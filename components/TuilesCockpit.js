"use client";

const TON = { vert: "text-isoGreen-dark", rouge: "text-isoRed", ambre: "text-isoGold-dark", neutre: "text-ink/50" };

/**
 * Quatre cartes chiffrées sous le bandeau Bleu Hill : libellé, chiffre, précision colorée
 * et mini graphique des 7 derniers jours (le dernier jour en bleu foncé).
 * items : [{ label, valeur, note, ton, serie, actif, onClick, aide }]
 */
export default function TuilesCockpit({ items }) {
  return (
    <div className="tuiles-cockpit">
      {items.map((it) => {
        const Tag = it.onClick ? "button" : "div";
        const serie = (it.serie || []).map((v) => (v === null || v === undefined ? 0 : v));
        const max = Math.max(1, ...serie);
        return (
          <Tag key={it.label} onClick={it.onClick} title={it.aide} aria-pressed={it.onClick ? !!it.actif : undefined} className={`tuile-cockpit ${it.actif ? "actif" : ""}`}>
            <span className="flex items-baseline justify-between gap-2">
              <span className="text-sm text-ink/65 truncate">{it.label}</span>
              {it.note && <span className={`text-xs font-medium whitespace-nowrap ${TON[it.ton] || TON.neutre}`}>{it.note}</span>}
            </span>
            <b className="block font-display chiffre text-[36px] font-semibold leading-tight mt-0.5 truncate">{it.valeur}</b>
            {serie.length > 0 ? (
              <span className="flex items-end gap-1 h-9 mt-auto pt-2" aria-label="7 derniers jours">
                {serie.map((v, i) => (
                  <i
                    key={i}
                    className={`flex-1 rounded-t-sm ${i === serie.length - 1 ? "bg-brand-500" : "bg-[#CFE0EE]"}`}
                    style={{ height: `${Math.max(6, (v / max) * 100)}%` }}
                  />
                ))}
              </span>
            ) : (
              <span className="block h-9 mt-2" />
            )}
          </Tag>
        );
      })}
    </div>
  );
}
