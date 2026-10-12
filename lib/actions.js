/**
 * Actions communes sur un dossier — renvoient les ids créés pour pouvoir
 * annuler proprement (l'annulation retire aussi l'événement de l'historique).
 */
export async function enregistrerEvenement(supabase, dossierId, type, { cause = null, nom = null } = {}) {
  const { data, error } = await supabase
    .from("dossier_evenements")
    .insert({ dossier_id: dossierId, type, cause, effectue_par_nom: nom })
    .select("id")
    .single();
  if (error) console.error("Événement non enregistré :", error.message);
  return data?.id || null;
}

/** Annule une action : restaure les champs, supprime l'événement et le retour créés. */
export async function annulerAction(supabase, { dossierId, ancienChamps, evenementId, retourId }) {
  const { error } = await supabase.from("dossiers").update(ancienChamps).eq("id", dossierId);
  if (evenementId) await supabase.from("dossier_evenements").delete().eq("id", evenementId);
  if (retourId) await supabase.from("dossier_retours").delete().eq("id", retourId);
  return error;
}

/** Champs d'un dossier modifiés par le circuit (sauvegardés avant chaque action). */
export const CHAMPS_CIRCUIT = [
  "etat",
  "ingenieur",
  "date_acceptation",
  "date_soumission",
  "date_verification",
  "valide_par",
  "retour_interne",
  "cause_retour_interne",
  "retour_client",
  "cause_retour_client",
  "date_retour_client",
  "ingenieur_modif",
  "nb_retours",
  "a_corriger",
  "prioritaire",
  "motif_statut",
  "hors_habilitation",
  "pris_en_charge_par",
  "dernier_retour_type",
  "date_prise_en_charge",
];

export function instantane(d) {
  return Object.fromEntries(CHAMPS_CIRCUIT.filter((c) => c in d).map((c) => [c, d[c]]));
}
