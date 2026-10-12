"use client";
import Avatar from "@/components/ui/Avatar";
import EmptyState from "@/components/ui/EmptyState";
import Icon from "@/components/ui/Icon";

export default function ChargeDetaillee({ titre, dossiers, champPersonne, badgeTexte, icone = "users" }) {
  const groupes = {};
  for (const d of dossiers) {
    const cle = d[champPersonne];
    if (!cle) continue;
    if (!groupes[cle]) groupes[cle] = [];
    groupes[cle].push(d);
  }
  const entrees = Object.entries(groupes).sort((a, b) => b[1].length - a[1].length);

  return (
    <div className="card flex flex-col">
      <div className="card-header border-b border-line">
        <p className="card-title">
          <Icon name={icone} size={15} className="text-ink/40" />
          {titre}
        </p>
        <span className="badge badge-neutral">{dossiers.length}</span>
      </div>
      <div className="flex flex-col divide-y divide-line max-h-80 overflow-y-auto">
        {entrees.map(([personne, liste]) => (
          <div key={personne} className="px-5 py-3">
            <div className="flex justify-between items-center mb-2">
              <span className="flex items-center gap-2 font-semibold text-sm capitalize">
                <Avatar nom={personne} taille={24} />
                {personne}
              </span>
              <span className="badge badge-brand">
                {liste.length} {badgeTexte}
              </span>
            </div>
            <ul className="flex flex-col gap-1 pl-8">
              {liste.map((d) => (
                <li key={d.id} className="text-xs flex justify-between gap-3">
                  <span className="text-ink/75 truncate">{d.nom_dossier}</span>
                  <span className="text-ink/40 shrink-0">{d.nom_operation}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {entrees.length === 0 && <EmptyState texte="Rien en cours." compact />}
      </div>
    </div>
  );
}
