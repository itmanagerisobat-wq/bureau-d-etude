"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import Navbar from "@/components/Navbar";
import { useAppData } from "@/lib/useAppData";
import GestionComptes from "@/components/GestionComptes";
import DossiersSupprimes from "@/components/DossiersSupprimes";
import PageHeader from "@/components/ui/PageHeader";
import Icon from "@/components/ui/Icon";
import EmptyState from "@/components/ui/EmptyState";
import { ETATS } from "@/lib/constants";
import { COULEURS_DEFAUT, LIBELLES_DEFAUT, definirCouleurs, definirLibelles, assombrir } from "@/lib/couleurs";
import SuppressionDonnees from "@/components/SuppressionDonnees";
import { actionListe } from "@/lib/parametres";
import { EcranChargement, EcranErreurProfil } from "@/components/ui/Screens";

// [clé, libellé, icône, réservé à l'admin]
const VUES = [
  ["comptes", "Comptes", "lock", true],
  ["listes", "Listes déroulantes", "list", true],
  ["habilitations", "Habilitations", "shield", false],
  ["equipes", "Équipes clients", "users", false],
  ["statuts", "Statuts", "layers", false],
  ["objectifs", "Objectifs", "target", false],
  ["config", "Config SLA", "sliders", false],
  ["audit", "Journal d'audit", "history", true],
  ["backups", "Sauvegardes", "database", true],
  ["donnees", "Données", "alert", true],
  ["supprimes", "Dossiers supprimés", "history", "superviseur"],
];

// Les statuts ne sont plus une liste déroulante : ils se règlent dans l'onglet « Statuts ».
const TABLES = [
  { key: "parametres_ingenieurs", label: "Ingénieurs", champ: "nom", admin: true },
  { key: "parametres_operations", label: "Opérations", champ: "libelle" },
  { key: "parametres_clients", label: "Clients", champ: "nom", admin: true },
  { key: "parametres_validateurs", label: "Service qualité", champ: "nom", admin: true },
  { key: "parametres_causes_retour", label: "Causes de retour", champ: "libelle" },
];

