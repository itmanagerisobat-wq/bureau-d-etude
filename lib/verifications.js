// Vérifications de la Qualité : chaque audit compte, même quand un même dossier revient
// (retour client, nouvelle modification) et est vérifié une deuxième ou une troisième fois.
// Source : l'historique (événements « Validé » et « retour levé, dossier validé »).
// Les anciens dossiers sans historique comptent une fois, avec leur date d'audit.

const TYPES = ["verification_ok", "retour_annule"];

/** Lit les événements d'audit depuis une date, par pages de 1000 (limite Supabase). */
export async function chargerVerifications(supabase, depuisISO) {
  const lignes = [];
  for (let page = 0; page < 50; page++) {
    const { data, error } = await supabase
      .from("dossier_evenements")
      .select("id, dossier_id, type, effectue_par_nom, created_at")
      .in("type", TYPES)
      .gte("created_at", depuisISO)
      .order("created_at", { ascending: true })
      .range(page * 1000, page * 1000 + 999);
    if (error) return null;
    lignes.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return lignes;
}

/**
 * Liste des vérifications [{ dossier_id, date, par, dossier }] :
 * les événements d'audit, plus les dossiers audités qui n'ont aucun événement (données anciennes).
 */
export function listeVerifications(dossiers, evenements) {
  const parId = new Map(dossiers.map((d) => [d.id, d]));
  if (!evenements) {
    return dossiers.filter((d) => d.date_verification).map((d) => ({ dossier_id: d.id, date: d.date_verification, par: d.valide_par || "", dossier: d }));
  }
  const avecEvt = new Set(evenements.map((e) => e.dossier_id));
  const liste = evenements.map((e) => ({ dossier_id: e.dossier_id, date: e.created_at, par: e.effectue_par_nom || parId.get(e.dossier_id)?.valide_par || "", dossier: parId.get(e.dossier_id) || null }));
  for (const d of dossiers) {
    if (d.date_verification && !avecEvt.has(d.id)) liste.push({ dossier_id: d.id, date: d.date_verification, par: d.valide_par || "", dossier: d });
  }
  return liste;
}

/** Début de l'année précédente : assez d'historique pour les filtres Mois / Année et les comparaisons. */
export function debutHistorique() {
  const a = new Date().getFullYear() - 1;
  return new Date(a, 0, 1).toISOString();
}
