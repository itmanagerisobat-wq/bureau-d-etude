"use client";
import { useEffect, useRef, useState } from "react";
import Icon from "@/components/ui/Icon";

export const BUCKET = "dossiers-fichiers";
const TAILLE_MAX = 50 * 1024 * 1024; // 50 Mo (limite de l'offre gratuite Supabase)

function nomPropre(nom) {
  return nom
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .slice(-120);
}

function taille(o) {
  if (!o && o !== 0) return "";
  if (o < 1024) return `${o} o`;
  if (o < 1024 * 1024) return `${Math.round(o / 1024)} Ko`;
  return `${(o / 1024 / 1024).toFixed(1).replace(".", ",")} Mo`;
}

/** Dépose des fichiers pour un dossier (utilisé aussi à la création d'un dossier). */
export async function deposerFichiers(supabase, dossierId, fichiers, categorie, auteur, versionDepart = 1) {
  const erreurs = [];
  let version = versionDepart;
  for (const f of fichiers) {
    if (f.size > TAILLE_MAX) {
      erreurs.push(`${f.name} : trop lourd (max 50 Mo)`);
      continue;
    }
    const chemin = `${dossierId}/${categorie}/${Date.now()}_${nomPropre(f.name)}`;
    const { error } = await supabase.storage.from(BUCKET).upload(chemin, f, { contentType: f.type || undefined });
    if (error) {
      erreurs.push(`${f.name} : ${error.message}`);
      continue;
    }
    const { error: e2 } = await supabase.from("dossier_fichiers").insert({
      dossier_id: dossierId,
      categorie,
      nom_fichier: f.name,
      chemin,
      taille: f.size,
      type_mime: f.type || null,
      version: categorie === "livrable" ? version++ : 1,
      depose_par_nom: auteur || null,
    });
    if (e2) erreurs.push(`${f.name} : ${e2.message}`);
  }
  return erreurs;
}

/** Télécharge un fichier sur le poste (sans ouvrir d'onglet). Renvoie un message d'erreur ou null. */
export async function telechargerFichier(supabase, f) {
  const { data, error } = await supabase.storage.from(BUCKET).download(f.chemin);
  if (error) return `Téléchargement impossible (${f.nom_fichier}) : ${error.message}`;
  const url = URL.createObjectURL(data);
  const a = document.createElement("a");
  a.href = url;
  a.download = f.nom_fichier;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return null;
}

/**
 * Pièces d'un dossier :
 *  - « Pièces reçues » : déposées par la Qualité, téléchargées par l'ingénieur
 *  - « Livrables » : déposés par l'ingénieur (versions successives), téléchargés par la Qualité
 */
