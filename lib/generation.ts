// Génération d'un devis ou d'une facture : mêmes règles que main() de l'exe
import type { SupabaseClient } from "@supabase/supabase-js";
import { calcDossier, zoneDe, type ResultatDossier } from "./calcul";
import { chargerDossier, chargerLogo, chargerParams, journaliser } from "./data";
import { aujourdhui, dateFr, eur, fr, isoDate, parseDate, slug, txt } from "./format";
import { genererPdf, type InfoFacture } from "./pdf/devis";
import { genererPdfBtoc } from "./pdf/btoc";
import type { Dossier, Params, SousTraitant } from "./types";
import { controlesDossier } from "./controles";
import { appliquerTextes, choisirModele, ficheDuDossier, miseEnPageDefaut, type ModeleDocument } from "./modelesDocuments";

/** Choisit le modèle : BtoB = modèle de l'exe, BtoC = modèle Word particuliers */
async function fabriquerPdf(o: {
  dossier: Dossier; r: ResultatDossier; P: Params; numero: string; date: string; facture?: InfoFacture | null;
  soustraitant: SousTraitant | null; logo: Buffer | null; miseEnPage?: string; libellePrime?: string | null;
}): Promise<Buffer> {
  const mep = o.miseEnPage ?? miseEnPageDefaut(o.dossier.type_client === "BtoC" ? "BtoC" : "BtoB");
  if (mep.startsWith("btoc-")) {
    const cpT = txt(o.dossier.travaux_cp) || txt(o.dossier.cp_siege);
    const { pdf } = await genererPdfBtoc({
      dossier: o.dossier, libres: o.r.libres, totaux: o.r.totaux, P: o.P, numero: o.numero, date: o.date,
      zone: zoneDe(o.P, cpT).zone ?? null, soustraitant: o.soustraitant, facture: o.facture ?? null, logo: o.logo,
      variante: mep, libellePrime: o.libellePrime,
    });
    return pdf;
  }
  const L = o.r.lignes.map((x) => ({ ligne: x.ligne, calc: x.calc! }));
  const { pdf } = await genererPdf({
    dossier: o.dossier, lignes: L, P: o.P, numero: o.numero, date: o.date, facture: o.facture ?? null, logo: o.logo,
    libres: o.r.libres, totaux: o.r.totaux,
  });
  return pdf;
}

export interface ResultatGeneration {
  ok: boolean;
  message: string;
  erreurs?: string[];
  alertes?: string[];
}

export async function archiverEtDeposer(
  sb: SupabaseClient, dossierId: string, type: "devis" | "facture" | "ndd" | "cadre", numero: string, nom: string, pdf: Buffer, fiche?: string, detail?: string,
): Promise<{ path: string; remplace: boolean; id: string | null }> {
  let q = sb.from("documents").select("id").eq("dossier_id", dossierId).eq("type", type).eq("archive", false);
  if (fiche) q = q.eq("fiche", fiche);
  const { data: anciens } = await q;
  const remplace = !!anciens?.length;
  if (remplace) await sb.from("documents").update({ archive: true }).in("id", anciens!.map((a) => a.id));
  const stamp = new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 17) + Math.random().toString(36).slice(2, 6);
  const path = `${type}s/${dossierId}/${stamp}_${nom}`;
  const up = await sb.storage.from("documents").upload(path, pdf, { contentType: "application/pdf", upsert: false });
  if (up.error) throw new Error("Dépôt du PDF impossible : " + up.error.message);
  const { data: { user } } = await sb.auth.getUser();
  const { data: ins } = await sb.from("documents").insert({ dossier_id: dossierId, type, numero, fichier: nom, storage_path: path, archive: false, created_by: user?.id ?? null, ...(fiche ? { fiche } : {}), ...(detail ? { detail } : {}) }).select("id").maybeSingle();
  return { path, remplace, id: (ins as any)?.id ?? null };
}

