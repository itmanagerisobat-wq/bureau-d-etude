import JSZip from "jszip";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { slug, txt } from "@/lib/format";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Dossier complet en un clic : devis, cadre de contribution et facture du dossier, et les notes de dimensionnement
 * rattachées (reprises de ce devis, ou même SIRET), dans un seul ZIP prêt pour le délégataire.
 */
export async function GET(_: Request, { params }: { params: { id: string } }) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return new NextResponse("Non connecté", { status: 401 });
  const { data: d } = await sb.from("dossiers").select("*").eq("id", params.id).maybeSingle();
  if (!d) return new NextResponse("Dossier introuvable", { status: 404 });

  const siret = txt(d.siret).replace(/\s/g, "");
  let qn = sb.from("ndd_documents").select("id");
  qn = siret ? qn.or(`dossier_id.eq.${d.id},siret.eq.${siret}`) : qn.eq("dossier_id", d.id);
  const { data: ndds } = await qn;
  const nddIds = (ndds ?? []).map((n) => n.id);

  const [{ data: docsDossier }, { data: docsNdd }] = await Promise.all([
    sb.from("documents").select("fichier, storage_path, type").eq("dossier_id", d.id).eq("archive", false),
    nddIds.length ? sb.from("documents").select("fichier, storage_path, type").in("ndd_id", nddIds).eq("archive", false) : Promise.resolve({ data: [] as any[] }),
  ]);
  const docs = [...(docsDossier ?? []), ...(docsNdd ?? [])];
  if (!docs.length) return new NextResponse("Aucun PDF généré pour ce dossier.", { status: 404 });

  const zip = new JSZip();
  const ordre: Record<string, string> = { devis: "1", cadre: "2", ndd: "3", facture: "4" };
  const manquants: string[] = [];
  await Promise.all(docs.map(async (x) => {
    const { data } = await sb.storage.from("documents").download(x.storage_path);
    if (data) zip.file(`${ordre[x.type] ?? "9"}_${x.fichier}`, Buffer.from(await data.arrayBuffer()));
    else manquants.push(x.fichier);
  }));
  const contenu = [
    `Dossier ${txt(d.numero_devis) || txt(d.ref_dossier)} — ${txt(d.raison_sociale)}`,
    `Généré le ${new Date().toLocaleString("fr-FR", { timeZone: "Europe/Paris" })}`,
    "",
    "Pièces :",
    ...docs.filter((x) => !manquants.includes(x.fichier)).map((x) => `- ${x.type.toUpperCase()} : ${x.fichier}`),
    ...(manquants.length ? ["", "Introuvables dans le stockage :", ...manquants.map((m) => `- ${m}`)] : []),
    ...(!docs.some((x) => x.type === "cadre") ? ["", "Pas de cadre de contribution généré pour ce dossier."] : []),
    ...(!docs.some((x) => x.type === "facture") ? ["", "Pas encore de facture pour ce dossier."] : []),
    ...(!docs.some((x) => x.type === "ndd") ? ["Pas de note de dimensionnement rattachée (reprise de ce devis ou même SIRET)."] : []),
  ].join("\r\n");
  zip.file("0_Contenu_du_dossier.txt", contenu);
  const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  const nom = `Dossier_${slug(txt(d.numero_devis) || txt(d.ref_dossier))}_${slug(txt(d.raison_sociale))}.zip`;
  return new NextResponse(buf as any, { headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${nom}"` } });
}
