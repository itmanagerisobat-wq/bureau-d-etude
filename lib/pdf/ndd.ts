// Note de dimensionnement (NDD) — reproduit le modèle HILL SOLUTION (NDD 2026-0006-V2, reportlab).
// Coordonnées reportlab (origine en BAS à gauche, en points) mesurées sur le PDF modèle ; conversion pdfkit via Y().
// Polices : Carlito = Calibri à métriques identiques (licence OFL), sans crénage ni ligatures comme reportlab.
import PDFDocument from "pdfkit";
import { readFileSync } from "fs";
import path from "path";

type Doc = InstanceType<typeof PDFDocument>;
type RGB = [number, number, number];

const W = 595.2756, H = 841.8898;
const Y = (y: number) => H - y;
const X0 = 48, LARG = 499.2756;
const HAUT_PAGE = 737.8898;   // sommet du 1er titre de section sur les pages 2 et suivantes
const BAS_CADRE = 40;         // limite basse du contenu (le pied de page est à 13,5)

const c = (r: number, g: number, b: number): RGB => [r * 255, g * 255, b * 255];
export const COUL = {
  bleu: c(0.031373, 0.439216, 0.658824),
  marine: c(0.043137, 0.309804, 0.478431),
  gris: c(0.352941, 0.392157, 0.439216),
  vert: c(0.427451, 0.745098, 0.270588),
  rouge: c(0.803922, 0.188235, 0.172549),
  orange: c(0.929412, 0.552941, 0.117647),
  bord: c(0.788235, 0.839216, 0.878431),
  bord2: c(0.623529, 0.705882, 0.768627),
  zebre: c(0.917647, 0.952941, 0.976471),
  zebre2: c(0.862745, 0.921569, 0.960784),
  blanc: [255, 255, 255] as RGB,
  noir: [0, 0, 0] as RGB,
};
const DEGRADE_HAUT = c(1, 0.988235, 0.960784), DEGRADE_BAS = c(0.847059, 0.835294, 0.796078);

const R = "Carlito", B = "Carlito-Bold";
const SANS_CRENAGE = { kern: false, liga: false, clig: false, calt: false, dlig: false } as any;

function dossierPdf(...p: string[]) {
  // lib/pdf/<fonts|assets> : présent dans le dépôt et copié par Vercel (outputFileTracingIncludes)
  return path.join(process.cwd(), "lib", "pdf", ...p);
}
let polices: { r: Buffer; b: Buffer } | null = null;
function chargerPolices() {
  if (!polices) polices = { r: readFileSync(dossierPdf("fonts", "Carlito-Regular.ttf")), b: readFileSync(dossierPdf("fonts", "Carlito-Bold.ttf")) };
  return polices;
}
export function imageParDefaut(nom: "ndd-logo" | "ndd-qualification" | "ndd-signature"): Buffer | null {
  try { return readFileSync(dossierPdf("assets", nom + ".png")); } catch { return null; }
}

// ------------------------------------------------------------------ données
export type Statut = "Conforme" | "Non conforme" | "Prévu" | "À vérifier";

export interface BureauEtudes {
  nom: string; raison_sociale: string; siret: string; qualification: string; adresse: string;
  telephone: string; mail: string; charge: string; ville: string; pied: string;
}

export interface TableNdd {
  /** largeurs de colonnes (somme ≤ 499,28) */
  cols: number[];
  entete?: string[];
  /** alignement par colonne : l = gauche, r = droite, c = centré */
  align?: ("l" | "r" | "c")[];
  lignes: string[][];
  /** ligne de total (fond bleu clair, filet bleu au-dessus) */
  total?: string[];
  /** tableau « libellé / valeur » : colonne 1 fond bleu clair en gras marine, marges 3,5 */
  cleValeur?: boolean;
  /** colonne de statut colorée (index) */
  statut?: number;
}

export type Bloc =
  | { t: "titre"; n: number; texte: string }
  | { t: "para"; texte: string; taille?: number; interligne?: number }
  | { t: "table"; table: TableNdd }
  | { t: "sousTitre"; texte: string }
  | { t: "saut" };

