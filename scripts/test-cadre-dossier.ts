// Cadre de contribution généré de bout en bout (faux Supabase en mémoire) à partir des dossiers de Devis_ISOBAT.xlsx
// npx tsx scripts/test-cadre-dossier.ts Devis_ISOBAT.xlsx dossier_sortie
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { lireExcel } from "../lib/excel";
import { genererCadre } from "../lib/cadre";

function fauxSupabase(tables: Record<string, any[]>, sortie: string) {
  const q = (t: string) => {
    let rows = [...(tables[t] ?? [])];
    const api: any = {
      select: () => api, order: () => api, limit: () => api, in: () => api, like: () => api,
      eq: (k: string, v: any) => { rows = rows.filter((r) => r[k] === v); return api; },
      single: async () => ({ data: rows[0] ?? null, error: rows[0] ? null : { message: "introuvable" } }),
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      then: (res: any) => res({ data: rows, error: null }),
      insert: (r: any) => { (tables[t] ??= []).push({ id: "doc-" + Math.random(), ...r }); return { select: () => ({ maybeSingle: async () => ({ data: { id: "doc1" } }) }), then: (res: any) => res({ error: null }) }; },
      update: () => ({ in: async () => ({}), eq: async () => ({}) }),
    };
    return api;
  };
  return {
    from: q,
    storage: { from: () => ({ download: async () => ({ data: null }), upload: async (p: string, b: Buffer) => { writeFileSync(`${sortie}/${p.split("/").pop()!.replace(/^\d+[a-z0-9]*_/, "")}`, b); return { error: null }; } }) },
    auth: { getUser: async () => ({ data: { user: { id: "u" } } }) },
  } as any;
}

(async () => {
  const [xlsx, out] = process.argv.slice(2);
  mkdirSync(out, { recursive: true });
  const imp = await lireExcel(readFileSync(xlsx));
  const params = Object.entries(imp.parametres ?? {}).map(([cle, valeur]) => ({ cle, valeur }));
  const cas: any[] = imp.dossiers.map((x: any, i: number) => ({ id: "d" + i, numero_devis: x.dossier.numero_devis || `2026-90${i}`, date_devis: x.dossier.date_devis || "2026-10-14", ...x.dossier, statut: "Généré", lignes: x.lignes }));
  cas.push({ id: "btoc", ref_dossier: "ISB-2026-3076", type_client: "BtoC", civilite: "M.", rep_nom: "VILLAUME", rep_prenom: "Dominique", numero_devis: "2026-3076", date_devis: "2026-06-10", delegataire: "PREMIUM ENERGY",
    adresse_siege: "11 RUE DES CURTILLES", cp_siege: "88390", ville_siege: "DOMMARTIN-AUX-BOIS", telephone: "06-82-10-54-30", mail: "client@exemple.fr", precarite: "Très modeste",
    operations: [{ fiche: "BAR-TH-171", intitule: "Mise en place d’une pompe à chaleur (PAC) de type air/eau", libelle_prime: "Prime CEE", kwh: 131040, valorisation: 34.5, prime: null, caracs: { application: "Moyenne température", marque: "THALEOS", reference: "THAHP08-M", surface: "80", usage: "Chauffage", cop: "5", puissance: "8", etas: "198", groupe_ext: "THAHP08-M", regulateur: "IV" } }], lignes: [] });
  for (const c of cas) {
    const { lignes, ...d } = c;
    const sb = fauxSupabase({
      parametres: params, fiches_montants: imp.fiches, delegataires: imp.delegataires, equipements: imp.equipements, zones: imp.zones, fiches_textes: imp.textes,
      dossiers: [d], lignes: (lignes ?? []).map((l: any, i: number) => ({ id: "l" + i, ...l, dossier_id: d.id })), lignes_libres: [], cadre_natures: [], documents: [], journal: [],
    }, out);
    const r = await genererCadre(sb, d.id);
    console.log(d.ref_dossier ?? d.rep_nom, r.ok, r.message, r.erreurs ?? "", r.alertes ?? "");
  }
})();
