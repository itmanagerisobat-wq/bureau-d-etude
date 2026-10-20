// Périodes du tableau de bord : Aujourd'hui / Jour (choisi au calendrier) / Mois / Année.
import { jourLocal } from "@/lib/series";

const MOIS_COURTS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const MOIS_LONGS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

export const aujourdhuiISO = () => new Date().toLocaleDateString("sv-SE");

const ajouterJours = (iso, n) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString("sv-SE");
};
const finDeMois = (a, m) => new Date(a, m + 1, 0).getDate();

/** Bornes (AAAA-MM-JJ inclus) d'une période { type, jour }. */
export function bornes(p) {
  const ref = p.type === "jour" && p.jour ? p.jour : aujourdhuiISO();
  if (p.type === "aujourdhui" || p.type === "jour") return { du: ref, au: ref };
  const [a, m] = ref.split("-").map(Number);
  if (p.type === "mois") return { du: `${a}-${String(m).padStart(2, "0")}-01`, au: `${a}-${String(m).padStart(2, "0")}-${finDeMois(a, m - 1)}` };
  return { du: `${a}-01-01`, au: `${a}-12-31` };
}

/** Période précédente (veille, mois précédent, année précédente) pour les comparaisons. */
export function bornesPrecedentes(p) {
  const b = bornes(p);
  if (p.type === "aujourdhui" || p.type === "jour") {
    const v = ajouterJours(b.du, -1);
    return { du: v, au: v };
  }
  const [a, m] = b.du.split("-").map(Number);
  if (p.type === "mois") {
    const am = m === 1 ? a - 1 : a;
    const mm = m === 1 ? 12 : m - 1;
    return { du: `${am}-${String(mm).padStart(2, "0")}-01`, au: `${am}-${String(mm).padStart(2, "0")}-${finDeMois(am, mm - 1)}` };
  }
  return { du: `${a - 1}-01-01`, au: `${a - 1}-12-31` };
}

/** Une date (ISO ou jour) est-elle dans les bornes ? */
export function dansBornes(v, b) {
  const j = jourLocal(v);
  return !!j && j >= b.du && j <= b.au;
}

/** Libellé lisible de la période : « aujourd'hui », « jeudi 15 octobre 2026 », « octobre 2026 », « 2026 ». */
export function libellePeriode(p) {
  const b = bornes(p);
  if (p.type === "aujourdhui") return "aujourd'hui";
  if (p.type === "jour") return new Date(`${b.du}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const [a, m] = b.du.split("-").map(Number);
  if (p.type === "mois") return `${MOIS_LONGS[m - 1]} ${a}`;
  return String(a);
}

/** Texte de comparaison court : « vs veille », « vs sept. », « vs 2025 ». */
export function libelleComparaison(p) {
  if (p.type === "aujourdhui" || p.type === "jour") return "vs veille";
  const b = bornesPrecedentes(p);
  const [a, m] = b.du.split("-").map(Number);
  return p.type === "mois" ? `vs ${MOIS_COURTS[m - 1]}` : `vs ${a}`;
}

export const jourCourt = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "");
export { MOIS_LONGS };
