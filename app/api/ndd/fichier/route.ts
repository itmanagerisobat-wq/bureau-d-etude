import { NextResponse } from "next/server";
import { createClient, getUtilisateur } from "@/lib/supabase/server";
import { cheminLogoDelegataire } from "@/lib/cadre";

export const runtime = "nodejs";

// Fichiers de la NDD :
//  - type=plan&dossier=… : image du plan de calepinage importée pour un dossier (tout utilisateur)
//  - type=ndd-logo | ndd-qualification | ndd-signature : images du bureau d'études (admin)
//  - type=reference&fiche=… : NDD d'exemple d'une opération (admin)
//  - type=modele-doc&fiche=… : modèle de devis / facture fourni (admin)
//  - type=cadre-cachet | deleg-logo&delegataire=… : images du cadre de contribution (admin)
const IMAGES = ["ndd-logo", "ndd-qualification", "ndd-signature"];

export async function POST(req: Request) {
  const fd = await req.formData();
  const type = String(fd.get("type") ?? "");
  const f = fd.get("fichier") as File | null;
  if (!f) return NextResponse.json({ ok: false, message: "Fichier manquant" }, { status: 400 });
  if (type === "plan") {
    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, message: "Non connecté" }, { status: 401 });
    if (!/image\/(png|jpeg)/.test(f.type)) return NextResponse.json({ ok: false, message: "Image PNG ou JPG attendue" }, { status: 400 });
    const path = `ndd/${String(fd.get("dossier") ?? "x")}/plan_${Date.now()}.${f.type.endsWith("png") ? "png" : "jpg"}`;
    const { error } = await sb.storage.from("documents").upload(path, await f.arrayBuffer(), { contentType: f.type, upsert: true });
    return NextResponse.json(error ? { ok: false, message: error.message } : { ok: true, path });
  }
  const { supabase, profil } = await getUtilisateur();
  if (profil?.role !== "admin") return NextResponse.json({ ok: false, message: "Réservé à l'administrateur" }, { status: 403 });
  if (IMAGES.includes(type)) {
    if (!/image\/png/.test(f.type)) return NextResponse.json({ ok: false, message: "Image PNG attendue (fond transparent conseillé)" }, { status: 400 });
    const { error } = await supabase.storage.from("documents").upload(`ressources/${type}.png`, await f.arrayBuffer(), { contentType: f.type, upsert: true });
    return NextResponse.json(error ? { ok: false, message: error.message } : { ok: true });
  }
  if (type === "reference") {
    const fiche = String(fd.get("fiche") ?? "").trim().toUpperCase();
    if (!fiche) return NextResponse.json({ ok: false, message: "Code fiche manquant" }, { status: 400 });
    if (f.type !== "application/pdf") return NextResponse.json({ ok: false, message: "PDF attendu" }, { status: 400 });
    const path = `ndd-modeles/${fiche}/${Date.now()}_${f.name.replace(/[^\w.\-]+/g, "_")}`;
    const up = await supabase.storage.from("documents").upload(path, await f.arrayBuffer(), { contentType: "application/pdf" });
    if (up.error) return NextResponse.json({ ok: false, message: up.error.message });
    const { error } = await supabase.from("ndd_modeles").upsert({ fiche, pdf_reference: path, updated_at: new Date().toISOString() }, { onConflict: "fiche" });
    return NextResponse.json(error ? { ok: false, message: error.message } : { ok: true, path });
  }
  if (type === "cadre-cachet" || type === "deleg-logo") {
    // cadre de contribution : cachet « Signature Partenaire » ou logo d'un délégataire (PNG ou JPG)
    if (!/image\/(png|jpeg)/.test(f.type)) return NextResponse.json({ ok: false, message: "Image PNG ou JPG attendue" }, { status: 400 });
    const base = type === "cadre-cachet" ? "ressources/cadre-cachet" : cheminLogoDelegataire(String(fd.get("delegataire") ?? ""));
    if (type === "deleg-logo" && !String(fd.get("delegataire") ?? "").trim()) return NextResponse.json({ ok: false, message: "Délégataire manquant" }, { status: 400 });
    await supabase.storage.from("documents").remove([`${base}.png`, `${base}.jpg`]);
    const { error } = await supabase.storage.from("documents").upload(`${base}.${f.type.endsWith("png") ? "png" : "jpg"}`, await f.arrayBuffer(), { contentType: f.type, upsert: true });
    return NextResponse.json(error ? { ok: false, message: error.message } : { ok: true });
  }
  if (type === "modele-doc") {
    // modèle de devis / facture fourni (PDF ou Word), conservé pour mémoire
    const fiche = (String(fd.get("fiche") ?? "").trim().toUpperCase() || "TOUTES").replace(/[^\w\-]+/g, "_");
    if (!/\.(pdf|docx?)$/i.test(f.name)) return NextResponse.json({ ok: false, message: "PDF ou Word (.docx) attendu" }, { status: 400 });
    const path = `modeles-documents/${fiche}/${Date.now()}_${f.name.replace(/[^\w.\-]+/g, "_")}`;
    const { error } = await supabase.storage.from("documents").upload(path, await f.arrayBuffer(), { contentType: f.type || "application/octet-stream" });
    return NextResponse.json(error ? { ok: false, message: error.message } : { ok: true, path });
  }
  return NextResponse.json({ ok: false, message: "Type inconnu" }, { status: 400 });
}

/** Ouvre un fichier NDD stocké (?path=…) — image importée ou NDD de référence */
export async function GET(req: Request) {
  const sb = createClient();
  const path = new URL(req.url).searchParams.get("path") ?? "";
  if (!/^(ndd|ndd-modeles|modeles-documents|ressources)\//.test(path)) return new NextResponse("Chemin refusé", { status: 400 });
  const { data, error } = await sb.storage.from("documents").createSignedUrl(path, 300);
  if (error || !data) return new NextResponse("Fichier introuvable", { status: 404 });
  return NextResponse.redirect(data.signedUrl);
}

/** Supprime une image du bureau d'études (retour à l'image d'origine) */
export async function DELETE(req: Request) {
  const { supabase, profil } = await getUtilisateur();
  if (profil?.role !== "admin") return NextResponse.json({ ok: false }, { status: 403 });
  const u = new URL(req.url).searchParams;
  const type = u.get("type") ?? "";
  if (type === "cadre-cachet" || type === "deleg-logo") {
    const base = type === "cadre-cachet" ? "ressources/cadre-cachet" : cheminLogoDelegataire(u.get("delegataire") ?? "");
    await supabase.storage.from("documents").remove([`${base}.png`, `${base}.jpg`]);
    return NextResponse.json({ ok: true });
  }
  if (!IMAGES.includes(type)) return NextResponse.json({ ok: false }, { status: 400 });
  await supabase.storage.from("documents").remove([`ressources/${type}.png`]);
  return NextResponse.json({ ok: true });
}
