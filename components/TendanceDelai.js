"use client";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import Icon from "@/components/ui/Icon";
import EmptyState from "@/components/ui/EmptyState";
import { AXE, GRILLE, TOOLTIP, COULEURS_GRAPH as C } from "@/lib/chartTheme";

export default function TendanceDelai({ data }) {
  return (
    <div className="card">
      <div className="card-header">
        <p className="card-title">
          <Icon name="clock" size={15} className="text-ink/40" />
          Tendance délai de vérification (par semaine)
        </p>
      </div>
      <div className="px-4 pb-4">
        {data.length < 2 ? (
          <EmptyState icone="trend" texte="Pas encore assez de données." compact />
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={data}>
              <CartesianGrid {...GRILLE} vertical={false} />
              <XAxis dataKey="semaine" {...AXE} />
              <YAxis {...AXE} unit="h" width={40} />
              <Tooltip {...TOOLTIP} formatter={(v) => `${v.toFixed(1)}h`} />
              <Line type="monotone" dataKey="delaiMoyen" stroke={C.brand} strokeWidth={2.5} dot={{ r: 3, fill: "#fff", strokeWidth: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
