"use client";
import Icon from "@/components/ui/Icon";

const TONS = {
  brand: { texte: "text-brand-600", fond: "bg-brand-50", barre: "bg-brand-500" },
  navy: { texte: "text-brand-600", fond: "bg-brand-50", barre: "bg-brand-500" },
  green: { texte: "text-isoGreen-dark", fond: "bg-isoGreen-light", barre: "bg-isoGreen" },
  gold: { texte: "text-isoGold-dark", fond: "bg-isoGold-light", barre: "bg-[#D09A2E]" },
  red: { texte: "text-isoRed-dark", fond: "bg-isoRed-light", barre: "bg-isoRed" },
  neutral: { texte: "text-ink/70", fond: "bg-ink/[0.05]", barre: "bg-ink/30" },
};

export default function KPICard({ label, value, previousValue, accent = "brand", icone, aide, onClick, actif }) {
  const ton = TONS[accent] || TONS.brand;

  let tendance = null;
  if (previousValue !== undefined && previousValue !== null && previousValue !== 0) {
    const delta = value - previousValue;
    const pct = Math.round((delta / previousValue) * 100);
    tendance = { delta, pct, positif: delta >= 0 };
  }

  const Tag = onClick ? "button" : "div";

  return (
    <Tag
      onClick={onClick}
      title={aide}
      className={`card relative overflow-hidden p-4 flex flex-col gap-3 text-left min-w-0 ${
        onClick ? "hover:border-brand-300 transition-colors" : ""
      } ${actif ? "ring-2 ring-brand-500/30 border-brand-300" : ""}`}
    >
      <span className={`absolute left-0 top-4 bottom-4 w-[3px] rounded-r ${ton.barre}`} />
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium text-ink/55 leading-snug">{label}</span>
        {icone && (
          <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${ton.fond} ${ton.texte}`}>
            <Icon name={icone} size={15} />
          </span>
        )}
      </div>
      <div className="flex items-end gap-2">
        <span className="font-display text-[28px] leading-none font-extrabold tabular text-ink">{value ?? 0}</span>
        {tendance && (
          <span
            className={`text-xs font-semibold mb-0.5 ${tendance.positif ? "text-isoGreen-dark" : "text-isoRed"}`}
            title="Vs mois précédent"
          >
            {tendance.positif ? "↑" : "↓"} {Math.abs(tendance.pct)}%
          </span>
        )}
      </div>
    </Tag>
  );
}
