// Thème commun à tous les graphiques Recharts de l'app.
export const COULEURS_GRAPH = {
  brand: "#1F6FA8",
  brandClair: "#7FB0D9",
  green: "#4E9F3D",
  gold: "#D09A2E",
  red: "#D33A3A",
  grille: "#E9EDF2",
  texte: "#6B7785",
};

export const AXE = {
  tick: { fontSize: 11, fill: COULEURS_GRAPH.texte },
  tickLine: false,
  axisLine: { stroke: COULEURS_GRAPH.grille },
};

export const GRILLE = {
  stroke: COULEURS_GRAPH.grille,
  strokeDasharray: "0",
};

export const TOOLTIP = {
  cursor: { fill: "rgba(31,111,168,0.06)" },
  contentStyle: {
    borderRadius: 10,
    border: "1px solid #E3E8EE",
    boxShadow: "0 8px 24px rgba(19,33,47,0.12)",
    fontSize: 12,
    padding: "8px 12px",
  },
  labelStyle: { fontWeight: 600, color: "#13212F", marginBottom: 4 },
};

export const LEGENDE = {
  iconType: "circle",
  iconSize: 8,
  wrapperStyle: { fontSize: 12, color: COULEURS_GRAPH.texte, paddingTop: 8 },
};
