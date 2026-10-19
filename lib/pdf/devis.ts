// Génération des PDF devis / facture — mise en page reprise de la classe Devis (reportlab) de l'exe.
// Coordonnées d'origine reportlab (origine en bas à gauche) converties pour pdfkit via Y().
import PDFDocument from "pdfkit";
import { cp5, eur, fr, num, puFmt, txt } from "../format";
import { CARACTERISTIQUES, DETAIL_OFFRE, PUCES_FACTURE, TEXTE_CEE_DEFAUT, TEXTE_EXIGENCES } from "../textes";
import type { CalcLigne, Dossier, Ligne, LigneLibre, Params } from "../types";
import type { Totaux } from "../calcul";
import { drawPara, esc, layout, textAt } from "./richtext";
import { LOGO_WORD_JPG } from "./logoWord";

type Doc = InstanceType<typeof PDFDocument>;

const W = 595.2756, H = 841.8898;
// géométrie du modèle de devis entreprise (FUNKY PARC 2025-2705), mesurée sur le PDF
const GREEN = "#056734", RED = "#C8102E", LRED = "#D52B1E", LGRN = "#1E7B4F";
const TX0 = 21, TX1 = 574.3;
const XCOLS = [380.6, 429.5, 484.4, 539.4];
const XVALS = [405.05, 456.95, 511.9, 556.85];
const TXT_W = 348;
const Y = (y: number) => H - y; // reportlab -> pdfkit

export interface InfoFacture { devis?: string | null; date_devis?: string | null; id?: string | null }

function texteCee(modele: string | null, nom: string, siren: string, montant: string): string {
  const t = (modele || TEXTE_CEE_DEFAUT).replaceAll("{DELEGATAIRE}", nom).replaceAll("{SIREN}", siren).replaceAll("{MONTANT}", montant);
  return t.replace(/\r/g, "").split("\n").map(esc).join("<br/>");
}

/** Rectangle reportlab (x, y bas, w, h) */
function rect(doc: Doc, x: number, y: number, w: number, h: number) {
  doc.rect(x, Y(y + h), w, h);
}

/** Logo ISOBAT vectoriel (draw_logo) dans un carré de côté w, coin bas-gauche (x, y) reportlab */
export function drawLogo(doc: Doc, x: number, y: number, w: number) {
  doc.save();
  doc.lineWidth(0.6).strokeColor("#000000");
  rect(doc, x, y, w, w); doc.stroke();
  const s = w / 91, cx = x + w / 2, cy = y + 56 * s, r = 17 * s;
  // arc : départ -38°, étendue 256° (sens trigonométrique)
  doc.lineWidth(2.6 * s).strokeColor(LRED);
  const pts: [number, number][] = [];
  for (let a = -38; a <= 218; a += 4) pts.push([cx + r * Math.cos((a * Math.PI) / 180), cy + r * Math.sin((a * Math.PI) / 180)]);
  doc.moveTo(pts[0][0], Y(pts[0][1]));
  for (const [px, py] of pts.slice(1)) doc.lineTo(px, Y(py));
  doc.stroke();
  doc.fillColor(LGRN);
  for (let i = 0; i < 3; i++) {
    const ty = cy + 6 * s - i * 5.6 * s;
    doc.moveTo(cx - 14 * s, Y(ty - 8.5 * s)).lineTo(cx, Y(ty)).lineTo(cx + 14 * s, Y(ty - 8.5 * s))
      .lineTo(cx + 14 * s, Y(ty - 11.6 * s)).lineTo(cx, Y(ty - 3.1 * s)).lineTo(cx - 14 * s, Y(ty - 11.6 * s)).closePath().fill();
  }
  const fs = 15 * s;
  doc.font("Helvetica-Bold").fontSize(fs);
  const wiso = doc.widthOfString("ISO "), wbat = doc.widthOfString("BAT");
  const tx = cx - (wiso + wbat) / 2;
  doc.fillColor(LRED); textAt(doc, "ISO ", tx, Y(y + 19 * s), { font: "Helvetica-Bold", size: fs });
  doc.fillColor(LGRN); textAt(doc, "BAT", tx + wiso, Y(y + 19 * s), { font: "Helvetica-Bold", size: fs });
  doc.restore();
}

