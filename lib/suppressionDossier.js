/**
 * Suppression d'un dossier (admin et Responsables) : motif obligatoire, copie complète archivée
 * dans le journal des suppressions (consultable et restaurable par l'admin — Paramètres → Dossiers supprimés).
 * Renvoie true si le dossier a été supprimé.
 */
export async function supprimerDossierAvecTrace(supabase, d) {
  const motif = window.prompt(
    `Supprimer définitivement le dossier « ${d.nom_dossier} » ?\n\nIndiquez le motif de la suppression (obligatoire, conservé dans le journal) :`
  );
  if (motif === null) return false;
  if (!motif.trim()) {
    alert("Le motif est obligatoire : dossier non supprimé.");
    return false;
  }
  const { error } = await supabase.rpc("fn_supprimer_dossier", { p_id: d.id, p_motif: motif.trim() });
  if (error) {
    alert(
      /fn_supprimer_dossier|function/i.test(error.message) && /not find|does not exist|introuvable/i.test(error.message)
        ? "Suppression indisponible : exécutez la migration V22 dans Supabase."
        : error.message.includes("reserve_admin")
          ? "Seuls l'admin et les Responsables peuvent supprimer un dossier."
          : "Suppression impossible : " + error.message
    );
    return false;
  }
  return true;
}