export interface PlanNdd {
  image: Buffer | null;            // vue aérienne (jpeg/png) au format 4:3
  /** ou mosaïque de tuiles d'orthophoto (positions relatives au cadre, origine en haut à gauche) */
  tuiles?: { x: number; y: number; w: number; h: number; image: Buffer }[];
  /** surcharges vectorielles en coordonnées relatives à l'image (0..1, origine en haut à gauche) */
  parcelles?: [number, number][][];
  batiments?: [number, number][][];
  points?: [number, number][];
  /** couleur de chaque point (#rrggbb, même ordre que points) et légende par modèle de déstratificateur */
  couleurs?: string[];
  modeles?: { libelle: string; couleur: string; nombre: number }[];
  echelle?: { fraction: number; libelle: string } | null;
  nombre: number;
  legende?: string;
}

export interface DonneesNdd {
  reference: string;
  date: string;
  titre: string;              // NOTE DE DIMENSIONNEMENT
  sousTitre: string;          // Système de déstratification d'air
  ligneOperation: string;     // Opération BAT-TH-142 (vA71.4) — bâtiment tertiaire
  be: BureauEtudes;
  beneficiaire: [string, string][];   // 5 couples libellé / valeur
  site: [string, string][];
  synthese: { valeur: string; l1: string; l2?: string; accent?: "bleu" | "vert" }[];
  intro: string;
  blocs: Bloc[];              // sections 2 à 6 (titres compris)
  plan?: PlanNdd | null;      // section 7
  numeroPlan?: number;
  signatureBeneficiaire: string;
  images: { logo?: Buffer | null; qualification?: Buffer | null; signature?: Buffer | null };
  auteur?: string;
}

// ------------------------------------------------------------------ outils texte
function police(doc: Doc, gras: boolean, taille: number) { doc.font(gras ? B : R).fontSize(taille); }
function largeur(doc: Doc, s: string, gras: boolean, taille: number) {
  police(doc, gras, taille);
  return doc.widthOfString(s, { features: SANS_CRENAGE } as any);
}
/** Texte posé sur sa ligne de base (coordonnées reportlab). */
function texte(doc: Doc, s: string, x: number, base: number, o: { gras?: boolean; taille: number; coul?: RGB; align?: "l" | "r" | "c"; espaceMots?: number }) {
  if (!s) return;
  police(doc, !!o.gras, o.taille);
  const w = doc.widthOfString(s, { features: SANS_CRENAGE } as any);
  const xx = o.align === "r" ? x - w : o.align === "c" ? x - w / 2 : x;
  const asc = ((doc as any)._font.ascender / 1000) * o.taille;
  doc.fillColor(o.coul ?? COUL.noir).text(s, xx, Y(base) - asc, { lineBreak: false, features: SANS_CRENAGE, wordSpacing: o.espaceMots || 0 } as any);
}