export default function FichiersDossier({ supabase, dossier, auteur, peutDeposerPieces, peutDeposerLivrables, peutSupprimer, compact = false, onChange }) {
  const [fichiers, setFichiers] = useState(null);
  const [envoi, setEnvoi] = useState(null); // categorie en cours d'envoi
  const [erreurs, setErreurs] = useState([]);
  const refPieces = useRef(null);
  const refLivrables = useRef(null);

  async function charger() {
    const { data, error } = await supabase
      .from("dossier_fichiers")
      .select("*")
      .eq("dossier_id", dossier.id)
      .order("created_at", { ascending: false });
    setFichiers(error ? [] : data || []);
    if (error) setErreurs(["Pièces jointes indisponibles : exécute supabase/migration_workflow_v10.sql."]);
  }

  useEffect(() => {
    charger();
  }, [dossier.id]);

  async function deposer(e, categorie) {
    const liste = [...(e.target.files || [])];
    e.target.value = "";
    if (!liste.length) return;
    setEnvoi(categorie);
    const versionDepart = (fichiers || []).filter((f) => f.categorie === "livrable").reduce((m, f) => Math.max(m, f.version), 0) + 1;
    const errs = await deposerFichiers(supabase, dossier.id, liste, categorie, auteur, versionDepart);
    setErreurs(errs);
    setEnvoi(null);
    charger();
    onChange?.();
  }

  async function telecharger(f) {
    const err = await telechargerFichier(supabase, f);
    if (err) alert(err);
  }

  async function supprimer(f) {
    if (!confirm(`Supprimer « ${f.nom_fichier} » ?`)) return;
    await supabase.storage.from(BUCKET).remove([f.chemin]);
    await supabase.from("dossier_fichiers").delete().eq("id", f.id);
    charger();
    onChange?.();
  }

  async function toutTelecharger(liste) {
    for (const f of liste) {
      // eslint-disable-next-line no-await-in-loop
      await telecharger(f);
    }
  }

  const pieces = (fichiers || []).filter((f) => f.categorie === "piece");
  const livrables = (fichiers || []).filter((f) => f.categorie === "livrable");

  function bloc(titre, icone, liste, categorie, peutDeposer, ref, vide) {
    return (
      <div className={`rounded-xl border border-line bg-white ${compact ? "" : ""}`}>
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-line">
          <p className="text-xs font-semibold text-ink/70 flex items-center gap-1.5">
            <Icon name={icone} size={13} className="text-ink/40" />
            {titre}
            <span className="badge badge-neutral">{liste.length}</span>
          </p>
          <div className="flex gap-1">
            {liste.length > 1 && (
              <button className="btn-ghost btn-xs" onClick={() => toutTelecharger(liste)}>
                <Icon name="download" size={12} />
                Tout
              </button>
            )}
            {peutDeposer && (
              <>
                <button className="btn-secondary btn-xs" onClick={() => ref.current?.click()} disabled={envoi === categorie}>
                  <Icon name="upload" size={12} />
                  {envoi === categorie ? "Envoi…" : "Déposer"}
                </button>
                <input ref={ref} type="file" multiple className="hidden" onChange={(e) => deposer(e, categorie)} />
              </>
            )}
          </div>
        </div>
        {fichiers === null ? (
          <p className="text-xs text-ink/40 px-3 py-3">Chargement…</p>
        ) : liste.length === 0 ? (
          <p className="text-xs text-ink/40 px-3 py-3">{vide}</p>
        ) : (
          <ul className="divide-y divide-line max-h-56 overflow-y-auto">
            {liste.map((f) => (
              <li key={f.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                <Icon name="file" size={14} className="text-ink/40" />
                <button className="min-w-0 flex-1 text-left hover:text-brand-600" onClick={() => telecharger(f)} title="Télécharger">
                  <span className="block truncate font-medium">
                    {f.categorie === "livrable" && <span className="badge badge-brand mr-1.5">v{f.version}</span>}
                    {f.nom_fichier}
                  </span>
                  <span className="block text-[11px] text-ink/45">
                    {taille(f.taille)} · {new Date(f.created_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
                    {f.depose_par_nom ? ` · ${f.depose_par_nom}` : ""}
                  </span>
                </button>
                <button className="btn-icon w-7 h-7" onClick={() => telecharger(f)} aria-label="Télécharger">
                  <Icon name="download" size={14} />
                </button>
                {peutSupprimer && (
                  <button className="btn-icon w-7 h-7 hover:text-isoRed" onClick={() => supprimer(f)} aria-label="Supprimer">
                    <Icon name="x" size={14} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className={`grid gap-3 ${compact ? "" : "sm:grid-cols-2"}`}>
        {bloc("Pièces reçues", "inbox", pieces, "piece", peutDeposerPieces, refPieces, "Aucune pièce jointe.")}
        {bloc("Livrables de l'ingénieur", "send", livrables, "livrable", peutDeposerLivrables, refLivrables, "Aucun livrable déposé.")}
      </div>
      {erreurs.length > 0 && (
        <div className="alert alert-red">
          <Icon name="alert" size={15} className="mt-0.5" />
          <span>
            {erreurs.map((e) => (
              <span key={e} className="block">
                {e}
              </span>
            ))}
          </span>
        </div>
      )}
    </div>
  );
}
