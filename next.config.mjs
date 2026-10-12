/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Modules e-mail (liaison RH de la Messagerie) : exécutés côté serveur, non empaquetés
  experimental: {
    serverComponentsExternalPackages: ["imapflow", "mailparser", "nodemailer"],
  },
};

export default nextConfig;
