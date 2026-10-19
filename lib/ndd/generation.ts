// Génération d'une note de dimensionnement (une par opération du dossier)
import type { SupabaseClient } from "@supabase/supabase-js";
import { zoneDe } from "../calcul";
import { chargerParams } from "../data";
import { aujourdhui, cp5, fr, num, parseDate, slug, txt } from "../format";
import type { ResultatGeneration } from "../generation";
import { genererPdfNdd, imageParDefaut, type PlanNdd } from "../pdf/ndd";
import type { CalcLigne, Dossier, Ligne, Params } from "../types";
import { bureauEtudes, construireDestrat, construireGenerique, debitEquipement } from "./construire";
import { altitude, batimentsAutour, centre, composerPlan, dansPolygone, geocoder, parcelleAuPoint, parcelleParReference, placerPoints, type Batiment, type LonLat } from "./geo";
import { fusionnerModeles } from "./modeles";
import { legendeModeles, pointsParModele } from "./couleurs";
import { departementDe, temperatureBase, ZONES_DEPARTEMENTS } from "./temperatures";
import type { DocumentNdd, ModeleNdd, SaisieNdd } from "./types";
import { calculsNdd, siteDe, versDossier } from "./document";

export async function chargerModelesNdd(sb: SupabaseClient): Promise<ModeleNdd[]> {
  const { data } = await sb.from("ndd_modeles").select("*").order("fiche");
  return fusionnerModeles((data ?? []) as ModeleNdd[]);
}

async function imagesNdd(sb: SupabaseClient) {
  const lire = async (nom: string) => {
    const { data } = await sb.storage.from("documents").download(`ressources/${nom}.png`);
    return data ? Buffer.from(await data.arrayBuffer()) : null;
  };
  const [logo, qualification, signature] = await Promise.all(["ndd-logo", "ndd-qualification", "ndd-signature"].map((n) => lire(n).catch(() => null)));
  return {
    logo: logo ?? imageParDefaut("ndd-logo"),
    qualification: qualification ?? imageParDefaut("ndd-qualification"),
    signature: signature ?? imageParDefaut("ndd-signature"),
  };
}

export const adresseSite = (d: Dossier, L?: Partial<Ligne> | null) =>
  d.type_client === "BtoC"
    ? [txt(d.travaux_adresse) || txt(d.adresse_siege), cp5(d.travaux_cp || d.cp_siege), txt(d.travaux_ville) || txt(d.ville_siege)].filter(Boolean).join(" ")
    : [txt(L?.adresse_travaux), cp5(L?.cp_travaux), txt(L?.ville_travaux)].filter(Boolean).join(" ");

/**
 * Complète automatiquement la saisie NDD : position du site, parcelle cadastrale, altitude, température de base.
 * Ne remplace jamais une valeur déjà saisie. Renvoie la saisie complétée et les messages.
 */
export async function completerSaisie(sb: SupabaseClient, site: { adresse: string; cp: string }, s: SaisieNdd): Promise<{ saisie: SaisieNdd; messages: string[] }> {
  const out: SaisieNdd = { ...s };
  const messages: string[] = [];
  try {
    if (!num(out.lon as any) || !num(out.lat as any)) {
      const g = await geocoder(site.adresse);
      if (g) { out.lon = g.lon; out.lat = g.lat; if (g.score < 0.6) messages.push(`Adresse localisée approximativement (${g.libelle}) : vérifiez la position sur le plan`); }
      else messages.push("Adresse des travaux introuvable : placez le site sur le plan");
    }
    const lon = num(out.lon as any), lat = num(out.lat as any);
    if (lon && lat) {
      if (!out.parcelle?.section || !out.parcelle?.numero) {
        const p = await parcelleAuPoint(lon, lat).catch(() => null);
        if (p) out.parcelle = { insee: p.insee, prefixe: p.prefixe, section: p.section, numero: p.numero };
        else messages.push("Parcelle cadastrale introuvable au point localisé");
      }
      if (!num(out.altitude as any)) out.altitude = await altitude(lon, lat).catch(() => null);
    }
  } catch (e: any) {
    messages.push(`Services IGN indisponibles (${e?.message ?? e}) : saisissez parcelle et altitude à la main`);
  }
  if (out.temp_base === null || out.temp_base === undefined || String(out.temp_base) === "") {
    const dep = departementDe(cp5(site.cp));
    let zone = txt(out.zone_temp);
    if (!zone && dep) {
      const { data } = await sb.from("temperatures_base").select("zone").eq("departement", dep).maybeSingle();
      zone = txt(data?.zone) || ZONES_DEPARTEMENTS[dep] || "";
    }
    if (zone) out.zone_temp = zone;   // zone remplie depuis l'adresse, même sans altitude
    const t = temperatureBase(zone, num(out.altitude as any));
    if (t !== null) out.temp_base = t;
    else if (!zone) messages.push(`Zone de température de base du département ${dep || "?"} inconnue : choisissez-la (A à I) dans la note`);
  }
  return { saisie: out, messages };
}

