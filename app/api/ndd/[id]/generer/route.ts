import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { genererDocumentNdd } from "@/lib/ndd/generation";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Génère le PDF d'une note de dimensionnement ({ nouvelle_version }) */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, message: "Non connecté" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  try {
    return NextResponse.json(await genererDocumentNdd(sb, params.id, { nouvelleVersion: !!b.nouvelle_version, motif: String(b.motif ?? "").slice(0, 300) }));
  } catch (e: any) {
    return NextResponse.json({ ok: false, message: e?.message ?? "Erreur inattendue" }, { status: 500 });
  }
}