interface LigneP { mots: string[]; w: number; nsp: number }
/** Découpage façon reportlab Paragraph (aligné à gauche, resserrement des espaces de 5 % autorisé). */
function couper(doc: Doc, s: string, larg: number, gras: boolean, taille: number): LigneP[] {
  const lignes: LigneP[] = [];
  for (const brut of String(s ?? "").split(/\n/)) {
    const mots = brut.split(/\s+/).filter(Boolean);
    const sp = largeur(doc, " ", gras, taille);
    let cur: string[] = [], w = 0;
    for (const m of mots) {
      const wm = largeur(doc, m, gras, taille);
      if (!cur.length) { cur = [m]; w = wm; continue; }
      const nouv = w + sp + wm;
      const nsp = cur.length;
      if (nouv > larg + 1e-6 && nouv - nsp * sp * 0.05 > larg + 1e-6) {
        lignes.push({ mots: cur, w, nsp: cur.length - 1 }); cur = [m]; w = wm;
      } else { cur.push(m); w = nouv; }
    }
    lignes.push({ mots: cur, w, nsp: Math.max(0, cur.length - 1) });
  }
  return lignes;
}
/** Paragraphe : (x, haut) en coordonnées reportlab ; 1re ligne de base = haut − taille. Renvoie la hauteur. */
function paragraphe(doc: Doc, s: string, x: number, haut: number, larg: number, o: { gras?: boolean; taille: number; interligne: number; coul?: RGB; align?: "l" | "r" | "c" }, dessiner = true): number {
  const lignes = couper(doc, s, larg, !!o.gras, o.taille);
  if (dessiner) {
    const sp = largeur(doc, " ", !!o.gras, o.taille);
    lignes.forEach((ln, i) => {
      const base = haut - o.taille - i * o.interligne;
      const resserre = ln.w > larg && ln.nsp ? (ln.w - larg) / ln.nsp : 0;
      const wl = ln.w - resserre * ln.nsp;
      const cx = o.align === "r" ? x + larg - wl : o.align === "c" ? x + (larg - wl) / 2 : x;
      texte(doc, ln.mots.join(" "), cx, base, { gras: o.gras, taille: o.taille, coul: o.coul, espaceMots: -resserre });
      void sp;
    });
  }
  return lignes.length * o.interligne;
}

// ------------------------------------------------------------------ outils dessin
function rectArrondi(doc: Doc, x: number, y: number, w: number, h: number, r: number) {
  doc.roundedRect(x, Y(y + h), w, h, r);
}
function fond(doc: Doc, num: number) {
  // dégradé vertical crème : 60 bandes de 1/60 de page (recouvrement de 2 pt)
  const pas = H / 60;
  for (let i = 0; i < 60; i++) {
    const t = i / 59;
    const col = DEGRADE_HAUT.map((v, k) => v + (DEGRADE_BAS[k] - v) * t) as RGB;
    doc.rect(0, Y(H - (i + 1) * pas - 1 + pas + 2), W, pas + 2).fill(col);
  }
  void num;
}
function entetePage(doc: Doc, d: DonneesNdd) {
  fond(doc, 0);
  if (d.images.logo) try { doc.image(d.images.logo, 23.7, Y(765.6898 + 60.5), { width: 111, height: 60.5 }); } catch { /* image invalide */ }
  if (d.images.qualification) try { doc.image(d.images.qualification, 481.5, Y(764.1898 + 59), { width: 95.5, height: 59 }); } catch { /* idem */ }
  if (d.be.pied) texte(doc, d.be.pied, W / 2, 13.5, { taille: 8, align: "c" });
}

function titreSection(doc: Doc, n: number, t: string, yc: number) {
  doc.circle(58, Y(yc), 10).fill(COUL.bleu);
  texte(doc, String(n), 58, yc - 4, { gras: true, taille: 11, coul: COUL.blanc, align: "c" });
  texte(doc, t, 76, yc - 4.5, { gras: true, taille: 12.5, coul: COUL.marine });
  const x1 = 76 + largeur(doc, t, true, 12.5) + 8;
  doc.lineWidth(1.4).strokeColor(COUL.vert).moveTo(x1, Y(yc)).lineTo(X0 + LARG, Y(yc)).stroke();
}

function encadre(doc: Doc, x: number, y: number, w: number, h: number, titre: string) {
  doc.lineWidth(0.7);
  rectArrondi(doc, x, y, w, h, 6); doc.fillAndStroke(COUL.blanc, COUL.bord);
  rectArrondi(doc, x, y + h - 20, w, 20, 6); doc.fill(COUL.bleu);
  doc.rect(x, Y(y + h - 20 + 8), w, 8).fill(COUL.bleu);
  texte(doc, titre, x + 9, y + h - 14, { gras: true, taille: 9.5, coul: COUL.blanc });
}

// ------------------------------------------------------------------ tableaux (équivalent reportlab Table)
interface Cellule { s: string; gras: boolean; taille: number; inter: number; coul: RGB; align: "l" | "r" | "c"; h: number }
interface Rangee { cells: Cellule[]; h: number; type: "entete" | "corps" | "total" }

