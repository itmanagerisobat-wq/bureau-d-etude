"use client";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LabelList } from "recharts";
import Icon from "@/components/ui/Icon";
import EmptyState from "@/components/ui/EmptyState";
import { AXE, GRILLE, TOOLTIP, COULEURS_GRAPH as C } from "@/lib/chartTheme";

export default function TopCausesChart({ data }) {
  const hauteur = Math.max(200, data.length * 34 + 30);
  return (
    <div className="card">
      <div className="card-header border-b border-line">
        <p className="card-title">
          <Icon name="alert" size={15} className="text-ink/40" />
          Top causes de retour
        </p>
      </div>
      <div className="p-4">
        {data.length === 0 ? (
          <EmptyState icone="checkCircle" texte="Aucun retour sur la période." compact />
        ) : (
          <ResponsiveContainer width="100%" height={hauteur}>
            <BarChart data={data} layout="vertical" margin={{ left: 4, right: 32 }}>
              <CartesianGrid {...GRILLE} horizontal={false} />
              <XAxis type="number" allowDecimals={false} {...AXE} />
              <YAxis type="category" dataKey="cause" width={160} {...AXE} tick={{ ...AXE.tick, fill: "#13212F" }} />
              <Tooltip {...TOOLTIP} formatter={(v) => [`${v} retour(s)`, "Total"]} />
              <Bar dataKey="total" fill={C.red} radius={[0, 6, 6, 0]} barSize={18}>
                <LabelList dataKey="total" position="right" style={{ fontSize: 11, fill: C.texte, fontWeight: 600 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
