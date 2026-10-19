// Cadre de contribution d'essai (reprend le modèle COMMUNE DE COUBLANC) : npx tsx scripts/test-cadre.ts sortie.pdf
import { writeFileSync } from "fs";
import { genererPdfCadre, PREMIUM_PAR_DEFAUT } from "../lib/pdf/cadre";

(async () => {
  const { pdf } = await genererPdfCadre({
    delegataire: { nom: "PREMIUM ENERGY", logo: null, ...PREMIUM_PAR_DEFAUT },
    societe: "ISOBAT", prime: 3271.32,
    travaux: [{ fiche: "BAT-TH-142", nature: "Mise en place d’un système de déstratification d’air pour l’homogénéisation de la température de l’air d’un local de grande hauteur chauffé par un système convectif et/ou radiatif" }],
    kwhClassique: 908700, kwhPrecarite: 0,
    beneficiaire: "COMMUNE DE COUBLANC , N° SIRET : 21710148400012",
    adresse: "1679 ROUTE D’ARCINGES, 71170 COUBLANC", telephone: "03 85 26 30 78 / 06 83 52 94 85", mail: "mairie@coublanc.fr",
    representant: "", date: "14/10/2026",
  });
  writeFileSync(process.argv[2], pdf);
})();