function preparerTable(doc: Doc, t: TableNdd): Rangee[] {
  const pad = t.cleValeur ? 3.5 : 4;
  const out: Rangee[] = [];
  const mk = (vals: string[], type: Rangee["type"]): Rangee => {
    const cells = vals.map((s, i) => {
      const ent = type === "entete";
      const statut = t.statut === i && type === "corps";
      const gras = ent || statut || (!!t.cleValeur && i === 0);
      const taille = ent || statut ? 8.6 : 8.8;
      const inter = ent || statut ? 11.008 : 11.264;
      const coul = ent || statut ? COUL.blanc : t.cleValeur && i === 0 ? COUL.marine : COUL.noir;
      const align: "l" | "r" | "c" = ent ? (t.statut === i ? "c" : "l") : statut ? "c" : (t.align?.[i] ?? "l");
      const hh = paragraphe(doc, s, 0, 0, t.cols[i] - 12, { gras, taille, interligne: inter }, false);
      return { s, gras, taille, inter, coul, align, h: hh };
    });
    return { cells, h: Math.max(...cells.map((c) => c.h)) + 2 * pad, type };
  };
  if (t.entete) out.push(mk(t.entete, "entete"));
  t.lignes.forEach((l) => out.push(mk(l, "corps")));
  if (t.total) out.push(mk(t.total, "total"));
  return out;
}

/** Dessine les rangées données ; haut = coordonnée reportlab du haut du tableau. Renvoie la hauteur. */
function dessinerTable(doc: Doc, t: TableNdd, rangees: Rangee[], haut: number): number {
  const larg = t.cols.reduce((a, b) => a + b, 0);
  const xs = t.cols.map((_, i) => X0 + t.cols.slice(0, i).reduce((a, b) => a + b, 0));
  let y = haut;
  let corps = 0;
  // fonds
  for (const r of rangees) {
    const bas = y - r.h;
    if (r.type === "entete") doc.rect(X0, Y(y), larg, r.h).fill(COUL.bleu);
    else if (t.cleValeur) {
      doc.rect(X0, Y(y), t.cols[0], r.h).fill(COUL.zebre);
      doc.rect(xs[1], Y(y), larg - t.cols[0], r.h).fill(COUL.blanc);
    } else if (r.type === "total") doc.rect(X0, Y(y), larg, r.h).fill(COUL.zebre2);
    else {
      const coulFond = corps % 2 === 0 ? COUL.blanc : COUL.zebre;
      if (t.statut !== undefined) {
        doc.rect(X0, Y(y), xs[t.statut] - X0, r.h).fill(coulFond);
        const st = r.cells[t.statut].s;
        const cs = st === "Non conforme" ? COUL.rouge : st === "À vérifier" ? COUL.orange : COUL.vert;
        doc.rect(xs[t.statut], Y(y), larg - (xs[t.statut] - X0), r.h).fill(cs);
      } else doc.rect(X0, Y(y), larg, r.h).fill(coulFond);
      corps++;
    }
    y = bas;
  }
  // textes (alignement vertical centré, marges 6)
  y = haut;
  for (const r of rangees) {
    r.cells.forEach((cl, i) => {
      const hautTexte = y - (r.h - cl.h) / 2;
      paragraphe(doc, cl.s, xs[i] + 6, hautTexte, t.cols[i] - 12, { gras: cl.gras, taille: cl.taille, interligne: cl.inter, coul: cl.coul, align: cl.align });
    });
    y -= r.h;
  }
  // filets : sous chaque rangée de corps (0,4 bord), cadre (0,6 bord2), filet bleu au-dessus du total
  const total = haut - y;
  doc.save().lineCap("round").lineJoin("round");
  y = haut;
  doc.lineWidth(0.4).strokeColor(COUL.bord);
  for (const r of rangees) {
    y -= r.h;
    if (r.type !== "entete") doc.moveTo(X0, Y(y)).lineTo(X0 + larg, Y(y)).stroke();
  }
  doc.lineWidth(0.6).strokeColor(COUL.bord2);
  doc.moveTo(X0, Y(haut)).lineTo(X0 + larg, Y(haut)).stroke();
  doc.moveTo(X0, Y(haut - total)).lineTo(X0 + larg, Y(haut - total)).stroke();
  doc.moveTo(X0, Y(haut - total)).lineTo(X0, Y(haut)).stroke();
  doc.moveTo(X0 + larg, Y(haut - total)).lineTo(X0 + larg, Y(haut)).stroke();
  const iTot = rangees.findIndex((r) => r.type === "total");
  if (iTot > 0) {
    const yt = haut - rangees.slice(0, iTot).reduce((a, r) => a + r.h, 0);
    doc.lineWidth(0.9).strokeColor(COUL.bleu).moveTo(X0, Y(yt)).lineTo(X0 + larg, Y(yt)).stroke();
  }
  doc.restore();
  return total;
}

