// Cadre de contribution CEE — reproduit le modèle Word ISO BAT / PREMIUM ENERGY
// (« Cadre de contribution COMMUNE DE COUBLANC (Église) », 2 pages A4).
// Coordonnées en points depuis le HAUT de la page, lignes de base mesurées sur le PDF modèle.
// Polices : Calibri → Carlito (métriques identiques, OFL) ; Microsoft Sans Serif (valeurs saisies) → Helvetica.
import PDFDocument from "pdfkit";
import { readFileSync } from "fs";
import path from "path";
import { BADGE_0808, CACHET_ISOBAT, LOGO_CEE, LOGO_ISOBAT_CADRE, LOGO_PREMIUM } from "./cadreImages";

type Doc = InstanceType<typeof PDFDocument>;

export interface DelegataireCadre {
  nom: string;                 // PREMIUM ENERGY
  logo: Buffer | null;         // null = logo PREMIUM ENERGY du modèle si le nom correspond, sinon le nom écrit
  site: string;                // https://www.premiumenergyfrance.fr/service/
  telephone: string;           // 0805 696 722
  mediateur_adresse: string;   // DEVIGNY MEDIATION, 9 Avenue René Gasnier 49100 Angers
  mediateur_site: string;
  mediateur_mail: string;
}

export interface DonneesCadre {
  delegataire: DelegataireCadre;
  societe: string;                              // ISOBAT
  prime: number;
  travaux: { nature: string; fiche: string }[];
  kwhClassique: number;
  kwhPrecarite: number;
  beneficiaire: string;                         // ligne « Au bénéfice de »
  adresse: string;
  telephone: string;
  mail: string;
  representant: string;                         // vide pour un particulier
  date: string;                                 // JJ/MM/AAAA
  logoSociete?: Buffer | null;
  cachet?: Buffer | null;
}

const R = "Carlito", B = "Carlito-Bold", I = "Carlito-Italic";
const SANS = "Helvetica", SANS_B = "Helvetica-Bold";
const SANS_CRENAGE = { kern: false, liga: false, clig: false, calt: false, dlig: false } as any;
const BLEU_LIEN = "#0563C1";

let polices: Record<string, Buffer> | null = null;
function chargerPolices() {
  const p = (f: string) => readFileSync(path.join(process.cwd(), "lib", "pdf", "fonts", f));
  if (!polices) polices = { [R]: p("Carlito-Regular.ttf"), [B]: p("Carlito-Bold.ttf"), [I]: p("Carlito-Italic.ttf") };
  return polices;
}

// ------------------------------------------------------------------ formats du modèle
const grp = (x: number, dec = 2) => {
  const [e, d] = Math.abs(x).toFixed(dec).split(".");
  return (x < 0 ? "-" : "") + e.replace(/\B(?=(\d{3})+(?!\d))/g, " ") + (d ? "," + d : "");
};
/** « 3 271.32 € » : le modèle écrit la prime avec un point */
const euroPoint = (x: number) => grp(x).replace(",", ".") + " €";
/** MWh : « 908.70 » (classique, point) ; kWh : « 908 700,00 » */
const mwhPoint = (kwh: number) => grp(kwh / 1000).replace(",", ".");

