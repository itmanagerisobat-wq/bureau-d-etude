import { S } from "@/lib/constants";

/**
 * Calculs du rapport de contrôle qualité (même logique que le rapport PDF mensuel) :
 *  - période = date de production du dossier (champ `date`)
 *  - « traités » = dossiers audités
 *  - un dossier « Modification » compte pour l'ingénieur de modif (sinon l'ingénieur)
 *  - retours internes = retours de type interne ou qualité (imputables à l'ingénieur)
 *  - taux de retour = retours internes ÷ dossiers traités
 */

export const GRILLE_DEFAUT = { excellent: 10, bon: 30, surveiller: 50, seuilMin: 5 };

export const NIVEAUX = [
  { cle: "excellent", libelle: "Excellent", couleur: "#5B9E47" },
  { cle: "bon", libelle: "Bon", couleur: "#E6A23C" },
  { cle: "surveiller", libelle: "À surveiller", couleur: "#EE8B5B" },
  { cle: "critique", libelle: "Critique", couleur: "#D9453B" },
];

export function niveau(taux, grille = GRILLE_DEFAUT) {
  if (taux <= grille.excellent) return NIVEAUX[0];
  if (taux <= grille.bon) return NIVEAUX[1];
  if (taux <= grille.surveiller) return NIVEAUX[2];
  return NIVEAUX[3];
}

const AUDITES = [S.VALIDE, "Dossier vérifié"];
const estModif = (d) => String(d.nature_prod || "").toLowerCase().startsWith("modif");

/** Ingénieur à qui le dossier est compté. */
export function ingenieurResponsable(d) {
  return String((estModif(d) && d.ingenieur_modif) || d.ingenieur || "—").trim();
}
const memeNom = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();

const pct = (a, b) => (b ? (a / b) * 100 : 0);

/** Ligne de détail (un ingénieur ou une opération). */
function ligne(cle, dossiers, retoursParDossier, causes) {
  const nouveaux = dossiers.filter((d) => !estModif(d)).length;
  const modifies = dossiers.length - nouveaux;
  const parCause = Object.fromEntries(causes.map((c) => [c, 0]));
  let autres = 0;
  let internes = 0;
  let clients = 0;
  for (const d of dossiers) {
    for (const r of retoursParDossier.get(d.id) || []) {
      if (r.type === "client") {
        clients++;
        continue;
      }
      internes++;
      const c = causes.find((x) => x.toLowerCase() === String(r.cause || "").trim().toLowerCase());
      if (c) parCause[c]++;
      else autres++;
    }
  }
  return { cle, nouveaux, modifies, total: dossiers.length, internes, clients, parCause, autres, taux: pct(internes, dossiers.length) };
}

/**
 * dossiers : dossiers de la période (tous statuts) ; retours : lignes dossier_retours ;
 * causes : causes internes de Paramètres (colonnes) ; filtre : { operation, ingenieur }.
 */