// ------------------------------------------------------------------ document
export async function genererPdfNdd(d: DonneesNdd): Promise<{ pdf: Buffer; pages: number }> {
  const doc = new PDFDocument({ size: "A4", margin: 0, bufferPages: true, autoFirstPage: false });
  const pol = chargerPolices();
  doc.registerFont(R, pol.r);
  doc.registerFont(B, pol.b);
  doc.info.Title = `Note de dimensionnement ${d.reference}`;
  doc.info.Author = d.auteur ?? d.be.nom;
  const chunks: Buffer[] = [];
  doc.on("data", (x) => chunks.push(x));
  const fin = new Promise<Buffer>((res) => doc.on("end", () => res(Buffer.concat(chunks))));
  let pages = 0;
  const nouvellePage = () => { doc.addPage({ size: "A4", margin: 0 }); pages++; entetePage(doc, d); };

  // ================= page 1
  nouvellePage();
  doc.rect(48, Y(689.8898 + 52), 4, 52).fill(COUL.bleu);
  texte(doc, d.titre, 62, 719.8898, { gras: true, taille: 21, coul: COUL.marine });
  texte(doc, d.sousTitre, 62, 703.8898, { taille: 11, coul: COUL.gris });
  texte(doc, d.ligneOperation, 62, 690.8898, { taille: 8.6, coul: COUL.gris });
  // cartouche référence
  doc.lineWidth(0.9); rectArrondi(doc, 407.2756, 677.8898, 140, 70, 6); doc.fillAndStroke(COUL.blanc, COUL.bleu);
  ([["Référence de l’étude", d.reference, 736.8898], ["Date d’étude", d.date, 715.8898], ["Bureau d’études", d.be.nom, 694.8898]] as const)
    .forEach(([l, v, yb]) => {
      texte(doc, l, 417.2756, yb, { taille: 6.8, coul: COUL.gris });
      texte(doc, v, 417.2756, yb - 10.5, { gras: true, taille: 9.5, coul: COUL.marine });
    });
  // bénéficiaire / site
  const champs = (x: number, liste: [string, string][]) => {
    let yl = 627.8898;
    for (const [l, v] of liste) {
      texte(doc, l, x, yl, { taille: 7.4, coul: COUL.gris });
      const h = paragraphe(doc, v || " ", x, yl - 3, 226.6378, { taille: 9, interligne: 11.52 });
      yl = yl - 3 - h - 10;
    }
  };
  encadre(doc, 48, 487.8898, 244.6378, 172, "BÉNÉFICIAIRE");
  champs(57, d.beneficiaire);
  encadre(doc, 302.6378, 487.8898, 244.6378, 172, "SITE DES TRAVAUX");
  champs(311.6378, d.site);
  // bureau d'études
  encadre(doc, 48, 377.8898, 499.2756, 100, "BUREAU D’ÉTUDES");
  const be: [string, string, number, number][] = [
    ["Raison sociale", d.be.raison_sociale, 57, 446.8898], ["SIRET", d.be.siret, 262, 446.8898], ["Qualification", d.be.qualification, 387, 446.8898],
    ["Adresse", d.be.adresse, 57, 422.8898], ["Téléphone", d.be.telephone, 262, 422.8898], ["Mail", d.be.mail, 387, 422.8898],
    ["Chargé(e) d’étude", d.be.charge, 57, 398.8898],
  ];
  for (const [l, v, x, yb] of be) {
    texte(doc, l, x, yb, { taille: 7.4, coul: COUL.gris });
    texte(doc, v, x, yb - 10.5, { taille: 8.8 });
  }
  // 1 — synthèse
  titreSection(doc, 1, "SYNTHÈSE DU DIMENSIONNEMENT", 349.8898);
  const nT = d.synthese.length || 1;
  const wT = (LARG - (nT - 1) * 8) / nT;
  d.synthese.forEach((t, i) => {
    const x = 48 + i * (wT + 8);
    doc.lineWidth(1.4); rectArrondi(doc, x, 273.8898, wT, 54, 6); doc.fillAndStroke(COUL.blanc, COUL.bord);
    doc.rect(x, Y(273.8898 + 54), 3.5, 54).fill(t.accent === "vert" ? COUL.vert : COUL.bleu);
    const cx = x + 2 + wT / 2;
    texte(doc, t.valeur, cx, 302.8898, { gras: true, taille: 15, coul: COUL.marine, align: "c" });
    texte(doc, t.l1, cx, 289.8898, { taille: 7.6, coul: COUL.gris, align: "c" });
    if (t.l2) texte(doc, t.l2, cx, 280.8898, { taille: 7.6, coul: COUL.gris, align: "c" });
  });
  paragraphe(doc, d.intro, 48, 259.8898, LARG, { taille: 9.4, interligne: 12.5 });

  // ================= sections 2 à 6 : mise en page en flux (comme platypus)
  // modèle d'espacement platypus : espace = espaceApres(précédent) + espaceAvant(courant), supprimé en haut de page
  const AVANT: Record<string, number> = { titre: 4, table: 0, para: 0, sousTitre: 4 };
  const APRES: Record<string, number> = { titre: 12, table: 10, para: 0, sousTitre: 2 };
  let y = 0;            // haut de la place libre (reportlab)
  let apres = -1;       // espace après l'élément précédent (-1 = haut de page)
  const sautPage = () => { nouvellePage(); y = HAUT_PAGE; apres = -1; };
  const espace = (t: string) => (apres < 0 ? 0 : apres + AVANT[t]);
  sautPage();
  for (const b of d.blocs) {
    if (b.t === "saut") { if (apres >= 0) sautPage(); continue; }
    if (b.t === "titre") {
      if (y - espace("titre") - 20 - 12 - 60 < BAS_CADRE) sautPage(); // garde le titre avec la suite
      y -= espace("titre");
      titreSection(doc, b.n, b.texte, y - 10);
      y -= 20; apres = APRES.titre;
    } else if (b.t === "sousTitre") {
      if (y - espace("sousTitre") - 14 - 40 < BAS_CADRE) sautPage();
      y -= espace("sousTitre");
      texte(doc, b.texte, 48, y - 10, { gras: true, taille: 9.5, coul: COUL.marine });
      y -= 14; apres = APRES.sousTitre;
    } else if (b.t === "para") {
      const taille = b.taille ?? 9.2, inter = b.interligne ?? 12.2;
      const h = paragraphe(doc, b.texte, 48, 0, LARG, { taille, interligne: inter }, false);
      if (y - espace("para") - h < BAS_CADRE) sautPage();
      y -= espace("para");
      paragraphe(doc, b.texte, 48, y, LARG, { taille, interligne: inter });
      y -= h; apres = APRES.para;
    } else if (b.t === "table") {
      const toutes = preparerTable(doc, b.table);
      const entete = b.table.entete ? toutes[0] : null;
      let reste = entete ? toutes.slice(1) : toutes;
      y -= espace("table");
      while (reste.length) {
        // rangées qui tiennent sur la page (l'en-tête est répété en haut de chaque morceau)
        const tete = entete ? [entete] : [];
        let h = tete.reduce((a, r) => a + r.h, 0), n = 0;
        for (const r of reste) { if (y - h - r.h < BAS_CADRE) break; h += r.h; n++; }
        if (n === 0) { if (apres < 0) n = 1; else { sautPage(); continue; } }
        y -= dessinerTable(doc, b.table, [...tete, ...reste.slice(0, n)], y);
        reste = reste.slice(n);
        if (reste.length) sautPage();
      }
      apres = APRES.table;
    }
  }

  // ================= section 7 : plan de calepinage + signatures (page dédiée)
  if (d.plan === undefined) {
    // pas de plan : « Fait à … » et signatures à la suite
    if (y - (apres < 0 ? 0 : apres + 14) - 150 < BAS_CADRE) sautPage();
    signatures(doc, d, y - (apres < 0 ? 10 : apres + 14));
  } else {
    sautPage();
    const p = d.plan;
    titreSection(doc, d.numeroPlan ?? 7, "PLAN DE CALEPINAGE", 727.8898);
    texte(doc, `Nombre total de déstratificateurs : ${p?.nombre ?? 0}`, 547.2756, 711.8898, { taille: 8.6, coul: COUL.gris, align: "r" });
    doc.rect(53.6378, Y(341.8898 + 368), 488, 368).fill(COUL.blanc);
    const ix = 57.6378, iy = 345.8898, iw = 480, ih = 360;
    if (p?.tuiles?.length) {
      doc.save(); doc.rect(ix, Y(iy + ih), iw, ih).clip();
      for (const t of p.tuiles) {
        // léger recouvrement pour éviter les liserés entre tuiles
        try { doc.image(t.image, ix + t.x * iw - 0.05, Y(iy + ih) + t.y * ih - 0.05, { width: t.w * iw + 0.1, height: t.h * ih + 0.1 }); } catch { /* tuile invalide */ }
      }
      doc.restore();
    } else if (p?.image) {
      try { doc.image(p.image, ix, Y(iy + ih), { fit: [iw, ih], align: "center", valign: "center" }); } catch { /* image invalide */ }
    } else {
      texte(doc, "Vue aérienne indisponible : importez une image du site dans la note de dimensionnement", ix + iw / 2, iy + ih / 2, { taille: 9, coul: COUL.gris, align: "c" });
    }
    if (p) dessinerSurcharges(doc, p, ix, iy, iw, ih);
    doc.lineWidth(0.6).strokeColor(COUL.bord2).rect(ix, Y(iy + ih), iw, ih).stroke();
    if (p?.legende) texte(doc, p.legende, W / 2, 331.8898, { taille: 7.5, coul: COUL.gris, align: "c" });
    else if (p?.modeles?.length && (p.modeles.length > 1 || p.modeles[0].couleur.toUpperCase() !== "#DC0000")) legendeModeles(doc, p.modeles);
    else for (const [m, x] of LEGENDE) {
      if (m === "●") doc.circle(x + 3.4, Y(331.8898 + 2.55), 3.1).fill(COUL.gris); // puce Segoe UI Symbol
      else texte(doc, m, x, 331.8898, { taille: 7.5, coul: COUL.gris });
    }
    signatures(doc, d, 315.8898);
  }

  doc.end();
  return { pdf: await fin, pages };
}

