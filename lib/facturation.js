// Facturation : paramètres, sélection des dossiers d'une période, lignes, numérotation.
import { jourLocal } from "@/lib/series";

/** Valeurs de départ, reprises de la facture FA2610-0002 (toutes modifiables dans l'onglet Paramètres). */
export const CONFIG_DEFAUT = {
  emetteur: { nom: "HILLSOLUTION", adresse: "38 rue de Berri", cp_ville: "75008 Paris", tel: "0762664069", email: "contact@etudeshillsolution.com", web: "www.hill-solution.fr" },
  banque: { beneficiaire: "HILLSOLUTION", iban: "FR98 3000 2006 2100 0000 7435 X64", bic: "CRLYFRPP", adresse: "38 RUE DE BERRI 75008 PARIS", banque: "LCL" },
  pied: { forme: "Société à responsabilité limitée (SARL)", capital: "100 000 €", siret: "977 765 890 00024", tva_intra: "FR28977765890" },
  prefixe: "FA",
  tva: 20,
  delai_jours: 1,
  conditions: "A réception",
  categorie: "Prestation de services",
  designation_defaut: "Dossier administratif {fiche}",
  pu_nouveau_defaut: 40,
  pu_modification_defaut: 0,
  clients: {}, // { "Nom du client dans l'app": { raison_sociale, adresse, cp_ville, code_client } }
  tarifs: {}, // { "BAR-TH-174": { designation, pu_nouveau, pu_modification } }
};

/** Fusionne la configuration enregistrée avec les valeurs de départ. */
export function completerConfig(c = {}) {
  return {
    ...CONFIG_DEFAUT,
    ...c,
    emetteur: { ...CONFIG_DEFAUT.emetteur, ...(c.emetteur || {}) },
    banque: { ...CONFIG_DEFAUT.banque, ...(c.banque || {}) },
    pied: { ...CONFIG_DEFAUT.pied, ...(c.pied || {}) },
    clients: { ...(c.clients || {}) },
    tarifs: { ...(c.tarifs || {}) },
  };
}

const num = (v, defaut = 0) => {
  if (v === undefined || v === null || String(v).trim() === "") return defaut;
  const n = Number(String(v).replace(",", ".").replace(/\s/g, ""));
  return Number.isFinite(n) ? n : defaut;
};
export const arrondi = (n) => Math.round(n * 100) / 100;

/** Montant au format de la facture : 6 080,00 */
export const euros = (n) => num(n).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** Date JJ/MM/AAAA */
export const dateFr = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "");

export function ajouterJours(iso, n) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + num(n));
  return d.toLocaleDateString("sv-SE");
}

/** Bornes d'un mois « AAAA-MM ». */
export function bornesMois(mois) {
  const [a, m] = mois.split("-").map(Number);
  const fin = new Date(a, m, 0).getDate();
  return { du: `${mois}-01`, au: `${mois}-${String(fin).padStart(2, "0")}` };
}

/** Mois précédent au format AAAA-MM (période facturée par défaut). */
export function moisPrecedent() {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return d.toLocaleDateString("sv-SE").slice(0, 7);
}

export const estNouveau = (d) => d.nature_prod === "Nouveau dossier";
export const estModification = (d) => d.nature_prod === "Modification";

/** Date qui fait entrer un dossier dans la période : date d'audit ou date du dossier. */
export const dateRetenue = (d, base) => jourLocal(base === "saisie" ? d.date : d.date_verification);

/**
 * Dossiers à facturer.
 * criteres = { client, du, au, base: "audit" | "saisie", nouveaux, modifications, exclureFactures, dejaFactures: Set(id) }
 * Renvoie { retenus, dejaFactures } (dejaFactures = dossiers de la période déjà sur une autre facture).
 */
export function dossiersAFacturer(dossiers, c) {
  const dans = dossiers.filter((d) => {
    if (d.etat === "Annulé") return false;
    if (c.client && d.client !== c.client) return false;
    const n = estNouveau(d);
    const m = estModification(d);
    if (!((c.nouveaux && n) || (c.modifications && m))) return false;
    const j = dateRetenue(d, c.base);
    return !!j && j >= c.du && j <= c.au;
  });
  const deja = dans.filter((d) => c.dejaFactures?.has(d.id));
  const retenus = c.exclureFactures ? dans.filter((d) => !c.dejaFactures?.has(d.id)) : dans;
  retenus.sort((a, b) => String(a.nom_operation).localeCompare(String(b.nom_operation)) || String(dateRetenue(a, c.base)).localeCompare(String(dateRetenue(b, c.base))) || String(a.nom_dossier).localeCompare(String(b.nom_dossier)));
  return { retenus, dejaFactures: deja };
}

/** Désignation et prix unitaire d'une fiche pour une nature. */
export function tarif(config, fiche, nature) {
  const t = config.tarifs?.[fiche] || {};
  const base = (t.designation || config.designation_defaut || "Dossier administratif {fiche}").replace("{fiche}", fiche);
  if (nature === "Modification") {
    return { designation: `${base} (modification)`, pu: num(t.pu_modification, num(config.pu_modification_defaut)) };
  }
  return { designation: base, pu: num(t.pu_nouveau, num(config.pu_nouveau_defaut, 40)) };
}

/**
 * Lignes de facture : une ligne par fiche et par nature, avec la liste des dossiers (modèle détaillé).
 */
export function construireLignes(retenus, config, base) {
  const groupes = new Map();
  for (const d of retenus) {
    const nature = estModification(d) ? "Modification" : "Nouveau dossier";
    const k = `${d.nom_operation}|${nature}`;
    if (!groupes.has(k)) {
      const t = tarif(config, d.nom_operation, nature);
      groupes.set(k, { fiche: d.nom_operation, nature, designation: t.designation, tva: num(config.tva, 20), pu: t.pu, dossiers: [] });
    }
    groupes.get(k).dossiers.push({ id: d.id, nom: d.nom_dossier, date: dateRetenue(d, base), beneficiaire: d.beneficiaire_nom || "" });
  }
  const lignes = [...groupes.values()].map((g) => ({ ...g, qte: g.dossiers.length, total: arrondi(g.pu * g.dossiers.length) }));
  lignes.sort((a, b) => a.fiche.localeCompare(b.fiche) || (a.nature === "Modification") - (b.nature === "Modification"));
  return lignes;
}

export function totaux(lignes, tvaTaux) {
  const ht = arrondi(lignes.reduce((s, l) => s + l.total, 0));
  const tva = arrondi((ht * num(tvaTaux, 20)) / 100);
  return { ht, tva, ttc: arrondi(ht + tva) };
}

/** Numéro suivant : FA + AAMM + « - » + compteur sur 4 chiffres (FA2610-0002). */
export function numeroSuivant(prefixe, dateFacture, numerosExistants) {
  const racine = `${prefixe || "FA"}${dateFacture.slice(2, 4)}${dateFacture.slice(5, 7)}-`;
  const max = numerosExistants
    .filter((n) => String(n).startsWith(racine))
    .map((n) => parseInt(String(n).slice(racine.length), 10))
    .filter((n) => Number.isFinite(n))
    .reduce((a, b) => Math.max(a, b), 0);
  return `${racine}${String(max + 1).padStart(4, "0")}`;
}
