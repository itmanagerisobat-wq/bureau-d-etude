export const ROLES = {
  ADMIN: "admin",
  INGENIEUR: "ingenieur",
  QUALITE: "qualite",
};

export const ROLE_LABELS = {
  admin: "Admin",
  ingenieur: "Ingénieur",
  qualite: "Qualité",
};

export const MOIS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

/**
 * Tons sémantiques partagés par toute l'app (badges, KPI, graphiques).
 * brand = en cours / information · gold = attente · green = validé · red = problème
 */
export const TON_HEX = {
  neutral: "#8A96A3",
  brand: "#1F6FA8",
  green: "#4E9F3D",
  gold: "#D09A2E",
  red: "#D33A3A",
  dark: "#7A2E2E",
};

/**
 * Référentiel UNIQUE des états de dossier : libellé court affiché + ton.
 * Utilisé par StatutBadge, les tableaux, le pipeline Qualité et les KPI.
 */
export const ETATS = {
  "Dans la file": { court: "Dans la file", ton: "neutral" },
  "En attente de traitement": { court: "À faire", ton: "neutral" },
  "En attente": { court: "En attente", ton: "neutral" },
  Encours: { court: "En cours", ton: "brand" },
  "En attente d'info": { court: "En attente d'info", ton: "gold" },
  "En attente de vérification": { court: "À contrôler", ton: "gold" },
  "En cours de vérification": { court: "En vérification Q", ton: "gold" },
  "Audité": { court: "Audité", ton: "green" },
  "Dossier vérifié": { court: "Audité", ton: "green" },
  Suspendue: { court: "Suspendu", ton: "red" },
  "en pause": { court: "En pause", ton: "gold" },
  "Annulé": { court: "Annulé", ton: "neutral" },
};

/** Statuts du circuit (valeurs stockées en base). */
export const S = {
  FILE: "Dans la file",
  ASSIGNE: "En attente de traitement",
  EN_COURS: "Encours",
  ATTENTE_INFO: "En attente d'info",
  A_CONTROLER: "En attente de vérification",
  VERIF: "En cours de vérification",
  VALIDE: "Audité",
};

/** Statuts « de côté », posés à la main avec un motif obligatoire. */
export const STATUTS_MANUELS = ["Suspendue", "en pause", "Annulé"];

/** Compatibilité : couleur hex par état (dérivée du référentiel ci-dessus). */
export const ETAT_COULEURS = Object.fromEntries(
  Object.entries(ETATS).map(([etat, m]) => [etat, TON_HEX[m.ton]])
);

/** Référentiel UNIQUE des événements de l'historique d'un dossier. */
export const EVENEMENTS = {
  assignation: { texte: "Assigné", ton: "brand" },
  acceptation: { texte: "Accepté par l'ingénieur", ton: "brand" },
  soumission_verification: { texte: "Terminé — envoyé au contrôle", ton: "gold" },
  prise_en_charge: { texte: "Pris en charge par la Qualité", ton: "brand" },
  verification_ok: { texte: "Validé", ton: "green" },
  retour_interne_avant_audit: { texte: "Retour interne (avant audit)", ton: "gold" },
  retour_interne_apres_audit: { texte: "Retour interne (après audit)", ton: "red" },
  retour_client: { texte: "Retour client (modif. demandée)", ton: "red" },
  reassignation: { texte: "Réassigné", ton: "brand" },
  changement_statut_manuel: { texte: "Statut modifié manuellement", ton: "neutral" },
  mise_en_file: { texte: "Mis dans la file", ton: "neutral" },
  prise_file: { texte: "Pris par l'ingénieur", ton: "brand" },
  attente_info: { texte: "En attente d'info", ton: "gold" },
  reprise: { texte: "Repris par l'ingénieur", ton: "brand" },
};

export const SEUIL_ALERTE_JOURS_ENCOURS_VERIF = 5;

/** Les 3 types de retour. */
export const TYPES_RETOUR = {
  interne: { libelle: "Retour interne", court: "Interne", ton: "gold", aide: "Erreur trouvée par la Qualité pendant la vérification" },
  qualite: { libelle: "Retour qualité", court: "Qualité", ton: "red", aide: "Erreur découverte chez le client, non vue au contrôle" },
  client: { libelle: "Retour modif client", court: "Modif client", ton: "brand", aide: "Le client demande une modification" },
};