// légende du modèle (composée en Segoe UI Symbol) : positions des mots reprises du PDF d'origine
const LEGENDE: [string, number][] = [["●", 103.26], ["Déstratificateur", 111.78], ["—", 168.39], ["parcelle", 182.05], ["cadastrale", 209.88],
  ["en", 245.33], ["jaune", 255.55], ["—", 279.76], ["bâtiment", 293.42], ["en", 325.23], ["bleu", 335.45], ["—", 356.0], ["Vue", 369.67],
  ["aérienne", 384.55], [":", 415.1], ["©", 418.78], ["IGN", 427.51], ["Géoplateforme", 442.31]];

/** Légende avec une pastille de couleur par modèle de déstratificateur (ex. DS3 en bleu, DS7 en rouge) */
function legendeModeles(doc: Doc, modeles: { libelle: string; couleur: string; nombre: number }[]) {
  const t = 7.5, base = 331.8898;
  const fin = " — parcelle cadastrale en jaune — bâtiment en bleu clair — Vue aérienne : © IGN Géoplateforme";
  const items = modeles.map((m) => `${m.libelle} (${m.nombre})`);
  const total = items.reduce((a, s) => a + 9 + largeur(doc, s, false, t) + 6, 0) + largeur(doc, fin, false, t);
  let x = W / 2 - total / 2;
  modeles.forEach((m, i) => {
    doc.circle(x + 3.4, Y(base + 2.55), 3.4).fill(m.couleur);
    x += 9;
    texte(doc, items[i], x, base, { taille: t, coul: COUL.gris });
    x += largeur(doc, items[i], false, t) + 6;
  });
  texte(doc, fin.trim(), x, base, { taille: t, coul: COUL.gris });
}

