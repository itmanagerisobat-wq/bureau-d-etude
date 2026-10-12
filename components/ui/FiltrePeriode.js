"use client";
import Icon from "@/components/ui/Icon";

export const PERIODE_INITIALE = {
  mode: "tout",
  jour: new Date().toISOString().slice(0, 10),
  mois: new Date().toISOString().slice(0, 7),
};

/** Le dossier (champ `date`) est-il dans la période choisie ? */
export function dansPeriode(d, periode) {
  const dt = String(d.date || "").slice(0, 10);
  if (periode.mode === "aujourdhui") return dt === new Date().toISOString().slice(0, 10);
  if (periode.mode === "jour") return dt === periode.jour;
  if (periode.mode === "mois") return dt.slice(0, 7) === periode.mois;
  return true;
}

/** Filtre Date : Tout · Aujourd'hui · Un jour · Un mois. */
export default function FiltrePeriode({ periode, onChange }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="flex items-center gap-1.5 text-xs font-semibold text-ink/50 uppercase tracking-wider">
        <Icon name="calendar" size={13} />
        Date
      </span>
      <div className="segmented">
        {[
          ["tout", "Tout"],
          ["aujourdhui", "Aujourd'hui"],
          ["jour", "Un jour"],
          ["mois", "Un mois"],
        ].map(([m, l]) => (
          <button key={m} data-active={periode.mode === m} onClick={() => onChange({ ...periode, mode: m })}>
            {l}
          </button>
        ))}
      </div>
      {periode.mode === "jour" && (
        <input type="date" className="input input-sm w-40" value={periode.jour} onChange={(e) => onChange({ ...periode, jour: e.target.value })} aria-label="Jour" />
      )}
      {periode.mode === "mois" && (
        <input type="month" className="input input-sm w-40" value={periode.mois} onChange={(e) => onChange({ ...periode, mois: e.target.value })} aria-label="Mois" />
      )}
    </div>
  );
}
