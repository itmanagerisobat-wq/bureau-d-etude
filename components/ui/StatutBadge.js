import { ETATS } from "@/lib/constants";
import { couleurEtat, assombrir } from "@/lib/couleurs";

const CLASSE_TON = {
  neutral: "badge-neutral",
  brand: "badge-brand",
  green: "badge-green",
  gold: "badge-gold",
  red: "badge-red",
  dark: "badge-red",
};

/** Badge d'état de dossier — même rendu partout, couleur paramétrable (Paramètres → Statuts). */
export default function StatutBadge({ etat, complet = false }) {
  const meta = ETATS[etat] || { court: etat || "—", ton: "neutral" };
  const c = couleurEtat(etat);
  return (
    <span className="badge badge-dot" style={{ background: `${c}22`, color: assombrir(c, 0.7) }} title={etat}>
      {complet ? etat : meta.court}
    </span>
  );
}

export function Badge({ ton = "neutral", children, dot = false, className = "" }) {
  return (
    <span className={`badge ${dot ? "badge-dot" : ""} ${CLASSE_TON[ton]} ${className}`}>{children}</span>
  );
}