function signatures(doc: Doc, d: DonneesNdd, yFait: number) {
  texte(doc, `Fait à ${d.be.ville || "Paris"}, le ${d.date}`, 48, yFait, { taille: 9.5 });
  const haut = yFait - 14, bas = haut - 118;
  const boite = (x: number, titre: string, sous: string) => {
    doc.lineWidth(0.9); rectArrondi(doc, x, bas, 241.6378, 118, 6); doc.fillAndStroke(COUL.blanc, COUL.bleu);
    texte(doc, titre, x + 9, haut - 15, { gras: true, taille: 9.2, coul: COUL.marine });
    texte(doc, sous, x + 9, haut - 27, { taille: 7.6, coul: COUL.gris });
  };
  boite(48, "Cachet et signature du bénéficiaire", d.signatureBeneficiaire);
  boite(305.6378, "Cachet et signature du bureau d’études", `${d.be.nom} — ${d.be.charge}`);
  if (d.images.signature) {
    try {
      const w = 104.252, h = 80;
      doc.image(d.images.signature, 305.6378 + 241.6378 / 2 - w / 2, Y(bas + 6 + h), { fit: [w, h], align: "center", valign: "bottom" });
    } catch { /* image invalide */ }
  }
}

function dessinerSurcharges(doc: Doc, p: PlanNdd, ix: number, iy: number, iw: number, ih: number) {
  const P = ([u, v]: [number, number]) => [ix + u * iw, Y(iy + ih) + v * ih] as [number, number];
  doc.save();
  doc.rect(ix, Y(iy + ih), iw, ih).clip();
  const poly = (pts: [number, number][]) => {
    pts.forEach((pt, i) => { const [x, yy] = P(pt); if (i) doc.lineTo(x, yy); else doc.moveTo(x, yy); });
    doc.closePath();
  };
  for (const pg of p.parcelles ?? []) { poly(pg); doc.lineWidth(1.3).lineJoin("miter").strokeColor([245, 200, 0]).stroke(); }
  for (const pg of p.batiments ?? []) { poly(pg); doc.lineWidth(0.6).strokeColor([60, 170, 210]).stroke(); }
  (p.points ?? []).forEach((pt, i) => {
    const [x, yy] = P(pt);
    doc.circle(x, yy, 6).fill([255, 255, 255]);
    doc.circle(x, yy, 4.8).fill(p.couleurs?.[i] ?? [220, 0, 0]);
  });
  if (p.echelle) {
    const bx = ix + 0.02 * iw, by = Y(iy) - 0.02 * ih - 14;
    const lg = p.echelle.fraction * iw;
    doc.rect(bx, by, lg + 40, 14).fillOpacity(0.85).fill([255, 255, 255]).fillOpacity(1);
    doc.lineWidth(1.6).strokeColor([0, 0, 0]).moveTo(bx + 3, by + 9).lineTo(bx + 3 + lg, by + 9).stroke();
    texte(doc, p.echelle.libelle, bx + 6 + lg + 2, iy + 0.02 * ih + 4.2, { gras: true, taille: 8 });
  }
  doc.restore();
}
