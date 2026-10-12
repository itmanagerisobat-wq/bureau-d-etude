/** @type {import('tailwindcss').Config} */
// Palette alignée sur le logo Hill Solution (bleu montagne + vert "HILL").
// Les noms historiques (isoGreen, isoNavy…) sont conservés pour la compatibilité,
// mais leurs valeurs sont harmonisées et lisibles sur fond blanc.
module.exports = {
  content: ["./app/**/*.{js,jsx}", "./components/**/*.{js,jsx}", "./lib/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#EEF5FB",
          100: "#D9E8F5",
          200: "#B3D0EA",
          300: "#7FB0D9",
          400: "#4A8DC4",
          500: "#1F6FA8", // bleu du logo
          600: "#195C8D",
          700: "#154A72",
          800: "#113A59",
          900: "#0C2940",
        },
        isoGreen: { DEFAULT: "#4E9F3D", dark: "#3B7F2D", light: "#EAF5E4" },
        isoRed: { DEFAULT: "#D33A3A", dark: "#B02525", light: "#FDECEC" },
        isoGold: { DEFAULT: "#B7791F", dark: "#8F5E14", light: "#FDF3DC" },
        isoNavy: { DEFAULT: "#1F6FA8", dark: "#154A72", light: "#EEF5FB" },
        night: { DEFAULT: "#0F2742", light: "#1D3A5C" }, // barre du haut : Bleu nuit
        ink: "#13212F",
        paper: "#F2F4F7",
        line: "#E3E8EE",
      },
      fontFamily: {
        display: ["Manrope", "Inter", "system-ui", "sans-serif"],
        body: ["Inter", "system-ui", "sans-serif"],
        mono: ["'IBM Plex Mono'", "ui-monospace", "monospace"],
      },
      borderRadius: {
        card: "14px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(19,33,47,0.04), 0 2px 8px rgba(19,33,47,0.04)",
        pop: "0 12px 40px rgba(19,33,47,0.18)",
      },
      keyframes: {
        "fade-in": { from: { opacity: 0 }, to: { opacity: 1 } },
        "slide-up": {
          from: { opacity: 0, transform: "translateY(8px)" },
          to: { opacity: 1, transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-in": "fade-in .15s ease-out",
        "slide-up": "slide-up .18s ease-out",
      },
    },
  },
  plugins: [],
};