// ------------------------------------------------------------------ texte
function largeur(doc: Doc, s: string, font: string, size: number) {
  doc.font(font).fontSize(size);
  return doc.widthOfString(s, { features: SANS_CRENAGE } as any);
}
/** Texte sur sa ligne de base ; renvoie la position x de fin */
function ecrire(doc: Doc, s: string, x: number, base: number, font: string, size: number, o: { align?: "left" | "center" | "right"; coul?: string; espace?: number; souligne?: boolean } = {}) {
  doc.font(font).fontSize(size);
  const w = doc.widthOfString(s, { features: SANS_CRENAGE } as any) + (o.espace || 0) * (s.match(/ /g) || []).length;
  const xx = o.align === "center" ? x - w / 2 : o.align === "right" ? x - w : x;
  const asc = ((doc as any)._font.ascender / 1000) * size;
  doc.fillColor(o.coul ?? "black").text(s, xx, base - asc, { lineBreak: false, features: SANS_CRENAGE, wordSpacing: o.espace || 0 } as any);
  if (o.souligne) doc.save().rect(xx, base + 1.5, w, 0.6).fill(o.coul ?? "black").restore();
  return xx + w;
}
/** Découpe en lignes (comme Word : au mot) */
function lignes(doc: Doc, texte: string, font: string, size: number, larg: number): string[] {
  const out: string[] = [];
  for (const parag of texte.split("\n")) {
    let cur = "";
    for (const mot of parag.split(/\s+/).filter(Boolean)) {
      const essai = cur ? cur + " " + mot : mot;
      if (cur && largeur(doc, essai, font, size) > larg) { out.push(cur); cur = mot; } else cur = essai;
    }
    out.push(cur);
  }
  return out;
}
/** Paragraphe (justifié sauf dernière ligne si justifie) ; renvoie la ligne de base suivante */
function paragraphe(doc: Doc, texte: string, x: number, base: number, larg: number, font: string, size: number, interligne: number, justifie = false) {
  const ls = lignes(doc, texte, font, size, larg);
  ls.forEach((l, i) => {
    const nEsp = (l.match(/ /g) || []).length;
    const esp = justifie && i < ls.length - 1 && nEsp ? (larg - largeur(doc, l, font, size)) / nEsp : 0;
    ecrire(doc, l, x, base + i * interligne, font, size, { espace: esp });
  });
  return base + ls.length * interligne;
}

/** Lignes imposées (coupures du modèle Word), justifiées à la largeur sauf la dernière ; Word resserre aussi les espaces */
function lignesFixes(doc: Doc, ls: string[], x: number, base: number, larg: number, font: string, size: number, interligne: number, justifie: boolean, souligne = false) {
  ls.forEach((l, i) => {
    const nEsp = (l.match(/ /g) || []).length;
    const w = largeur(doc, l, font, size);
    const esp = nEsp && ((justifie && i < ls.length - 1) || w > larg) ? (larg - w) / nEsp : 0;
    ecrire(doc, l, x, base + i * interligne, font, size, { espace: esp, souligne });
  });
  return base + ls.length * interligne;
}
/** Coupe comme Word : les espaces peuvent se resserrer d'environ 0,5 pt pour garder un mot sur la ligne */
function lignesWord(doc: Doc, texte: string, font: string, size: number, larg: number): string[] {
  const out: string[] = [];
  let cur = "";
  for (const mot of texte.split(/\s+/).filter(Boolean)) {
    const essai = cur ? cur + " " + mot : mot;
    const nEsp = (essai.match(/ /g) || []).length;
    if (cur && largeur(doc, essai, font, size) - nEsp * 0.5 > larg) { out.push(cur); cur = mot; } else cur = essai;
  }
  if (cur) out.push(cur);
  return out;
}

/** Case à cocher (☒ / ☐ de MS Gothic) : carré de 7,6 pt posé sur la ligne de base */
function caseACocher(doc: Doc, x: number, base: number, cochee: boolean) {
  const c = 7.6, x0 = x + 0.85, y0 = base - 7.6;
  doc.save().lineWidth(0.55).strokeColor("black").rect(x0, y0, c, c).stroke();
  if (cochee) doc.moveTo(x0, y0).lineTo(x0 + c, y0 + c).moveTo(x0 + c, y0).lineTo(x0, y0 + c).stroke();
  doc.restore();
}

function image(doc: Doc, buf: Buffer | null | undefined, x: number, y: number, w: number, h: number) {
  if (!buf) return false;
  try { doc.image(buf, x, y, { fit: [w, h], align: "center", valign: "center" }); return true; } catch { return false; }
}

