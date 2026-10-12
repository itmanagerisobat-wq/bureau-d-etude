"use client";
import Icon from "@/components/ui/Icon";

export default function NavigationOnglets({ operations, operationActive, onChange }) {
  const liste = ["Tous", ...operations];
  return (
    <div className="flex items-center gap-3 mb-6 overflow-x-auto scrollbar-none -mx-1 px-1 py-0.5">
      <span className="eyebrow flex items-center gap-1.5 shrink-0">
        <Icon name="layers" size={13} />
        Opération
      </span>
      <div className="flex gap-2">
        {liste.map((op) => (
          <button
            key={op}
            onClick={() => onChange(op)}
            className={`chip shrink-0 ${operationActive === op ? "chip-active" : ""}`}
            aria-pressed={operationActive === op}
          >
            {op === "Tous" ? "Toutes" : op}
          </button>
        ))}
      </div>
    </div>
  );
}
