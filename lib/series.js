// Petites séries sur les 7 derniers jours, pour les mini graphiques des cartes chiffrées.

/** Jour local AAAA-MM-JJ d'une date ISO (ou d'une date déjà au format jour). */
export function jourLocal(v) {
  if (!v) return null;
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  return isNaN(d) ? null : d.toLocaleDateString("sv-SE");
}

/** Les 7 derniers jours, du plus ancien à aujourd'hui. */
export function septJours() {
  return Array.from({ length: 7 }, (_, i) => new Date(Date.now() - (6 - i) * 86400000).toLocaleDateString("sv-SE"));
}

/** Nombre d'éléments par jour (champ date). */
export function serieCompte(items, champ, filtre = () => true) {
  const jours = septJours();
  const c = Object.fromEntries(jours.map((j) => [j, 0]));
  for (const x of items || []) {
    if (!filtre(x)) continue;
    const j = jourLocal(x[champ]);
    if (j in c) c[j] += 1;
  }
  return jours.map((j) => c[j]);
}

/** Moyenne d'une valeur par jour (jours vides : null). */
export function serieMoyenne(items, champ, valeur) {
  const jours = septJours();
  const acc = Object.fromEntries(jours.map((j) => [j, []]));
  for (const x of items || []) {
    const j = jourLocal(x[champ]);
    if (!(j in acc)) continue;
    const v = valeur(x);
    if (v !== null && v !== undefined && !isNaN(v)) acc[j].push(v);
  }
  return jours.map((j) => (acc[j].length ? acc[j].reduce((a, b) => a + b, 0) / acc[j].length : null));
}

/** Écart aujourd'hui / hier, en texte (« +3 vs hier »). */
export function ecartHier(serie, unite = "") {
  const a = serie[6] ?? 0;
  const b = serie[5] ?? 0;
  const d = Math.round((a - b) * 10) / 10;
  if (!d) return { texte: "comme hier", ton: "neutre" };
  return { texte: `${d > 0 ? "+" : "−"}${String(Math.abs(d)).replace(".", ",")}${unite} vs hier`, ton: d > 0 ? "vert" : "rouge" };
}