export interface DonneesPdf {
  dossier: Dossier;
  lignes: { ligne: Ligne; calc: CalcLigne }[];
  P: Params;
  numero: string;
  date: string; // JJ/MM/AAAA
  facture?: InfoFacture | null;
  logo?: Buffer | null;
  libres?: { ligne: LigneLibre; ht: number; tva: number; ttc: number }[];
  totaux?: Totaux;
}

export async function genererPdf(d: DonneesPdf): Promise<{ pdf: Buffer; totKwh: number; tot: number; pages: number }> {
  const { dossier: cl, lignes, P, numero, date, facture } = d;
  const doc = new PDFDocument({ size: "A4", margin: 0, bufferPages: true, autoFirstPage: false });
  // reportlab n'applique pas le crénage des polices standard : on le désactive pour des positions identiques
  for (const f of ["Helvetica", "Helvetica-Bold"]) { doc.font(f); (doc as any)._font.font.kernPairs = {}; }
  const titre = facture ? "FACTURE" : "DEVIS";
  doc.info.Title = `${titre.charAt(0) + titre.slice(1).toLowerCase()} ${numero} - ${txt(cl.raison_sociale)}`;
  doc.info.Author = P.societe.raison_sociale || "ISOBAT";
  const chunks: Buffer[] = [];
  doc.on("data", (c) => chunks.push(c));
  const fin = new Promise<Buffer>((res) => doc.on("end", () => res(Buffer.concat(chunks))));

  let page = 0;
  let multi = false;
  const isob = P.societe;

  const footer = () => {
    doc.fillColor("black");
    textAt(doc, `${isob.raison_sociale || "ISOBAT"} - ${isob.adresse || ""} - SIREN: ${isob.siren || ""}`, W / 2, Y(14.5), { size: 7, align: "center" });
  };
  // logo du modèle (devis FUNKY PARC) : logo ISO BAT encadré vert-gris, 94,6 pt en haut à gauche
  const logo = () => {
    if (d.logo) {
      doc.save().lineWidth(0.8).strokeColor("#7E938C").rect(13.5, 9.3, 94.6, 94.4).stroke().restore();
      try { doc.image(d.logo, 17.5, 13.3, { fit: [86.6, 86.4], align: "center", valign: "center" }); } catch { doc.image(LOGO_WORD_JPG, 13.5, 9.3, { width: 94.6, height: 94.4 }); }
    } else doc.image(LOGO_WORD_JPG, 13.5, 9.3, { width: 94.6, height: 94.4 });
  };
  const bar = (y: number, h = 23) => {
    doc.fillColor(GREEN); rect(doc, TX0, y, TX1 - TX0, h); doc.fill();
    doc.fillColor("white");
    textAt(doc, "Détail", TX0 + 5, Y(y + 7.5), { font: "Helvetica-Bold", size: 10 });
    ["Quantité", "P.U TTC", "Total TTC", "TVA"].forEach((t, i) => textAt(doc, t, XVALS[i], Y(y + 7.5), { font: "Helvetica-Bold", size: 10, align: "center" }));
    doc.fillColor("black");
  };
  const newPage = (first: boolean): number => {
    if (page) footer();
    doc.addPage({ size: "A4", margin: 0 });
    page++;
    logo();
    if (first) {
      doc.fillColor(GREEN); rect(doc, 21, H - 126.9, 245, 17); doc.fill();
      doc.fillColor("white"); textAt(doc, `${titre} ${numero}`, 24.3, 122, { font: "Helvetica-Bold", size: 12 });
      doc.fillColor("black");
      let infos: string[];
      // Numéro Client = « ISBB- » (entreprise) ou « ISBC- » (particulier) + numéro du devis
      const nDev = facture ? txt(cl.numero_devis) || txt(facture.devis) : txt(numero);
      const numClient = nDev ? `${cl.type_client === "BtoC" ? "ISBC" : "ISBB"}-${nDev}` : "";
      if (facture) {
        infos = [`Numéro Client : ${numClient}`];
        if (facture.devis) infos.push(`Devis n° ${facture.devis} du ${facture.date_devis}`);
        infos.push(`Date de facture : ${date}`);
        if (facture.id) infos.push(`ID ${facture.id}`);
      } else infos = [`Numéro Client : ${numClient}`, `Date : ${date}`];
      infos.forEach((t, i) => textAt(doc, t, 21, 140 + i * 9, { size: 8 }));
      const dy = Math.max(0, infos.length - 2) * 9;
      textAt(doc, "ADRESSE DES TRAVAUX :", 21, 167 + dy, { font: "Helvetica-Bold", size: 9 });
      const L0 = lignes[0]?.ligne;
      const site = multi || !L0 ? txt(cl.raison_sociale) : txt(L0.nom_site) || txt(cl.raison_sociale);
      (L0 ? [site, txt(L0.adresse_travaux), `${cp5(L0.cp_travaux)} ${txt(L0.ville_travaux).toUpperCase()}`]
          : [site, txt(cl.travaux_adresse) || txt(cl.adresse_siege), `${cp5(txt(cl.travaux_cp) || cl.cp_siege)} ${(txt(cl.travaux_ville) || txt(cl.ville_siege)).toUpperCase()}`])
        .forEach((t, i) => textAt(doc, t, 21, 176 + dy + i * 9, { size: 8 }));
      const x = 297.7;
      textAt(doc, txt(cl.raison_sociale).toUpperCase(), x, 125, { font: "Helvetica-Bold", size: 10 });
      const rep = [txt(cl.rep_nom).toUpperCase(), txt(cl.rep_prenom)].filter(Boolean).join(" ");
      const bat = txt(cl.type_batiment) === "Tertiaire" ? "Bâtiment tertiaire" : "Bâtiment industriel";
      const btoc = cl.type_client === "BtoC";
      const info = btoc ? [
        txt(cl.adresse_siege),
        `${cp5(cl.cp_siege)} ${txt(cl.ville_siege).toUpperCase()}`,
        `Tél : ${txt(cl.telephone)}`,
        `Mail : ${txt(cl.mail)}`,
      ] : [
        `Siret : ${txt(cl.siret)}`,
        txt(cl.adresse_siege),
        `${cp5(cl.cp_siege)} ${txt(cl.ville_siege).toUpperCase()}`,
        `Tél : ${txt(cl.telephone)}`,
        `Mail : ${txt(cl.mail)}`,
        `Représenté par : ${rep}, ${txt(cl.fonction)}`,
      ];
      if (!facture && (lignes.length || txt(cl.secteur))) info.push((lignes.length ? bat : "") + (!btoc && txt(cl.secteur) ? `${lignes.length ? "  /  " : ""}Secteur d'activité : ${txt(cl.secteur)}` : ""));
      info.forEach((t, i) => textAt(doc, t, x, 140 + i * 9, { size: 8 }));
      return H - 226 - dy;
    }
    textAt(doc, `${titre} ${numero} du ${date}`, 23, 137.9, { font: "Helvetica-Bold", size: 10 });
    textAt(doc, txt(cl.raison_sociale).toUpperCase(), TX1 - 0.5, 138.9, { font: "Helvetica-Bold", size: 10, align: "right" });
    return H - 171.9;
  };

  // ---------------- contenu
  const libres = d.libres ?? [];
  const avecCee = lignes.length > 0;
  const c0 = (lignes[0]?.calc ?? { typ: "Tertiaire", fiche: "", version: "", cons: 0 }) as CalcLigne;
  const typ = c0.typ, fiche = c0.fiche, indus = typ === "Industriel";
  const totKwh = lignes.reduce((s, l) => s + l.calc.kwh, 0);
  const tot = Math.round(lignes.reduce((s, l) => s + l.calc.prime, 0) * 100) / 100;
  const local = indus ? "local industriel" : "local";
  const tx: any = P.textes[`${fiche}|${c0.version}`] ?? {};
  const exigences: string = tx.vertical || TEXTE_EXIGENCES;
  const tvaTxt = `${fr(P.tva * 100, 0)} %`;
  multi = lignes.length > 1;

  const entete = (denomPoint: string) =>
    `<b>- ${esc(denomPoint)}</b><br/>Opération entrant dans le dispositif de prime C.E.E. (Certificat d'Economie d'Energie), conforme aux recommandations de la fiche technique N°<b>${esc(fiche)}</b> de C.E.E décrites par le ministère de la Transition énergétique.<br/><br/>Kwh Cumac : <b>${fr(totKwh)}</b><br/>Prime CEE : <b>${eur(tot)}</b><br/>- Matériel(s) fourni(s) et mis en place par notre société <b>${esc(isob.raison_sociale || "ISOBAT")}</b>, représentée par ${esc(isob.representant)}, SIRET <b>${esc(isob.siret)}</b>`;

  const valsLigne = (c: CalcLigne) => [fr(c.nb), puFmt(c.pu), eur(c.prime), tvaTxt];
  const blocs: [string, string[] | null][] = [];

  if (!avecCee) { /* devis sans opération CEE : uniquement les lignes produits */ }
  else if (!facture) {
    const denom = (tx.denomination || "").replace(/[. ]+$/, "") ||
      `Mise en place d’un système de déstratification d’air pour l’homogénéisation de la température de l’air d’un ${local} de grande hauteur complètement clos et chauffé par un système convectif et/ou radiatif`;
    blocs.push([entete(denom), null]);
    for (const { ligne: L, calc: r } of lignes) {
      const chauff = r.pc && r.pr ? "convectif et radiatif" : r.pc ? "convectif" : "radiatif";
      const eq = P.equip[r.ref] ?? { marque: "", libelle: "" };
      let t = "";
      if (multi) t += `<b>${esc(txt(L.nom_site) || "Local")}</b> – Kwh Cumac : <b>${fr(r.kwh)}</b> – Prime CEE : <b>${eur(r.prime)}</b><br/>`;
      t += `- ${esc(denom)}.<br/>• Le local est chauffé par un système <b>${chauff}</b><br/>`;
      if (indus) t += "• Le système de déstratification d’air installé ne permet pas de chauffer l’air<br/>";
      t += `<br/>Marque : <b>${esc(eq.marque)}</b><br/>Référence : <b>${esc(r.ref)}</b><br/>${esc(eq.libelle)}<br/><br/>`;
      t += CARACTERISTIQUES.map((x) => `• ${esc(x)}<br/>`).join("") + "<br/>";
      t += `${esc(exigences)}<br/><br/>`;
      if (r.pc) t += `Puissance nominale du système de chauffage convectif du local : <b>${fr(r.pc)} kW</b><br/>`;
      if (r.pr) t += `Puissance nominale du système de chauffage radiatif du local : <b>${fr(r.pr)} kW</b><br/>`;
      t += `Hauteur sous plafond / faîtage du local : <b>${fr(r.h)} m</b>`;
      if (num(L.surface)) t += `<br/>Surface déstratifiée : <b>${fr(num(L.surface))} m²</b>`;
      if (num(L.volume)) t += `<br/>Volume : <b>${fr(num(L.volume))} m³</b>`;
      blocs.push([t, valsLigne(r)]);
    }
    blocs.push([`Température de consigne du chauffage : <b>${fr(c0.cons, 0)} °C</b> lorsque le local est occupé<br/><br/>Accrédité selon la norme NF EN ISO/CEI 17065.<br/>Devis complété par une note de dimensionnement`, null]);
  } else {
    // blocs_facture
    const denom = tx.denomination ? String(tx.denomination).replace(/[. ]+$/, "")
      : indus ? "Mise en place de déstratificateurs ou brasseurs d’air pour l’homogénéisation de la température de l’air d’un local industriel de grande hauteur chauffé par un système convectif et/ou radiatif"
      : "Mise en place d’un système de déstratification d’air pour l’homogénéisation de la température de l’air d’un local de grande hauteur chauffé par un système convectif et/ou radiatif";
    const bruit = exigences.includes("45 dB") ? "" : `<br/><br/>${esc(CARACTERISTIQUES[1])}.`;
    blocs.push([entete(denom + "."), null]);
    for (const { ligne: L, calc: r } of lignes) {
      const chauff = r.pc && r.pr ? "convectif et radiatif" : r.pc ? "convectif" : "radiatif";
      const eq = P.equip[r.ref] ?? { marque: "", libelle: "" };
      let t = "";
      if (multi) t += `<b>${esc(txt(L.nom_site) || "Local")}</b> – Kwh Cumac : <b>${fr(r.kwh)}</b> – Prime CEE : <b>${eur(r.prime)}</b><br/>`;
      t += `Le local est chauffé par un système <b>${chauff}</b><br/>`;
      if (num(L.surface)) t += `Surface déstratifiée : <b>${fr(num(L.surface))} m²</b><br/>`;
      if (num(L.volume)) t += `Volume : <b>${fr(num(L.volume))} m³</b><br/>`;
      if (r.pc) t += `Puissance nominale du système de chauffage convectif du local : <b>${fr(r.pc)} kW</b><br/>`;
      if (r.pr) t += `Puissance nominale du système de chauffage radiatif du local : <b>${fr(r.pr)} kW</b><br/>`;
      t += `Hauteur sous plafond / faîtage du local : <b>${fr(r.h)} m</b><br/><br/>`;
      t += `- ${esc(denom)}<br/>` + PUCES_FACTURE.map((x) => `• ${esc(x)}<br/>`).join("");
      t += `<br/>Marque : <b>${esc(eq.marque)}</b><br/>Référence : <b>${esc(r.ref)}</b><br/>${esc(eq.libelle)}<br/><br/>`;
      t += `${esc(exigences)}${bruit}`;
      blocs.push([t, valsLigne(r)]);
    }
    blocs.push(["Accrédité selon la norme NF EN ISO/CEI 17065.", null]);
  }
  // lignes produits / prestations (même tableau : Quantité, P.U TTC, Total TTC, TVA)
  for (const { ligne: Lb, ttc } of libres) {
    const q = num(Lb.quantite) ?? 0, t = num(Lb.tva) ?? 0, pu = num(Lb.pu_ht) ?? 0;
    let tl = `<b>${esc(txt(Lb.designation)).replace(/\n/g, "<br/>")}</b>`;
    if (txt(Lb.detail)) tl += `<br/>${esc(txt(Lb.detail)).replace(/\n/g, "<br/>")}`;
    blocs.push([tl, [`${fr(q)}${txt(Lb.unite) && txt(Lb.unite) !== "U" ? " " + txt(Lb.unite) : ""}`, puFmt(pu * (1 + t)), eur(ttc), `${fr(t * 100, Number.isInteger(t * 100) ? 0 : 1)} %`]]);
  }
  if (!blocs.length) blocs.push(["", null]);

  // ---------------- tableau
  let top = newPage(true);
  bar(top);
  let y = top - 4;
  let tblTop = top;
  const closeTable = (yb: number) => {
    doc.strokeColor("black").lineWidth(0.6);
    rect(doc, TX0, yb, TX1 - TX0, tblTop - yb); doc.stroke();
    for (const xv of XCOLS) doc.moveTo(xv, Y(yb)).lineTo(xv, Y(tblTop)).stroke();
  };
  blocs.forEach(([t, vals], i) => {
    const p = layout(doc, t, TXT_W, 8, 11);
    const h = p.height;
    if (y - h < 60) {
      closeTable(y - 2);
      tblTop = newPage(false);
      bar(tblTop, 29);
      y = tblTop - 4;
    }
    doc.fillColor("black");
    drawPara(doc, p, TX0 + 5, Y(y));
    if (vals) vals.forEach((v, k) => textAt(doc, v, XVALS[k], Y(y - h / 2), { size: 7.8, align: "center" }));
    y -= h + 8;
    void i; // modèle FUNKY PARC : aucun trait horizontal entre les blocs
  });
  closeTable(y - 2);

  if (facture) {
    let mention = esc(isob.assurance);
    if (isob.tva_intra) mention += `<br/>N° TVA intracommunautaire : ${esc(isob.tva_intra)}`;
    if (isob.conditions) mention += `<br/>Conditions de règlement : ${esc(isob.conditions)}`;
    const pa = layout(doc, mention, 330, 8, 11.5);
    if (y - 30 - pa.height < 50) { newPage(false); y = H - 200; }
    doc.fillColor("black");
    drawPara(doc, pa, TX0 + 25, Y(y - 30));
  }

  // ---------------- dernière page : conditions CEE + totaux
  top = newPage(false);
  bar(top, 29);
  const deleg = P.deleg[txt(cl.delegataire).toUpperCase()];
  // textes du modèle FUNKY PARC : titres 9 pt gras, « Termes » 7 pt et « Détail de l'offre » 8 pt, interligne 10 pt, x = 21
  const parts: { titre: string; corps: string; taille: number }[] = avecCee
    ? [{ titre: "Termes et conditions CEE", corps: texteCee(deleg?.texte_cee ?? null, deleg?.nom ?? "", deleg?.siren ?? "", eur(tot)), taille: 7 },
       { titre: "Détail de l’offre :", corps: isob.detail_offre ? esc(isob.detail_offre).replace(/\r?\n/g, "<br/>") : DETAIL_OFFRE, taille: 8 }]
    : (isob.conditions ? [{ titre: "Conditions", corps: esc(isob.conditions), taille: 7 }] : []);
  const paras = parts.map((x) => ({ ...x, p: layout(doc, x.corps, 553, x.taille, 10) }));
  const hauteur = paras.reduce((h, x) => h + 10 + x.p.lines.length * 10, 0);
  let base = Math.min(488.9, 660 - hauteur);   // le bloc reste au-dessus du cadre des totaux
  doc.fillColor("black");
  for (const x of paras) {
    textAt(doc, x.titre, 21, base, { font: "Helvetica-Bold", size: 9 });
    base += 10;
    drawPara(doc, x.p, 21, base - x.taille);
    base += x.p.lines.length * 10;
  }
  // cadre du modèle (devis FUNKY PARC 2025-2705) : fond lavande, bordure gris clair
  doc.save();
  doc.rect(21, 668.9, 551, 127).fill([240, 240, 255]);
  doc.lineWidth(1).strokeColor([210, 210, 210]).rect(21.5, 669.4, 550, 126).stroke();
  doc.restore();
  if (!facture) {
    textAt(doc, "Signature, date, cachet commercial & mention « Bon pour accord » :", 26, 682.9, { font: "Helvetica-Bold", size: 7 });
    textAt(doc, "Nom, prénom et fonction du signataire", 26, 691.9, { size: 6 });
  }
  textAt(doc, `Mode de paiement : ${isob.mode_paiement || "Chèques, virement ou espèce"}`, 26, 790.9, { size: 7 });
  let rows: [string, string, number][];
  if (!libres.length && !(d.totaux?.aide)) {
    // devis CEE seul : totaux identiques à l'exe
    const ht = Math.round((tot / (1 + P.tva)) * 100) / 100;
    rows = [
      ["Total H.T", eur(ht), 0],
      [`Total TVA  ${fr(P.tva * 100, 0)}%`, eur(Math.round((tot - ht) * 100) / 100), 0],
      ["Total TTC", eur(tot), 1],
      ["* Prime CEE", "- " + eur(tot), 0],
      ["Reste à payer", "0,00 €", 2],
    ];
  } else {
    const T = d.totaux!;
    const unTaux = T.taux.length === 1 ? `  ${fr(T.taux[0] * 100, Number.isInteger(T.taux[0] * 100) ? 0 : 1)}%` : "";
    rows = [["Total H.T", eur(T.ht), 0], [`Total TVA${unTaux}`, eur(T.tva), 0], ["Total TTC", eur(T.ttc), 1]];
    if (T.primeCee) rows.push(["* Prime CEE", "- " + eur(T.primeCee), 0]);
    if (T.aide) rows.push([txt(cl.aide_libelle) || "Aide", "- " + eur(T.aide), 0]);
    rows.push(["Reste à payer", eur(T.reste), 2]);
  }
  rows.forEach(([a, b, k], i) => {
    const yy = H - 684.9 - i * 11;   // lignes de base du modèle
    doc.fillColor(k === 2 ? RED : "black");
    const f = k ? "Helvetica-Bold" : "Helvetica";
    textAt(doc, a, 500.5, Y(yy), { font: f, size: 9, align: "right" });
    textAt(doc, b, W - 28, Y(yy), { font: f, size: 9, align: "right" });
  });
  doc.fillColor("black");
  footer();

  // numérotation « page/total »
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    doc.fillColor("black");
    textAt(doc, `${i + 1}/${range.count}`, 570.6, Y(17), { font: "Helvetica-Bold", size: 8, align: "right" });
  }
  doc.end();
  const pdf = await fin;
  return { pdf, totKwh, tot, pages: range.count };
}