export function calculerRapport({ dossiers, retours, causes, grille = GRILLE_DEFAUT, operation = null, ingenieur = null }) {
  const traites = dossiers.filter((d) => AUDITES.includes(d.etat));
  const retoursParDossier = new Map();
  for (const r of retours || []) {
    if (!retoursParDossier.has(r.dossier_id)) retoursParDossier.set(r.dossier_id, []);
    retoursParDossier.get(r.dossier_id).push(r);
  }
  // Colonnes de causes : la liste de Paramètres + les causes rencontrées hors liste regroupées en « Autres »
  const colonnes = [...causes];

  const operations = [...new Set(traites.map((d) => d.nom_operation || "Sans fiche"))].sort();
  const sections = (operation ? [operation] : operations).map((op) => {
    const ds = traites.filter((d) => (d.nom_operation || "Sans fiche") === op && (!ingenieur || memeNom(ingenieurResponsable(d), ingenieur)));
    const parIng = new Map(); // nom en minuscules → { nom affiché, dossiers }
    for (const d of ds) {
      const nom = ingenieurResponsable(d);
      const k = nom.toLowerCase();
      if (!parIng.has(k)) parIng.set(k, { nom, liste: [] });
      parIng.get(k).liste.push(d);
    }
    const lignes = [...parIng.values()].map(({ nom, liste }) => ligne(nom, liste, retoursParDossier, colonnes)).sort((a, b) => a.cle.localeCompare(b.cle));
    const total = ligne("TOTAL", ds, retoursParDossier, colonnes);
    const eligibles = lignes.filter((l) => l.total >= grille.seuilMin);
    const tauxMoyen = eligibles.length ? eligibles.reduce((s, l) => s + l.taux, 0) / eligibles.length : 0;
    const pareto = paretoCauses(total, colonnes);
    return {
      operation: op,
      lignes,
      total,
      kpi: {
        nouveaux: total.nouveaux,
        modifies: total.modifies,
        total: total.total,
        partModifs: pct(total.modifies, total.total),
        internes: total.internes,
        tauxPondere: total.taux,
        tauxMoyen,
        nbEligibles: eligibles.length,
        rendement: 100 - total.taux,
        clients: total.clients,
        volumeMoyen: lignes.length ? total.total / lignes.length : 0,
      },
      classement: [...lignes].sort((a, b) => a.taux - b.taux || b.total - a.total),
      pareto,
    };
  });

  // Vue « un ingénieur » : une ligne par opération
  let parOperation = null;
  if (ingenieur) {
    const siens = traites.filter((d) => memeNom(ingenieurResponsable(d), ingenieur) && (!operation || d.nom_operation === operation));
    const groupes = new Map();
    for (const d of siens) {
      const k = d.nom_operation || "Sans fiche";
      if (!groupes.has(k)) groupes.set(k, []);
      groupes.get(k).push(d);
    }
    const lignes = [...groupes.entries()].map(([k, l]) => ligne(k, l, retoursParDossier, colonnes)).sort((a, b) => a.cle.localeCompare(b.cle));
    // Moyenne de l'équipe par opération (pour comparer)
    for (const l of lignes) {
      const eq = traites.filter((d) => (d.nom_operation || "Sans fiche") === l.cle);
      l.tauxEquipe = ligne("eq", eq, retoursParDossier, colonnes).taux;
    }
    const total = ligne("TOTAL", siens, retoursParDossier, colonnes);
    total.tauxEquipe = ligne("eq", traites.filter((d) => !operation || d.nom_operation === operation), retoursParDossier, colonnes).taux;
    parOperation = { lignes, total, pareto: paretoCauses(total, colonnes), dossiers: siens, retoursParDossier };
  }

  return { colonnes, sections, parOperation, nbTraites: traites.length };
}

function paretoCauses(total, colonnes) {
  const lignes = colonnes.map((c) => ({ cause: c, n: total.parCause[c] || 0 }));
  if (total.autres) lignes.push({ cause: "Autres causes", n: total.autres });
  lignes.sort((a, b) => b.n - a.n);
  let cumul = 0;
  const n = total.internes || 0;
  return lignes.map((l) => {
    cumul += l.n;
    return { ...l, part: pct(l.n, n), cumul: pct(cumul, n) };
  });
}

/** Anomalies de saisie à signaler sous les tableaux (retours sans cause, causes hors liste). */
export function anomalies(section) {
  const notes = [];
  for (const l of section.lignes) {
    const somme = Object.values(l.parCause).reduce((s, v) => s + v, 0) + l.autres;
    if (l.autres) notes.push(`${l.cle} : ${l.autres} retour(s) interne(s) avec une cause hors liste ou vide`);
    else if (somme !== l.internes) notes.push(`${l.cle} : ${l.internes} retours internes pour ${somme} causes saisies`);
  }
  return notes;
}

export const fmtPct = (v, d = 1) => `${(v || 0).toFixed(d).replace(".", ",")} %`;
