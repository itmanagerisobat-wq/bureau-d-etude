// Modèles de NDD fournis d'origine (repris des notes HILL SOLUTION 2026-0005 et 2026-0006).
// Ils sont enregistrés dans la table ndd_modeles et modifiables dans Paramètres ; de nouveaux modèles
// (une opération = un modèle) s'ajoutent depuis Paramètres > Notes de dimensionnement.
import type { Dossier } from "../types";
import type { ModeleNdd } from "./types";

export const INTRO_DESTRAT =
  "La présente note établit le dimensionnement du système de déstratification d’air au regard des caractéristiques propres du local et des moyens de chauffage en place. Elle détermine le nombre, le modèle et l’implantation des déstratificateurs nécessaires pour homogénéiser la température de l’air, en réinjectant vers la zone occupée l’air chaud accumulé sous plafond, conformément aux exigences de la fiche {FICHE}.";
export const CALCUL_DESTRAT =
  "Le volume déstratifié est égal à la surface multipliée par la hauteur. La quantité nécessaire de déstratificateurs est l’arrondi supérieur du volume déstratifié divisé par le débit unitaire du modèle retenu (taux de brassage minimal {TAUX} vol/h) ; le taux de brassage obtenu est égal au nombre de déstratificateurs multiplié par leur débit, divisé par le volume déstratifié. La hauteur d’installation est égale à 80 % de la hauteur du local et chaque déstratificateur couvre une surface égale à son débit divisé par la hauteur.";
export const CONCLUSION_DESTRAT =
  "Grâce à l’homogénéisation de la température, l’écart entre le plafond et le sol ne dépasse pas 3 °C ; la chaleur est redistribuée dans la zone occupée, ce qui réduit les déperditions par la toiture et la consommation de chauffage, tout en améliorant le confort thermique.";
export const VENTILATION_DEFAUT =
  "Ventilation naturelle, sans dispositif mécanique de brassage ni de régulation de la stratification thermique";
export const INTRO_GENERIQUE =
  "La présente note établit le dimensionnement de l’opération au regard des caractéristiques propres du site et des équipements retenus, conformément aux exigences de la fiche {FICHE}.";

const base = { titre: "NOTE DE DIMENSIONNEMENT", pdf_reference: null, actif: true, champs: [], exigences: [] };

export const MODELES_DEFAUT: ModeleNdd[] = [
  {
    ...base, fiche: "BAT-TH-142", moteur: "destratification", sous_titre: "Système de déstratification d’air",
    libelle_batiment: "bâtiment tertiaire", taux_brassage: 1,
    intro: INTRO_DESTRAT, texte_calcul: CALCUL_DESTRAT, texte_conclusion: CONCLUSION_DESTRAT,
  },
  {
    ...base, fiche: "IND-BA-110", moteur: "destratification", sous_titre: "Système de déstratification d’air",
    libelle_batiment: "local industriel", taux_brassage: 1,
    intro: INTRO_DESTRAT, texte_calcul: CALCUL_DESTRAT, texte_conclusion: CONCLUSION_DESTRAT,
  },
];

export function modeleNdd(fiche: string, modeles: ModeleNdd[]): ModeleNdd | null {
  return modeles.find((m) => m.fiche === fiche && m.actif) ?? MODELES_DEFAUT.find((m) => m.fiche === fiche) ?? null;
}

/** Fiche CEE de la note pour un dossier de déstratification */
export const ficheDestrat = (typeBatiment: string | null) => (String(typeBatiment).toLowerCase().startsWith("ind") ? "IND-BA-110" : "BAT-TH-142");

export interface NddPossible { fiche: string; moteur: ModeleNdd["moteur"]; libelle: string; operation?: number }

/** Notes disponibles pour un dossier : déstratification (BtoB) et opérations BtoC ayant un modèle */
export function nddDuDossier(d: Dossier, nbLocaux: number, modeles: ModeleNdd[]): NddPossible[] {
  const out: NddPossible[] = [];
  const actifs = modeles.filter((m) => m.actif);
  if (d.type_client !== "BtoC" && nbLocaux > 0) {
    const f = ficheDestrat(d.type_batiment);
    const m = actifs.find((x) => x.fiche === f);
    if (m) out.push({ fiche: f, moteur: m.moteur, libelle: `${f} — ${m.sous_titre || "déstratification"}` });
  }
  (d.operations ?? []).forEach((o, i) => {
    const code = o.fiche === "AUTRE" ? String(o.caracs?.code ?? "").trim() : o.fiche;
    const m = actifs.find((x) => x.fiche === code);
    if (m && !out.some((x) => x.fiche === code)) out.push({ fiche: code, moteur: m.moteur, libelle: `${code} — ${m.sous_titre || o.intitule}`, operation: i });
  });
  return out;
}


/** Modèles enregistrés en base complétés par les textes d'origine (champs laissés vides) */
export function fusionnerModeles(lignes: ModeleNdd[]): ModeleNdd[] {
  const vide = (v: unknown) => v === null || v === undefined || v === "";
  const out = lignes.map((m) => {
    const d = MODELES_DEFAUT.find((x) => x.fiche === m.fiche);
    const r: any = { ...m, champs: m.champs ?? [], exigences: m.exigences ?? [] };
    if (d) for (const k of ["titre", "sous_titre", "libelle_batiment", "taux_brassage", "intro", "texte_calcul", "texte_conclusion"] as const) if (vide(r[k])) r[k] = (d as any)[k];
    if (vide(r.intro)) r.intro = INTRO_GENERIQUE;
    if (vide(r.titre)) r.titre = "NOTE DE DIMENSIONNEMENT";
    return r as ModeleNdd;
  });
  for (const d of MODELES_DEFAUT) if (!out.some((m) => m.fiche === d.fiche)) out.push(d);
  return out;
}