/** Modèle de document applicable (Paramètres › Modèles de documents) ; figé à la 1re génération */
async function modeleDocument(sb: SupabaseClient, dossier: Dossier, nbLocaux: number, document: "devis" | "facture", date: string): Promise<ModeleDocument | null> {
  const { data, error } = await sb.from("modeles_documents").select("*");
  if (error || !data?.length) return null;
  const tc = dossier.type_client === "BtoC" ? "BtoC" : "BtoB";
  const fige = document === "devis" ? (dossier as any).modele_devis_id : (dossier as any).modele_facture_id;
  return choisirModele(data as ModeleDocument[], { document, type_client: tc, fiche: ficheDuDossier(dossier, nbLocaux), date }, fige);
}

/** Détail d'une version de devis / facture affiché dans la liste des PDF */
function detailVersion(r: ResultatDossier, motif?: string) {
  const parRef = new Map<string, number>();
  for (const x of r.lignes) if (x.calc) parRef.set(txt(x.ligne.reference) || "?", (parRef.get(txt(x.ligne.reference) || "?") ?? 0) + x.calc.nb);
  return [
    `${eur(r.totaux.ttc)} TTC`, r.totPrime ? `prime ${eur(r.totPrime)}` : "",
    r.lignes.length ? `${r.lignes.length} local(aux) : ${[...parRef].map(([k, n]) => `${n} × ${k.replace(/\s*\(.*\)$/, "")}`).join(" + ")}` : "",
    txt(motif) ? `— ${txt(motif)}` : "",
  ].filter(Boolean).join(" · ");
}

export async function genererDevis(sb: SupabaseClient, id: string, motif?: string): Promise<ResultatGeneration> {
  const [P, { dossier, lignes, libres, soustraitant }] = await Promise.all([chargerParams(sb), chargerDossier(sb, id)]);
  const r = calcDossier(dossier, lignes, P, libres);
  const cc = controlesDossier({ ...dossier, date_facture: null }, soustraitant);
  r.erreurs.push(...cc.erreurs); r.alertes.push(...cc.alertes);
  if (cc.erreurs.length) r.ok = false;
  if (!r.ok) {
    const msg = r.erreurs.join(" | ");
    await sb.from("dossiers").update({ statut: "Erreur", controles: msg }).eq("id", id);
    await journaliser(sb, id, "Devis : erreur", msg);
    return { ok: false, message: "Devis non généré : contrôles bloquants", erreurs: r.erreurs, alertes: r.alertes };
  }
  let numero = txt(dossier.numero_devis);
  if (!numero) {
    const { data, error } = await sb.rpc("prochain_numero", { p_type: "devis" });
    if (error) throw new Error("Numérotation impossible : " + error.message);
    numero = data as string;
  }
  const dDevis = parseDate(dossier.date_devis) ?? aujourdhui();
  const nom = `Devis_${numero}_${slug(txt(dossier.raison_sociale))}.pdf`;
  const L = r.lignes.map((x) => ({ ligne: x.ligne, calc: x.calc! }));
  const md = await modeleDocument(sb, dossier, lignes.length, "devis", isoDate(dDevis)!);
  const pdf = await fabriquerPdf({ dossier: { ...dossier, numero_devis: numero }, r, P: appliquerTextes(P, md, dossier.delegataire), numero, date: dateFr(dDevis), soustraitant, logo: await chargerLogo(sb), miseEnPage: md?.mise_en_page, libellePrime: md?.textes?.libelle_prime });
  const { remplace } = await archiverEtDeposer(sb, id, "devis", numero, nom, pdf, undefined, detailVersion(r, motif));

  // fige la version de fiche utilisée et enregistre les montants calculés
  await Promise.all(L.map(({ ligne, calc }) =>
    sb.from("lignes").update({ version_fiche: calc.version, kwh: calc.kwh, prime: calc.prime, pu: calc.pu }).eq("id", ligne.id!)));

  const aVerif = r.alertes.some((a) => a.includes("VÉRIFIER") || a.includes("ALERTE"));
  let msg = (aVerif ? "À VÉRIFIER" : "OK") + (r.alertes.length ? " | " + r.alertes.join(" | ") : "");
  if (remplace) msg = "Régénéré (ancienne version archivée) | " + msg;
  await sb.from("dossiers").update({
    statut: "Généré", numero_devis: numero, date_devis: isoDate(dDevis), controles: msg, a_verifier: aVerif,
    kwh: r.totKwh, prime: r.totPrime, total_ht: r.totaux.ht, total_ttc: r.totaux.ttc, genere_le: new Date().toISOString(), pdf_devis: nom,
  }).eq("id", id);
  if (md) await sb.from("dossiers").update({ modele_devis_id: md.id }).eq("id", id);
  const resume = `${eur(r.totaux.ttc)} TTC${r.totPrime ? ` — prime ${eur(r.totPrime)}` : ""} — reste à payer ${eur(r.totaux.reste)}`;
  await journaliser(sb, id, remplace ? "Devis régénéré" : "Devis généré", `${numero} — ${resume}`);
  return { ok: true, message: `Devis ${numero} généré — ${resume}`, alertes: r.alertes };
}

