"use client";
import { useEffect, useRef, useState } from "react";
import Icon from "@/components/ui/Icon";

/** Ajoute un message dans les échanges d'un dossier (table dossier_commentaires). */
export async function ajouterEchange(supabase, dossierId, auteur, texte) {
  const contenu = String(texte || "").trim();
  if (!contenu) return null;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase.from("dossier_commentaires").insert({
    dossier_id: dossierId,
    auteur_id: user?.id,
    auteur_nom: auteur || "—",
    contenu,
  });
  return error ? error.message : null;
}

/**
 * Nombre de messages par dossier + auteur du dernier message, pour signaler
 * dans les listes qu'un échange attend une réponse.
 */
export async function resumeEchanges(supabase, ids) {
  if (!ids?.length) return {};
  const res = {};
  for (let i = 0; i < ids.length; i += 200) {
    // eslint-disable-next-line no-await-in-loop
    const { data } = await supabase
      .from("dossier_commentaires")
      .select("dossier_id, auteur_nom, created_at")
      .in("dossier_id", ids.slice(i, i + 200))
      .order("created_at", { ascending: true })
      .limit(5000);
    for (const c of data || []) {
      const r = res[c.dossier_id] || (res[c.dossier_id] = { total: 0, dernier: null });
      r.total += 1;
      r.dernier = c.auteur_nom;
    }
  }
  return res;
}

const memeNom = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();

/**
 * Pastille « n messages » ; rouge si le dernier message attend une réponse :
 * il vient de quelqu'un d'autre (moi) ou de l'une des personnes surveillées (de, ex. l'ingénieur du dossier).
 */
export function PastilleEchanges({ resume, moi, de }) {
  if (!resume?.total) return null;
  const aRepondre = !!resume.dernier && (de ? de.some((n) => n && memeNom(n, resume.dernier)) : !memeNom(resume.dernier, moi));
  return (
    <span
      className={`badge ${aRepondre ? "badge-red" : "badge-neutral"}`}
      title={aRepondre ? `Dernier message de ${resume.dernier}` : "Échanges sur ce dossier"}
    >
      <Icon name="message" size={11} />
      {resume.total}
    </span>
  );
}

/**
 * Échanges sur un dossier entre la Saisie / la Qualité et l'ingénieur :
 * note donnée à la création, notes d'attribution, remarques de retour,
 * commentaires de l'ingénieur à l'envoi, et réponses libres.
 */
export default function EchangesDossier({ supabase, dossier, auteur, peutEcrire = true, compact = false, rafraichir = 0, onChange }) {
  const [messages, setMessages] = useState(null);
  const [texte, setTexte] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState("");
  const bas = useRef(null);

  async function charger() {
    const { data, error } = await supabase
      .from("dossier_commentaires")
      .select("*")
      .eq("dossier_id", dossier.id)
      .order("created_at", { ascending: true });
    setMessages(error ? [] : data || []);
  }

  useEffect(() => {
    charger();
  }, [dossier.id, rafraichir]);

  useEffect(() => {
    bas.current?.scrollIntoView({ block: "nearest" });
  }, [messages?.length]);

  async function envoyer() {
    if (!texte.trim()) return;
    setEnvoi(true);
    const err = await ajouterEchange(supabase, dossier.id, auteur, texte);
    setEnvoi(false);
    if (err) return setErreur("Message non envoyé : " + err);
    setErreur("");
    setTexte("");
    charger();
    onChange?.();
  }

  const liste = [
    ...(dossier.commentaire ? [{ id: "creation", auteur_nom: "Note à la création", contenu: dossier.commentaire, created_at: dossier.created_at, systeme: true }] : []),
    ...(messages || []),
  ];

  return (
    <div className="flex flex-col gap-2">
      <div className={`flex flex-col gap-2 overflow-y-auto ${compact ? "max-h-56" : "max-h-80"}`}>
        {messages === null ? (
          <p className="text-xs text-ink/45">Chargement…</p>
        ) : liste.length === 0 ? (
          <p className="text-xs text-ink/45">Aucun échange pour l'instant.</p>
        ) : (
          liste.map((m) => {
            const deMoi = !m.systeme && memeNom(m.auteur_nom, auteur);
            return (
              <div key={m.id} className={`flex ${deMoi ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                    m.systeme ? "bg-isoGold-light/70" : deMoi ? "bg-brand-50 border border-brand-500/15" : "bg-paper border border-line"
                  }`}
                >
                  <p className="text-[11px] text-ink/50 mb-0.5">
                    <span className={`font-semibold text-ink/70 ${m.systeme ? "" : "capitalize"}`}>{deMoi ? "Moi" : m.auteur_nom}</span>
                    {m.created_at && (
                      <>
                        {" · "}
                        {new Date(m.created_at).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      </>
                    )}
                  </p>
                  <p className="whitespace-pre-wrap break-words">{m.contenu}</p>
                </div>
              </div>
            );
          })
        )}
        <div ref={bas} />
      </div>
      {peutEcrire && (
        <div className="flex gap-2">
          <input
            className="input input-sm flex-1"
            placeholder="Écrire un message…"
            value={texte}
            onChange={(e) => setTexte(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                envoyer();
              }
            }}
          />
          <button className="btn-secondary btn-sm" onClick={envoyer} disabled={envoi || !texte.trim()}>
            <Icon name="send" size={13} />
            Envoyer
          </button>
        </div>
      )}
      {erreur && <p className="text-xs text-isoRed">{erreur}</p>}
    </div>
  );
}
