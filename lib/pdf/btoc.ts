// Devis / facture BtoC (particuliers) — reproduit le modèle Word ISOBAT.
//  - variante « btoc-word »     : devis 2026-3042 (DAMAREST, BAR-TH-171)
//  - variante « btoc-pac-2026 » : devis 2026-3076 (VILLAUME, BAR-TH-171) — montants avec point, SCOP,
//    efficacité saisonnière sur une ligne, nom du produit sur la ligne des prix, adresse des travaux sur 2 lignes.
// Coordonnées en points depuis le HAUT de la page (mesurées sur le PDF modèle).
import PDFDocument from "pdfkit";
import { cp5, eur as eurFr, fr, num, txt } from "../format";
import { modele, primeOperation } from "../operations";
import { TEXTE_CEE_DEFAUT } from "../textes";
import type { Dossier, LigneLibre, Params, SousTraitant } from "../types";
import type { Totaux } from "../calcul";
import { drawLogo } from "./devis";
import { LOGO_WORD_JPG } from "./logoWord";
import { drawPara as drawParaBrut, esc, layout, textAt as textAtBrut } from "./richtext";

// Word place la ligne de base ~0,21 × la taille plus haut que le calcul « sommet + taille » : correction globale
const REMONTE = 0.212;
const textAt = (doc: Doc, s: string, x: number, base: number, o: { font?: string; size?: number; align?: "left" | "right" | "center" } = {}) =>
  textAtBrut(doc, s, x, base - REMONTE * (o.size ?? 8), o);
const drawPara = (doc: Doc, p: ReturnType<typeof layout>, x: number, top: number) => drawParaBrut(doc, p, x, top - REMONTE * p.size);

type Doc = InstanceType<typeof PDFDocument>;
const W = 595.2756, H = 841.8898;
const LAVANDE: [number, number, number] = [238, 238, 255];
const GRIS = "#D2D2D2";
const BAS_PAGE = 790;

const TEXTE_DECHETS =
  "Gestion, évacuation et traitements des déchets de chantier comprenant la main d’œuvre liée à la dépose et au tri, le transport des déchets de chantiers vers un ou plusieurs points de collecte et coûts de traitement.";

export interface DonneesBtoc {
  dossier: Dossier;
  libres: { ligne: LigneLibre; ht: number; tva: number; ttc: number }[];
  totaux: Totaux;
  P: Params;
  numero: string;
  date: string;
  zone: string | null;
  soustraitant: SousTraitant | null;
  facture?: { devis?: string | null; date_devis?: string | null; id?: string | null } | null;
  logo?: Buffer | null;
  variante?: string;            // mise en page du modèle (btoc-word par défaut)
  libellePrime?: string | null; // libellé de la prime imposé par le modèle (sinon celui de l'opération)
}

const kwhFmt = (x: number) => fr(x).replace(",", "."); // le modèle écrit « 131 040.00 »
const pctFmt = (t: number) => fr(t * 100) + " %";
const dateCourte = (s: string | null | undefined) => (s ? s.split("-").reverse().join("/") : "");

