"use client";
import Avatar from "@/components/ui/Avatar";
import Icon from "@/components/ui/Icon";
import { formatDuree } from "@/lib/constants";

export default function ChargeParIngenieurTable({ ingenieurs, dossiersEnCours }) {
  function dossierDe(ing) {
    return dossiersEnCours.find((d) => d.ingenieur === ing) || null;
  }

  function heuresDepuis(d) {
    if (!d?.date_acceptation) return null;
    return (Date.now() - new Date(d.date_acceptation).getTime()) / 3600000;
  }

  const occupes = ingenieurs.filter((i) => dossierDe(i)).length;

  return (
    <div className="card">
      <div className="card-header">
        <p className="card-title">
          <Icon name="users" size={15} className="text-ink/40" />
          Charge actuelle par ingénieur
        </p>
        <span className="text-xs text-ink/50">
          <strong className="text-ink">{occupes}</strong> / {ingenieurs.length} occupés
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="table table-hover">
          <thead>
            <tr>
              <th>Ingénieur</th>
              <th>Dossier en cours</th>
              <th>Opération</th>
              <th>Client</th>
              <th>Nature</th>
              <th className="text-right">Depuis</th>
            </tr>
          </thead>
          <tbody>
            {ingenieurs.map((ing) => {
              const d = dossierDe(ing);
              const h = heuresDepuis(d);
              return (
                <tr key={ing}>
                  <td>
                    <span className="flex items-center gap-2 font-semibold capitalize">
                      <Avatar nom={ing} taille={26} />
                      {ing}
                    </span>
                  </td>
                  <td className="font-medium">
                    {d?.nom_dossier || <span className="badge badge-neutral">Disponible</span>}
                  </td>
                  <td className="text-ink/70">{d?.nom_operation || "—"}</td>
                  <td className="text-ink/70">{d?.client || "—"}</td>
                  <td className="text-ink/55">{d?.nature_prod || "—"}</td>
                  <td className="text-right tabular text-ink/60">{h === null ? "—" : formatDuree(h)}</td>
                </tr>
              );
            })}
            {ingenieurs.length === 0 && (
              <tr>
                <td colSpan={6} className="table-empty">Aucun ingénieur.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