/** Plan de calepinage : image importée, sinon vue IGN avec parcelle, bâtiment et déstratificateurs */
async function preparerPlan(sb: SupabaseClient, s: SaisieNdd, nb: number, couleurs: { reference: string; couleur: string }[] = []): Promise<{ plan: PlanNdd; alerte?: string; points?: LonLat[] }> {
  const coul = { couleurs: couleurs.map((c) => c.couleur), modeles: legendeModeles(couleurs) };
  if (s.plan_image) {
    const { data } = await sb.storage.from("documents").download(s.plan_image);
    if (data) return { plan: { image: Buffer.from(await data.arrayBuffer()), nombre: nb } };
  }
  const lon = num(s.lon as any), lat = num(s.lat as any);
  if (!lon || !lat) return { plan: { image: null, nombre: nb }, alerte: "NDD : plan de calepinage vide (site non localisé)" };
  try {
    const c: LonLat = [lon, lat];
    const p = s.parcelle;
    const [parcelle, bats] = await Promise.all([
      (p?.insee && p.section && p.numero ? parcelleParReference(p.insee, p.section, p.numero, p.prefixe) : parcelleAuPoint(lon, lat)).catch(() => null),
      batimentsAutour(lon, lat, 120).catch(() => [] as Batiment[]),
    ]);
    let points = (s.points ?? []).filter((x) => Array.isArray(x) && x.length === 2) as LonLat[];
    const contient = (b: Batiment, q: LonLat) => b.contour.some((a) => dansPolygone(q, a));
    let choisis = points.length ? bats.filter((b) => points.some((q) => contient(b, q))) : bats.filter((b) => contient(b, c));
    if (!choisis.length && bats.length) {
      const dist = (b: Batiment) => { const m = centre(b.contour[0]); return (m[0] - lon) ** 2 + (m[1] - lat) ** 2; };
      choisis = [bats.reduce((a, b) => (dist(b) < dist(a) ? b : a))];
    }
    if (points.length !== nb) points = choisis.length ? placerPoints(choisis[0].contour[0], nb) : Array.from({ length: nb }, () => c);
    const pl = await composerPlan({ centre: c, parcelle, batiments: choisis, points });
    return { plan: { image: null, tuiles: pl.tuiles, parcelles: pl.parcelles, batiments: pl.batiments, points: pl.points, echelle: pl.echelle, nombre: nb, ...coul }, points };
  } catch (e: any) {
    return { plan: { image: null, nombre: nb }, alerte: `NDD : vue aérienne IGN indisponible (${e?.message ?? e}) — importez une image du site` };
  }
}

async function deposer(sb: SupabaseClient, nddId: string, numero: string, nom: string, pdf: Buffer, fiche: string, detail: string): Promise<{ id: string | null; remplace: boolean }> {
  const { data: anciens } = await sb.from("documents").select("id").eq("ndd_id", nddId).eq("archive", false);
  const remplace = !!anciens?.length;
  if (remplace) await sb.from("documents").update({ archive: true }).in("id", anciens!.map((a) => a.id));
  const stamp = new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 17) + Math.random().toString(36).slice(2, 6);
  const path = `ndd/${nddId}/${stamp}_${nom}`;
  const up = await sb.storage.from("documents").upload(path, pdf, { contentType: "application/pdf", upsert: false });
  if (up.error) throw new Error("Dépôt du PDF impossible : " + up.error.message);
  const { data: { user } } = await sb.auth.getUser();
  const { data } = await sb.from("documents").insert({ ndd_id: nddId, dossier_id: null, type: "ndd", fiche, numero, fichier: nom, storage_path: path, archive: false, created_by: user?.id ?? null, detail }).select("id").maybeSingle();
  return { id: (data as any)?.id ?? null, remplace };
}