export default function ParametresPage() {
  const { profile, erreurProfil, options, loading, supabase, refresh } = useAppData();
  const estAdmin = profile?.role === "admin";
  // « superviseur » = admin hors Responsables (journal des suppressions)
  const estSuperviseur = estAdmin && profile?.fonction !== "Responsable";
  const vuesVisibles = VUES.filter(([, , , admin]) => !admin || (admin === "superviseur" ? estSuperviseur : estAdmin));
  const tablesVisibles = TABLES.filter((t) => !t.admin || estAdmin);
  // Onglet affiché par défaut : le premier autorisé pour ce rôle (la Qualité n'a pas « Listes déroulantes »)
  const vueAutorisee = (v) => vuesVisibles.some(([k]) => k === v);
  const [habs, setHabs] = useState(null); // Set "ingenieur|operation"
  const [equipes, setEquipes] = useState(null); // Set "client|ingenieur"
  const [ongletActif, setOngletActif] = useState("parametres_operations");
  const [lignes, setLignes] = useState([]);
  const [nouveau, setNouveau] = useState("");
  const [objectifs, setObjectifs] = useState([]);
  const [ingenieurs, setIngenieurs] = useState([]);
  const [auditLog, setAuditLog] = useState([]);
  const [backups, setBackups] = useState([]);
  const [vue, setVue] = useState("listes"); // listes | objectifs | config | audit | backups
  const [seuilVerification, setSeuilVerification] = useState(1);
  const [seuilUrgence, setSeuilUrgence] = useState(24);
  const [delaiMaxTraitement, setDelaiMaxTraitement] = useState(24);
  const [conservation, setConservation] = useState(90);
  const [purge, setPurge] = useState(null);
  const [configId, setConfigId] = useState(null);
  const [rapportCfg, setRapportCfg] = useState(null); // colonnes V17 (null = migration non exécutée)
  const [rapportMsg, setRapportMsg] = useState("");

  const table = TABLES.find((t) => t.key === ongletActif);

  async function chargerListe() {
    const { data } = await supabase.from(ongletActif).select("*").order(table.champ);
    setLignes(data || []);
  }

  useEffect(() => {
    if (profile) chargerListe();
  }, [ongletActif, profile]);

  useEffect(() => {
    if (!profile) return;
    (async () => {
      const [{ data: objs }, { data: ings }] = await Promise.all([
        supabase.from("objectifs").select("*"),
        supabase.from("parametres_ingenieurs").select("nom").eq("actif", true),
      ]);
      setObjectifs(objs || []);
      setIngenieurs((ings || []).map((r) => r.nom));

      const { data: config } = await supabase.from("parametres_config").select("*").limit(1).maybeSingle();
      if (config) {
        setSeuilVerification(config.seuil_verification_heures);
        setSeuilUrgence(config.seuil_urgence_heures || 24);
        setDelaiMaxTraitement(config.delai_max_traitement_heures || 24);
        setConservation(config.conservation_fichiers_jours || 90);
        setConfigId(config.id);
        if ("grille_excellent" in config) {
          setRapportCfg({
            grille_excellent: config.grille_excellent,
            grille_bon: config.grille_bon,
            grille_surveiller: config.grille_surveiller,
            seuil_min_dossiers: config.seuil_min_dossiers,
            rapport_redige_par: config.rapport_redige_par || "",
            rapport_diffusion: config.rapport_diffusion || "",
          });
        }
      }
    })();
  }, [profile]);

  async function majSeuilVerification(valeur) {
    const n = Number(valeur) || 1;
    setSeuilVerification(n);
    if (configId) {
      await supabase.from("parametres_config").update({ seuil_verification_heures: n }).eq("id", configId);
    }
  }

  async function majSeuilUrgence(valeur) {
    const n = Number(valeur) || 24;
    setSeuilUrgence(n);
    if (configId) {
      await supabase.from("parametres_config").update({ seuil_urgence_heures: n }).eq("id", configId);
    }
  }

  async function majDelaiMaxTraitement(valeur) {
    const n = Number(valeur) || 24;
    setDelaiMaxTraitement(n);
    if (configId) {
      await supabase.from("parametres_config").update({ delai_max_traitement_heures: n }).eq("id", configId);
    }
  }

  async function majConservation(valeur) {
    const n = Math.max(1, Math.round(Number(valeur) || 90));
    setConservation(n);
    if (configId) {
      await supabase.from("parametres_config").update({ conservation_fichiers_jours: n }).eq("id", configId);
    }
  }

  async function enregistrerRapportCfg() {
    if (!configId || !rapportCfg) return;
    const c = rapportCfg;
    const nums = [c.grille_excellent, c.grille_bon, c.grille_surveiller].map(Number);
    if (!(nums[0] < nums[1] && nums[1] < nums[2])) {
      setRapportMsg("Les seuils doivent être croissants : Excellent < Bon < À surveiller.");
      return;
    }
    const { error } = await supabase
      .from("parametres_config")
      .update({
        grille_excellent: nums[0],
        grille_bon: nums[1],
        grille_surveiller: nums[2],
        seuil_min_dossiers: Math.max(0, Math.round(Number(c.seuil_min_dossiers) || 0)),
        rapport_redige_par: c.rapport_redige_par.trim(),
        rapport_diffusion: c.rapport_diffusion.trim(),
      })
      .eq("id", configId);
    setRapportMsg(error ? `Erreur : ${error.message}` : "Enregistré ✓");
  }

  async function purgerMaintenant() {
    if (!confirm(`Supprimer définitivement les pièces jointes des dossiers audités ou annulés depuis plus de ${conservation} jours ?`)) return;
    setPurge("…");
    const {
      data: { session },
    } = await supabase.auth.getSession();
    try {
      const res = await fetch("/api/purge-fichiers", { method: "POST", headers: { Authorization: `Bearer ${session?.access_token}` } });
      const j = await res.json();
      setPurge(res.ok ? `${j.supprimes} fichier(s) supprimé(s).` : `Erreur : ${j.error}`);
    } catch (e) {
      setPurge("Erreur : " + e.message);
    }
  }

  const [statuts, setStatuts] = useState(null);

  async function chargerStatuts() {
    let r = await supabase.from("parametres_etats").select("id, libelle, couleur, ordre, libelle_affiche, personnalise").order("ordre");
    if (r.error) r = await supabase.from("parametres_etats").select("id, libelle, couleur, ordre, libelle_affiche").order("ordre");
    if (r.error) r = await supabase.from("parametres_etats").select("id, libelle, couleur, ordre").order("ordre");
    // Statuts du circuit uniquement (les anciens libellés inutilisés sont masqués)
    const masques = ["En attente", "Encours de vérif"];
    setStatuts((r.data || []).filter((e) => (ETATS[e.libelle] || e.personnalise) && !masques.includes(e.libelle)));
  }

  const [nouveauStatut, setNouveauStatut] = useState("");
  async function ajouterStatut() {
    if (!nouveauStatut.trim()) return;
    const err = await actionListe(supabase, "parametres_etats", "ajouter", { valeur: nouveauStatut });
    if (err) return alert("Ajout impossible : " + err);
    setNouveauStatut("");
    chargerStatuts();
    refresh();
  }
  async function supprimerStatut(e) {
    if (!confirm(`Supprimer le statut « ${e.libelle_affiche || e.libelle} » ?`)) return;
    const err = await actionListe(supabase, "parametres_etats", "supprimer", { id: e.id });
    if (err) return alert(err);
    chargerStatuts();
    refresh();
  }

  async function majLibelle(etat, valeur) {
    const v = valeur.trim();
    if (v === (etat.libelle_affiche || "")) return;
    const { error } = await supabase.from("parametres_etats").update({ libelle_affiche: v || null }).eq("id", etat.id);
    if (error) return alert("Modification impossible (exécute la migration V12) : " + error.message);
    const suivant = (statuts || []).map((e) => (e.id === etat.id ? { ...e, libelle_affiche: v || null } : e));
    setStatuts(suivant);
    definirLibelles(Object.fromEntries(suivant.map((e) => [e.libelle, e.libelle_affiche])));
  }

  async function chargerEquipes() {
    const { data, error } = await supabase.from("equipes_clients").select("client, ingenieur");
    if (error) {
      setEquipes(new Set());
      alert("Table des équipes introuvable : exécute supabase/migration_workflow_v12.sql. (" + error.message + ")");
      return;
    }
    setEquipes(new Set((data || []).map((e) => `${e.client}|${e.ingenieur}`)));
  }

  async function basculerEquipe(client, ingenieur) {
    const cle = `${client}|${ingenieur}`;
    const actif = equipes.has(cle);
    const suivant = new Set(equipes);
    actif ? suivant.delete(cle) : suivant.add(cle);
    setEquipes(suivant);
    const { error } = actif
      ? await supabase.from("equipes_clients").delete().eq("client", client).eq("ingenieur", ingenieur)
      : await supabase.from("equipes_clients").insert({ client, ingenieur });
    if (error) {
      alert("Modification impossible : " + error.message);
      chargerEquipes();
    }
  }

  async function majCouleur(etat, couleur) {
    setStatuts((l) => l.map((e) => (e.id === etat.id ? { ...e, couleur } : e)));
    const { error } = await supabase.from("parametres_etats").update({ couleur }).eq("id", etat.id);
    if (error) alert("Modification impossible : " + error.message);
    else definirCouleurs(Object.fromEntries((statuts || []).map((e) => [e.libelle, e.id === etat.id ? couleur : e.couleur])));
  }

  async function chargerHabilitations() {
    const { data, error } = await supabase.from("ingenieur_habilitations").select("ingenieur, operation");
    if (error) {
      setHabs(new Set());
      alert("Table des habilitations introuvable : exécute supabase/migration_workflow_v9.sql. (" + error.message + ")");
      return;
    }
    setHabs(new Set((data || []).map((h) => `${h.ingenieur}|${h.operation}`)));
  }

  async function basculerHabilitation(ingenieur, operation) {
    const cle = `${ingenieur}|${operation}`;
    const actif = habs.has(cle);
    const suivant = new Set(habs);
    actif ? suivant.delete(cle) : suivant.add(cle);
    setHabs(suivant);
    const { error } = actif
      ? await supabase.from("ingenieur_habilitations").delete().eq("ingenieur", ingenieur).eq("operation", operation)
      : await supabase.from("ingenieur_habilitations").insert({ ingenieur, operation });
    if (error) {
      alert("Modification impossible : " + error.message);
      chargerHabilitations();
    }
  }

  async function chargerAudit() {
    const { data } = await supabase
      .from("audit_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    setAuditLog(data || []);
  }

  async function chargerBackups() {
    const { data } = await supabase
      .from("backups")
      .select("id, nb_dossiers, declenche_par, created_at")
      .order("created_at", { ascending: false })
      .limit(20);
    setBackups(data || []);
  }

  async function ajouterLigne() {
    if (!nouveau.trim()) return;
    const err = await actionListe(supabase, ongletActif, "ajouter", { valeur: nouveau });
    if (err) return alert("Ajout impossible : " + err);
    setNouveau("");
    chargerListe();
    refresh(); // la nouvelle valeur apparaît tout de suite dans les autres onglets et pages
  }

  async function modifierLigne(id, action, libelle) {
    if (action === "supprimer" && !confirm(`Supprimer définitivement « ${libelle} » ?`)) return;
    const err = await actionListe(supabase, ongletActif, action, { id });
    if (err) return alert(err);
    chargerListe();
    refresh();
  }


  async function majObjectif(ingenieur, champ, valeur) {
    await supabase.from("objectifs").upsert(
      { ingenieur, [champ]: Number(valeur) || 0 },
      { onConflict: "ingenieur" }
    );
    const { data } = await supabase.from("objectifs").select("*");
    setObjectifs(data || []);
  }

  async function lancerSauvegardeManuelle() {
    const { data: doss } = await supabase.from("dossiers").select("*");
    await supabase.from("backups").insert({
      contenu: doss,
      nb_dossiers: doss?.length || 0,
      declenche_par: profile.nom_complet,
    });
    chargerBackups();
    alert("Sauvegarde effectuée.");
  }

  function telechargerBackup(backup) {
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hillsolution_backup_${backup.created_at?.slice(0, 10)}.json`;
    a.click();
  }

  // Rôle sans accès à l'onglet courant (ex. Qualité sur « Listes ») → premier onglet autorisé
  useEffect(() => {
    if (!profile || vueAutorisee(vue)) return;
    const premiere = vuesVisibles[0]?.[0];
    if (!premiere) return;
    setVue(premiere);
    if (premiere === "habilitations") chargerHabilitations();
  }, [profile, vue]);

  if (erreurProfil) return <EcranErreurProfil message={erreurProfil} />;
  if (loading || !profile) return <EcranChargement />;

  function carteSeuil({ titre, description, valeur, onChange, step, min, icone, ton = "brand", unite = "heures", pied = null }) {
    const tons = {
      brand: "bg-brand-50 text-brand-600",
      red: "bg-isoRed-light text-isoRed",
      gold: "bg-isoGold-light text-isoGold-dark",
    };
    return (
      <div className="card p-5 flex flex-col gap-4">
        <div className="flex gap-3">
          <span className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${tons[ton]}`}>
            <Icon name={icone} size={17} />
          </span>
          <div>
            <p className="font-semibold text-sm">{titre}</p>
            <p className="text-xs text-ink/55 mt-1 leading-relaxed">{description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-auto">
          <input
            type="number"
            step={step}
            min={min}
            className="input w-28 tabular font-semibold"
            value={valeur}
            onChange={(e) => onChange(e.target.value)}
          />
          <span className="text-sm text-ink/50">{unite}</span>
        </div>
        {pied}
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Navbar role={profile.role} nom={profile.nom_complet} />
      <main className="max-w-[1800px] mx-auto px-3 sm:px-4 lg:px-5 py-6">
        <PageHeader
          icone="settings"
          titre="Paramètres"
          sousTitre={estAdmin ? "Configuration complète de l'application." : "Réglages du service Qualité : fiches, équipes, statuts, objectifs et délais."}
        />

        <div className="flex gap-1 mb-6 overflow-x-auto scrollbar-none border-b border-line">
          {vuesVisibles.map(([v, label, icone]) => (
            <button
              key={v}
              onClick={() => {
                setVue(v);
                if (v === "audit") chargerAudit();
                if (v === "habilitations") chargerHabilitations();
                if (v === "statuts") chargerStatuts();
                if (v === "backups") chargerBackups();
                if (v === "equipes") chargerEquipes();
              }}
              className={`flex items-center gap-2 px-3.5 h-10 -mb-px border-b-2 text-sm font-medium whitespace-nowrap transition-colors ${
                vue === v ? "border-brand-500 text-brand-600" : "border-transparent text-ink/55 hover:text-ink"
              }`}
            >
              <Icon name={icone} size={15} />
              {label}
            </button>
          ))}
        </div>

        {vueAutorisee(vue) && vue === "comptes" && estAdmin && <GestionComptes supabase={supabase} />}

        {vueAutorisee(vue) && vue === "listes" && (
          <div className="grid md:grid-cols-[220px_1fr] gap-6">
            <div className="flex md:flex-col gap-1 overflow-x-auto">
              {tablesVisibles.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setOngletActif(t.key)}
                  className={`text-left px-3 py-2 rounded-lg text-sm whitespace-nowrap transition-colors ${
                    ongletActif === t.key ? "bg-brand-50 text-brand-700 font-semibold" : "text-ink/65 hover:bg-ink/5"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="card">
              {ongletActif === "parametres_validateurs" && (
                <p className="px-4 pt-4 text-xs text-ink/55">
                  Noms acceptés dans « Audité par ». Pour qu'une personne puisse se connecter, crée-lui un compte (rôle Qualité) dans
                  l'onglet <strong>Comptes</strong> : elle est ajoutée ici automatiquement.
                </p>
              )}
              <div className="flex gap-2 p-4 border-b border-line">
                <input
                  className="input flex-1"
                  placeholder={`Ajouter — ${table.label.toLowerCase()}`}
                  value={nouveau}
                  onChange={(e) => setNouveau(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && ajouterLigne()}
                />
                <button onClick={ajouterLigne} className="btn-primary" disabled={!nouveau.trim()}>
                  <Icon name="plus" size={15} />
                  Ajouter
                </button>
              </div>
              <ul className="divide-y divide-line">
                {lignes.map((l) => (
                  <li
                    key={l.id}
                    className={`px-4 py-2.5 flex justify-between items-center text-sm gap-3 ${l.actif === false ? "opacity-45" : ""}`}
                  >
                    <span className="font-medium">
                      {l[table.champ]}
                      {l.actif === false && <span className="badge badge-neutral ml-2">Désactivé</span>}
                    </span>
                    <div className="flex items-center gap-2">
                      {l.actif === false ? (
                        <button onClick={() => modifierLigne(l.id, "reactiver")} className="btn-ghost btn-xs">
                          Réactiver
                        </button>
                      ) : (
                        <button onClick={() => modifierLigne(l.id, "desactiver")} className="btn-ghost btn-xs" title="Masquée des listes, conservée dans l'historique">
                          Désactiver
                        </button>
                      )}
                      <button
                        onClick={() => modifierLigne(l.id, "supprimer", l[table.champ])}
                        className="btn-ghost btn-xs text-isoRed hover:bg-isoRed-light"
                        title="Supprimer définitivement"
                      >
                        <Icon name="x" size={13} />
                        Supprimer
                      </button>
                    </div>
                  </li>
                ))}
                {lignes.length === 0 && <EmptyState texte="Liste vide." compact />}
              </ul>
            </div>
          </div>
        )}

        {vueAutorisee(vue) && vue === "habilitations" && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-ink/60">
              Coche les fiches CEE que chaque ingénieur peut prendre dans la file. La Qualité peut toujours assigner un dossier à la
              main hors habilitation.
            </p>
            <div className="card overflow-x-auto">
              {habs === null ? (
                <EmptyState icone="shield" texte="Chargement…" compact />
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Ingénieur</th>
                      {options.operations.map((op) => (
                        <th key={op} className="!text-center">{op}</th>
                      ))}
                      <th className="!text-right">Fiches</th>
                    </tr>
                  </thead>
                  <tbody>
                    {options.ingenieurs.map((ing) => {
                      const n = options.operations.filter((op) => habs.has(`${ing}|${op}`)).length;
                      return (
                        <tr key={ing}>
                          <td className="font-semibold capitalize">{ing}</td>
                          {options.operations.map((op) => {
                            const actif = habs.has(`${ing}|${op}`);
                            return (
                              <td key={op} className="text-center">
                                <button
                                  onClick={() => basculerHabilitation(ing, op)}
                                  aria-pressed={actif}
                                  aria-label={`${ing} — ${op}`}
                                  className={`w-7 h-7 rounded-md inline-flex items-center justify-center border transition-colors ${
                                    actif ? "bg-brand-500 border-brand-500 text-white" : "bg-white border-line text-transparent hover:border-ink/30"
                                  }`}
                                >
                                  <Icon name="check" size={15} />
                                </button>
                              </td>
                            );
                          })}
                          <td className="text-right tabular text-ink/60">{n}</td>
                        </tr>
                      );
                    })}
                    <tr>
                      <td className="text-xs text-ink/50">Ingénieurs habilités</td>
                      {options.operations.map((op) => {
                        const n = options.ingenieurs.filter((ing) => habs.has(`${ing}|${op}`)).length;
                        return (
                          <td key={op} className={`text-center text-xs font-semibold tabular ${n <= 1 ? "text-isoRed" : "text-ink/60"}`}>
                            {n}
                            {n <= 1 && <span className="block font-normal">à risque</span>}
                          </td>
                        );
                      })}
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {vueAutorisee(vue) && vue === "equipes" && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-ink/60">
              Coche les ingénieurs dédiés à un client. Les dossiers de ce client ne vont <strong>qu'à ces ingénieurs</strong> (attribution
              automatique et « Terminé → suivant ») et attendent dans la file s'ils sont occupés. Quand il n'y a plus de dossiers de leur
              client, ils reçoivent les dossiers normaux. Un client sans case cochée reste ouvert à tous les ingénieurs habilités.
            </p>
            <div className="card overflow-x-auto">
              {equipes === null ? (
                <EmptyState icone="users" texte="Chargement…" compact />
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Ingénieur</th>
                      {options.clients.map((c) => (
                        <th key={c} className="!text-center">{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {options.ingenieurs.map((ing) => (
                      <tr key={ing}>
                        <td className="font-semibold capitalize">{ing}</td>
                        {options.clients.map((c) => {
                          const actif = equipes.has(`${c}|${ing}`);
                          return (
                            <td key={c} className="text-center">
                              <button
                                onClick={() => basculerEquipe(c, ing)}
                                aria-pressed={actif}
                                aria-label={`${ing} — équipe ${c}`}
                                className={`w-7 h-7 rounded-md inline-flex items-center justify-center border transition-colors ${
                                  actif ? "bg-brand-500 border-brand-500 text-white" : "bg-white border-line text-transparent hover:border-ink/30"
                                }`}
                              >
                                <Icon name="check" size={15} />
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                    <tr>
                      <td className="text-xs text-ink/50">Équipe</td>
                      {options.clients.map((c) => {
                        const n = options.ingenieurs.filter((ing) => equipes.has(`${c}|${ing}`)).length;
                        return (
                          <td key={c} className="text-center text-xs tabular text-ink/60">
                            {n ? `${n} ingénieur(s)` : <span className="text-ink/35">ouvert à tous</span>}
                          </td>
                        );
                      })}
                    </tr>
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {vueAutorisee(vue) && vue === "donnees" && estAdmin && <SuppressionDonnees supabase={supabase} />}

        {vueAutorisee(vue) && vue === "statuts" && (
          <div className="flex flex-col gap-4 max-w-3xl">
            <p className="text-sm text-ink/60">
              Nom et couleur de chaque statut, appliqués partout dans l'app (Saisie, Qualité, Dashboard, écran ingénieur). Les statuts
              du circuit (<Icon name="lock" size={11} className="inline" />) ne se suppriment pas. Les statuts que tu ajoutes servent à
              « Mettre de côté » un dossier (page Qualité) et peuvent être supprimés s'ils ne sont utilisés par aucun dossier.
            </p>
            <div className="card p-3 flex gap-2">
              <input
                className="input flex-1"
                placeholder="Nouveau statut (ex. En attente client)"
                value={nouveauStatut}
                onChange={(e) => setNouveauStatut(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && ajouterStatut()}
              />
              <button className="btn-primary" onClick={ajouterStatut} disabled={!nouveauStatut.trim()}>
                <Icon name="plus" size={15} />
                Ajouter
              </button>
            </div>
            <div className="card divide-y divide-line">
              {statuts === null && <EmptyState texte="Chargement…" compact />}
              {(statuts || []).map((e) => {
                const hex = /^#[0-9a-f]{6}$/i.test(e.couleur || "") ? e.couleur : COULEURS_DEFAUT[e.libelle] || "#8A96A3";
                return (
                <div key={e.id} className="flex items-center gap-4 px-5 py-3">
                  <input
                    type="color"
                    value={hex}
                    onChange={(ev) => setStatuts((l) => l.map((x) => (x.id === e.id ? { ...x, couleur: ev.target.value } : x)))}
                    onBlur={(ev) => majCouleur(e, ev.target.value)}
                    className="w-10 h-10 rounded-lg border border-line cursor-pointer p-0.5 bg-white"
                    aria-label={`Couleur du statut ${ETATS[e.libelle]?.court}`}
                  />
                  <div className="flex-1 min-w-0">
                    <input
                      key={e.id + (e.libelle_affiche || "")}
                      className="input input-sm font-semibold max-w-xs"
                      defaultValue={e.libelle_affiche || LIBELLES_DEFAUT[e.libelle] || e.libelle}
                      onBlur={(ev) => majLibelle(e, ev.target.value === (LIBELLES_DEFAUT[e.libelle] || e.libelle) ? "" : ev.target.value)}
                      onKeyDown={(ev) => ev.key === "Enter" && ev.currentTarget.blur()}
                      aria-label={`Nom affiché du statut ${e.libelle}`}
                    />
                    <p className="text-xs text-ink/45 mt-1 flex items-center gap-1">
                      {e.personnalise ? (
                        <span className="badge badge-brand">Statut ajouté</span>
                      ) : (
                        <>
                          <Icon name="lock" size={11} />
                          Statut du circuit
                        </>
                      )}
                      <span>· valeur en base : {e.libelle}</span>
                    </p>
                  </div>
                  <span
                    className="badge badge-dot"
                    style={{
                      background: `${hex}22`,
                      color: assombrir(hex, 0.7),
                    }}
                  >
                    {ETATS[e.libelle]?.court || e.libelle_affiche || e.libelle}
                  </span>
                  {e.personnalise && (
                    <button className="btn-ghost btn-xs text-isoRed hover:bg-isoRed-light" onClick={() => supprimerStatut(e)}>
                      <Icon name="x" size={13} />
                      Supprimer
                    </button>
                  )}
                  {COULEURS_DEFAUT[e.libelle] && hex.toLowerCase() !== COULEURS_DEFAUT[e.libelle].toLowerCase() && (
                    <button className="btn-ghost btn-xs" onClick={() => majCouleur(e, COULEURS_DEFAUT[e.libelle])}>
                      Par défaut
                    </button>
                  )}
                </div>
                );
              })}
            </div>
          </div>
        )}

        {vueAutorisee(vue) && vue === "objectifs" && (
          <div className="card overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Ingénieur</th>
                  <th>Objectif nouveaux dossiers</th>
                  <th>Objectif modifications</th>
                </tr>
              </thead>
              <tbody>
                {ingenieurs.map((ing) => {
                  const obj = objectifs.find((o) => o.ingenieur === ing) || {};
                  return (
                    <tr key={ing}>
                      <td className="font-semibold capitalize">{ing}</td>
                      <td>
                        <input
                          type="number"
                          className="input input-sm w-24 tabular"
                          defaultValue={obj.objectif_nv_dossier || 0}
                          onBlur={(e) => majObjectif(ing, "objectif_nv_dossier", e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          className="input input-sm w-24 tabular"
                          defaultValue={obj.objectif_modif || 0}
                          onBlur={(e) => majObjectif(ing, "objectif_modif", e.target.value)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {vueAutorisee(vue) && vue === "config" && (
          <div className="grid md:grid-cols-3 gap-4">
            {carteSeuil({
              titre: "Seuil d'alerte — 1ʳᵉ vérification",
              description:
                "Un dossier soumis mais pas encore vérifié au-delà de ce délai passe en alerte (badge de temps rouge sur la page Qualité).",
              valeur: seuilVerification,
              onChange: majSeuilVerification,
              step: "0.5",
              min: "0.5",
              icone: "clock",
              ton: "gold",
            })}
            {carteSeuil({
              titre: "Seuil d'urgence",
              description: "Au-delà de ce délai sans vérification, le dossier est signalé en urgence (icône flamme) sur la page Qualité.",
              valeur: seuilUrgence,
              onChange: majSeuilUrgence,
              step: "1",
              min: "1",
              icone: "flame",
              ton: "red",
            })}
            {carteSeuil({
              titre: "Délai max. de traitement (ingénieur)",
              description: "Depuis l'acceptation d'un dossier, affiche un compte à rebours « Il te reste X h » dans Mes dossiers.",
              valeur: delaiMaxTraitement,
              onChange: majDelaiMaxTraitement,
              step: "1",
              min: "1",
              icone: "target",
              ton: "brand",
            })}
            {carteSeuil({
              titre: "Conservation des pièces jointes",
              description:
                "Les fichiers d'un dossier audité ou annulé sont supprimés automatiquement (chaque nuit) après ce délai, pour libérer l'espace de stockage.",
              valeur: conservation,
              onChange: majConservation,
              step: "1",
              min: "1",
              icone: "database",
              ton: "gold",
              unite: "jours",
              pied: (
                <div className="flex items-center gap-2 flex-wrap">
                  <button className="btn-secondary btn-sm" onClick={purgerMaintenant} disabled={purge === "…"}>
                    <Icon name="reset" size={13} />
                    Purger maintenant
                  </button>
                  {purge && <span className="text-xs text-ink/60">{purge === "…" ? "Purge en cours…" : purge}</span>}
                </div>
              ),
            })}
            <div className="card p-5 md:col-span-3">
              <p className="card-title mb-1">
                <Icon name="shield" size={15} className="text-ink/40" />
                Rapport qualité — grille de lecture et en-tête
              </p>
              {!rapportCfg ? (
                <p className="alert alert-gold text-sm mt-2">Exécutez la migration V17 dans Supabase pour régler ces paramètres (les valeurs par défaut 10 / 30 / 50 % et 5 dossiers s'appliquent en attendant).</p>
              ) : (
                <>
                  <p className="text-xs text-ink/55 mb-4">
                    Taux de retour interne : Excellent ≤ seuil 1, Bon ≤ seuil 2, À surveiller ≤ seuil 3, Critique au-delà. Les ingénieurs ayant moins de dossiers que le minimum ne comptent pas dans le « taux moyen simple ».
                  </p>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end">
                    {[
                      ["grille_excellent", "Excellent ≤ (%)", "#5B9E47"],
                      ["grille_bon", "Bon ≤ (%)", "#E6A23C"],
                      ["grille_surveiller", "À surveiller ≤ (%)", "#EE8B5B"],
                      ["seuil_min_dossiers", "Min. dossiers (moyenne)", null],
                    ].map(([k, label, c]) => (
                      <label key={k} className="text-xs font-semibold text-ink/60 flex flex-col gap-1">
                        <span className="flex items-center gap-1.5">
                          {c && <span className="w-2.5 h-2.5 rounded-full" style={{ background: c }} />}
                          {label}
                        </span>
                        <input
                          type="number"
                          min="0"
                          className="input"
                          value={rapportCfg[k]}
                          onChange={(e) => setRapportCfg((x) => ({ ...x, [k]: e.target.value }))}
                        />
                      </label>
                    ))}
                    <label className="text-xs font-semibold text-ink/60 flex flex-col gap-1">
                      Rédigé par
                      <input className="input" value={rapportCfg.rapport_redige_par} onChange={(e) => setRapportCfg((x) => ({ ...x, rapport_redige_par: e.target.value }))} />
                    </label>
                    <label className="text-xs font-semibold text-ink/60 flex flex-col gap-1">
                      Diffusion
                      <input className="input" value={rapportCfg.rapport_diffusion} onChange={(e) => setRapportCfg((x) => ({ ...x, rapport_diffusion: e.target.value }))} />
                    </label>
                  </div>
                  <div className="flex items-center gap-3 mt-4">
                    <button className="btn-primary btn-sm" onClick={enregistrerRapportCfg}>
                      <Icon name="check" size={14} />
                      Enregistrer
                    </button>
                    {rapportMsg && <span className="text-xs text-ink/60">{rapportMsg}</span>}
                    <span className="text-xs text-ink/45 ml-auto">Les colonnes de causes du rapport = la liste « Causes de retour interne » (onglet Listes).</span>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {vueAutorisee(vue) && vue === "supprimes" && <DossiersSupprimes supabase={supabase} />}

        {vueAutorisee(vue) && vue === "audit" && (
          <div className="card overflow-x-auto">
            <table className="table table-hover">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Action</th>
                  <th>Table</th>
                  <th>Par</th>
                </tr>
              </thead>
              <tbody>
                {auditLog.map((a) => (
                  <tr key={a.id}>
                    <td className="whitespace-nowrap text-ink/60 tabular">{new Date(a.created_at).toLocaleString("fr-FR")}</td>
                    <td>
                      <span
                        className={`badge ${
                          a.action === "DELETE" ? "badge-red" : a.action === "INSERT" ? "badge-green" : "badge-brand"
                        }`}
                      >
                        {a.action}
                      </span>
                    </td>
                    <td className="font-mono text-xs text-ink/65">{a.table_name}</td>
                    <td className="capitalize">{a.effectue_par_nom || "—"}</td>
                  </tr>
                ))}
                {auditLog.length === 0 && (
                  <tr>
                    <td colSpan={4} className="table-empty">Aucune entrée.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {vueAutorisee(vue) && vue === "backups" && (
          <div className="flex flex-col gap-4">
            <div className="card p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <p className="font-semibold text-sm">Sauvegarde manuelle</p>
                <p className="text-xs text-ink/55 mt-1">
                  Une sauvegarde automatique hebdomadaire est aussi planifiée côté Supabase (fonction{" "}
                  <code className="font-mono bg-paper px-1 rounded">fn_backup_hebdomadaire</code>).
                </p>
              </div>
              <button onClick={lancerSauvegardeManuelle} className="btn-primary">
                <Icon name="database" size={15} />
                Sauvegarder maintenant
              </button>
            </div>
            <div className="card divide-y divide-line">
              {backups.map((b) => (
                <div key={b.id} className="px-5 py-3 flex justify-between items-center text-sm gap-3">
                  <div className="flex items-center gap-3">
                    <span className="w-8 h-8 rounded-lg bg-paper text-ink/50 flex items-center justify-center">
                      <Icon name="database" size={15} />
                    </span>
                    <div>
                      <p className="font-semibold">{new Date(b.created_at).toLocaleString("fr-FR")}</p>
                      <p className="text-ink/45 text-xs">
                        {b.nb_dossiers} dossiers · {b.declenche_par}
                      </p>
                    </div>
                  </div>
                  <button onClick={() => telechargerBackup(b)} className="btn-secondary btn-xs">
                    <Icon name="download" size={13} />
                    Télécharger
                  </button>
                </div>
              ))}
              {backups.length === 0 && <EmptyState icone="database" texte="Aucune sauvegarde encore." />}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
