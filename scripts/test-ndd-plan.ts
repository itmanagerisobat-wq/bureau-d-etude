// Plan de calepinage hors ligne : services IGN simulés (fetch remplacé), vérifie emprise, tuiles et surcharges.
// npx tsx scripts/test-ndd-plan.ts tuile.jpg sortie.pdf
import { readFileSync, writeFileSync } from "fs";
import { composerPlan, placerPoints, type Anneau } from "../lib/ndd/geo";
import { genererPdfNdd, imageParDefaut } from "../lib/pdf/ndd";
import { legendeModeles, pointsParModele } from "../lib/ndd/couleurs";

(async () => {
  const [tuile, out] = process.argv.slice(2);
  const img = readFileSync(tuile);
  let n = 0;
  (globalThis as any).fetch = async (url: string) => { n++; return { ok: true, arrayBuffer: async () => img.buffer.slice(img.byteOffset, img.byteOffset + img.byteLength) } as any; };
  const c: [number, number] = [2.03551, 47.8968];
  const d = 0.00012;
  const bat: Anneau = [[c[0] - d * 1.6, c[1] - d], [c[0] + d * 1.6, c[1] - d], [c[0] + d * 1.6, c[1] + d * 0.4], [c[0], c[1] + d], [c[0] - d * 1.6, c[1] + d], [c[0] - d * 1.6, c[1] - d]];
  const parc: Anneau = [[c[0] - 0.0004, c[1] - 0.0003], [c[0] + 0.0005, c[1] - 0.0003], [c[0] + 0.0005, c[1] + 0.0004], [c[0] - 0.0004, c[1] + 0.0004], [c[0] - 0.0004, c[1] - 0.0003]];
  const pts = placerPoints(bat, 4);
  console.log("points", pts.length);
  const p = await composerPlan({ centre: c, parcelle: { insee: "45036", prefixe: "000", section: "0C", numero: "0390", contour: [parc] }, batiments: [{ id: "b", contour: [bat] }], points: pts });
  console.log("tuiles", p.tuiles.length, "requêtes", n, "échelle", p.echelle, "points", p.points.map((q) => q.map((v) => v.toFixed(2))));
  const blanc = { valeur: "", l1: "" };
  const { pdf } = await genererPdfNdd({
    reference: "TEST-V1", date: "07/10/2026", titre: "NOTE DE DIMENSIONNEMENT", sousTitre: "Test plan", ligneOperation: "Opération test",
    be: { nom: "HILL SOLUTION", raison_sociale: "", siret: "", qualification: "", adresse: "", telephone: "", mail: "", charge: "X", ville: "Paris", pied: "pied" },
    beneficiaire: [], site: [], synthese: [blanc], intro: "", blocs: [], signatureBeneficiaire: "CLIENT",
    plan: { image: null, tuiles: p.tuiles, parcelles: p.parcelles, batiments: p.batiments, points: p.points, echelle: p.echelle, nombre: 4,
      ...(() => { const l = pointsParModele(null, [{ reference: "ONSEN-DS3(3500m3/h)", nb: 2 } as any, { reference: "ONSEN-DS7(6500m3/h)", nb: 2 } as any]); return { couleurs: l.map((x) => x.couleur), modeles: legendeModeles(l) }; })() },
    images: { logo: imageParDefaut("ndd-logo"), qualification: imageParDefaut("ndd-qualification"), signature: imageParDefaut("ndd-signature") },
  });
  writeFileSync(out, pdf);
})();
