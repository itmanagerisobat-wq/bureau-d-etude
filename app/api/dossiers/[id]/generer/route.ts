import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { genererDevis, genererFacture } from "@/lib/generation";
import { genererCadre } from "@/lib/cadre";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, message: "Non connecté" }, { status: 401 });
  const { type, motif } = await req.json().catch(() => ({ type: "devis", motif: "" }));
  const m = String(motif ?? "").slice(0, 300);
  try {
    if (type === "cadre") return NextResponse.json(await genererCadre(sb, params.id, m));
    const r = type === "facture" ? await genererFacture(sb, params.id, m) : await genererDevis(sb, params.id, m);
    let document: string | null = null;
    if (r.ok) {
      const { data } = await sb.from("documents").select("id").eq("dossier_id", params.id).eq("type", type === "facture" ? "facture" : "devis")
        .eq("archive", false).order("created_at", { ascending: false }).limit(1).maybeSingle();
      document = data?.id ?? null;
    }
    return NextResponse.json({ ...r, document });
  } catch (e: any) {
    return NextResponse.json({ ok: false, message: e?.message ?? "Erreur inattendue" }, { status: 500 });
  }
}
