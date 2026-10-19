// Couleur de chaque déstratificateur sur le plan de calepinage, selon son modèle.
// Paramétrable dans Paramètres › Références (colonne « Couleur sur le plan ») ; par défaut DS3 = bleu, DS7 = rouge.
import { num, txt } from "../format";
import type { Params } from "../types";
import type { LocalSaisi } from "./types";

export const COULEUR_DS3 = "#1E5AE6", COULEUR_DS7 = "#DC0000", COULEUR_AUTRE = "#F08C00";

export function couleurModele(P: Pick<Params, "equip"> | null, reference: string): string {
  const ref = txt(reference);
  const c = txt(P?.equip?.[ref]?.couleur);
  if (/^#[0-9a-f]{6}$/i.test(c)) return c;
  const r = ref.toUpperCase().replace(/[\s_-]+/g, "");
  if (/DS3(?!\d)/.test(r)) return COULEUR_DS3;
  if (/DS7(?!\d)/.test(r)) return COULEUR_DS7;
  return COULEUR_AUTRE;
}

/** Nom court du modèle pour la légende (« ONSEN-DS7(6500m3/h) » → « ONSEN-DS7 ») */
export const nomCourt = (ref: string) => txt(ref).replace(/\s*\(.*\)\s*$/, "") || "Déstratificateur";

/** Un élément par déstratificateur, dans l'ordre des locaux : modèle et couleur */
export function pointsParModele(P: Pick<Params, "equip"> | null, locaux: LocalSaisi[]): { reference: string; couleur: string }[] {
  const out: { reference: string; couleur: string }[] = [];
  for (const l of locaux) {
    const n = Math.max(0, Math.round(num(l.nb as any) ?? 0));
    for (let i = 0; i < n; i++) out.push({ reference: txt(l.reference), couleur: couleurModele(P, l.reference) });
  }
  return out;
}

/** Légende : un élément par modèle (couleur, nom, nombre) */
export function legendeModeles(liste: { reference: string; couleur: string }[]) {
  const m = new Map<string, { libelle: string; couleur: string; nombre: number }>();
  for (const p of liste) {
    const k = nomCourt(p.reference);
    const e = m.get(k) ?? { libelle: k, couleur: p.couleur, nombre: 0 };
    e.nombre++; m.set(k, e);
  }
  return [...m.values()];
}
