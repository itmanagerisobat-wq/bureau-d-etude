import { getUtilisateur } from "@/lib/supabase/server";
import { chargerParams } from "@/lib/data";
import DossierEditor from "@/components/DossierEditor";
import { devisDepuisNdd } from "@/lib/ndd/document";

export const dynamic = "force-dynamic";

/** /dossiers/nouveau : nouveau devis ; /dossiers/nouveau?facture=1 : facture sans devis */
export default async function Nouveau({ searchParams }: { searchParams: { facture?: string; ndd?: string } }) {
  const { supabase, profil } = await getUtilisateur();
  const [P, st] = await Promise.all([chargerParams(supabase), supabase.from("soustraitants").select("*").eq("actif", true).order("nom")]);
  const facture = searchParams.facture === "1";
  // devis préparé depuis une note de dimensionnement (la NDD se fait avant le devis)
  let depuis: ReturnType<typeof devisDepuisNdd> | null = null;
  if (searchParams.ndd) {
    const { data: n } = await supabase.from("ndd_documents").select("*").eq("id", searchParams.ndd).maybeSingle();
    if (n) depuis = devisDepuisNdd(n as any);
  }
  return <DossierEditor key={facture ? "f" : depuis ? "n" + searchParams.ndd : "d"} P={P} initial={null} lignesInit={depuis?.lignes ?? []} soustraitants={st.data ?? []}
    factureDirecte={facture} role={profil?.role ?? "gestionnaire"} prefill={depuis?.dossier} nddSource={depuis ? searchParams.ndd : undefined} />;
}