/** Génère (ou régénère) la note de dimensionnement autonome `id`. nouvelleVersion = V+1, sinon la version courante est remplacée. */
export async function genererDocumentNdd(sb: SupabaseClient, id: string, o: { nouvelleVersion?: boolean; motif?: string } = {}): Promise<ResultatGeneration & { document?: string | null }> {
  const [P, modeles, { data: n, error }] = await Promise.all([chargerParams(sb), chargerModelesNdd(sb), sb.from("ndd_documents").select("*").eq("id", id).maybeSingle()]);
  if (error || !n) return { ok: false, message: "Note introuvable" + (error ? ` : ${error.message}` : "") };
  const doc = n as DocumentNdd;
  const modele = modeles.find((m) => m.fiche === doc.fiche) ?? null;
  const pre = calculsNdd(doc, P, modele);
  if (pre.erreurs.length) return { ok: false, message: "Note non générée : informations manquantes", erreurs: pre.erreurs };

  const site = siteDe(doc);
  const { saisie, messages } = await completerSaisie(sb, { adresse: [site.adresse, site.cp, site.ville].filter(Boolean).join(" "), cp: site.cp }, doc.saisie ?? {});
  let numero = txt(doc.numero);
  if (!numero) {
    const { data, error: e } = await sb.rpc("prochain_numero_ndd");
    if (e) throw new Error("Numérotation impossible : " + e.message);
    numero = data as string;
  }
  const version = o.nouvelleVersion || !doc.version ? (doc.version || 0) + 1 : doc.version;
  const reference = `${numero}-V${version}`;
  const date = parseDate(doc.date_etude) ?? aujourdhui();
  const { dossier } = versDossier({ ...doc, saisie });
  const base = { dossier, P, saisie, modele: modele!, reference, date, zone: zoneDe(P, site.cp).zone ?? null, be: bureauEtudes(P), images: await imagesNdd(sb) };

  const alertes = [...messages, ...pre.alertes.filter((a) => !/Parcelle|Altitude|Température/.test(a))];
  let res;
  if (modele!.moteur === "destratification") {
    const nb = pre.lignes.reduce((a, x) => a + x.calc.nb, 0);
    const pl = await preparerPlan(sb, saisie, nb, pointsParModele(P, doc.locaux ?? []));
    if (pl.alerte) alertes.push(pl.alerte);
    if (pl.points && saisie.points?.length !== nb) saisie.points = pl.points;
    res = construireDestrat({ ...base, plan: pl.plan }, pre.lignes);
  } else {
    const pl = saisie.plan_image ? await preparerPlan(sb, saisie, 0) : null;
    res = construireGenerique({ ...base, plan: pl?.plan ?? null }, null);
  }
  alertes.push(...res.alertes);
  if (res.erreurs.length) {
    await sb.from("ndd_documents").update({ saisie }).eq("id", id);
    return { ok: false, message: "Note non générée", erreurs: res.erreurs, alertes };
  }
  const { pdf } = await genererPdfNdd(res.donnees);
  const nomBenef = doc.type_client === "BtoC" ? [txt(doc.rep_nom), txt(doc.rep_prenom)].filter(Boolean).join(" ") : txt(doc.raison_sociale);
  const nom = `NDD_${reference}_${slug(nomBenef)}.pdf`;
  // détail de la version : modèles et nombres de déstratificateurs, volume, taux obtenu (+ motif saisi)
  const parModele = legendeModeles(pointsParModele(P, doc.locaux ?? [])).map((m) => `${m.nombre} × ${m.libelle}`).join(" + ");
  const vol = pre.lignes.reduce((a, x) => a + (x.calc.h || 0) * (num(x.ligne.surface as any) ?? 0), 0);
  const inst = pre.lignes.reduce((a, x) => a + x.calc.nb * (debitEquipement(P, txt(x.ligne.reference)) ?? 0), 0);
  const detail = [`V${version}`, `${doc.locaux?.length ?? 0} local(aux)`, parModele, vol ? `${fr(Math.round(vol), 0)} m³` : "", vol && inst ? `taux ${fr(inst / vol, 2)} vol/h` : "", txt(o.motif) ? `— ${txt(o.motif)}` : ""].filter(Boolean).join(" · ");
  const dep = await deposer(sb, id, reference, nom, pdf, doc.fiche, detail);
  await sb.from("ndd_documents").update({ numero, version, saisie, pdf: nom, updated_at: new Date().toISOString() }).eq("id", id);
  return { ok: true, message: `Note de dimensionnement ${reference} générée`, alertes, document: dep.id };
}

export type { Params };
