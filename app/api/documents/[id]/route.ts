import { NextResponse } from "next/server";
import { createClient, getUtilisateur } from "@/lib/supabase/server";

export const runtime = "nodejs";

/** Ouvre un PDF stocké (devis, facture, archive) via une URL signée courte. */
export async function GET(_: Request, { params }: { params: { id: string } }) {
  const sb = createClient();
  const { data: doc } = await sb.from("documents").select("storage_path, fichier").eq("id", params.id).maybeSingle();
  if (!doc) return new NextResponse("Document introuvable", { status: 404 });
  const { data, error } = await sb.storage.from("documents").createSignedUrl(doc.storage_path, 120);
  if (error || !data) return new NextResponse("Lien indisponible", { status: 500 });
  return NextResponse.redirect(data.signedUrl);
}

/**
 * Supprime définitivement un PDF (fichier + ligne) : versions archivées pour tous,
 * PDF en cours réservé à l'administrateur.
 */
export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const { supabase: sb, profil } = await getUtilisateur();
  if (!profil) return NextResponse.json({ ok: false, message: "Non connecté" }, { status: 401 });
  const { data: doc } = await sb.from("documents").select("id, storage_path, fichier, archive, dossier_id, type").eq("id", params.id).maybeSingle();
  if (!doc) return NextResponse.json({ ok: false, message: "Document introuvable" }, { status: 404 });
  if (!doc.archive && profil.role !== "admin") return NextResponse.json({ ok: false, message: "Seules les versions archivées peuvent être supprimées (PDF en cours : administrateur)" }, { status: 403 });
  await sb.storage.from("documents").remove([doc.storage_path]);
  const { error } = await sb.from("documents").delete().eq("id", doc.id);
  if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  if (doc.dossier_id) await sb.from("journal").insert({ dossier_id: doc.dossier_id, action: "PDF supprimé", detail: doc.fichier });
  return NextResponse.json({ ok: true });
}
