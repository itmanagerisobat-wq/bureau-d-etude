"use client";
import { useState } from "react";
import {
  BarChart, Bar, AreaChart, Area, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid, LabelList,
} from "recharts";
import Modal from "@/components/ui/Modal";
import Icon from "@/components/ui/Icon";
import EmptyState from "@/components/ui/EmptyState";
import { AXE, GRILLE, TOOLTIP, LEGENDE, COULEURS_GRAPH as C } from "@/lib/chartTheme";

const MOIS = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sep", "Oct", "Nov", "Déc"];

function evolutionMensuelle(dossiers) {
  const map = {};
  for (const d of dossiers) {
    if (!d.date) continue;
    const date = new Date(d.date);
    const cle = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    map[cle] = (map[cle] || 0) + 1;
  }
  return Object.entries(map)
    .map(([cle, total]) => {
      const [annee, mois] = cle.split("-");
      return { label: `${MOIS[Number(mois) - 1]} ${annee.slice(2)}`, cle, total };
    })
    .sort((a, b) => a.cle.localeCompare(b.cle))
    .slice(-12);
}

function repartitionPar(dossiers, champ) {
  const map = {};
  for (const d of dossiers) {
    const val = d[champ] || "—";
    map[val] = (map[val] || 0) + 1;
  }
  return Object.entries(map)
    .map(([label, total]) => ({ label, total }))
    .sort((a, b) => b.total - a.total);
}

function nouveauxVsModifications(dossiers) {
  const map = {};
  for (const d of dossiers) {
    if (!d.date) continue;
    const date = new Date(d.date);
    const cle = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    if (!map[cle]) map[cle] = { nouveau: 0, modification: 0 };
    if (d.nature_prod === "Nouveau dossier") map[cle].nouveau += 1;
    else if (d.nature_prod === "Modification") map[cle].modification += 1;
  }
  return Object.entries(map)
    .map(([cle, v]) => {
      const [annee, mois] = cle.split("-");
      return { label: `${MOIS[Number(mois) - 1]} ${annee.slice(2)}`, cle, Nouveau: v.nouveau, Modification: v.modification };
    })
    .sort((a, b) => a.cle.localeCompare(b.cle))
    .slice(-12);
}

export const GRAPHIQUES = [
  { type: "evolution", label: "Évolution mensuelle", icone: "trend", sousTitre: "Volume de dossiers sur les 12 derniers mois" },
  { type: "operation", label: "Par opération", icone: "layers", sousTitre: "Volume de dossiers par opération" },
  { type: "client", label: "Par client", icone: "building", sousTitre: "Volume de dossiers par client" },
  { type: "nature", label: "Nouveaux vs Modifs", icone: "chart", sousTitre: "Comparaison mensuelle par nature de production" },
];

function BarresHorizontales({ data, couleur }) {
  const hauteur = Math.max(220, data.length * 34 + 30);
  return (
    <ResponsiveContainer width="100%" height={hauteur}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 36 }}>
        <CartesianGrid {...GRILLE} horizontal={false} />
        <XAxis type="number" allowDecimals={false} {...AXE} />
        <YAxis type="category" dataKey="label" width={130} {...AXE} tick={{ ...AXE.tick, fill: "#13212F" }} />
        <Tooltip {...TOOLTIP} formatter={(v) => [`${v} dossier(s)`, "Total"]} />
        <Bar dataKey="total" fill={couleur} radius={[0, 6, 6, 0]} barSize={18}>
          <LabelList dataKey="total" position="right" style={{ fontSize: 11, fill: C.texte, fontWeight: 600 }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export default function GraphiquePopup({ type, dossiers, onFermer }) {
  const [actif, setActif] = useState(type);
  const config = GRAPHIQUES.find((g) => g.type === actif);
  const vide = dossiers.length === 0;

  return (
    <Modal titre="Graphiques" sousTitre={config.sousTitre} onFermer={onFermer} taille="xl">
      <div className="segmented mb-5 flex-wrap">
        {GRAPHIQUES.map((g) => (
          <button key={g.type} data-active={actif === g.type} onClick={() => setActif(g.type)}>
            <Icon name={g.icone} size={13} />
            {g.label}
          </button>
        ))}
      </div>

      {vide && <EmptyState icone="chart" texte="Aucun dossier pour ces filtres." />}

      {!vide && actif === "evolution" && (
        <ResponsiveContainer width="100%" height={320}>
          <AreaChart data={evolutionMensuelle(dossiers)} margin={{ top: 10, right: 10 }}>
            <defs>
              <linearGradient id="degradeBrand" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={C.brand} stopOpacity={0.22} />
                <stop offset="100%" stopColor={C.brand} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid {...GRILLE} vertical={false} />
            <XAxis dataKey="label" {...AXE} />
            <YAxis allowDecimals={false} {...AXE} width={36} />
            <Tooltip {...TOOLTIP} formatter={(v) => [`${v} dossier(s)`, "Total"]} />
            <Area
              type="monotone"
              dataKey="total"
              stroke={C.brand}
              strokeWidth={2.5}
              fill="url(#degradeBrand)"
              dot={{ r: 3, fill: "#fff", stroke: C.brand, strokeWidth: 2 }}
              activeDot={{ r: 5 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}

      {!vide && actif === "operation" && <BarresHorizontales data={repartitionPar(dossiers, "nom_operation")} couleur={C.brand} />}

      {!vide && actif === "client" && <BarresHorizontales data={repartitionPar(dossiers, "client")} couleur={C.green} />}

      {!vide && actif === "nature" && (
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={nouveauxVsModifications(dossiers)} margin={{ top: 10, right: 10 }} barGap={3}>
            <CartesianGrid {...GRILLE} vertical={false} />
            <XAxis dataKey="label" {...AXE} />
            <YAxis allowDecimals={false} {...AXE} width={36} />
            <Tooltip {...TOOLTIP} />
            <Legend {...LEGENDE} />
            <Bar dataKey="Nouveau" fill={C.brand} radius={[5, 5, 0, 0]} maxBarSize={22} />
            <Bar dataKey="Modification" fill={C.brandClair} radius={[5, 5, 0, 0]} maxBarSize={22} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </Modal>
  );
}
