// ============================================================
// Logique de calcul des scores — reprend fidèlement les formules
// de la feuille STATISTIQUES du classeur Excel d'origine.
// ============================================================

/**
 * Score Qualité (/50) — proportionnel au taux de retour
 * Ne compte que les retours INTERNES (faute imputable à l'ingénieur) —
 * un retour client (modification demandée après coup) n'est pas une faute
 * qualité de l'ingénieur, donc ne pénalise pas ce score.
 * Excel (originel): MAX(0, 50 * (1 - retours / dossiers_traités))
 */
export function scoreQualite(dossiersTraites, retoursInternesUniquement) {
  if (!dossiersTraites || dossiersTraites === 0) return null; // "" dans Excel
  return Math.max(0, 50 * (1 - retoursInternesUniquement / dossiersTraites));
}

/**
 * Statut d'atteinte d'objectif
 * Excel: Atteint / Partiellement atteint / Non atteint / N/A
 */
export function statutAtteinteObjectif(nvDossierTraite, modifTraite, objectifNv, objectifModif) {
  const objNv = objectifNv || 0;
  const objModif = objectifModif || 0;
  if (objNv === 0 && objModif === 0) return "N/A";
  const atteintNv = nvDossierTraite >= objNv;
  const atteintModif = modifTraite >= objModif;
  if (atteintNv && atteintModif) return "Atteint";
  if (atteintNv || atteintModif) return "Partiellement atteint";
  return "Non atteint";
}

/**
 * Score Productivité (/50)
 * Excel: 50 si Atteint, 25 si Partiellement atteint, 0 si Non atteint, "" si N/A
 */
export function scoreProductivite(statut) {
  if (statut === "Atteint") return 50;
  if (statut === "Partiellement atteint") return 25;
  if (statut === "Non atteint") return 0;
  return null;
}

/**
 * Score Global (/100)
 */
export function scoreGlobal(qualite, productivite) {
  if (qualite === null || productivite === null) return null;
  return qualite + productivite;
}

/**
 * Agrège les dossiers d'un ingénieur sur une période filtrée et
 * calcule l'ensemble des indicateurs STATISTIQUES.
 */
export function calculerStatsIngenieur(dossiersIngenieur, objectif, retoursIngenieur) {
  // Productivité : seuls les dossiers VALIDÉS comptent comme traités.
  const valides = dossiersIngenieur.filter((d) => d.etat === "Audité" || d.etat === "Dossier vérifié");
  const nvDossierTraite = valides.filter((d) => d.nature_prod === "Nouveau dossier").length;
  const modifTraite = valides.filter((d) => d.nature_prod === "Modification").length;

  const dossierTraiteTotal = nvDossierTraite + modifTraite;

  // Retours : un enregistrement par retour (table dossier_retours) quand elle est
  // disponible — un dossier revenu 3 fois compte pour 3 retours.
  let nbRetourInterne;
  let nbRetourClient;
  if (retoursIngenieur) {
    // « Retour qualité » = erreur de l'ingénieur découverte chez le client : imputable comme un retour interne
    nbRetourInterne = retoursIngenieur.filter((r) => r.type === "interne" || r.type === "qualite").length;
    nbRetourClient = retoursIngenieur.filter((r) => r.type === "client").length;
  } else {
    nbRetourInterne = dossiersIngenieur.filter((d) => d.retour_interne).length;
    nbRetourClient = dossiersIngenieur.filter((d) => d.retour_client).length;
  }
  const nbRetourTotal = nbRetourInterne + nbRetourClient;

  const statut = statutAtteinteObjectif(
    nvDossierTraite,
    modifTraite,
    objectif?.objectif_nv_dossier,
    objectif?.objectif_modif
  );

  // Seule la faute interne (imputable) pénalise le score qualité ;
  // un retour client (modif demandée) est suivi séparément, sans pénaliser.
  const qualite = scoreQualite(dossierTraiteTotal, nbRetourInterne);
  const productivite = scoreProductivite(statut);
  const global = scoreGlobal(qualite, productivite);

  // Délai moyen de traitement (idée bonus)
  const delais = dossiersIngenieur
    .map((d) => d.delai_traitement_jours)
    .filter((v) => v !== null && v !== undefined);
  const delaiMoyen = delais.length
    ? delais.reduce((a, b) => a + Number(b), 0) / delais.length
    : null;

  // Dossiers à risque (double faute) (idée bonus)
  const dossiersARisque = dossiersIngenieur.filter((d) => d.dossier_a_risque).length;

  return {
    nvDossierTraite,
    modifTraite,
    dossierTraiteTotal,
    nbRetourInterne,
    nbRetourClient,
    nbRetourTotal,
    statutAtteinte: statut,
    scoreQualite: qualite,
    scoreProductivite: productivite,
    scoreGlobal: global,
    delaiMoyenJours: delaiMoyen,
    dossiersARisque,
  };
}

