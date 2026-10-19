import { initiales } from "@/lib/constants";

const TEINTES = ["#1F6FA8", "#4E9F3D", "#B7791F", "#7A5CB0", "#2B8C8C", "#C0574B"];

function teinte(nom = "") {
  let h = 0;
  for (const c of nom) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return TEINTES[h % TEINTES.length];
}

export default function Avatar({ nom, taille = 28 }) {
  const couleur = teinte(nom);
  return (
    <span
      className="inline-flex items-center justify-center rounded-full font-semibold shrink-0"
      style={{
        width: taille,
        height: taille,
        fontSize: Math.round(taille * 0.4),
        background: `${couleur}1A`,
        color: couleur,
      }}
      aria-hidden
    >
      {initiales(nom)}
    </span>
  );
}
