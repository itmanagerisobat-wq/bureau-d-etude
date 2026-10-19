// Température extérieure de base (NF EN 12831 / NF P 52-612) : zone A…I du département × tranche d'altitude.
// La zone de chaque département est enregistrée dans la table temperatures_base (complétée au fil des dossiers).

const TRANCHES = [200, 400, 600, 800, 1000, 1200, 1400, 1600, 1800, 2000, 2200];
// valeurs par zone, une par tranche (null = hors tableau)
const TABLE: Record<string, (number | null)[]> = {
  A: [-2, -4, -6, -8, -10, -12, -14, -16, -18, -20, null],
  B: [-4, -5, -6, -7, -8, -9, -10, null, null, null, null],
  C: [-5, -6, -7, -8, -9, -10, -11, -12, -13, -14, -15],
  D: [-7, -8, -9, -11, -13, -14, -15, null, null, null, null],
  E: [-8, -9, -11, -13, -15, -17, -19, -21, -23, -25, -27],
  F: [-9, -10, -11, -12, -13, null, null, null, null, null, null],
  G: [-10, -11, -13, -14, -17, -19, -21, -23, -24, -25, -29],
  H: [-12, -13, -15, -17, -19, -21, -23, -24, null, null, null],
  I: [-15, -15, -19, -21, -23, -24, -25, null, null, null, null],
};
export const ZONES_TEMP = Object.keys(TABLE);

/**
 * Zone de chaque département (déduite de sa température de base au niveau de la mer) — valeurs par défaut,
 * à vérifier : la table temperatures_base (Paramètres › Notes de dimensionnement) est prioritaire.
 * Sans valeur ici (06, 07, 26, 46, 84 : −6 °C hors grille) : la zone se choisit à la main.
 */
export const ZONES_DEPARTEMENTS: Record<string, string> = { "01": "G", "02": "D", "03": "E", "04": "E", "05": "G", "08": "G", "09": "C", "10": "G", "11": "C", "12": "E", "13": "C", "14": "D", "15": "E", "16": "C", "17": "C", "18": "D", "19": "E", "20": "A", "21": "G", "22": "B", "23": "E", "24": "C", "25": "H", "27": "D", "28": "D", "29": "B", "2A": "A", "2B": "A", "30": "C", "31": "C", "32": "C", "33": "C", "34": "C", "35": "B", "36": "D", "37": "D", "38": "G", "39": "G", "40": "C", "41": "D", "42": "E", "43": "E", "44": "C", "45": "D", "47": "C", "48": "E", "49": "D", "50": "B", "51": "G", "52": "H", "53": "D", "54": "I", "55": "H", "56": "B", "57": "I", "58": "G", "59": "F", "60": "D", "61": "D", "62": "F", "63": "E", "64": "C", "65": "C", "66": "C", "67": "I", "68": "I", "69": "G", "70": "H", "71": "G", "72": "D", "73": "G", "74": "G", "75": "C", "76": "D", "77": "D", "78": "D", "79": "D", "80": "F", "81": "C", "82": "C", "83": "C", "85": "C", "86": "D", "87": "E", "88": "I", "89": "G", "90": "I", "91": "D", "92": "D", "93": "D", "94": "D", "95": "D" };

/** Département d'un code postal (Corse : 2A / 2B) */
export function departementDe(cp: string | null | undefined): string {
  const c = String(cp ?? "").replace(/\s/g, "");
  if (!/^\d{5}$/.test(c)) return c.slice(0, 2);
  if (c.startsWith("20")) return Number(c) < 20200 ? "2A" : "2B";
  return c.slice(0, 2);
}

export function temperatureBase(zone: string | null | undefined, altitude: number | null | undefined): number | null {
  const z = String(zone ?? "").trim().toUpperCase();
  if (!TABLE[z] || altitude === null || altitude === undefined || !Number.isFinite(altitude)) return null;
  const i = TRANCHES.findIndex((t) => Math.round(altitude) <= t);
  return i < 0 ? null : TABLE[z][i];
}
