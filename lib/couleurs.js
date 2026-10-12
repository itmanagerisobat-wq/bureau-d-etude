import { ETATS, TON_HEX, STATUTS_MANUELS } from "@/lib/constants";

/**
 * Couleurs des statuts, paramétrables dans Paramètres → Statuts
 * (colonne `couleur` de la table parametres_etats).
 * Chargées une fois par useAppData ; en attendant, couleurs par défaut.
 */
export const COULEURS_DEFAUT = {
  "Dans la file": "#8A96A3",
  "En attente de traitement": "#6B7C93",
  Encours: "#1F6FA8",
  "En attente d'info": "#D09A2E",
  "En attente de vérification": "#E07B1F",
  "En cours de vérification": "#E07B1F",
  "Audité": "#4E9F3D",
  "Dossier vérifié": "#4E9F3D",
  Suspendue: "#D33A3A",
  "en pause": "#A77BCA",
  "Annulé": "#5E6670",
};

let couleurs = { ...COULEURS_DEFAUT };

export function definirCouleurs(map) {
  couleurs = { ...COULEURS_DEFAUT, ...Object.fromEntries(Object.entries(map || {}).filter(([, v]) => /^#[0-9a-f]{6}$/i.test(v || ""))) };
}

/** Noms affichés des statuts, renommables dans Paramètres → Statuts (colonne libelle_affiche). */
export const LIBELLES_DEFAUT = Object.fromEntries(Object.entries(ETATS).map(([k, v]) => [k, v.court]));

export function definirLibelles(map) {
  for (const k of Object.keys(ETATS)) {
    const v = (map || {})[k];
    ETATS[k].court = v && v.trim() ? v.trim() : LIBELLES_DEFAUT[k] ?? k;
  }
}

/** Statuts personnalisés (Paramètres → Statuts) : ajoutés aux statuts connus et à « Mettre de côté ». */
export function definirStatutsPerso(libelles) {
  for (const l of libelles || []) {
    if (!ETATS[l]) ETATS[l] = { court: l, ton: "neutral", perso: true };
    if (!STATUTS_MANUELS.includes(l)) STATUTS_MANUELS.push(l);
  }
}

export function couleurEtat(etat) {
  return couleurs[etat] || TON_HEX[ETATS[etat]?.ton] || "#8A96A3";
}

/** Assombrit une couleur hex (pour un texte lisible sur fond clair). */
export function assombrir(hex, facteur = 0.55) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * facteur);
  const g = Math.round(((n >> 8) & 255) * facteur);
  const b = Math.round((n & 255) * facteur);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}
