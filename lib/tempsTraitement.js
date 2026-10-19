// Temps de traitement d'un dossier par l'ingénieur, pauses exclues.
//   - temps_traitement_s : secondes déjà passées sur le dossier (figées à chaque pause, attente d'info ou envoi)
//   - date_acceptation   : début de la séance en cours (quand le dossier est « Encours »)
// Le chrono = temps figé + temps de la séance en cours. Pendant une pause, il ne bouge plus.

const EN_COURS = "Encours";

/** Secondes passées sur le dossier (séance en cours comprise si le dossier est en cours). */
export function secondesTraitement(d, maintenant = Date.now()) {
  if (!d) return 0;
  const base = Number(d.temps_traitement_s) || 0;
  if (d.etat === EN_COURS && d.date_acceptation) {
    return base + Math.max(0, (maintenant - new Date(d.date_acceptation).getTime()) / 1000);
  }
  return base;
}

/** Heures passées sur un dossier en cours (pour le chrono et la charge des ingénieurs). */
export function heuresTraitement(d) {
  return secondesTraitement(d) / 3600;
}

/** Durée de traitement d'un dossier terminé (pauses exclues) ; anciens dossiers : envoi − prise. */
export function heuresTraitementFini(d) {
  if (Number(d?.temps_traitement_s) > 0) return d.temps_traitement_s / 3600;
  if (d?.date_acceptation && d?.date_soumission) {
    const h = (new Date(d.date_soumission) - new Date(d.date_acceptation)) / 3600000;
    return h > 0 ? h : null;
  }
  return null;
}

/** Champs à enregistrer pour arrêter le chrono (pause, attente d'info, envoi au contrôle). */
export function figerTemps(d) {
  return { temps_traitement_s: Math.round(secondesTraitement(d)) };
}

/**
 * Mise à jour d'un dossier ; si la colonne temps_traitement_s n'existe pas encore (migration V29
 * non exécutée), on réessaie sans elle pour ne pas bloquer l'ingénieur.
 */
export async function majDossier(supabase, id, champs, filtres = (q) => q, avecSelect = false) {
  const lancer = (c) => {
    let q = filtres(supabase.from("dossiers").update(c).eq("id", id));
    return avecSelect ? q.select("id") : q;
  };
  let res = await lancer(champs);
  if (res.error && /temps_traitement_s/.test(res.error.message || "") && "temps_traitement_s" in champs) {
    const { temps_traitement_s, ...reste } = champs; // eslint-disable-line no-unused-vars
    res = await lancer(reste);
  }
  return res;
}
