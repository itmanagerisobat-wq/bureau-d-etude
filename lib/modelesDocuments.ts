// Modèles de devis / facture par opération et par type de client (BtoB / BtoC), avec date d'effet.
// Un modèle choisit une mise en page (programmée dans l'application) et peut remplacer ses textes.
import type { Params } from "./types";
import { ficheDestrat } from "./ndd/modeles";

export type DocumentModele = "devis" | "facture";
export interface ModeleDocument {
  id: string;
  document: DocumentModele;
  type_client: "BtoB" | "BtoC";
  fiche: string;                 // code opération, ou « * » = toutes les opérations
  libelle: string;
  mise_en_page: string;          // voir MISES_EN_PAGE
  date_effet: string;            // AAAA-MM-JJ
  fichier_reference: string | null;
  textes: Partial<Record<CleTexte, string>>;
  actif: boolean;
  created_at?: string;
}

/** Mises en page disponibles (chacune reproduit un modèle fourni). Une nouvelle mise en page = à ajouter au programme. */
export const MISES_EN_PAGE: { v: string; l: string; types: ("BtoB" | "BtoC")[] }[] = [
  { v: "btob-exe", l: "Entreprise — modèle du générateur d’origine (devis / facture ISOBAT)", types: ["BtoB"] },
  { v: "btoc-word", l: "Particulier — modèle Word ISOBAT (devis 2026-3042 DAMAREST)", types: ["BtoC"] },
  { v: "btoc-pac-2026", l: "Particulier — modèle Word ISOBAT PAC (devis 2026-3076 VILLAUME : montants avec point, SCOP, nom du produit sur la ligne des prix)", types: ["BtoC"] },
];
export const miseEnPageDefaut = (t: "BtoB" | "BtoC") => (t === "BtoC" ? "btoc-word" : "btob-exe");

export type CleTexte = "libelle_prime" | "texte_cee" | "detail_offre" | "conditions" | "assurance" | "mode_paiement" | "texte_dechets";
/** Textes qu'un modèle peut remplacer (vide = texte habituel des Paramètres) */
export const TEXTES_MODELE: { cle: CleTexte; libelle: string; pour: ("BtoB" | "BtoC")[]; doc: DocumentModele[]; aide?: string }[] = [
  { cle: "libelle_prime", libelle: "Libellé de la prime", pour: ["BtoC"], doc: ["devis", "facture"], aide: "ex. « Prime CEE » ou « Prime Coup de pouce CEE » (vide = celui saisi dans l’opération)" },
  { cle: "texte_cee", libelle: "Termes et conditions CEE", pour: ["BtoB", "BtoC"], doc: ["devis"], aide: "Variables : {DELEGATAIRE}, {SIREN}, {MONTANT}" },
  { cle: "detail_offre", libelle: "Détail de l’offre", pour: ["BtoB"], doc: ["devis"] },
  { cle: "texte_dechets", libelle: "Gestion des déchets", pour: ["BtoC"], doc: ["devis", "facture"] },
  { cle: "mode_paiement", libelle: "Mode de paiement", pour: ["BtoC"], doc: ["devis"] },
  { cle: "conditions", libelle: "Conditions de règlement", pour: ["BtoB", "BtoC"], doc: ["facture"] },
  { cle: "assurance", libelle: "Mention assurance", pour: ["BtoB", "BtoC"], doc: ["facture"] },
];

/** Opération principale d'un dossier (pour choisir son modèle) */
export function ficheDuDossier(d: { type_client?: string | null; type_batiment?: string | null; operations?: any[] | null }, nbLocaux: number): string {
  if (d.type_client === "BtoC") {
    const o = (d.operations ?? [])[0];
    return o ? (o.fiche === "AUTRE" ? String(o.caracs?.code ?? "").trim() : o.fiche) : "*";
  }
  return nbLocaux ? ficheDestrat(d.type_batiment ?? null) : "*";
}

/** Modèle applicable : même document et type de client, l'opération (sinon « toutes »), date d'effet la plus récente ≤ date */
export function choisirModele(modeles: ModeleDocument[], c: { document: DocumentModele; type_client: "BtoB" | "BtoC"; fiche: string; date: string }, figeId?: string | null): ModeleDocument | null {
  if (figeId) { const m = modeles.find((x) => x.id === figeId); if (m) return m; }
  const ok = modeles.filter((m) => m.actif && m.document === c.document && m.type_client === c.type_client && m.date_effet <= c.date);
  const plusRecent = (l: ModeleDocument[]) => l.sort((a, b) => b.date_effet.localeCompare(a.date_effet))[0] ?? null;
  return plusRecent(ok.filter((m) => m.fiche === c.fiche)) ?? plusRecent(ok.filter((m) => m.fiche === "*"));
}

/** Paramètres modifiés par les textes du modèle (copie : les Paramètres d'origine ne changent pas) */
export function appliquerTextes(P: Params, m: ModeleDocument | null, delegataire: string | null): Params {
  if (!m) return P;
  const t = m.textes ?? {};
  const societe = { ...P.societe };
  for (const k of ["detail_offre", "conditions", "assurance", "mode_paiement", "texte_dechets"] as const) if (t[k]?.trim()) societe[k] = t[k]!;
  const deleg = { ...P.deleg };
  const cle = String(delegataire ?? "").trim().toUpperCase();
  if (t.texte_cee?.trim() && deleg[cle]) deleg[cle] = { ...deleg[cle], texte_cee: t.texte_cee };
  return { ...P, societe, deleg };
}
