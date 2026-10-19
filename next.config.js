/** @type {import('next').NextConfig} */
module.exports = {
  // serveur autonome (VPS / Docker) : BUILD_STANDALONE=1 ; sans effet sur Vercel
  ...(process.env.BUILD_STANDALONE ? { output: "standalone" } : {}),
  experimental: {
    serverComponentsExternalPackages: ["pdfkit", "exceljs", "unpdf"],
    serverActions: { bodySizeLimit: "10mb" },
    // polices standard de pdfkit (lues sur disque à l'exécution)
    outputFileTracingIncludes: {
      "/api/dossiers/[id]/generer": ["./node_modules/pdfkit/js/data/**/*", "./lib/pdf/fonts/**/*"],
      // NDD : polices Carlito (métriques Calibri) et images du bureau d'études
      "/api/ndd/[id]/generer": ["./node_modules/pdfkit/js/data/**/*", "./lib/pdf/fonts/**/*", "./lib/pdf/assets/**/*"],
    },
  },
};