/** Type du dernier retour d'un dossier : « interne », « qualite » ou « client ». */
export function typeDernierRetour(d) {
  if (d?.dernier_retour_type) return d.dernier_retour_type;
  if (d?.retour_client && !d?.retour_interne) return "client";
  return "interne";
}

/** Initiales pour les avatars (« fatma ben ali » → « FB »). */
export function initiales(nom) {
  if (!nom) return "?";
  return nom
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

/** Date ISO (AAAA-MM-JJ) → « 12 sept. 2026 ». */
export function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

/** Durée en heures → « 45 min », « 3,2 h », « 2 j 4 h ». */
export function formatDuree(heures) {
  if (heures === null || heures === undefined || isNaN(heures)) return "—";
  if (heures < 1) return `${Math.max(1, Math.round(heures * 60))} min`;
  if (heures < 48) return `${heures.toFixed(1).replace(".", ",")} h`;
  const j = Math.floor(heures / 24);
  const h = Math.round(heures % 24);
  return h ? `${j} j ${h} h` : `${j} j`;
}

// ------------------------------------------------------------
// Bénéficiaire : normalisation et contrôles de saisie
// ------------------------------------------------------------

/** « 12, Av. de la Gare » → « 12 avenue de la gare » (pour comparer des adresses libres). */
export function normaliserAdresse(adresse) {
  if (!adresse) return "";
  let s = adresse
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ");
  const abrev = { av: "avenue", ave: "avenue", bd: "boulevard", bld: "boulevard", r: "rue", ch: "chemin", pl: "place", rte: "route", imp: "impasse", all: "allee", st: "saint", ste: "sainte", fg: "faubourg" };
  s = s
    .split(/\s+/)
    .filter(Boolean)
    .map((m) => abrev[m] || m)
    .filter((m) => !["de", "du", "des", "la", "le", "les", "l", "d"].includes(m))
    .join(" ");
  return s;
}

/** Téléphone → 10 chiffres français (« +33 6 12… » → « 0612… »), sinon chiffres bruts. */
export function normaliserTelephone(tel) {
  if (!tel) return "";
  let d = tel.replace(/\D/g, "");
  if (d.startsWith("0033")) d = "0" + d.slice(4);
  else if (d.startsWith("33") && d.length === 11) d = "0" + d.slice(2);
  return d;
}

export function telephoneValide(tel) {
  if (!tel) return true;
  return /^0[1-9]\d{8}$/.test(normaliserTelephone(tel));
}

export function emailValide(email) {
  if (!email) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

/** SIRET : 14 chiffres + clé de Luhn (exception connue : La Poste, SIREN 356000000). */
export function siretValide(siret) {
  if (!siret) return true;
  const s = siret.replace(/\s/g, "");
  if (!/^\d{14}$/.test(s)) return false;
  if (s.startsWith("356000000")) return s.split("").reduce((a, c) => a + Number(c), 0) % 5 === 0;
  let somme = 0;
  for (let i = 0; i < 14; i++) {
    let n = Number(s[i]);
    if (i % 2 === 0) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    somme += n;
  }
  return somme % 10 === 0;
}

/** Affichage « 06 12 34 56 78 ». */
export function formatTelephone(tel) {
  const d = normaliserTelephone(tel);
  if (d.length === 10) return d.replace(/(\d{2})(?=\d)/g, "$1 ");
  return tel || "";
}


/**
 * Un même dossier modifié plusieurs fois (une ligne par modification) :
 * renvoie Map(id → { n, total }) — « Modif n/total », dans l'ordre des dates.
 */
export function rangsModifs(dossiers) {
  const groupes = new Map();
  for (const d of dossiers || []) {
    const k = String(d.nom_dossier || "").trim().toLowerCase();
    if (!k) continue;
    if (!groupes.has(k)) groupes.set(k, []);
    groupes.get(k).push(d);
  }
  const rangs = new Map();
  for (const liste of groupes.values()) {
    if (liste.length < 2) continue;
    liste
      .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")) || String(a.created_at || "").localeCompare(String(b.created_at || "")))
      .forEach((d, i) => rangs.set(d.id, { n: i + 1, total: liste.length }));
  }
  return rangs;
}