export async function genererFacture(sb: SupabaseClient, id: string, motif?: string): Promise<ResultatGeneration> {
  const [P, { dossier, lignes, libres, soustraitant }] = await Promise.all([chargerParams(sb), chargerDossier(sb, id)]);
  const r = calcDossier(dossier, lignes, P, libres);
  const erreurs = [...r.erreurs];
  if (!dossier.facture_directe && (!dossier.numero_devis || dossier.statut !== "Généré"))
    erreurs.push("le devis doit d'abord être généré (ou créer une facture directe avec « Nouvelle facture »)");
  const dfact = parseDate(dossier.date_facture);
  const ddevis = parseDate(dossier.date_devis);
  if (!dfact) erreurs.push("Date facture (date des travaux) manquante ou invalide");
  else if (ddevis && dfact < ddevis)
    erreurs.push(`date facture ${dateFr(dfact)} antérieure au devis du ${dateFr(ddevis)} : engagement CEE non respecté`);
  if (erreurs.length) {
    const msg = "FACTURE : " + erreurs.join(" | ");
    await sb.from("dossiers").update({ statut_facture: "Erreur", controles: msg }).eq("id", id);
    await journaliser(sb, id, "Facture : erreur", msg);
    return { ok: false, message: "Facture non générée", erreurs };
  }
  let nfact = txt(dossier.numero_facture);
  if (!nfact) {
    const { data, error } = await sb.rpc("prochain_numero", { p_type: "facture" });
    if (error) throw new Error("Numérotation impossible : " + error.message);
    nfact = data as string;
  }
  const idDel = txt(dossier.id_delegataire);
  const nom = `Facture_${nfact}_${slug(txt(dossier.raison_sociale))}${idDel ? "_ID" + slug(idDel) : ""}.pdf`;
  const mf = await modeleDocument(sb, dossier, lignes.length, "facture", isoDate(dfact)!);
  const pdf = await fabriquerPdf({
    dossier, r, P: appliquerTextes(P, mf, dossier.delegataire), numero: nfact, date: dateFr(dfact), miseEnPage: mf?.mise_en_page, libellePrime: mf?.textes?.libelle_prime,
    facture: { devis: dossier.numero_devis || null, date_devis: dossier.numero_devis ? dateFr(ddevis ?? dossier.date_devis) : null, id: idDel || null },
    soustraitant, logo: await chargerLogo(sb),
  });
  const { remplace } = await archiverEtDeposer(sb, id, "facture", nfact, nom, pdf, undefined, detailVersion(r, motif));
  const fmsg = "FACTURE OK" + (idDel ? "" : " | ID délégataire à saisir après dépôt chez le délégataire, puis régénérer");
  await sb.from("dossiers").update({
    statut_facture: "Générée", numero_facture: nfact, date_facture: isoDate(dfact), pdf_facture: nom, controles: fmsg, total_ht: r.totaux.ht, total_ttc: r.totaux.ttc,
  }).eq("id", id);
  if (mf) await sb.from("dossiers").update({ modele_facture_id: mf.id }).eq("id", id);
  await journaliser(sb, id, remplace ? "Facture régénérée" : "Facture générée", `${nfact} — prime ${eur(r.totPrime)}`);
  return { ok: true, message: `Facture ${nfact} générée — prime ${eur(r.totPrime)}`, alertes: idDel ? [] : ["ID délégataire à saisir après dépôt chez le délégataire, puis régénérer"] };
}
