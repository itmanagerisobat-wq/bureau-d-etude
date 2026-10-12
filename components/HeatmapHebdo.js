"use client";
import Icon from "@/components/ui/Icon";

export default function HeatmapHebdo({ data }) {
  const max = Math.max(...data.map((d) => d.total), 1);
  const total = data.reduce((s, d) => s + d.total, 0);

  return (
    <div className="card h-full">
      <div className="card-header">
        <p className="card-title">
          <Icon name="calendar" size={15} className="text-ink/40" />
          Volume par jour de la semaine
        </p>
        <span className="text-xs text-ink/45 tabular">{total} dossiers</span>
      </div>
      <div className="flex items-end gap-2 h-40 px-5 pb-4">
        {data.map((d) => {
          const hauteur = Math.max(4, (d.total / max) * 100);
          const pic = d.total === max && d.total > 0;
          return (
            <div key={d.jour} className="flex-1 h-full flex flex-col items-center gap-1.5 group">
              <span className={`text-[11px] tabular font-semibold ${pic ? "text-brand-600" : "text-ink/45"}`}>
                {d.total}
              </span>
              <div className="w-full flex-1 flex items-end">
                <div
                  className={`w-full rounded-md transition-colors ${pic ? "bg-brand-500" : "bg-brand-200 group-hover:bg-brand-300"}`}
                  style={{ height: `${hauteur}%` }}
                  title={`${d.jour} : ${d.total} dossier(s)`}
                />
              </div>
              <span className="text-[11px] font-medium text-ink/55">{d.jour}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