export async function genererPdfBtoc(d: DonneesBtoc): Promise<{ pdf: Buffer; pages: number }> {
  const { dossier: cl, libres, totaux, P, numero, date, facture } = d;
  const doc = new PDFDocument({ size: "A4", margin: 0, bufferPages: true, autoFirstPage: false });
  for (const f of ["Helvetica", "Helvetica-Bold"]) { doc.font(f); (doc as any)._font.font.kernPairs = {}; }
  const titre = facture ? "FACTURE" : "DEVIS";
  const client = [txt(cl.civilite), txt(cl.rep_nom).toUpperCase(), txt(cl.rep_prenom)].filter(Boolean).join(" ") || txt(cl.raison_sociale);
  doc.info.Title = `${facture ? "Facture" : "Devis"} ${numero} - ${client}`;
  doc.info.Author = P.societe.raison_sociale || "ISOBAT";
  const chunks: Buffer[] = [];
  doc.on("data", (c) => chunks.push(c));
  const fin = new Promise<Buffer>((res) => doc.on("end", () => res(Buffer.concat(chunks))));
  const isob = P.societe;
  const v26 = d.variante === "btoc-pac-2026";
  // en-tête des particuliers (devis 2026-3076) : commun à tous les devis et factures BtoC
  const ent = true;
  // le modèle 2026-3076 écrit les montants avec un point (« 4 272.23 € ») et les kWh avec une virgule
  const eur = (x: number) => (v26 ? eurFr(x).replace(/,(\d\d)(?=\s*€)/, ".$1") : eurFr(x));
  const kwh = (x: number) => (v26 ? fr(x) : kwhFmt(x));

  // ---------------- page 1 : en-tête
  doc.addPage({ size: "A4", margin: 0 });
  if (ent && !d.logo) {
    doc.image(LOGO_WORD_JPG, 13.5, 7, { width: 95.6, height: 95.6 }); // logo du modèle Word (cadre vert-gris compris)
  } else if (d.logo) {
    doc.lineWidth(0.6).strokeColor(ent ? "#7E938C" : "black").rect(13.5, 7, 95.6, 95.6).stroke();
    try { doc.image(d.logo, 17, 10.5, { fit: [88.6, 88.6], align: "center", valign: "center" }); } catch { drawLogo(doc, 13.5, H - 7 - 95.6, 95.6); }
  } else drawLogo(doc, 13.5, H - 7 - 95.6, 95.6);

  doc.fillColor("black");
  textAt(doc, `${titre} : ${numero}`, 21, 137.4, { font: "Helvetica-Bold", size: 12 });
  textAt(doc, client, 297.8, 137.0, { font: "Helvetica-Bold", size: 10 });
  doc.strokeColor("black").lineWidth(1).moveTo(21.5, 137.1).lineTo(574.8, 137.1).stroke();

  const lab = (label: string, valeur: string, base: number) => {
    textAt(doc, label, 21, base, { size: 8 });
    doc.font("Helvetica").fontSize(8);
    textAt(doc, valeur, 21 + doc.widthOfString(label), base, { font: "Helvetica-Bold", size: 9 });
  };
  let yg = 152.3;
  // Numéro Client particulier = « ISBC- » + numéro du devis (ex. ISBC-2026-3076)
  const nDevis = facture ? txt(cl.numero_devis) || txt(facture.devis) : txt(numero);
  lab("Numéro Client : ", nDevis ? `ISBC-${nDevis}` : "", yg); yg += 10.2;
  if (facture) {
    lab("Date de facture : ", date, yg); yg += 10.2;
    if (facture.devis) { lab("Devis n° : ", `${facture.devis} du ${facture.date_devis ?? ""}`, yg); yg += 10.2; }
    if (facture.id) { lab("ID : ", facture.id, yg); yg += 10.2; }
  } else { lab("Date de devis : ", date, yg); yg += 10.2; }
  const tAdr = txt(cl.travaux_adresse) || txt(cl.adresse_siege);
  const tCp = txt(cl.travaux_cp) || txt(cl.cp_siege);
  const tVille = txt(cl.travaux_ville) || txt(cl.ville_siege);
  const pa = ent
    ? layout(doc, `${esc(`Adresse des travaux : ${tAdr}`)}<br/>${esc(`${cp5(tCp)} ${tVille}, FRANCE`)}`, 200, 8, 8.9)
    : layout(doc, esc(`Adresse des travaux : ${tAdr}, ${cp5(tCp)} ${tVille}`), 140, 8, 8.9);
  drawPara(doc, pa, 21, yg - 0.6 - 8);

  const droite = [
    ent ? txt(cl.adresse_siege) : `${txt(cl.adresse_siege)},`,
    `${cp5(cl.cp_siege)} ${txt(cl.ville_siege)}`,
    `Tél : ${txt(cl.telephone)}`,
    `E-mail : ${txt(cl.mail)}`,
    d.zone ? `Zone : ${d.zone}` : "",
    txt(cl.precarite) ? `Précarité : ${txt(cl.precarite)}` : "",
    txt(cl.type_chauffage) ? `Type de chauffage : ${txt(cl.type_chauffage)}` : "",
    txt(cl.type_logement) ? `Type de logement : ${txt(cl.type_logement)}` : "",
  ].filter(Boolean);
  droite.forEach((t, i) => textAt(doc, t, 297.8, 153.4 + i * 9.03, { size: 8 }));

  // ---------------- tableau
  const entete = (y0: number) => {
    doc.fillColor("black");
    doc.rect(22.1, y0, 576.8 - 22.1, 1).fill();
    doc.rect(22.1, y0 + 20.6, 576.8 - 22.1, 0.9).fill();
    const b = y0 + 18.2;
    textAt(doc, "Détail", 22.1, b, { font: "Helvetica-Bold", size: 12 });
    textAt(doc, "Qté", 368.4, b, { font: "Helvetica-Bold", size: 12 });
    textAt(doc, "P.U HT", 416.4, b, { font: "Helvetica-Bold", size: 12 });
    textAt(doc, "Total HT", 475.3, b, { font: "Helvetica-Bold", size: 12 });
    textAt(doc, "TVA", 554.3, b, { font: "Helvetica-Bold", size: 12 });
  };
  entete(223.8);
  let y = 263.0; // ligne de base courante
  let page = 1;
  const saut = (besoin: number) => {
    if (y + besoin > BAS_PAGE) { doc.addPage({ size: "A4", margin: 0 }); page++; y = 60; }
  };
  const para = (markup: string, size: number, leading: number, width: number, x = 22.1) => {
    const p = layout(doc, markup, width, size, leading);
    saut(p.height);
    doc.fillColor("black");
    drawPara(doc, p, x, y - size);
    y += p.height;
  };

  // opérations CEE
  const ops = cl.type_client === "BtoC" ? cl.operations ?? [] : [];
  ops.forEach((o, i) => {
    const m = modele(o.fiche);
    const lignesOp = m.lignes(o.caracs, d.variante);
    for (const l of lignesOp) para(l.map((x) => (x.b ? `<b>${esc(x.t)}</b>` : esc(x.t))).join(""), 8, v26 ? 10 : 10.3, 345);
    y += v26 ? 2.7 : 12.2;
    para(`- Kwh Cumac : <b>${kwh(num(o.kwh as any) ?? 0)}</b>`, 8, 10.1, 345);
    para(`- ${esc(txt(d.libellePrime) || o.libelle_prime || "Prime CEE")} : <b>${eur(primeOperation(o))} </b>`, 8, 10.1, 345);
    if (i < ops.length - 1) y += 10;
  });
  if (ops.length && d.soustraitant) {
    const s = d.soustraitant;
    y += 3.1;
    para(`Travaux sous-traités auprès de l’entreprise <b>${esc(s.nom)}</b>, ${esc(s.adresse)}<br/>représentée par ${esc(s.representant)}, SIRET <b>${esc(s.siret)}</b>, Certificat rge Numéro <b>${esc(s.rge_numero)}</b> attribué le <b>${dateCourte(s.rge_date)}</b> valable jusqu'au <b>${dateCourte(s.rge_validite)}</b>`, 8, 9.9, 330);
  }

  // lignes produits / prestations
  y += ops.length ? -1.7 : 0;
  libres.forEach(({ ligne: L, ht }) => {
    const titreL = esc(txt(L.designation)).replace(/\n/g, "<br/>");
    const pT = layout(doc, `<b>${titreL}</b>`, 340, 7, 8.5);
    const pD = txt(L.detail) ? layout(doc, esc(txt(L.detail)).replace(/\n/g, "<br/>"), 340, 8, 9.9) : null;
    saut(pT.height + 18 + (pD ? pD.height + 6 : 0));
    y += 9.8;
    drawPara(doc, pT, 24, y - 7);
    y += pT.height - 8.5 + 18;
    const q = num(L.quantite) ?? 0, pu = num(L.pu_ht) ?? 0, t = num(L.tva) ?? 0;
    textAt(doc, `${fr(q)} ${txt(L.unite) || "U"}`, 387.8, y, { size: 7, align: "right" });
    textAt(doc, eur(pu), 457.1, y, { size: 7, align: "right" });
    textAt(doc, eur(ht), 525.0, y, { size: 7, align: "right" });
    textAt(doc, pctFmt(t), 576.8, y, { size: 7, align: "right" });
    if (txt(L.nom)) textAt(doc, txt(L.nom), 24, y, { font: "Helvetica-Bold", size: 7 });
    if (pD) { y += txt(L.nom) ? 18 : 15.3; drawPara(doc, pD, 24, y - 8); y += pD.height - 9.9; }
    y += 6;
  });

  // ---------------- conditions + cadre des totaux (ancrés en bas de page)
  const deleg = P.deleg[txt(cl.delegataire).toUpperCase()];
  const primeTot = totaux.primeCee;
  let cgv = "";
  if (primeTot > 0 && deleg) {
    const t = (deleg.texte_cee || TEXTE_CEE_DEFAUT).replaceAll("{DELEGATAIRE}", deleg.nom).replaceAll("{SIREN}", deleg.siren ?? "").replaceAll("{MONTANT}", eur(primeTot));
    cgv += `<font size=9><b>Termes et conditions CEE</b></font><br/>${esc(t.replace(/\r?\n/g, " "))}<br/>`;
  }
  cgv += `<font size=9><b>Gestion des déchets</b></font><br/>${esc(isob.texte_dechets || TEXTE_DECHETS)}`;
  const pc = layout(doc, cgv, 557, 8, 9.2);
  const hautCadre = 662.2;
  let debut = hautCadre - 9.8 - pc.height;
  if (y + 6 > debut) { doc.addPage({ size: "A4", margin: 0 }); page++; }
  doc.fillColor("black");
  drawPara(doc, pc, 21.4, debut);

  // cadre lavande
  doc.save();
  doc.rect(21, hautCadre, 574.6 - 21, 789.2 - hautCadre).fillColor(LAVANDE).fill();
  doc.lineWidth(1).strokeColor(GRIS).rect(21.5, hautCadre, 574.6 - 21.5, 789.2 - hautCadre).stroke();
  const tauxTva = [...new Set(libres.filter((x) => x.tva > 0).map((x) => num(x.ligne.tva) ?? 0))];
  const lignesTot: [string, string, "n" | "b" | "r"][] = [
    ["Total H.T", eur(totaux.ht), "n"],
    [v26 && tauxTva.length === 1 ? `Total TVA  ${fr(tauxTva[0] * 100, tauxTva[0] * 100 % 1 ? 1 : 0)}%` : "Total TVA", eur(totaux.tva), "n"],
    ["Total TTC", eur(totaux.ttc), "b"],
  ];
  if (primeTot > 0) lignesTot.push(["Prime CEE *", "- " + eur(primeTot), "n"]);
  if (totaux.aide > 0) lignesTot.push([txt(cl.aide_libelle) || "Aide", "- " + eur(totaux.aide), "n"]);
  lignesTot.push(["Reste à payer", eur(totaux.reste), "r"]);
  const hauts = [662.7, 676.9, 687.9, 698.9, 710.4, 721.6, 732.8];
  lignesTot.forEach((_, i) => {
    const top = hauts[i], bas = i === lignesTot.length - 1 ? 788.6 : hauts[i + 1];
    doc.lineWidth(1).strokeColor(GRIS).rect(445.4, top, 516.7 - 445.4, bas - top).stroke();
    doc.rect(516.7, top, 574.6 - 516.7, bas - top).stroke();
  });
  doc.restore();
  const bases = [675.9, 686.8, 697.9, 709.3, 720.5, 731.7, 742.9];
  lignesTot.forEach(([a, b, k], i) => {
    const f = k === "n" ? "Helvetica" : "Helvetica-Bold";
    doc.fillColor(k === "r" ? "#FF0000" : "black");
    textAt(doc, a, 509, bases[i], { font: f, size: 9, align: "right" });
    textAt(doc, b, 575, bases[i], { font: f, size: 9, align: "right" });
  });
  doc.fillColor("black");
  if (!facture) {
    textAt(doc, "Apposer signature précédée de la mention \"Bon pour accord\"", 26, 677.6, { size: 9 });
    textAt(doc, "Le :", 26, 687.2, { size: 9 });
  } else {
    let m = esc(isob.assurance);
    if (isob.tva_intra) m += `<br/>N° TVA intracommunautaire : ${esc(isob.tva_intra)}`;
    if (isob.conditions) m += `<br/>Conditions de règlement : ${esc(isob.conditions)}`;
    drawPara(doc, layout(doc, m, 405, 7, 8.6), 26, 669);
  }
  textAt(doc, `Mode de paiement : ${isob.mode_paiement || "Chèques, virement ou espèce"}`, 26, 785.7, { size: 7 });

  // pieds de page + numérotation
  const range = doc.bufferedPageRange();
  for (let i = range.count - 1; i < range.count; i++) { // comme le modèle Word : pied de page sur la dernière page
    doc.switchToPage(range.start + i);
    doc.fillColor("black");
    textAt(doc, `${isob.raison_sociale || "ISOBAT"} - ${isob.adresse || ""} - SIREN: ${isob.siren || ""}`, 297.1, 810.0, { size: 7, align: "center" });
    textAt(doc, `${i + 1}/${range.count}`, 578.8, 807.7, { font: "Helvetica-Bold", size: 8, align: "right" });
  }
  void page; void W;
  doc.end();
  return { pdf: await fin, pages: range.count };
}
