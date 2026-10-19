import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { BadgeFacture } from "@/components/Badges";
import { dateFr, eur } from "@/lib/format";
import { chargerParams } from "@/lib/data";
import { versSaisie } from "@/lib/saisie";
import { VueSaisie } from "@/components/VueSaisie";

export const dynamic = "force-dynamic";

const FILTRES = [
  { v: "", l: "Tous" },
  { v: "encours", l: "Devis en cours" },
  { v: "emis", l: "Devis émis" },
  { v: "facturer", l: "À facturer" },
  { v: "facture", l: "Facturés" },
  { v: "BtoB", l: "BtoB" },
  { v: "BtoC", l: "BtoC" },
  { v: "ignores", l: "Ignorés" },
];

export default async function Dossiers({ searchParams }: { searchParams: { q?: string; f?: string; vue?: string } }) {
  const vue = searchParams.vue === "saisie" ? "saisie" : "liste";
  const sb = createClient();
  const q = (searchParams.q ?? "").trim();
  const f = searchParams.f ?? "";
  // dossiers ignorés (erreur, doublon…) : visibles seulement avec le filtre « Ignorés »
  // (sans la mise à jour SQL n°7, la colonne n'existe pas encore : la liste reste affichée sans ce filtre)
  const requete = (avecIgnore: boolean) => {
  let req = sb.from("dossiers").select("*").order("updated_at", { ascending: false }).limit(500);
  if (avecIgnore) req = f === "ignores" ? req.eq("ignore", true) : req.not("ignore", "is", true);
  if (f === "encours") req = req.is("numero_devis", null).eq("facture_directe", false);
  else if (f === "emis") req = req.not("numero_devis", "is", null);
  else if (f === "facturer") req = req.not("numero_devis", "is", null).is("numero_facture", null);
  else if (f === "facture") req = req.not("numero_facture", "is", null);
  else if (f === "BtoB" || f === "BtoC") req = req.eq("type_client", f);
  if (q) {
    const s = q.replace(/[%,()]/g, " ");
    req = req.or(`raison_sociale.ilike.%${s}%,ref_dossier.ilike.%${s}%,numero_devis.ilike.%${s}%,numero_facture.ilike.%${s}%,siret.ilike.%${s}%`);
  }
  return req;
  };
  let [{ data: dossiers, error: e1 }, { data: tous, error: e2 }] = await Promise.all([
    requete(true),
    sb.from("dossiers").select("numero_devis, numero_facture, prime, total_ttc, genere_le, date_facture").not("ignore", "is", true),
  ]);
  if (e1) ({ data: dossiers } = await requete(false));
  if (e2) ({ data: tous } = await sb.from("dossiers").select("numero_devis, numero_facture, prime, total_ttc, genere_le, date_facture"));
  let saisie: ReturnType<typeof versSaisie> = [];
  if (vue === "saisie" && dossiers?.length) {
    const [P, { data: l }] = await Promise.all([chargerParams(sb), sb.from("lignes").select("*").in("dossier_id", dossiers.map((x) => x.id))]);
    saisie = versSaisie(dossiers as any, (l ?? []) as any, P);
  }
  const lien = (o: { f?: string; vue?: string }) => {
    const p = new URLSearchParams();
    const ff = o.f ?? f, vv = o.vue ?? vue;
    if (ff) p.set("f", ff); if (q) p.set("q", q); if (vv === "saisie") p.set("vue", "saisie");
    return `/?${p.toString()}`;
  };
  const an = new Date().getFullYear();
  const T = tous ?? [];
  const stats = {
    devis: T.filter((d) => d.numero_devis && d.genere_le?.startsWith(String(an))).length,
    ca: T.filter((d) => d.numero_facture && d.date_facture?.startsWith(String(an))).reduce((s, d) => s + Number(d.total_ttc ?? d.prime ?? 0), 0),
    prime: T.filter((d) => d.numero_devis && d.genere_le?.startsWith(String(an))).reduce((s, d) => s + Number(d.prime || 0), 0),
    aFacturer: T.filter((d) => d.numero_devis && !d.numero_facture).length,
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-vert-900">Devis & factures</h1>
          <p className="text-sm text-slate-500">Gestion commerciale — clients entreprises (BtoB) et particuliers (BtoC)</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href="/api/export" className="btn-ghost">⇩ Export Excel</a>
          <Link href="/ndd/nouvelle" className="btn-ghost">+ Nouvelle NDD</Link>
          <Link href="/factures/nouvelle" className="btn-or">+ Nouvelle facture</Link>
          <Link href="/dossiers/nouveau" className="btn-vert">+ Nouveau devis</Link>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { l: `Devis émis ${an}`, v: String(stats.devis), c: "text-vert-700" },
          { l: `Facturé ${an} (TTC)`, v: eur(stats.ca), c: "text-vert-700" },
          { l: `Primes CEE ${an}`, v: eur(stats.prime), c: "text-vert-700" },
          { l: "Devis à facturer", v: String(stats.aFacturer), c: "text-or-600" },
        ].map((s) => (
          <div key={s.l} className="carte px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{s.l}</div>
            <div className={`mt-1 text-2xl font-bold tabular-nums ${s.c}`}>{s.v}</div>
          </div>
        ))}
      </div>

      <div className="carte overflow-hidden">
        <form className="flex flex-wrap items-center gap-2 border-b border-slate-200 p-3">
          <input name="q" defaultValue={q} placeholder="Rechercher client, réf., n° devis, SIRET…" className="champ max-w-xs" />
          <input type="hidden" name="f" value={f} />
          {vue === "saisie" && <input type="hidden" name="vue" value="saisie" />}
          <button className="btn-ghost">Rechercher</button>
          <div className="ml-auto flex flex-wrap gap-1">
            {FILTRES.map((x) => (
              <Link key={x.v} href={lien({ f: x.v })}
                className={`rounded-full px-3 py-1 text-xs font-medium ${f === x.v ? "bg-vert-500 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                {x.l}
              </Link>
            ))}
          </div>
        </form>
        <div className="flex items-center gap-1 border-b border-slate-200 px-3 py-2 text-xs">
          <span className="mr-2 text-slate-500">Affichage :</span>
          <Link href={lien({ vue: "liste" })} className={`rounded-md px-2.5 py-1 font-medium ${vue === "liste" ? "bg-vert-500 text-white" : "text-slate-600 hover:bg-slate-100"}`}>Liste des devis</Link>
          <Link href={lien({ vue: "saisie" })} className={`rounded-md px-2.5 py-1 font-medium ${vue === "saisie" ? "bg-vert-500 text-white" : "text-slate-600 hover:bg-slate-100"}`}>Vue Saisie (colonnes de l’Excel)</Link>
        </div>
        {vue === "saisie" ? <VueSaisie lignes={saisie} /> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px]">
            <thead>
              <tr>
                <th className="th">N° devis</th><th className="th">Date</th><th className="th">Client</th>
                <th className="th">Type</th><th className="th text-right whitespace-nowrap">Total TTC</th>
                <th className="th text-right">Prime CEE</th><th className="th">Facture</th>
              </tr>
            </thead>
            <tbody>
              {(dossiers ?? []).map((d) => (
                <tr key={d.id} className="hover:bg-vert-50/50">
                  <td className="td font-mono text-xs"><Link href={`/dossiers/${d.id}`} className="font-semibold text-vert-700 hover:underline">{d.numero_devis || (d.facture_directe ? "facture seule" : "en cours")}</Link>{d.a_verifier && <span className="ml-1 text-or-600" title="À vérifier">⚠</span>}</td>
                  <td className="td text-slate-500 whitespace-nowrap">{dateFr(d.date_devis ?? d.date_facture)}</td>
                  <td className="td"><Link href={`/dossiers/${d.id}`} className="font-medium hover:text-vert-700">{d.raison_sociale || <em className="text-slate-400">sans nom</em>}</Link></td>
                  <td className="td"><span className={`badge ${d.type_client === "BtoC" ? "bg-or-100 text-or-600" : "bg-vert-50 text-vert-700"}`}>{d.type_client ?? "BtoB"}</span></td>
                  <td className="td text-right tabular-nums whitespace-nowrap">{d.total_ttc != null ? eur(d.total_ttc) : d.prime ? eur(d.prime) : "—"}</td>
                  <td className="td text-right tabular-nums font-medium whitespace-nowrap">{d.prime ? eur(d.prime) : "—"}</td>
                  <td className="td"><BadgeFacture statut={d.statut_facture} numero={d.numero_facture} /></td>
                </tr>
              ))}
              {!dossiers?.length && (
                <tr><td colSpan={7} className="td py-12 text-center text-slate-400">Aucun dossier{q || f ? " pour ce filtre" : " — créez votre premier devis"}.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        )}
      </div>
    </div>
  );
}
