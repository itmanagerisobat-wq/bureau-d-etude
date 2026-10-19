// Devis BtoC d'essai, modèle PAC 2026 (reprend le devis 2026-3076) : npx tsx scripts/test-btoc-2026.ts Devis_ISOBAT.xlsx sortie.pdf
import { readFileSync, writeFileSync } from "fs";
import { lireExcel } from "../lib/excel";
import { construireParams } from "../lib/params";
import { calcDossier, zoneDe } from "../lib/calcul";
import { genererPdfBtoc } from "../lib/pdf/btoc";
import type { Dossier, LigneLibre } from "../lib/types";

(async () => {
  const [xlsx, out] = process.argv.slice(2);
  const P = construireParams((await lireExcel(readFileSync(xlsx))) as any);
  const d = {
    id: "x", type_client: "BtoC", civilite: "M.", rep_nom: "VILLAUME", rep_prenom: "Dominique", raison_sociale: "",
    ref_dossier: "ISB-2026-3076", numero_devis: "2026-3076", date_devis: "2026-06-10", delegataire: "PREMIUM ENERGY",
    adresse_siege: "11 RUE DES CURTILLES", cp_siege: "88390", ville_siege: "DOMMARTIN-AUX-BOIS", telephone: "06-82-10-54-30 / 06-26-30-98-14", mail: "client@exemple.fr",
    precarite: "Très modeste", type_chauffage: "Combustible / Fioul", type_logement: "Maison individuelle / +15 ans",
    travaux_adresse: "11 RUE DES CURTILLES", travaux_cp: "88390", travaux_ville: "DOMMARTIN-AUX-BOIS",
    operations: [{ fiche: "BAR-TH-171", intitule: "", libelle_prime: "Prime Coup de pouce CEE", kwh: 131040, valorisation: 34.5, prime: null,
      caracs: { application: "Moyenne température", marque: "THALEOS", reference: "THAHP08-M MONOPHASE", surface: "80", usage: "Chauffage et eau chaude sanitaire",
        cop: "5", scop: "5,21", puissance: "8", etas: "198", groupe_ext: "THAHP08-M", regulateur: "IV" } }],
    soustraitant_id: "s1", statut: "Brouillon",
  } as unknown as Dossier;
  const libres: LigneLibre[] = [{ ordre: 0, designation: "FORFAIT POSE ET MISE EN SERVICE D'UNE POMPE A CHALEUR AIR EAU", nom: "PAC Mont-blanc R290", detail: "POMPE À CHALEUR AIR-EAU, MONOPHASÉ", quantite: 1, unite: "U", pu_ht: 4272.23, tva: 0.055 }];
  const r = calcDossier(d, [], P, libres);
  const { pdf, pages } = await genererPdfBtoc({
    dossier: d, libres: r.libres, totaux: r.totaux, P, numero: "2026-3076", date: "10/06/2026", zone: zoneDe(P, "88390").zone ?? null,
    soustraitant: { id: "s1", nom: "KLIMATIK CHAUD&FROID", adresse: "1 RUE SAINT LEGER 33230 GUITRES", representant: "YANN TELLIER", siret: "53830458500028", rge_numero: "QPAC/85463", rge_date: "2026-05-22", rge_validite: "2027-05-22" },
    variante: "btoc-pac-2026", libellePrime: "Prime CEE",
  });
  writeFileSync(out, pdf); console.log("pages", pages, r.totaux);
})();
