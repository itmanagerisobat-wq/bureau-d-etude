// Calcul et contrôles d'éligibilité — reprise fidèle de calc_ligne / choisir_version
import { cp5, fr, num, parseDate, dateFr, aujourdhui, cmpVersion, txt } from "./format";
import type { CalcLigne, Dossier, FicheMontant, Ligne, LigneLibre, Params, TypeBatiment, Zone } from "./types";
import { controlesOperation, primeOperation } from "./operations";

/** Champs client obligatoires — BtoB (entreprise) */
export const CHAMPS_DOSSIER: [keyof Dossier, string][] = [
  ["raison_sociale", "Raison sociale"],
  ["siret", "SIRET"],
  ["adresse_siege", "Adresse siège"],
  ["cp_siege", "CP siège"],
  ["ville_siege", "Ville siège"],
  ["telephone", "Téléphone"],
  ["mail", "Mail"],
  ["rep_nom", "Représentant NOM"],
  ["fonction", "Fonction"],
];

/** BtoC (particulier) : pas de SIRET ni de fonction ; nom / prénom du client à la place de la raison sociale. */
export const CHAMPS_DOSSIER_BTOC: [keyof Dossier, string][] = [
  ["rep_nom", "Nom du client"],
  ["adresse_siege", "Adresse"],
  ["cp_siege", "Code postal"],
  ["ville_siege", "Ville"],
  ["telephone", "Téléphone"],
  ["mail", "Mail"],
];
/** Obligatoires en plus dès qu'il y a une opération CEE calculée */
export const CHAMPS_CEE: [keyof Dossier, string][] = [["delegataire", "Délégataire"], ["type_batiment", "Type bâtiment"]];
export const champsRequis = (d: Partial<Dossier>, avecCee = true) =>
  [...(d.type_client === "BtoC" ? CHAMPS_DOSSIER_BTOC : CHAMPS_DOSSIER), ...(avecCee ? CHAMPS_CEE : [])];

export const CHAMPS_LIGNE: [keyof Ligne, string][] = [
  ["adresse_travaux", "Adresse travaux"],
  ["cp_travaux", "CP travaux"],
  ["ville_travaux", "Ville travaux"],
  ["hauteur", "Hauteur (m)"],
  ["reference", "Référence déstratificateur"],
  ["nb", "Nb déstratificateurs"],
  ["consigne", "Consigne chauffage (°C)"],
];

const d0 = (s: string) => parseDate(s)!;

/** Version imposée (déjà utilisée pour ce devis) sinon la plus récente dont la date d'effet <= date du devis. */
export function choisirVersion(
  P: Params, typ: TypeBatiment, zone: Zone, dateRef: Date, versionImposee = "",
): [FicheMontant | null, string | null] {
  const cands = P.fiches.filter((f) => f.type_batiment === typ && f.zone === zone);
  if (versionImposee) {
    const v = cands.filter((f) => f.version === versionImposee);
    if (v.length) return [v[0], null];
    const [fb] = choisirVersion(P, typ, zone, dateRef);
    if (fb)
      return [fb, `À VÉRIFIER : la version ${versionImposee} utilisée à la 1re génération est introuvable dans Paramètres ; calcul fait avec ${fb.fiche} ${fb.version}`];
  }
  if (!cands.length) return [null, `aucune fiche enregistrée pour ${typ} ${zone} dans Paramètres`];
  const ok = cands.filter((f) => d0(f.date_effet) <= dateRef);
  if (!ok.length) {
    const f0 = cands.reduce((a, b) => (d0(b.date_effet) < d0(a.date_effet) ? b : a));
    return [f0, `À VÉRIFIER : aucune version de fiche connue au ${dateFr(dateRef)} pour ${typ} ${zone}, calcul fait avec ${f0.fiche} ${f0.version}`];
  }
  return [ok.reduce((a, b) => (d0(b.date_effet) > d0(a.date_effet) ? b : a)), null];
}

export function zoneDe(P: Params, cp: string | null): { dep: string; zone: Zone | undefined } {
  const dep = cp5(cp).slice(0, 2);
  return { dep, zone: P.zones[dep] };
}

