// Modèles d'opérations CEE résidentielles (BtoC) : champs saisis et lignes imprimées sur le devis.
// Les lignes reproduisent le devis BtoC ISOBAT (ex. devis 2026-3042, BAR-TH-171).
import { fr, num } from "./format";
import type { OperationBtoc } from "./types";

export interface ChampOp {
  cle: string;
  libelle: string;
  type?: "texte" | "nombre" | "liste";
  options?: string[];
  suffixe?: string;
  facultatif?: boolean;
}

/** Morceau de ligne : texte normal ou gras */
export type Morceau = { t: string; b?: boolean };

export interface ModeleOperation {
  fiche: string;
  intitule: string;
  libelle_prime: string;
  champs: ChampOp[];
  /** variante : mise en page du modèle de devis (ex. « btoc-pac-2026 ») */
  lignes: (c: Record<string, string>, variante?: string) => Morceau[][];
}

const v = (c: Record<string, string>, k: string) => (c[k] ?? "").trim();
const n2 = (s: string) => { const x = num(s); return x === null || s === "" ? s : fr(x); };
const nombreBrut = (s: string) => { const x = num(s); return x === null || s === "" ? s : String(x).replace(".", ","); };

export const MODELES: ModeleOperation[] = [
  {
    fiche: "BAR-TH-171",
    intitule: "Mise en place d’une pompe à chaleur (PAC) de type air/eau",
    libelle_prime: "Prime Coup de pouce CEE",
    champs: [
      { cle: "application", libelle: "Application", type: "liste", options: ["Basse température", "Moyenne température", "Haute température"] },
      { cle: "marque", libelle: "Marque" },
      { cle: "reference", libelle: "Référence" },
      { cle: "surface", libelle: "Surface chauffée par la PAC", type: "nombre", suffixe: "m²" },
      { cle: "usage", libelle: "Usage couvert par la PAC", type: "liste", options: ["Chauffage", "Chauffage et eau chaude sanitaire"] },
      { cle: "cop", libelle: "Coefficient de performance (COP)", type: "nombre" },
      { cle: "scop", libelle: "Coefficient de performance saisonnier (SCOP) — facultatif", type: "nombre", facultatif: true },
      { cle: "puissance", libelle: "Puissance thermique nominale", type: "nombre", suffixe: "kW" },
      { cle: "etas", libelle: "Efficacité énergétique saisonnière (ETAS)", type: "nombre", suffixe: "%" },
      { cle: "groupe_ext", libelle: "Réf Groupe Extérieur" },
      { cle: "regulateur", libelle: "Classe du régulateur", type: "liste", options: ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"] },
    ],
    lignes: (c, variante) => [
      [{ t: "BAR-TH-171 : Mise en place d’une pompe à chaleur (PAC) de type air/eau" }],
      [{ t: "La PAC est installée pour une application " }, { t: v(c, "application"), b: true }],
      [{ t: "Marque : " }, { t: v(c, "marque"), b: true }],
      [{ t: "Référence : " }, { t: v(c, "reference"), b: true }],
      [{ t: "Surface chauffée par la PAC : " }, { t: `${n2(v(c, "surface"))} m²`, b: true }],
      [{ t: "Usage couvert par la PAC : " }, { t: v(c, "usage"), b: true }],
      [{ t: "Coefficient de performance (COP) : " }, { t: nombreBrut(v(c, "cop")), b: true }],
      ...(v(c, "scop") ? [[{ t: "Le coefficient de Performance Saisonnier est de " }, { t: n2(v(c, "scop")), b: true }]] : []),
      [{ t: "Puissance thermique nominale : " }, { t: `${nombreBrut(v(c, "puissance"))} kW`, b: true }],
      ...(variante === "btoc-pac-2026"
        ? [[{ t: "Efficacité énergétique saisonnière (hors dispositif de régulation) : " }, { t: `${nombreBrut(v(c, "etas"))}%`, b: true }, { t: ", calculée selon le règlement (EU) n°813/2013 de la commission du 2 aout 2013." }]]
        : [[{ t: "Efficacité énergétique saisonnière (hors dispositif de régulation) : " }, { t: `${nombreBrut(v(c, "etas"))}%.`, b: true }],
           [{ t: " calculée selon le règlement (EU) n°813/2013 de la commission du 2 aout 2013." }]]),
      [{ t: "Réf Groupe Extérieur : " }, { t: v(c, "groupe_ext"), b: true }],
      [{ t: "Mise en place d’un régulateur de classe : " }, { t: v(c, "regulateur"), b: true }],
    ],
  },
  {
    fiche: "AUTRE",
    intitule: "",
    libelle_prime: "Prime CEE",
    champs: [
      { cle: "code", libelle: "Code fiche (ex. BAR-TH-174)" },
      { cle: "intitule", libelle: "Intitulé de l'opération" },
      { cle: "details", libelle: "Caractéristiques (une par ligne : Libellé : valeur)" },
    ],
    lignes: (c) => [
      [{ t: `${v(c, "code")}${v(c, "code") && v(c, "intitule") ? " : " : ""}${v(c, "intitule")}` }],
      ...v(c, "details").split(/\r?\n/).filter((l) => l.trim()).map((l) => {
        const i = l.indexOf(":");
        return i > 0 ? [{ t: l.slice(0, i + 1) + " " }, { t: l.slice(i + 1).trim(), b: true }] : [{ t: l }];
      }),
    ],
  },
];

export const modele = (fiche: string) => MODELES.find((m) => m.fiche === fiche) ?? MODELES[MODELES.length - 1];

export function nouvelleOperation(fiche = "BAR-TH-171", valorisation: number | null = null): OperationBtoc {
  const m = modele(fiche);
  return { fiche: m.fiche, intitule: m.intitule, caracs: {}, kwh: null, valorisation, prime: null, libelle_prime: m.libelle_prime };
}

/** Prime d'une opération : saisie si renseignée, sinon kWh cumac × valorisation / 1000 */
export function primeOperation(o: OperationBtoc): number {
  const p = num(o.prime as any);
  if (p) return Math.round(p * 100) / 100;
  const k = num(o.kwh as any) ?? 0, val = num(o.valorisation as any) ?? 0;
  return Math.round(((k * val) / 1000) * 100) / 100;
}

/** Champs obligatoires d'une opération (pour les contrôles) */
export function controlesOperation(o: OperationBtoc, i: number): string[] {
  const m = modele(o.fiche);
  const p = `Opération ${i + 1} (${o.fiche === "AUTRE" ? o.caracs.code || "autre" : o.fiche}) : `;
  const err: string[] = [];
  for (const ch of m.champs) if (!v(o.caracs, ch.cle) && ch.cle !== "details" && !ch.facultatif) err.push(p + `${ch.libelle} manquant`);
  if (!num(o.kwh as any)) err.push(p + "kWh cumac manquant");
  if (!primeOperation(o)) err.push(p + "prime manquante (valorisation ou montant)");
  return err;
}