// ------------------------------------------------------------------ document
export async function genererPdfCadre(d: DonneesCadre): Promise<{ pdf: Buffer; pages: number }> {
  const doc = new PDFDocument({ size: [595.5, 841.98], margin: 0, autoFirstPage: false });
  const pol = chargerPolices();
  for (const [n, b] of Object.entries(pol)) doc.registerFont(n, b);
  for (const f of [SANS, SANS_B]) { doc.font(f); (doc as any)._font.font.kernPairs = {}; }
  const del = d.delegataire;
  const nomDel = del.nom.toUpperCase();
  doc.info.Title = `Cadre de contribution - ${d.beneficiaire.split(" , ")[0]}`;
  doc.info.Author = d.societe;
  const chunks: Buffer[] = [];
  doc.on("data", (c) => chunks.push(c));
  const fin = new Promise<Buffer>((res) => doc.on("end", () => res(Buffer.concat(chunks))));

  // ================================================================= page 1
  doc.addPage({ size: [595.5, 841.98], margin: 0 });
  image(doc, LOGO_CEE, 70.8, 69.9, 152.2, 58.4);
  const logoDel = del.logo ?? (nomDel === "PREMIUM ENERGY" ? LOGO_PREMIUM : null);
  if (!image(doc, logoDel, 238.7, 79.6, 152.5, 38.2)) ecrire(doc, nomDel, 314.9, 104, B, 16, { align: "center", coul: "#1F9E8C" });
  image(doc, d.logoSociete ?? LOGO_ISOBAT_CADRE, 455.4, 47.0, 74.5, 74.3);

  lignesFixes(doc, [
    "Le dispositif national des certificats d’économies d’énergie (CEE) mis en place par le Ministère en charge de",
    "l’énergie impose à l’ensemble des fournisseurs d’énergie (électricité, gaz, fioul domestique, chaleur ou froid,",
    "carburants automobiles), de réaliser des économies et de promouvoir les comportements vertueux auprès",
    "des consommateurs d’énergie.",
  ], 70.8, 173.7, 454.2, R, 10.5, 12.8, true);

  let x = ecrire(doc, "Dans le cadre de son partenariat avec ", 70.8, 239.8, R, 10.5);
  x = ecrire(doc, nomDel, x + 0.2, 239.8, B, 10.5);
  x = ecrire(doc, ", la société ", x, 239.8, R, 10.5);
  ecrire(doc, d.societe, x + 2.7, 239.8, SANS, 7.98);
  ecrire(doc, "s’engage à vous apporter :", 70.8, 252.6, R, 10.5);

  caseACocher(doc, 85.4, 268.6, true);
  x = ecrire(doc, "une prime d’un montant de", 98.4, 268.6, B, 10.5);
  ecrire(doc, euroPoint(d.prime), x + 2.7, 268.6, SANS, 7.98);
  ([[85.4, 285.5, 98.4, "un bon d’achat pour des produits de consommation courante ;"], [85.0, 302.0, 96.4, "un prêt bonifié ;"],
    [85.4, 318.4, 96.9, "un audit ou conseil personnalisé ;"], [85.4, 334.8, 96.9, "un produit ou service"]] as [number, number, number, string][])
    .forEach(([cx, b, tx, t]) => { caseACocher(doc, cx, b, false); ecrire(doc, t, tx, b, R, 10.5); });
  ecrire(doc, "dans le cadre des travaux suivants :", 70.8, 350.7, R, 10.5);

  // tableau des travaux
  const cols = [71.75, 279.35, 358.45, 524.95];
  doc.save().fillColor("#40A8FF");
  doc.rect(72.0, 368.8, 207.1, 18.8).fill();
  doc.rect(279.6, 368.8, 78.6, 18.8).fill();
  doc.rect(358.7, 368.8, 166.0, 18.8).fill();
  doc.restore();
  doc.save().lineWidth(0.5).strokeColor("black");
  doc.rect(cols[0], 368.45, cols[3] - cols[0], 555.4 - 368.45).stroke();
  doc.moveTo(cols[0], 387.8).lineTo(cols[3], 387.8).stroke();
  for (const cx of [cols[1], cols[2]]) doc.moveTo(cx, 368.45).lineTo(cx, 555.4).stroke();
  doc.restore();
  ecrire(doc, "Nature des travaux", 180.5, 381.8, B, 10.5, { align: "center", coul: "white" });
  ecrire(doc, "Fiche CEE", 318.85, 381.8, B, 10.5, { align: "center", coul: "white" });
  ecrire(doc, "Conditions à respecter", 444.15, 381.8, B, 10.5, { align: "center", coul: "white" });
  ecrire(doc, "Cf. conditions (*) ci-dessous", 444.1, 398.1, R, 10.5, { align: "center" });
  let bt = 401.8;
  for (const t of d.travaux) {
    const ls = lignes(doc, t.nature, SANS, 6, 198);
    ecrire(doc, t.fiche, 317.8, bt + 3.3, SANS, 7.98, { align: "center" });
    ls.forEach((l, i) => ecrire(doc, l, 77.0, bt + i * 10, SANS, 6));
    bt += Math.max(ls.length * 10, 14) + 8;
    if (bt > 548) break;
  }

  ecrire(doc, "Cette prime est définie pour un volume de :", 70.8, 571.3, R, 10.5);
  x = ecrire(doc, "CEE classique : ", 74.0, 597.7, SANS, 9);
  x = ecrire(doc, mwhPoint(d.kwhClassique), x + 4.4, 597.7, SANS, 9);
  x = ecrire(doc, "MWh cumacs, (soit " + grp(d.kwhClassique), x + 4.4, 597.7, SANS, 9);
  ecrire(doc, "kWh cumacs) et CEE", x + 4.3, 597.7, SANS, 9);
  ecrire(doc, `précarité : ${grp(d.kwhPrecarite / 1000)} MWh cumacs (soit ${grp(d.kwhPrecarite)} kWh cumacs)`, 74.0, 607.7, SANS, 9);

  ecrire(doc, "Au bénéfice de :", 70.8, 622.5, B, 10.5);
  ecrire(doc, d.beneficiaire, 72.0, 634.7, SANS, 7.98);
  x = ecrire(doc, "Adresse :", 70.8, 648.2, B, 10.5);
  ecrire(doc, d.adresse, x + 5.6, 648.2, SANS, 7.98);
  x = ecrire(doc, "Tél(s) –:", 70.8, 664.0, B, 10.5);
  x = ecrire(doc, `${d.telephone} – `, x + 1.4, 664.0, SANS, 7.98);
  x = ecrire(doc, "Email :", x + 2.1, 664.0, B, 10.5);
  ecrire(doc, d.mail, x + 2.1, 664.0, SANS, 7.98);
  x = ecrire(doc, "Représenté par", 70.8, 689.6, R, 10.5);
  x = ecrire(doc, " (en cas de personne morale)", x, 689.6, I, 10.5);
  x = ecrire(doc, " :", x, 689.6, R, 10.5);
  if (d.representant) ecrire(doc, d.representant, x + 4, 689.6, SANS, 7.98);

  const prem = nomDel === "PREMIUM ENERGY";
  if (prem) lignesFixes(doc, [
    "(*) Les conditions à respecter pour la valorisation des Certificats d’Economies d’Energies, en lien avec vos présents travaux,",
    "sont disponibles sur le site du Ministère (cf. ci-dessous, section : Où s’informer sur les aides.) Le montant de la contribution",
    "financière est susceptible de varier en fonction des travaux effectivement réalisés d’après les éléments fournis sur la preuve",
    "de réalisation",
    "Sous réserve que les informations que vous avez transmises soient exactes, conformes aux travaux réalisés, et attestées par",
    "des documents officiels transmis à PREMIUM ENERGY, et que les critères d'éligibilité soient respectés selon la législation en",
    "vigueur au moment de la validation du dossier par PREMIUM ENERGY.",
  ], 70.8, 713.7, 454.2, I, 9, 10.97, false);
  else paragraphe(doc,
    "(*) Les conditions à respecter pour la valorisation des Certificats d’Economies d’Energies, en lien avec vos présents travaux, sont disponibles sur le site du Ministère (cf. ci-dessous, section : Où s’informer sur les aides.) Le montant de la contribution financière est susceptible de varier en fonction des travaux effectivement réalisés d’après les éléments fournis sur la preuve de réalisation\n" +
    `Sous réserve que les informations que vous avez transmises soient exactes, conformes aux travaux réalisés, et attestées par des documents officiels transmis à ${nomDel}, et que les critères d'éligibilité soient respectés selon la législation en vigueur au moment de la validation du dossier par ${nomDel}.`,
    70.8, 713.7, 454.3, I, 9, 10.97);

  x = ecrire(doc, "Date de cette proposition :", 70.8, 806.1, B, 10.5);
  ecrire(doc, d.date, 193.2, 805.9, SANS, 7.98);
  ecrire(doc, "1/2", 570.1, 809.3, SANS_B, 7.98, { align: "right" });

  // ================================================================= page 2
  doc.addPage({ size: [595.5, 841.98], margin: 0 });
  ecrire(doc, "Signature Bénéficiaire :", 76.3, 79.7, B, 10.5);
  ecrire(doc, "Signature Partenaire :", 303.0, 79.7, B, 10.5);
  doc.save().lineWidth(0.5).strokeColor("black");
  doc.rect(71.25, 83.1, 524.65 - 71.25, 160.45 - 83.1).stroke();
  doc.moveTo(297.95, 83.1).lineTo(297.95, 160.45).stroke();
  doc.restore();
  image(doc, d.cachet ?? CACHET_ISOBAT, 353.4, 96.0, 63.7, 54.4);

  lignesFixes(doc, [
    "/!\\ Faites réaliser plusieurs devis afin de prendre une décision éclairée. Attention, seules les propositions",
    "remises avant l'acceptation du devis ou du bon de commande sont valables, et vous ne pouvez pas cumuler",
    "plusieurs offres CEE différentes pour la même opération.",
  ], 70.8, 208.9, 454.2, R, 10.5, 12.85, true);
  doc.save().rect(70.8, 210.1, 11.5, 0.7).fill("black").restore();
  const p2 = `/!\\ Seul le professionnel est responsable de la conformité des travaux que vous lui confiez. Vérifiez ses qualifications techniques et l’éligibilité des produits proposés avant d’engager vos travaux. Un contrôle des travaux effectués dans votre logement pourra être réalisé sur demande de ${nomDel} ou des autorités publiques.`;
  lignesFixes(doc, prem ? [
    "/!\\ Seul le professionnel est responsable de la conformité des travaux que vous lui confiez. Vérifiez ses",
    "qualifications techniques et l’éligibilité des produits proposés avant d’engager vos travaux. Un contrôle des",
    "travaux effectués dans votre logement pourra être réalisé sur demande de PREMIUM ENERGY ou des",
    "autorités publiques.",
  ] : lignesWord(doc, p2, R, 10.5, 454.2), 70.8, 250.7, 454.2, R, 10.5, 12.8, true);
  doc.save().rect(70.8, 251.9, 11.6, 0.7).fill("black").restore();

  // encadré bleu « Où se renseigner »
  doc.save().rect(40.8, 297.2, 559.3 - 40.8, 523.6 - 297.2).fill("#99CCFF").restore();
  doc.save().lineWidth(0.5).strokeColor("black").rect(40.65, 297.05, 559.65 - 40.65, 523.75 - 297.05).stroke().restore();
  ecrire(doc, "Où se renseigner pour bénéficier de cette offre ?", 45.8, 310.0, R, 10.5, { souligne: true });
  ecrire(doc, nomDel, 288.4, 324.6, R, 9, { align: "center" });
  x = ecrire(doc, del.site, 45.8, 338.5, B, 9);
  x = ecrire(doc, "ou au ", x, 338.5, R, 9);
  ecrire(doc, del.telephone, x + 0.4, 338.5, B, 9);
  ecrire(doc, "Où s’informer sur les aides pour les travaux d’économies d’énergie ?", 45.8, 353.9, R, 10.5, { souligne: true });
  {
    const a = "Site du réseau FAIRE : ", u = "https://www.faire.gouv.fr";
    const w = largeur(doc, a, R, 10.5) + largeur(doc, u, R, 10.5);
    const x0 = 299.4 - w / 2;
    const x1 = ecrire(doc, a, x0, 369.7, R, 10.5);
    ecrire(doc, u, x1, 369.7, R, 10.5, { coul: BLEU_LIEN, souligne: true });
  }
  ecrire(doc, "Tél :", 235.3, 390.4, R, 10.5);
  image(doc, BADGE_0808, 254.7, 372.6, 110.0, 17.6);
  {
    const t = "En cas de litige avec le porteur de l’offre ou son partenaire, vous pouvez faire appel gratuitement au médiateur de la consommation (6° de l’article L. 611-1 du code de la consommation), après avoir obtenu une réponse écrite non satisfaisante à votre réclamation :";
    void t;
    lignesFixes(doc, [
      "En cas de litige avec le porteur de l’offre ou son partenaire, vous pouvez faire appel gratuitement au médiateur de la",
      "consommation (6° de l’article L. 611-1 du code de la consommation), après avoir obtenu une réponse écrite non",
      "satisfaisante à votre réclamation :",
    ], 45.8, 406.5, 508.1, R, 10.5, 12.8, true, true);
  }
  if (del.mediateur_adresse) ecrire(doc, `Par lettre simple : ${del.mediateur_adresse}`, 300, 447.8, R, 10.5, { align: "center" });
  if (del.mediateur_site) {
    const a = "Par internet : ", w = largeur(doc, a, R, 10.5) + largeur(doc, del.mediateur_site, R, 10.02);
    const x1 = ecrire(doc, a, 300 - w / 2, 463.6, R, 10.5);
    ecrire(doc, del.mediateur_site, x1, 463.6, R, 10.02, { coul: BLEU_LIEN, souligne: true });
  }
  if (del.mediateur_mail) {
    const a = "Par courriel : ", w = largeur(doc, a, R, 10.5) + largeur(doc, del.mediateur_mail, R, 10.5);
    const x1 = ecrire(doc, a, 300.1 - w / 2, 479.7, R, 10.5);
    ecrire(doc, del.mediateur_mail, x1, 479.7, R, 10.5, { coul: BLEU_LIEN, souligne: true });
  }
  lignesFixes(doc, ["Pour faciliter la prise en charge de votre demande, il est recommandé de transmettre au Médiateur les éléments de", "votre litige."],
    45.8, 500.8, 508.2, R, 10.5, 13.0, false);
  ecrire(doc, "2/2", 571.1, 824.0, SANS_B, 7.98, { align: "right" });

  doc.end();
  return { pdf: await fin, pages: 2 };
}

/** Coordonnées du délégataire PREMIUM ENERGY telles qu'imprimées sur le modèle (valeurs par défaut) */
export const PREMIUM_PAR_DEFAUT: Omit<DelegataireCadre, "nom" | "logo"> = {
  site: "https://www.premiumenergyfrance.fr/service/",
  telephone: "0805 696 722",
  mediateur_adresse: "DEVIGNY MEDIATION, 9 Avenue René Gasnier 49100 Angers",
  mediateur_site: "https://www.devignymediation.fr",
  mediateur_mail: "contact@devignymediation.fr",
};
