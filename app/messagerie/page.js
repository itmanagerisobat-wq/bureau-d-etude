"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Navbar from "@/components/Navbar";
import Icon from "@/components/ui/Icon";
import Avatar from "@/components/ui/Avatar";
import Modal from "@/components/ui/Modal";
import { EcranChargement, EcranErreurProfil } from "@/components/ui/Screens";
import { useAppData } from "@/lib/useAppData";
import { presence, depuis } from "@/lib/presence";

const BUCKET = "dossiers-fichiers";
const MENTION = "Les échanges de la messagerie sont conservés et accessibles à l'administration.";

async function appelApi(supabase, url, corps) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
    body: JSON.stringify(corps || {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Erreur");
  return data;
}

const nettoyerNom = (n) =>
  String(n || "fichier")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_");

function heure(iso) {
  const d = new Date(iso);
  const auj = new Date();
  const memeJour = d.toDateString() === auj.toDateString();
  return memeJour
    ? d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

const libelleRole = (p) => (p.fonction === "Responsable" ? "Responsable" : { qualite: "Qualité", ingenieur: "Ingénieur", admin: "Admin" }[p.role] || "");

export default function MessageriePage() {
  const { profile, erreurProfil, loading, supabase } = useAppData();
  const estAdmin = profile?.role === "admin";
  const superviseur = estAdmin && profile?.fonction !== "Responsable";

  const [config, setConfig] = useState(null);
  const [migration, setMigration] = useState(true);
  const [conversations, setConversations] = useState([]);
  const [membres, setMembres] = useState({}); // conv → [user_id]
  const [personnes, setPersonnes] = useState([]); // annuaire (ou toutes les personnes pour l'admin)
  const [nonLus, setNonLus] = useState({});
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [texte, setTexte] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState("");
  const [filtre, setFiltre] = useState("");
  const [recherche, setRecherche] = useState(null); // résultats de recherche dans les messages (admin)
  const [modal, setModal] = useState(null); // "prive" | "groupe" | "reglages" | "membres"
  const [panneauEquipe, setPanneauEquipe] = useState(false); // mobile
  const finRef = useRef(null);
  const fichierRef = useRef(null);
  const activeRef = useRef(null);
  activeRef.current = active;

  const nomDe = useCallback((id) => personnes.find((p) => p.id === id)?.nom || (id === profile?.id ? profile?.nom_complet : "Administration"), [personnes, profile]);

  // ---------- chargement ----------
  const chargerListe = useCallback(async () => {
    const [{ data: cfg }, conv, mem, nl] = await Promise.all([
      supabase.from("parametres_config").select("*").order("id").limit(1).maybeSingle(),
      supabase.from("chat_conversations").select("*").order("dernier_message_at", { ascending: false }),
      supabase.from("chat_membres").select("conversation_id, user_id"),
      supabase.rpc("fn_chat_non_lus"),
    ]);
    if (conv.error) {
      setMigration(false);
      return;
    }
    setConfig(cfg);
    setConversations(conv.data || []);
    const m = {};
    for (const r of mem.data || []) (m[r.conversation_id] = m[r.conversation_id] || []).push(r.user_id);
    setMembres(m);
    setNonLus(Object.fromEntries((nl.data || []).map((r) => [r.conversation_id, Number(r.non_lus)])));
  }, [supabase]);

  const chargerPersonnes = useCallback(async () => {
    const { data } = await supabase.rpc(estAdmin ? "fn_chat_personnes_admin" : "fn_chat_annuaire");
    setPersonnes(data || []);
  }, [supabase, estAdmin]);

  useEffect(() => {
    if (!profile) return;
    chargerListe();
    chargerPersonnes();
    const t = setInterval(chargerListe, 20000);
    const t2 = setInterval(chargerPersonnes, 30000);
    return () => {
      clearInterval(t);
      clearInterval(t2);
    };
  }, [profile]);

  // Liaison RH : relève des réponses e-mail du RH toutes les minutes tant que la page est ouverte
  useEffect(() => {
    if (!profile || !config?.rh_actif) return;
    const relever = () => document.visibilityState === "visible" && appelApi(supabase, "/api/messagerie/sync").catch(() => {});
    relever();
    const t = setInterval(relever, 60000);
    return () => clearInterval(t);
  }, [profile, config?.rh_actif]);

  const chargerMessages = useCallback(
    async (convId) => {
      const { data } = await supabase.from("chat_messages").select("*").eq("conversation_id", convId).order("created_at").limit(2000);
      if (activeRef.current === convId) setMessages(data || []);
      if (!superviseur) {
        await supabase.rpc("fn_chat_marquer_lu", { p_conv: convId });
        setNonLus((n) => ({ ...n, [convId]: 0 }));
      }
    },
    [supabase, superviseur]
  );

  useEffect(() => {
    if (!active) return;
    setMessages([]);
    chargerMessages(active);
    const t = setInterval(() => chargerMessages(active), 15000);
    return () => clearInterval(t);
  }, [active]);

  // Temps réel : nouveaux messages
  useEffect(() => {
    if (!profile || !migration) return;
    const canal = supabase
      .channel("messagerie")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, (payload) => {
        const m = payload.new;
        if (m.conversation_id === activeRef.current) {
          setMessages((liste) => (liste.some((x) => x.id === m.id) ? liste : [...liste, m]));
          if (!superviseur) supabase.rpc("fn_chat_marquer_lu", { p_conv: m.conversation_id });
        } else if (m.auteur_id !== profile.id) {
          setNonLus((n) => ({ ...n, [m.conversation_id]: (n[m.conversation_id] || 0) + 1 }));
        }
        setConversations((cs) => {
          const c = cs.find((x) => x.id === m.conversation_id);
          if (!c) {
            chargerListe();
            return cs;
          }
          return [{ ...c, dernier_message_at: m.created_at }, ...cs.filter((x) => x.id !== c.id)];
        });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [profile, migration]);

  useEffect(() => {
    finRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, active]);

  // ---------- libellés ----------
  const titre = useCallback(
    (c) => {
      if (!c) return "";
      if (c.type === "rh") {
        const lib = config?.rh_libelle || c.nom || "Ressources humaines";
        return superviseur ? `${lib} ↔ ${(membres[c.id] || []).map(nomDe).join(", ")}` : lib;
      }
      if (c.type !== "prive") return c.nom || "Sans nom";
      const ids = membres[c.id] || [];
      const autres = superviseur ? ids : ids.filter((id) => id !== profile?.id);
      return autres.map(nomDe).join(superviseur ? " ↔ " : ", ") || "Conversation";
    },
    [membres, nomDe, profile, superviseur, config]
  );

  const filtrees = useMemo(() => {
    const q = filtre.trim().toLowerCase();
    return conversations.filter((c) => !q || titre(c).toLowerCase().includes(q));
  }, [conversations, filtre, titre]);

  const groupes = [
    ["public", "Canaux", "list"],
    ["groupe", "Groupes", "users"],
    ["rh", "Ressources humaines", "building"],
    ["prive", "Messages privés", "message"],
  ];
  const convActive = conversations.find((c) => c.id === active);
  // Panneau Équipe : jamais l'admin superviseur, ni soi-même, ni les comptes coupés
  const annuaire = personnes.filter((p) => p.id !== profile?.id && p.chat_actif !== false && !(p.role === "admin" && p.fonction !== "Responsable"));
  const enLigne = annuaire.filter((p) => presence(p).cle === "on").length;
  const peutEcrire =
    !superviseur &&
    profile?.chat_actif !== false &&
    convActive &&
    (convActive.type === "public" ? config?.chat_public_actif : convActive.type === "rh" ? config?.rh_actif : config?.chat_prive_actif);

  // ---------- actions ----------
  async function envoyer(e) {
    e?.preventDefault();
    if (!texte.trim() || !active) return;
    setEnvoi(true);
    setErreur("");
    const { data, error } = await supabase
      .from("chat_messages")
      .insert({ conversation_id: active, auteur_id: profile.id, auteur_nom: profile.nom_complet || "Moi", contenu: texte.trim() })
      .select()
      .single();
    setEnvoi(false);
    if (error) return setErreur("Message non envoyé : " + error.message);
    setTexte("");
    setMessages((l) => (l.some((x) => x.id === data.id) ? l : [...l, data]));
    transmettreRh(data);
  }

  // Fil RH : le message part aussi par e-mail au RH
  async function transmettreRh(m) {
    if (convActive?.type !== "rh") return;
    try {
      await appelApi(supabase, "/api/messagerie/rh-envoi", { messageId: m.id });
      setMessages((l) => l.map((x) => (x.id === m.id ? { ...x, email_statut: "envoyé" } : x)));
    } catch (e) {
      setMessages((l) => l.map((x) => (x.id === m.id ? { ...x, email_statut: `erreur : ${e.message}` } : x)));
    }
  }

  async function ouvrirRh() {
    const { data, error } = await supabase.rpc("fn_chat_ouvrir_rh");
    if (error) return alert(error.message.includes("rh_desactive") ? "Le contact RH n'est pas activé." : error.message);
    await chargerListe();
    setActive(data);
  }

  async function envoyerFichier(f) {
    if (!f || !active) return;
    if (f.size > 50 * 1024 * 1024) return setErreur("Fichier trop lourd (50 Mo maximum).");
    setEnvoi(true);
    setErreur("");
    const chemin = `chat/${active}/${Date.now()}_${nettoyerNom(f.name)}`;
    const up = await supabase.storage.from(BUCKET).upload(chemin, f, { contentType: f.type || undefined });
    if (up.error) {
      setEnvoi(false);
      return setErreur("Envoi du fichier impossible : " + up.error.message);
    }
    const { data, error } = await supabase
      .from("chat_messages")
      .insert({ conversation_id: active, auteur_id: profile.id, auteur_nom: profile.nom_complet || "Moi", contenu: texte.trim() || null, fichier_chemin: chemin, fichier_nom: f.name })
      .select()
      .single();
    setEnvoi(false);
    if (error) return setErreur("Message non envoyé : " + error.message);
    setTexte("");
    setMessages((l) => [...l, data]);
    transmettreRh(data);
  }

  async function ouvrirFichier(m) {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(m.fichier_chemin, 300);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  }

  async function ouvrirPrive(userId) {
    const { data, error } = await supabase.rpc("fn_chat_ouvrir_prive", { p_autre: userId });
    if (error)
      return alert(
        error.message.includes("hors_equipe") ? "Cette personne ne fait pas partie de vos équipes." : error.message.includes("desactive") ? "Les messages privés sont désactivés." : error.message
      );
    setModal(null);
    await chargerListe();
    setActive(data);
  }

  async function rechercher(q) {
    if (!q.trim()) return setRecherche(null);
    const { data } = await supabase.from("chat_messages").select("*").ilike("contenu", `%${q.trim()}%`).order("created_at", { ascending: false }).limit(200);
    setRecherche(data || []);
  }

  // ---------- écrans ----------
  if (erreurProfil) return <EcranErreurProfil message={erreurProfil} />;
  if (loading || !profile) return <EcranChargement />;

  const coupe = profile.chat_actif === false && !estAdmin;

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar role={profile.role} nom={profile.nom_complet || profile.ingenieur_ref} />
      <main className="flex-1 max-w-[1800px] w-full mx-auto px-3 sm:px-4 lg:px-5 py-5 flex flex-col gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="font-display text-2xl font-extrabold flex items-center gap-2">
            <Icon name="message" size={22} className="text-brand-500" />
            Messagerie
          </h1>
          {superviseur && <span className="badge badge-gold">Supervision — invisible, lecture seule</span>}
          <span className="ml-auto flex gap-2">
            {estAdmin && migration && (
              <button className="btn-secondary btn-sm" onClick={() => setModal("reglages")}>
                <Icon name="settings" size={14} />
                Réglages de la messagerie
              </button>
            )}
          </span>
        </div>

        {!migration ? (
          <div className="alert alert-gold">
            <Icon name="alert" size={16} className="mt-0.5" />
            <span>La messagerie n'est pas encore installée : exécutez les migrations V19 et V20 dans Supabase.</span>
          </div>
        ) : coupe ? (
          <div className="alert alert-red">
            <Icon name="lock" size={16} className="mt-0.5" />
            <span>Votre accès à la messagerie a été désactivé par l'administrateur.</span>
          </div>
        ) : (
          <div className="card flex-1 min-h-[560px] h-[calc(100vh-170px)] grid grid-cols-1 md:grid-cols-[300px_1fr] xl:grid-cols-[300px_1fr_270px] overflow-hidden">
            {/* Liste des conversations */}
            <aside className={`border-r border-line flex flex-col min-h-0 ${active ? "hidden md:flex" : "flex"}`}>
              <div className="p-3 border-b border-line flex flex-col gap-2">
                <div className="relative">
                  <Icon name="search" size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink/35" />
                  <input className="input input-sm w-full pl-8" placeholder="Rechercher une conversation…" value={filtre} onChange={(e) => setFiltre(e.target.value)} />
                </div>
                {!superviseur && config?.rh_actif && (
                  <button className="btn-secondary btn-sm" onClick={ouvrirRh}>
                    <Icon name="building" size={14} />
                    Contacter les RH
                  </button>
                )}
                <button className="btn-ghost btn-sm xl:hidden" onClick={() => setPanneauEquipe(true)}>
                  <Icon name="users" size={14} />
                  Équipe — {enLigne} en ligne
                </button>
                {!superviseur && (
                  <div className="flex gap-2">
                    {config?.chat_prive_actif && (
                      <button className="btn-primary btn-sm flex-1" onClick={() => setModal("prive")}>
                        <Icon name="plus" size={14} />
                        Message privé
                      </button>
                    )}
                    {config?.chat_prive_actif && (estAdmin || config?.chat_groupes_utilisateurs) && (
                      <button className="btn-secondary btn-sm flex-1" onClick={() => setModal("groupe")}>
                        <Icon name="users" size={14} />
                        Groupe
                      </button>
                    )}
                  </div>
                )}
                {superviseur && (
                  <button className="btn-secondary btn-sm" onClick={() => setModal("groupe")}>
                    <Icon name="plus" size={14} />
                    Nouveau canal / groupe
                  </button>
                )}
              </div>
              <div className="flex-1 overflow-y-auto">
                {groupes.map(([type, label, icone]) => {
                  const liste = filtrees.filter((c) => c.type === type);
                  if (!liste.length) return null;
                  return (
                    <div key={type} className="py-2">
                      <p className="px-4 py-1 text-[11px] font-bold uppercase tracking-wider text-ink/40 flex items-center gap-1.5">
                        <Icon name={icone} size={12} />
                        {label}
                      </p>
                      {liste.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => {
                            setActive(c.id);
                            setRecherche(null);
                          }}
                          className={`w-full text-left px-4 py-2 flex items-center gap-2.5 text-sm transition-colors ${
                            active === c.id ? "bg-brand-50 text-brand-700 font-semibold" : "hover:bg-ink/[0.03]"
                          }`}
                        >
                          {c.type === "prive" ? (
                            <Avatar nom={titre(c)} taille={26} />
                          ) : (
                            <span className="w-[26px] h-[26px] rounded-lg bg-night/10 text-night flex items-center justify-center text-xs font-bold">#</span>
                          )}
                          <span className="flex-1 truncate">{titre(c)}</span>
                          {!!nonLus[c.id] && <span className="bg-isoRed text-white text-[10px] font-bold rounded-full px-1.5 min-w-[18px] h-[18px] inline-flex items-center justify-center">{nonLus[c.id]}</span>}
                        </button>
                      ))}
                    </div>
                  );
                })}
                {!filtrees.length && <p className="p-4 text-sm text-ink/50">Aucune conversation.</p>}
              </div>
              {config && (!config.chat_public_actif || !config.chat_prive_actif) && (
                <p className="px-4 py-2 text-[11px] text-ink/50 border-t border-line">
                  {!config.chat_public_actif && "Canaux publics désactivés. "}
                  {!config.chat_prive_actif && "Messages privés désactivés."}
                </p>
              )}
              {superviseur && (
                <div className="p-3 border-t border-line">
                  <input
                    className="input input-sm w-full"
                    placeholder="Chercher un mot dans tous les messages…"
                    onKeyDown={(e) => e.key === "Enter" && rechercher(e.currentTarget.value)}
                  />
                </div>
              )}
            </aside>

            {/* Conversation */}
            <section className={`flex flex-col min-h-0 ${active || recherche ? "flex" : "hidden md:flex"}`}>
              {recherche ? (
                <>
                  <div className="px-5 py-3 border-b border-line flex items-center gap-3">
                    <p className="font-semibold">Résultats de recherche ({recherche.length})</p>
                    <button className="btn-ghost btn-xs ml-auto" onClick={() => setRecherche(null)}>
                      Fermer
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto divide-y divide-line">
                    {recherche.map((m) => {
                      const c = conversations.find((x) => x.id === m.conversation_id);
                      return (
                        <button
                          key={m.id}
                          className="w-full text-left px-5 py-3 hover:bg-ink/[0.03]"
                          onClick={() => {
                            setRecherche(null);
                            setActive(m.conversation_id);
                          }}
                        >
                          <p className="text-xs text-ink/50">
                            {titre(c)} · {m.auteur_nom} · {heure(m.created_at)}
                          </p>
                          <p className="text-sm">{m.contenu}</p>
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : !convActive ? (
                <div className="flex-1 flex flex-col items-center justify-center text-ink/45 gap-2 p-6 text-center">
                  <Icon name="message" size={36} />
                  <p>Choisissez une conversation.</p>
                  <p className="text-xs">{MENTION}</p>
                </div>
              ) : (
                <>
                  <div className="px-5 py-3 border-b border-line flex items-center gap-3">
                    <button className="btn-icon md:hidden -ml-2" onClick={() => setActive(null)} aria-label="Retour">
                      <Icon name="chevronRight" size={18} className="rotate-180" />
                    </button>
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{titre(convActive)}</p>
                      <p className="text-xs text-ink/50 truncate">
                        {convActive.type === "public"
                          ? "Canal public — tout le monde"
                          : convActive.type === "rh"
                          ? "Vos messages sont transmis par e-mail aux Ressources humaines, leurs réponses arrivent ici."
                          : `${(membres[convActive.id] || []).length} membre(s) : ${(membres[convActive.id] || []).map(nomDe).join(", ")}`}
                      </p>
                    </div>
                    {estAdmin && ["public", "groupe"].includes(convActive.type) && (
                      <button className="btn-secondary btn-xs ml-auto" onClick={() => setModal("membres")}>
                        <Icon name="users" size={13} />
                        Gérer
                      </button>
                    )}
                  </div>

                  <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-2 bg-[#F7F8FA]">
                    {messages.map((m, i) => {
                      const moi = m.auteur_id === profile.id;
                      const suite = i > 0 && messages[i - 1].auteur_id === m.auteur_id && new Date(m.created_at) - new Date(messages[i - 1].created_at) < 5 * 60000;
                      return (
                        <div key={m.id} className={`flex gap-2 ${moi ? "flex-row-reverse" : ""}`}>
                          <div className="w-7 shrink-0">
                            {!moi && !suite && (m.source === "email" ? (
                              <span className="w-7 h-7 rounded-full bg-night text-white flex items-center justify-center" title="Ressources humaines (e-mail)">
                                <Icon name="building" size={14} />
                              </span>
                            ) : (
                              <Avatar nom={m.auteur_nom} taille={28} />
                            ))}
                          </div>
                          <div className={`max-w-[70%] flex flex-col ${moi ? "items-end" : "items-start"}`}>
                            {!suite && (
                              <span className="text-[11px] text-ink/45 mb-0.5">
                                {moi ? "Vous" : m.auteur_nom} · {heure(m.created_at)}
                                {m.source === "email" && " · reçu par e-mail"}
                              </span>
                            )}
                            <div className={`rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap break-words ${moi ? "bg-brand-500 text-white rounded-tr-sm" : "bg-white border border-line rounded-tl-sm"}`}>
                              {m.contenu}
                              {m.fichier_chemin && (
                                <button onClick={() => ouvrirFichier(m)} className={`flex items-center gap-1.5 mt-1 underline text-xs ${moi ? "text-white" : "text-brand-600"}`}>
                                  <Icon name="file" size={13} />
                                  {m.fichier_nom || "Fichier"}
                                </button>
                              )}
                            </div>
                            {moi && convActive.type === "rh" && (
                              <span className={`text-[10px] mt-0.5 ${String(m.email_statut || "").startsWith("erreur") ? "text-isoRed-dark" : "text-ink/40"}`}>
                                {m.email_statut === "envoyé" ? "Transmis par e-mail aux RH ✓" : m.email_statut ? `Non transmis aux RH (${m.email_statut.replace(/^erreur : /, "")})` : "Transmission aux RH…"}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {!messages.length && <p className="text-center text-sm text-ink/45 py-10">Aucun message pour l'instant.</p>}
                    <div ref={finRef} />
                  </div>

                  {peutEcrire ? (
                    <form onSubmit={envoyer} className="border-t border-line p-3 flex items-end gap-2">
                      <button type="button" className="btn-icon" title="Joindre un fichier" onClick={() => fichierRef.current?.click()} disabled={envoi}>
                        <Icon name="upload" size={17} />
                      </button>
                      <input
                        ref={fichierRef}
                        type="file"
                        className="hidden"
                        onChange={(e) => {
                          envoyerFichier(e.target.files?.[0]);
                          e.target.value = "";
                        }}
                      />
                      <textarea
                        className="input flex-1 resize-none min-h-[42px] max-h-40"
                        rows={1}
                        placeholder="Écrire un message… (Entrée pour envoyer, Maj+Entrée pour aller à la ligne)"
                        value={texte}
                        onChange={(e) => setTexte(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            envoyer();
                          }
                        }}
                      />
                      <button type="submit" className="btn-primary" disabled={envoi || !texte.trim()}>
                        <Icon name="send" size={15} />
                        Envoyer
                      </button>
                    </form>
                  ) : (
                    <p className="border-t border-line p-3 text-sm text-ink/50 text-center">
                      {superviseur ? "Mode supervision : lecture seule." : "L'envoi de messages est désactivé pour cette conversation."}
                    </p>
                  )}
                  {erreur && <p className="px-4 pb-2 text-xs text-isoRed-dark">{erreur}</p>}
                  <p className="px-4 pb-2 text-[11px] text-ink/40">{MENTION} Les messages envoyés ne peuvent pas être supprimés.</p>
                </>
              )}
            </section>

            <aside className={`border-l border-line flex-col min-h-0 ${panneauEquipe ? "fixed inset-0 z-40 bg-white flex" : "hidden xl:flex"}`}>
              <PanneauEquipe
                personnes={annuaire}
                enLigne={enLigne}
                peutEcrire={!superviseur && config?.chat_prive_actif}
                onChoisir={(id) => {
                  setPanneauEquipe(false);
                  ouvrirPrive(id);
                }}
                onFermer={panneauEquipe ? () => setPanneauEquipe(false) : null}
              />
            </aside>
          </div>
        )}
      </main>

      {modal === "prive" && (
        <ChoixPersonne
          titre="Nouveau message privé"
          personnes={personnes.filter((p) => p.id !== profile.id && (estAdmin ? p.chat_actif !== false && !(p.role === "admin" && p.fonction !== "Responsable") : true))}
          onChoisir={ouvrirPrive}
          onFermer={() => setModal(null)}
        />
      )}
      {modal === "groupe" && (
        <NouveauGroupe
          supabase={supabase}
          estAdmin={estAdmin}
          personnes={personnes.filter((p) => p.id !== profile.id && !(p.role === "admin" && p.fonction !== "Responsable"))}
          onFermer={() => setModal(null)}
          onCree={async (id) => {
            setModal(null);
            await chargerListe();
            setActive(id);
          }}
        />
      )}
      {modal === "membres" && convActive && (
        <GererMembres
          supabase={supabase}
          conv={convActive}
          membres={membres[convActive.id] || []}
          personnes={personnes.filter((p) => !(p.role === "admin" && p.fonction !== "Responsable"))}
          onFermer={() => setModal(null)}
          onMaj={chargerListe}
        />
      )}
      {modal === "reglages" && (
        <Reglages
          supabase={supabase}
          config={config}
          estSuperviseur={superviseur}
          personnes={personnes}
          moi={profile.id}
          onFermer={() => setModal(null)}
          onMaj={async () => {
            await chargerListe();
            await chargerPersonnes();
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ fenêtres */

function ChoixPersonne({ titre, personnes, onChoisir, onFermer }) {
  const [q, setQ] = useState("");
  const liste = personnes.filter((p) => p.nom.toLowerCase().includes(q.toLowerCase()));
  return (
    <Modal titre={titre} onFermer={onFermer}>
      <input autoFocus className="input w-full mb-3" placeholder="Rechercher une personne…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="max-h-[50vh] overflow-y-auto divide-y divide-line">
        {liste.map((p) => (
          <button key={p.id} onClick={() => onChoisir(p.id)} className="w-full text-left px-2 py-2.5 flex items-center gap-3 hover:bg-ink/[0.03]">
            <Avatar nom={p.nom} taille={28} />
            <span className="flex-1">{p.nom}</span>
            <span className="text-xs text-ink/45">{libelleRole(p)}</span>
          </button>
        ))}
        {!liste.length && <p className="text-sm text-ink/50 p-3">Personne trouvée.</p>}
      </div>
    </Modal>
  );
}

function NouveauGroupe({ supabase, estAdmin, personnes, onFermer, onCree }) {
  const [type, setType] = useState("groupe");
  const [nom, setNom] = useState("");
  const [choisis, setChoisis] = useState([]);
  const [err, setErr] = useState("");
  async function creer() {
    setErr("");
    const { data, error } = await supabase.rpc("fn_chat_creer", { p_type: type, p_nom: nom, p_membres: type === "groupe" ? choisis : [] });
    if (error) return setErr(error.message.includes("non_autorise") ? "Vous n'avez pas le droit de créer ce type de conversation." : error.message);
    onCree(data);
  }
  return (
    <Modal titre="Nouvelle conversation de groupe" onFermer={onFermer}>
      <div className="flex flex-col gap-3">
        {estAdmin && (
          <div className="segmented">
            <button data-active={type === "groupe"} onClick={() => setType("groupe")}>
              Groupe privé
            </button>
            <button data-active={type === "public"} onClick={() => setType("public")}>
              Canal public
            </button>
          </div>
        )}
        <input className="input" placeholder={type === "public" ? "Nom du canal (ex. Annonces)" : "Nom du groupe (ex. Équipe 174)"} value={nom} onChange={(e) => setNom(e.target.value)} />
        {type === "groupe" ? (
          <div className="max-h-[40vh] overflow-y-auto border border-line rounded-lg divide-y divide-line">
            {personnes.map((p) => (
              <label key={p.id} className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer">
                <input type="checkbox" checked={choisis.includes(p.id)} onChange={(e) => setChoisis((c) => (e.target.checked ? [...c, p.id] : c.filter((x) => x !== p.id)))} />
                <Avatar nom={p.nom} taille={22} />
                <span className="flex-1">{p.nom}</span>
                <span className="text-xs text-ink/45">{libelleRole(p)}</span>
              </label>
            ))}
          </div>
        ) : (
          <p className="text-xs text-ink/55">Un canal public est visible par tout le monde.</p>
        )}
        {err && <p className="text-sm text-isoRed-dark">{err}</p>}
        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={onFermer}>
            Annuler
          </button>
          <button className="btn-primary" onClick={creer} disabled={!nom.trim() || (type === "groupe" && !choisis.length)}>
            Créer
          </button>
        </div>
      </div>
    </Modal>
  );
}

function GererMembres({ supabase, conv, membres, personnes, onFermer, onMaj }) {
  const [nom, setNom] = useState(conv.nom || "");
  const [liste, setListe] = useState(membres);
  async function action(a, user) {
    const { error } = await supabase.rpc("fn_chat_gerer", { p_conv: conv.id, p_action: a, p_user: user || null, p_nom: a === "renommer" ? nom : null });
    if (error) return alert(error.message);
    if (a === "ajouter") setListe((l) => [...l, user]);
    if (a === "retirer") setListe((l) => l.filter((x) => x !== user));
    onMaj();
  }
  return (
    <Modal titre={`Gérer « ${conv.nom} »`} onFermer={onFermer}>
      <div className="flex flex-col gap-3">
        <div className="flex gap-2">
          <input className="input flex-1" value={nom} onChange={(e) => setNom(e.target.value)} />
          <button className="btn-secondary" onClick={() => action("renommer")} disabled={!nom.trim()}>
            Renommer
          </button>
        </div>
        {conv.type === "groupe" ? (
          <div className="max-h-[45vh] overflow-y-auto border border-line rounded-lg divide-y divide-line">
            {personnes.map((p) => {
              const dedans = liste.includes(p.id);
              return (
                <div key={p.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <Avatar nom={p.nom} taille={22} />
                  <span className="flex-1">{p.nom}</span>
                  <button className={dedans ? "btn-danger btn-xs" : "btn-secondary btn-xs"} onClick={() => action(dedans ? "retirer" : "ajouter", p.id)}>
                    {dedans ? "Retirer" : "Ajouter"}
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-ink/55">Canal public : tout le monde y a accès.</p>
        )}
      </div>
    </Modal>
  );
}

function PanneauEquipe({ personnes, enLigne, peutEcrire, onChoisir, onFermer }) {
  const [q, setQ] = useState("");
  const ordre = { on: 0, absent: 1, off: 2 };
  const sections = [
    ["Responsables", (p) => p.role === "admin" && p.fonction === "Responsable"],
    ["Qualité", (p) => p.role === "qualite"],
    ["Ingénieurs", (p) => p.role === "ingenieur"],
  ];
  const visibles = personnes.filter((p) => !q || p.nom.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <div className="p-3 border-b border-line flex items-center gap-2">
        <p className="font-semibold text-sm flex-1">
          Équipe{" "}
          <span className="text-xs font-normal text-ink/50">
            · <span className="text-isoGreen-dark font-semibold">{enLigne} en ligne</span> / {personnes.length}
          </span>
        </p>
        {onFermer && (
          <button className="btn-icon" onClick={onFermer} aria-label="Fermer">
            <Icon name="x" size={16} />
          </button>
        )}
      </div>
      <div className="p-3 border-b border-line">
        <input className="input input-sm w-full" placeholder="Chercher une personne…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {sections.map(([titre, test]) => {
          const liste = visibles.filter(test).sort((a, b) => ordre[presence(a).cle] - ordre[presence(b).cle] || a.nom.localeCompare(b.nom));
          if (!liste.length) return null;
          return (
            <div key={titre} className="py-1.5">
              <p className="px-4 py-1 text-[11px] font-bold uppercase tracking-wider text-ink/40">
                {titre} ({liste.filter((p) => presence(p).cle === "on").length}/{liste.length})
              </p>
              {liste.map((p) => {
                const pr = presence(p);
                return (
                  <button
                    key={p.id}
                    disabled={!peutEcrire}
                    onClick={() => onChoisir(p.id)}
                    title={peutEcrire ? `Écrire à ${p.nom}` : ""}
                    className="w-full text-left px-4 py-1.5 flex items-center gap-2.5 text-sm hover:bg-ink/[0.03] disabled:hover:bg-transparent"
                  >
                    <span className="relative">
                      <Avatar nom={p.nom} taille={26} />
                      <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-white" style={{ background: pr.couleur }} />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className={`block truncate capitalize ${pr.cle === "off" ? "text-ink/55" : ""}`}>{p.nom}</span>
                      <span className="block text-[10px] text-ink/40 truncate">
                        {pr.libelle}
                        {p.role === "ingenieur" && p.occupe !== undefined && p.occupe !== null ? (p.occupe ? " · occupé" : " · libre") : ""}
                        {p.equipes?.length ? ` · ${p.equipes.join(", ")}` : ""}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          );
        })}
        {!visibles.length && <p className="p-4 text-sm text-ink/50">Personne.</p>}
      </div>
    </>
  );
}

function Reglages({ supabase, config, personnes, moi, onFermer, onMaj }) {
  const [onglet, setOnglet] = useState("general");
  const [cfg, setCfg] = useState({
    chat_public_actif: config?.chat_public_actif ?? true,
    chat_prive_actif: config?.chat_prive_actif ?? true,
    chat_groupes_utilisateurs: config?.chat_groupes_utilisateurs ?? false,
    rh_actif: config?.rh_actif ?? false,
    rh_emails: config?.rh_emails ?? "",
    rh_libelle: config?.rh_libelle ?? "Ressources humaines",
  });
  const [msg, setMsg] = useState("");
  const v20 = config && "rh_actif" in config;

  async function enregistrer(maj) {
    setCfg((c) => ({ ...c, ...maj }));
    const { data, error } = await supabase.from("parametres_config").update(maj).eq("id", config.id).select("id");
    setMsg(error ? "Erreur : " + error.message : !data?.length ? "Non enregistré : droits insuffisants sur les réglages (migration V12 ?)" : "Enregistré ✓");
    onMaj();
  }
  async function personne(p) {
    const { error } = await supabase.rpc("fn_chat_personne", { p_user: p.id, p_actif: !p.chat_actif });
    if (error) return alert(error.message);
    onMaj();
  }
  const interrupteur = (cle, label, aide) => (
    <label className="flex items-start gap-3 py-2.5 cursor-pointer">
      <input type="checkbox" className="mt-1" checked={!!cfg[cle]} onChange={() => enregistrer({ [cle]: !cfg[cle] })} />
      <span>
        <span className="font-semibold text-sm">{label}</span>
        <span className="block text-xs text-ink/55">{aide}</span>
      </span>
    </label>
  );
  const participants = personnes.filter((p) => p.id !== moi && !(p.role === "admin" && p.fonction !== "Responsable"));

  return (
    <Modal titre="Réglages de la messagerie" onFermer={onFermer} taille="xl">
      <div className="flex flex-col gap-4">
        <div className="segmented self-start flex-wrap">
          {[
            ["general", "Général"],
            ["equipes", "Équipes"],
            ["personnes", "Personnes"],
            ["rh", "Liaison RH"],
          ].map(([k, l]) => (
            <button key={k} data-active={onglet === k} onClick={() => setOnglet(k)}>
              {l}
            </button>
          ))}
        </div>

        {onglet === "general" && (
          <div className="divide-y divide-line">
            {interrupteur("chat_public_actif", "Canaux publics", "Canaux visibles par tout le monde (ex. Général).")}
            {interrupteur("chat_prive_actif", "Messages privés et groupes", "Messages en tête-à-tête et groupes privés.")}
            {interrupteur("chat_groupes_utilisateurs", "Les utilisateurs peuvent créer des groupes", "Sinon, seuls l'admin et les Responsables créent des groupes et des canaux.")}
            <p className="text-xs text-ink/50 pt-3">
              L'admin n'apparaît nulle part (annuaire, présence) et lit toutes les conversations en lecture seule. Les participants voient la mention : « {MENTION} »
            </p>
          </div>
        )}

        {onglet === "equipes" && (v20 ? <GestionEquipes supabase={supabase} personnes={participants} onMaj={onMaj} /> : <AlerteV20 />)}

        {onglet === "personnes" && (
          <div>
            <p className="text-xs text-ink/55 mb-2">Couper l'accès à la messagerie d'une personne (elle garde l'accès au reste de l'application).</p>
            <div className="max-h-[50vh] overflow-y-auto border border-line rounded-lg divide-y divide-line">
              {personnes
                .filter((p) => p.id !== moi)
                .map((p) => (
                  <div key={p.id} className={`flex items-center gap-3 px-3 py-2 text-sm ${p.chat_actif ? "" : "opacity-60"}`}>
                    <Avatar nom={p.nom} taille={22} />
                    <span className="flex-1 capitalize">{p.nom}</span>
                    <span className="text-xs text-ink/45 w-24">{libelleRole(p)}</span>
                    {p.chat_actif ? <span className="badge badge-green">Actif</span> : <span className="badge badge-red">Coupé</span>}
                    <button className="btn-secondary btn-xs w-20" onClick={() => personne(p)}>
                      {p.chat_actif ? "Couper" : "Rétablir"}
                    </button>
                  </div>
                ))}
            </div>
          </div>
        )}

        {onglet === "rh" &&
          (v20 ? (
            <LiaisonRh supabase={supabase} cfg={cfg} config={config} enregistrer={enregistrer} interrupteur={interrupteur} />
          ) : (
            <AlerteV20 />
          ))}
        {msg && <p className="text-xs text-ink/55">{msg}</p>}
      </div>
    </Modal>
  );
}

function AlerteV20() {
  return (
    <div className="alert alert-gold text-sm">
      <Icon name="alert" size={16} className="mt-0.5" />
      <span>Exécutez la migration V20 dans Supabase pour activer cette partie.</span>
    </div>
  );
}

function GestionEquipes({ supabase, personnes, onMaj }) {
  const [equipes, setEquipes] = useState([]);
  const [membres, setMembres] = useState([]);
  const [choisie, setChoisie] = useState(null);
  const [nom, setNom] = useState("");
  const [mode, setMode] = useState("tout");

  async function charger() {
    const [{ data: e }, { data: m }] = await Promise.all([
      supabase.from("msg_equipes").select("*").order("nom"),
      supabase.from("msg_equipe_membres").select("*"),
    ]);
    setEquipes(e || []);
    setMembres(m || []);
  }
  useEffect(() => {
    charger();
  }, []);

  async function action(p) {
    const { data, error } = await supabase.rpc("fn_msg_equipe", {
      p_action: p.action,
      p_equipe: p.equipe || null,
      p_nom: p.nom || null,
      p_mode: p.mode || null,
      p_user: p.user || null,
    });
    if (error) return alert(error.message.includes("duplicate") ? "Une équipe porte déjà ce nom." : error.message);
    await charger();
    onMaj();
    return data;
  }

  const eq = equipes.find((e) => e.id === choisie);
  const dans = (uid) => membres.some((m) => m.equipe_id === choisie && m.user_id === uid);

  return (
    <div className="grid md:grid-cols-[260px_1fr] gap-4">
      <div className="flex flex-col gap-2">
        <div className="border border-line rounded-lg divide-y divide-line max-h-[45vh] overflow-y-auto">
          {equipes.map((e) => (
            <button key={e.id} onClick={() => setChoisie(e.id)} className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 ${choisie === e.id ? "bg-brand-50 font-semibold" : "hover:bg-ink/[0.03]"}`}>
              <span className="flex-1 truncate">{e.nom}</span>
              <span className="text-[10px] text-ink/45">{membres.filter((m) => m.equipe_id === e.id).length}</span>
              <span className={`badge ${e.mode === "equipe" ? "badge-gold" : "badge-neutral"}`}>{e.mode === "equipe" ? "restreinte" : "tous"}</span>
            </button>
          ))}
          {!equipes.length && <p className="p-3 text-xs text-ink/50">Aucune équipe : tout le monde voit tout le monde.</p>}
        </div>
        <div className="border border-dashed border-line rounded-lg p-3 flex flex-col gap-2">
          <input className="input input-sm" placeholder="Nouvelle équipe (ex. Équipe 174)" value={nom} onChange={(e) => setNom(e.target.value)} />
          <select className="input input-sm" value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="tout">Voit tout le monde</option>
            <option value="equipe">Voit seulement son équipe</option>
          </select>
          <button
            className="btn-primary btn-sm"
            disabled={!nom.trim()}
            onClick={async () => {
              const id = await action({ action: "creer", nom, mode });
              if (id) {
                setChoisie(id);
                setNom("");
              }
            }}
          >
            <Icon name="plus" size={14} />
            Créer l'équipe
          </button>
        </div>
      </div>

      {eq ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold">{eq.nom}</p>
            <select className="input input-sm w-60 ml-auto" value={eq.mode} onChange={(e) => action({ action: "modifier", equipe: eq.id, mode: e.target.value })}>
              <option value="tout">Voit tout le monde</option>
              <option value="equipe">Voit seulement son équipe</option>
            </select>
            <button
              className="btn-secondary btn-xs"
              onClick={() => {
                const n = prompt("Nouveau nom de l'équipe :", eq.nom);
                if (n && n.trim()) action({ action: "modifier", equipe: eq.id, nom: n });
              }}
            >
              Renommer
            </button>
            <button
              className="btn-danger btn-xs"
              onClick={async () => {
                if (!confirm(`Supprimer l'équipe « ${eq.nom} » ? Son groupe de discussion et l'historique sont conservés.`)) return;
                await action({ action: "supprimer", equipe: eq.id });
                setChoisie(null);
              }}
            >
              Supprimer
            </button>
          </div>
          <p className="text-xs text-ink/55">
            {eq.mode === "equipe"
              ? "Les membres voient seulement leur équipe, plus les Responsables, la Qualité et le canal Général."
              : "Les membres voient tout le monde."}{" "}
            L'équipe a son propre groupe de discussion, mis à jour automatiquement. Une personne peut faire partie de plusieurs équipes.
          </p>
          <div className="border border-line rounded-lg divide-y divide-line max-h-[45vh] overflow-y-auto">
            {personnes.map((p) => {
              const ok = dans(p.id);
              return (
                <label key={p.id} className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={ok} onChange={() => action({ action: ok ? "retirer" : "ajouter", equipe: eq.id, user: p.id })} />
                  <Avatar nom={p.nom} taille={22} />
                  <span className="flex-1 capitalize">{p.nom}</span>
                  <span className="text-xs text-ink/45">{libelleRole(p)}</span>
                </label>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="text-sm text-ink/50 self-center text-center">Choisissez une équipe pour gérer ses membres.</p>
      )}
    </div>
  );
}

function LiaisonRh({ supabase, cfg, config, enregistrer, interrupteur }) {
  const [emails, setEmails] = useState(cfg.rh_emails);
  const [libelle, setLibelle] = useState(cfg.rh_libelle);
  const [etat, setEtat] = useState("");
  async function sauver() {
    return enregistrer({ rh_emails: emails.trim(), rh_libelle: libelle.trim() || "Ressources humaines" });
  }
  async function tester() {
    setEtat("…");
    await sauver();
    try {
      const r = await appelApi(supabase, "/api/messagerie/test", { rhEmails: emails });
      setEtat(
        [
          `Envoi (SMTP) : ${r.smtp}${r.envoyeA ? ` — e-mail de test envoyé à ${r.envoyeA.join(", ")}` : ""}`,
          `Lecture (IMAP) : ${r.imap}`,
        ].join("\n")
      );
    } catch (e) {
      setEtat("Erreur : " + e.message);
    }
  }
  async function relever() {
    setEtat("…");
    try {
      const r = await appelApi(supabase, "/api/messagerie/sync?force=1");
      setEtat(`Relève : ${r.deposes ?? 0} message(s) reçu(s)${r.ignore ? ` (${r.ignore})` : ""}`);
    } catch (e) {
      setEtat("Erreur : " + e.message);
    }
  }
  return (
    <div className="flex flex-col gap-3">
      {interrupteur("rh_actif", "Liaison avec les Ressources humaines", "Bouton « Contacter les RH » pour chaque personne ; les messages partent par e-mail au RH, ses réponses reviennent dans la messagerie.")}
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="text-xs font-semibold text-ink/60 flex flex-col gap-1">
          Adresse(s) e-mail du RH (séparées par une virgule)
          <input className="input" value={emails} onChange={(e) => setEmails(e.target.value)} placeholder="rh.hillsolution@gmail.com" />
        </label>
        <label className="text-xs font-semibold text-ink/60 flex flex-col gap-1">
          Nom affiché dans la messagerie
          <input className="input" value={libelle} onChange={(e) => setLibelle(e.target.value)} />
        </label>
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <button className="btn-primary btn-sm" onClick={sauver}>
          <Icon name="check" size={14} />
          Enregistrer
        </button>
        <button className="btn-secondary btn-sm" onClick={tester}>
          <Icon name="send" size={14} />
          Tester la connexion et envoyer un e-mail de test
        </button>
        <button className="btn-secondary btn-sm" onClick={relever}>
          <Icon name="reset" size={14} />
          Relever les e-mails maintenant
        </button>
        {etat && (
          <span className={`text-xs whitespace-pre-line basis-full ${/Erreur/.test(etat) ? "text-isoRed-dark" : "text-isoGreen-dark"}`}>{etat === "…" ? "En cours…" : etat}</span>
        )}
      </div>
      <div className="text-xs text-ink/55 bg-ink/[0.03] rounded-lg p-3 leading-relaxed">
        <p>
          <strong>État :</strong> {config?.rh_synchro_statut || "aucune relève pour l'instant"}
          {config?.rh_derniere_synchro && ` — dernière relève ${depuis(config.rh_derniere_synchro)}`}
        </p>
        <p className="mt-1">
          <strong>Côté RH (Gmail)</strong> : pour répondre, il clique sur « Répondre ». Pour écrire à quelqu'un, il envoie un e-mail à l'adresse de la messagerie avec
          l'objet « Nom — sujet » (ex. « Sami — visite médicale ») ; « Tous — sujet » publie dans le canal Général. Seules les adresses ci-dessus sont acceptées.
        </p>
      </div>
    </div>
  );
}
