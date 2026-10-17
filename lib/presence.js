/** Présence d'une personne : en ligne (< 2 min et active), absente (< 10 min), hors ligne. */
export function depuis(iso) {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = new Date(iso);
  const hier = new Date(Date.now() - 86400000).toDateString() === d.toDateString();
  return hier ? `hier à ${d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}` : `le ${d.toLocaleDateString("fr-FR")}`;
}

export function presence(p) {
  if (!p?.derniere_activite) return { cle: "off", libelle: "Hors ligne", couleur: "#C3C8D0" };
  const min = (Date.now() - new Date(p.derniere_activite).getTime()) / 60000;
  if (min < 2 && p.presence_active) return { cle: "on", libelle: "En ligne", couleur: "#2E9E5B" };
  if (min < 10) return { cle: "absent", libelle: "Absent", couleur: "#E6A23C" };
  return { cle: "off", libelle: `Vu ${depuis(p.derniere_activite)}`, couleur: "#C3C8D0" };
}
