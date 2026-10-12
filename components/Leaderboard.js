"use client";
import Avatar from "@/components/ui/Avatar";
import Icon from "@/components/ui/Icon";
import EmptyState from "@/components/ui/EmptyState";

const PODIUM = ["#D09A2E", "#8A96A3", "#B0764A"];

export default function Leaderboard({ classement }) {
  const trie = [...classement].sort((a, b) => (b.stats.scoreGlobal ?? -1) - (a.stats.scoreGlobal ?? -1));

  return (
    <div className="card">
      <div className="card-header border-b border-line">
        <p className="card-title">
          <Icon name="trophy" size={15} className="text-ink/40" />
          Classement — Score global
        </p>
      </div>
      <ul className="flex flex-col divide-y divide-line">
        {trie.map((row, i) => {
          const score = row.stats.scoreGlobal;
          return (
            <li key={row.ingenieur} className="flex items-center gap-3 px-5 py-2.5 text-sm">
              <span
                className="w-6 h-6 rounded-full text-[11px] font-bold flex items-center justify-center shrink-0"
                style={
                  i < 3 && score !== null
                    ? { background: PODIUM[i], color: "#fff" }
                    : { background: "rgba(19,33,47,0.06)", color: "rgba(19,33,47,0.5)" }
                }
              >
                {i + 1}
              </span>
              <Avatar nom={row.ingenieur} taille={26} />
              <span className="font-medium capitalize flex-1 truncate">{row.ingenieur}</span>
              <div className="w-24 h-1.5 rounded-full bg-ink/[0.06] overflow-hidden hidden sm:block">
                <div className="h-full rounded-full bg-brand-500" style={{ width: `${score ?? 0}%` }} />
              </div>
              <span className="font-display font-bold tabular w-14 text-right">
                {score !== null && score !== undefined ? Math.round(score) : "—"}
                <span className="text-ink/30 text-xs font-medium">/100</span>
              </span>
            </li>
          );
        })}
        {trie.length === 0 && <EmptyState icone="trophy" texte="Pas encore de données." compact />}
      </ul>
    </div>
  );
}