/** Regroupe les dossiers par ingénieur */
export function grouperParIngenieur(dossiers) {
  const map = {};
  for (const d of dossiers) {
    if (!d.ingenieur) continue;
    if (!map[d.ingenieur]) map[d.ingenieur] = [];
    map[d.ingenieur].push(d);
  }
  return map;
}

/** Top N causes à partir de la table des retours (un enregistrement par retour). */
export function topCausesDepuisRetours(retours, n = 5) {
  const counts = {};
  for (const r of retours) counts[r.cause] = (counts[r.cause] || 0) + 1;
  return Object.entries(counts)
    .map(([cause, total]) => ({ cause, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, n);
}

/** Top N causes de retour (interne + client confondues) — ancienne méthode, par indicateurs */
export function topCausesRetour(dossiers, n = 5) {
  const counts = {};
  for (const d of dossiers) {
    if (d.retour_interne && d.cause_retour_interne) {
      counts[d.cause_retour_interne] = (counts[d.cause_retour_interne] || 0) + 1;
    }
    if (d.retour_client && d.cause_retour_client) {
      counts[d.cause_retour_client] = (counts[d.cause_retour_client] || 0) + 1;
    }
  }
  return Object.entries(counts)
    .map(([cause, total]) => ({ cause, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, n);
}

/**
 * Temps moyen (en heures) entre la soumission d'un dossier par l'ingénieur
 * (« Envoyer pour vérification ») et sa vérification par la Qualité —
 * objectif cible ~1h. Ne se base pas sur l'assignation initiale, qui inclut
 * le temps de traitement de l'ingénieur (non pertinent pour ce SLA).
 */
export function delaiMoyenVerification(dossiers) {
  const delais = dossiers
    .filter((d) => d.date_soumission && d.date_verification)
    .map((d) => (new Date(d.date_verification) - new Date(d.date_soumission)) / 3600000);
  if (!delais.length) return null;
  return delais.reduce((a, b) => a + b, 0) / delais.length;
}

/** Dossiers marqués comme récurrents (2 retours ou plus, toute cause confondue) */
export function dossiersRecurrents(dossiers) {
  return dossiers.filter((d) => d.recurrent);
}

/** Charge actuelle par ingénieur : dossiers assignés pas encore terminés (en attente d'acceptation + en cours) */
export function chargeParIngenieur(dossiers) {
  const counts = {};
  for (const d of dossiers) {
    if (d.ingenieur && ["En attente de traitement", "Encours"].includes(d.etat)) {
      counts[d.ingenieur] = (counts[d.ingenieur] || 0) + 1;
    }
  }
  return counts;
}

/** Taux de conformité du premier coup : % de dossiers audités sans aucun retour */
export function tauxConformitePremierCoup(dossiers) {
  const audites = dossiers.filter((d) => d.etat === "Audité" || d.date_verification);
  if (!audites.length) return null;
  const sansRetour = audites.filter((d) => (d.nb_retours || 0) === 0).length;
  return (sansRetour / audites.length) * 100;
}

/** Délai moyen de vérification, regroupé par semaine (pour voir la tendance) */
export function delaiParSemaine(dossiers) {
  const semaines = {};
  for (const d of dossiers) {
    if (!d.date_soumission || !d.date_verification) continue;
    const date = new Date(d.date_soumission);
    // Numéro de semaine ISO approximatif (année-semaine)
    const debutAnnee = new Date(date.getFullYear(), 0, 1);
    const numSemaine = Math.ceil(((date - debutAnnee) / 86400000 + debutAnnee.getDay() + 1) / 7);
    const cle = `${date.getFullYear()}-S${numSemaine}`;
    const delai = (new Date(d.date_verification) - new Date(d.date_soumission)) / 3600000;
    if (!semaines[cle]) semaines[cle] = [];
    semaines[cle].push(delai);
  }
  return Object.entries(semaines)
    .map(([semaine, delais]) => ({
      semaine,
      delaiMoyen: delais.reduce((a, b) => a + b, 0) / delais.length,
    }))
    .sort((a, b) => a.semaine.localeCompare(b.semaine))
    .slice(-8); // 8 dernières semaines
}

/** Répartition du volume de dossiers par jour de la semaine (carte de chaleur simple) */
export function repartitionParJourSemaine(dossiers) {
  const jours = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
  const counts = jours.map((j) => ({ jour: j, total: 0 }));
  for (const d of dossiers) {
    if (!d.date) continue;
    const idx = new Date(d.date).getDay();
    counts[idx].total += 1;
  }
  // Réordonner Lun→Dim
  return [...counts.slice(1), counts[0]];
}

/** Détection de doublons potentiels par nom de dossier (bonus) */
export function detecterDoublons(dossiers) {
  const seen = {};
  const doublons = [];
  for (const d of dossiers) {
    const key = (d.nom_dossier || "").trim().toUpperCase();
    if (!key) continue;
    if (seen[key]) {
      doublons.push({ nomDossier: d.nom_dossier, ids: [seen[key], d.id] });
    } else {
      seen[key] = d.id;
    }
  }
  return doublons;
}
