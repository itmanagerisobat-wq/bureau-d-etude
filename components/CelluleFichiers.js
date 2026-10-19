"use client";
import { useEffect, useRef, useState } from "react";
import Icon from "@/components/ui/Icon";
import { deposerFichiers, telechargerFichier } from "@/components/FichiersDossier";

/** Index des fichiers de tous les dossiers (une seule requête pour tout le tableau). */
export function useFichiers(supabase, actif = true) {
  const [parDossier, setParDossier] = useState({});
  const [indisponible, setIndisponible] = useState(false);

  async function recharger() {
    const { data, error } = await supabase
      .from("dossier_fichiers")
      .select("id, dossier_id, categorie, nom_fichier, chemin, version, created_at")
      .order("created_at", { ascending: true })
      .limit(20000);
    if (error) {
      setIndisponible(true);
      return;
    }
    const m = {};
    for (const f of data || []) (m[f.dossier_id] = m[f.dossier_id] || []).push(f);
    setParDossier(m);
  }

  useEffect(() => {
    if (actif) recharger();
  }, [actif]);

  return { parDossier, recharger, indisponible };
}

/**
 * Cellule « Fichiers » en fin de ligne :
 *  - Insérer : dépose une ou plusieurs pièces sans ouvrir le dossier
 *  - ⬇ N : télécharge tous les fichiers du dossier
 *  - pastille verte : l'ingénieur a déposé un livrable (clic = télécharger les livrables)
 */
export default function CelluleFichiers({ supabase, dossier, fichiers = [], auteur, onChange, desactive, sansInserer = false }) {
  const ref = useRef(null);
  const [etat, setEtat] = useState(null); // "envoi" | "telechargement"
  const livrables = fichiers.filter((f) => f.categorie === "livrable");

  async function deposer(e) {
    const liste = [...(e.target.files || [])];
    e.target.value = "";
    if (!liste.length) return;
    setEtat("envoi");
    const erreurs = await deposerFichiers(supabase, dossier.id, liste, "piece", auteur);
    setEtat(null);
    if (erreurs.length) alert(erreurs.join("\n"));
    onChange?.();
  }

  async function toutTelecharger(liste) {
    setEtat("telechargement");
    const erreurs = [];
    for (const f of liste) {
      // eslint-disable-next-line no-await-in-loop
      const err = await telechargerFichier(supabase, f);
      if (err) erreurs.push(err);
    }
    setEtat(null);
    if (erreurs.length) alert(erreurs.join("\n"));
  }

  if (desactive || (sansInserer && !fichiers.length)) return <span className="block text-right text-ink/25 text-xs">—</span>;

  return (
    <div className="flex items-center gap-1 justify-end whitespace-nowrap">
      {fichiers.length > 0 && (
        <button
          className="btn-ghost btn-xs tabular"
          onClick={() => toutTelecharger(fichiers)}
          disabled={!!etat}
          title={fichiers.map((f) => (f.categorie === "livrable" ? `[livrable v${f.version}] ` : "") + f.nom_fichier).join("\n")}
          aria-label={`Télécharger les ${fichiers.length} fichier(s)`}
        >
          <Icon name="download" size={13} />
          {etat === "telechargement" ? "…" : fichiers.length}
        </button>
      )}
      {livrables.length > 0 && (
        <button
          className="w-2.5 h-2.5 rounded-full bg-isoGreen ring-2 ring-isoGreen-light"
          onClick={() => toutTelecharger(livrables)}
          title={`Livrable déposé par l'ingénieur (v${livrables[livrables.length - 1].version}) — cliquer pour télécharger`}
          aria-label="Télécharger le livrable"
        />
      )}
      {!sansInserer && (
        <>
          <button className="btn-secondary btn-xs" onClick={() => ref.current?.click()} disabled={!!etat} title="Joindre des fichiers au dossier">
            <Icon name="upload" size={13} />
            {etat === "envoi" ? "Envoi…" : "Insérer"}
          </button>
          <input ref={ref} type="file" multiple className="hidden" onChange={deposer} />
        </>
      )}
    </div>
  );
}