/** Calcule une ligne (un local). Renvoie [calcul | null, erreurs bloquantes, alertes]. */
export function calcLigne(
  d: Dossier, L: Ligne, P: Params,
): [CalcLigne | null, string[], string[]] {
  const err: string[] = [];
  const warn: string[] = [];
  for (const [k, lib] of CHAMPS_LIGNE) {
    if (txt(L[k]) === "") err.push(`${lib} manquant`);
  }
  const typRaw = txt(d.type_batiment);
  const typ = (typRaw.charAt(0).toUpperCase() + typRaw.slice(1).toLowerCase()) as TypeBatiment;
  const { dep, zone } = zoneDe(P, L.cp_travaux);
  if (dep && !zone) err.push(`zone introuvable pour le département ${dep}`);

  const pc = num(L.p_conv), pr = num(L.p_rad), h = num(L.hauteur);
  const nb = num(L.nb), cons = num(L.consigne);
  if ([pc, pr, h, nb, cons].includes(null)) {
    err.push("valeur numérique invalide (puissance, hauteur, nombre ou consigne)");
    return [null, err, warn];
  }
  if (pc! + pr! <= 0) err.push("aucune puissance de chauffage renseignée");
  if (nb! <= 0 || nb !== Math.trunc(nb!)) err.push("nombre de déstratificateurs invalide");
  if (!L.clos) err.push("local non complètement clos (inéligible)");
  if (L.entrepot) err.push("entrepôt / local de stockage (exclu de la fiche)");
  const ref = txt(L.reference);
  if (ref && !(ref in P.equip)) err.push(`référence « ${ref} » absente des Paramètres`);
  const dl = txt(d.delegataire).toUpperCase();
  if (dl && !(dl in P.deleg)) err.push(`délégataire « ${txt(d.delegataire)} » absent des Paramètres`);
  if (!["Tertiaire", "Industriel"].includes(typ)) err.push(`type bâtiment « ${typRaw} » inconnu (Tertiaire / Industriel)`);

  const dateRef = parseDate(d.date_devis) ?? parseDate(d.date_facture) ?? aujourdhui();
  let fv: FicheMontant | null = null;
  let tx: Record<string, any> = {};
  if (zone && ["Tertiaire", "Industriel"].includes(typ)) {
    const [f, ev] = choisirVersion(P, typ, zone, dateRef, txt(L.version_fiche));
    fv = f;
    if (ev && !fv) err.push(ev);
    else if (ev) warn.push(ev);
    if (fv) {
      tx = P.textes[`${fv.fiche}|${fv.version}`] ?? {};
      const bloc = P.blocages.filter(
        (b) => b.fiche === fv!.fiche && d0(b.effet) <= dateRef && cmpVersion(b.version, fv!.version) > 0,
      );
      if (bloc.length && !txt(L.version_fiche))
        warn.push(`À VÉRIFIER : la fiche ${bloc[0].fiche} ${bloc[0].version} s'applique depuis le ${dateFr(bloc[0].effet)} mais n'a pas pu être lue automatiquement ; devis calculé avec ${fv.version} : vérifier le calcul, les montants et les mentions avant envoi (prévenir Paris)`);
      if (tx.partiel)
        warn.push(`À VÉRIFIER : fiche ${fv.fiche} ${fv.version} lue partiellement (${tx.partiel}) ; textes de la version précédente utilisés pour ces éléments : vérifier les mentions avant envoi`);
    }
  }
  const hmin = Number(tx.h_min) || P.hmin;
  const cmin = Number(tx.c_min) || P.cmin;
  if (h && h < hmin) err.push(`hauteur ${fr(h)} m < ${fr(hmin, 0)} m (inéligible)`);
  if (cons && cons < cmin) err.push(`consigne ${fr(cons, 0)} °C < ${fr(cmin, 0)} °C (inéligible)`);
  if (tx.limite && fv && dateRef >= d0(tx.limite))
    warn.push(`À VÉRIFIER : la fiche ${fv.fiche} ${fv.version} ne s'applique qu'aux opérations engagées avant le ${dateFr(tx.limite)} ; vérifier qu'une nouvelle version est en vigueur`);
  if (P.kwmax && nb && (pc! + pr!) / nb > P.kwmax)
    warn.push(`ALERTE dimensionnement : ${fr((pc! + pr!) / nb, 1)} kW par déstratificateur`);

  if (err.length || !fv) return [null, err.length ? err : ["fiche introuvable"], warn];

  const kwh = pc! * fv.kwhc_conv + pr! * fv.kwhc_rad;
  const valo = P.deleg[dl].valorisation;
  const prime = Math.round(((kwh * valo) / 1000) * 100) / 100;
  return [
    {
      typ, zone: zone!, pc: pc!, pr: pr!, h: h!, nb: Math.trunc(nb!), cons: cons!, ref, kwh, prime,
      fiche: fv.fiche, version: fv.version, pu: prime / Math.trunc(nb!),
    },
    err, warn,
  ];
}

export interface Totaux {
  ht: number;
  tva: number;
  ttc: number;
  primeCee: number;      // prime des opérations CEE calculées (déduite)
  aide: number;          // aide / prime saisie à la main (déduite)
  reste: number;         // reste à payer
  taux: number[];        // taux de TVA présents
}

export interface ResultatDossier {
  ok: boolean;
  erreurs: string[];
  alertes: string[];
  lignes: { ligne: Ligne; calc: CalcLigne | null }[];
  libres: { ligne: LigneLibre; ht: number; tva: number; ttc: number }[];
  totKwh: number;
  totPrime: number;
  totaux: Totaux;
}

