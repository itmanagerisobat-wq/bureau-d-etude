import "./globals.css";

export const metadata = {
  title: "Hill Solution — Qualité Bureau d'Études",
  description: "Suivi de production et qualité du bureau d'études Hill Solution",
  icons: { icon: "/icon.png" },
};

export const viewport = {
  themeColor: "#1F6FA8",
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,100..900&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
