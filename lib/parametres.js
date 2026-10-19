/**
 * Modifie une liste de Paramètres (ajouter / desactiver / reactiver / supprimer).
 * Passe par la fonction de la base fn_parametre_liste (V14) ; sans elle, écrit directement
 * dans la table et vérifie qu'une ligne a bien été modifiée.
 * Renvoie un message d'erreur en français, ou null si tout s'est bien passé.
 */
const COLONNES = {
  parametres_ingenieurs: "nom",
  parametres_clients: "nom",
  parametres_validateurs: "nom",
  parametres_operations: "libelle",
  parametres_causes_retour: "libelle",
  parametres_etats: "libelle",
};

function traduire(message = "") {
  if (/foreign key|violates foreign key|still referenced/i.test(message))
    return "Cette valeur est utilisée par des dossiers : elle ne peut pas être supprimée. Désactive-la plutôt.";
  if (/duplicate key|unique/i.test(message)) return "Cette valeur existe déjà.";
  if (/statut_du_circuit/.test(message)) return "Ce statut fait partie du circuit des dossiers : il ne peut pas être supprimé.";
  if (/reserve_admin/.test(message)) return "Réservé à l'administrateur.";
  if (/non_autorise|row-level security|permission denied/i.test(message))
    return "Droits insuffisants pour modifier cette liste (exécute la migration V14 dans Supabase).";
  if (/valeur_vide/.test(message)) return "La valeur est vide.";
  return message;
}

export async function actionListe(supabase, table, action, { id = null, valeur = null } = {}) {
  const { error } = await supabase.rpc("fn_parametre_liste", { p_table: table, p_action: action, p_id: id, p_valeur: valeur });
  if (!error) return null;
  const fonctionAbsente = /fn_parametre_liste|Could not find the function|PGRST202/i.test(error.message + (error.code || ""));
  if (!fonctionAbsente) return traduire(error.message);

  // Repli sans la V14 : écriture directe, en vérifiant le nombre de lignes touchées
  const col = COLONNES[table];
  let r;
  if (action === "ajouter") {
    const ligne = { [col]: (valeur || "").trim() };
    if (table === "parametres_causes_retour") ligne.type = "generique";
    if (table === "parametres_etats") Object.assign(ligne, { couleur: "#8A96A3", ordre: 80, personnalise: true });
    r = await supabase.from(table).insert(ligne).select("id");
  } else if (action === "supprimer") {
    r = await supabase.from(table).delete().eq("id", id).select("id");
  } else {
    r = await supabase.from(table).update({ actif: action === "reactiver" }).eq("id", id).select("id");
  }
  if (r.error) return traduire(r.error.message);
  if (!r.data?.length)
    return "Aucune modification enregistrée : la base refuse l'écriture. Exécute supabase/migration_workflow_v14.sql dans Supabase.";
  return null;
}