const r2 = (x: number) => Math.round(x * 100) / 100;
const nomLocal = (L: Ligne, i: number, n: number) =>
  n > 1 ? `${txt(L.nom_site) || "Local " + (i + 1)} : ` : "";

/** Calcule et contrôle un devis complet : opérations CEE (locaux) + lignes libres + aide déduite. */
export function calcDossier(d: Dossier, lignes: Ligne[], P: Params, libres: LigneLibre[] = []): ResultatDossier {
  const erreurs: string[] = [];
  const alertes: string[] = [];
  const btoc = d.type_client === "BtoC";
  const ops = btoc ? (d.operations ?? []) : [];
  if (btoc) lignes = []; // les locaux de déstratification ne concernent que le BtoB
  const avecCee = lignes.length > 0 || ops.length > 0;
  for (const [k, lib] of champsRequis(d, lignes.length > 0 || (btoc && ops.length > 0))) {
    if (btoc && k === "type_batiment") continue;
    if (txt(d[k]) === "") erreurs.push(`${lib} manquant`);
  }
  if (!lignes.length && !libres.length && !ops.length) erreurs.push("aucune ligne sur le devis (ajoutez une prestation ou une opération CEE)");
  if (btoc) {
    if (!txt(d.travaux_adresse) && !txt(d.adresse_siege)) erreurs.push("Adresse des travaux manquante");
    ops.forEach((o, i) => erreurs.push(...controlesOperation(o, i)));
    if (ops.length && !d.soustraitant_id) alertes.push("Aucun sous-traitant RGE choisi : la mention ne figurera pas sur le devis");
    if (ops.length && !txt(d.precarite)) alertes.push("Précarité du ménage non renseignée");
  }
  if (btoc && lignes.length)
    alertes.push("Des locaux de déstratification (BAT-TH-142 / IND-BA-110) sont saisis : ils ne figurent pas sur un devis particulier");
  const res = lignes.map((L, i) => {
    const [calc, err, warn] = calcLigne(d, L, P);
    const p = nomLocal(L, i, lignes.length);
    erreurs.push(...err.map((x) => p + x));
    alertes.push(...warn.map((x) => p + x));
    return { ligne: L, calc };
  });
  const lib = libres.map((L, i) => {
    const q = num(L.quantite), pu = num(L.pu_ht), t = num(L.tva);
    const n = `Ligne ${i + 1}${txt(L.designation) ? ` (${txt(L.designation).split("\n")[0].slice(0, 30)})` : ""} : `;
    if (!txt(L.designation)) erreurs.push(`Ligne ${i + 1} : désignation manquante`);
    if (q === null || q <= 0) erreurs.push(n + "quantité invalide");
    if (pu === null) erreurs.push(n + "prix unitaire invalide");
    if (t === null || t < 0 || t > 1) erreurs.push(n + "taux de TVA invalide");
    const ht = r2((q ?? 0) * (pu ?? 0));
    const tva = r2(ht * (t ?? 0));
    return { ligne: L, ht, tva, ttc: r2(ht + tva) };
  });
  const uniq = (a: string[]) => Array.from(new Set(a));
  const totKwh = res.reduce((s, r) => s + (r.calc?.kwh ?? 0), 0);
  const totPrime = r2(res.reduce((s, r) => s + (r.calc?.prime ?? 0), 0) + ops.reduce((s, o) => s + primeOperation(o), 0));
  const primeLocaux = r2(res.reduce((s, r) => s + (r.calc?.prime ?? 0), 0));
  // opérations CEE : montant TTC = prime (comme l'exe), HT déduit du taux de TVA des paramètres
  // (en BtoC, la prime est déduite des lignes produits : les opérations n'ont pas de prix propre)
  const ceeHt = r2(primeLocaux / (1 + P.tva));
  const ht = r2(ceeHt + lib.reduce((s, x) => s + x.ht, 0));
  const ttc = r2(primeLocaux + lib.reduce((s, x) => s + x.ttc, 0));
  const aide = r2(num(d.aide_montant) || 0);
  if (aide && !txt(d.aide_libelle)) erreurs.push("Libellé de l'aide déduite manquant");
  if (ttc - totPrime - aide < -0.005) alertes.push(`Reste à payer négatif (${fr(ttc - totPrime - aide)} €) : la prime dépasse le montant TTC des prestations`);
  const taux = Array.from(new Set([...(lignes.length ? [P.tva] : []), ...lib.map((x) => num(x.ligne.tva) ?? 0)])).sort((a, b) => b - a);
  void avecCee;
  const totaux: Totaux = { ht, tva: r2(ttc - ht), ttc, primeCee: totPrime, aide, reste: r2(ttc - totPrime - aide), taux };
  const errs = uniq(erreurs);
  return { ok: errs.length === 0, erreurs: errs, alertes: uniq(alertes), lignes: res, libres: lib, totKwh, totPrime, totaux };
}
