"use client";
import { useState } from "react";
import Avatar from "@/components/ui/Avatar";
import Icon from "@/components/ui/Icon";
import { StatutDossier, BadgeTypeRetour } from "@/components/DossierTable";
import { formatDate, formatDuree } from "@/lib/constants";
import { ingenieurResponsable } from "@/lib/rapportQualite";
import { exporterDossiers } from "@/lib/exportDossiers";

/**
 * Charge actuelle par ingénieur, avec un filtre : en choisissant un ingénieur, on voit aussi
 * la liste de tous ses dossiers sur la période (remplace l'ancien encadré « Dossiers par agent »).
 */
export default function ChargeParIngenieurTable({ ingenieurs, dossiersEnCours, dossiers = [] }) {
  const [choisi, setChoisi] = useState("");
  const [recherche, setRecherche] = useState("");

  const dossierDe = (ing) => dossiersEnCours.find((d) => d.ingenieur === ing) || null;
  const heuresDepuis = (d) => (d?.date_acceptation ? (Date.now() - new Date(d.date_acceptation).getTime()) / 3600000 : null);

  const occupes = ingenieurs.filter((i) => dossierDe(i)).length;
  const visibles = choisi ? ingenieurs.filter((i) => i === choisi) : ingenieurs;
  const memeNom = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
  const siens = choisi
    ? dossiers
        .filter((d) => memeNom(ingenieurResponsable(d), choisi))
        .filter((d) => !recherche || `${d.nom_dossier} ${d.nom_operation} ${d.client}`.toLowerCase().includes(recherche.toLowerCase()))
        .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))
    : [];

  return (
    <div className="card">
      <div className="card-header flex-wrap gap-3">
        <p className="card-title">
          <Icon name="users" size={15} className="text-ink/40" />
          Charge actuelle par ingénieur
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-ink/50 mr-2">
            <strong className="text-ink">{occupes}</strong> / {ingenieurs.length} occupés
          </span>
          <select className="input input-sm w-56" value={choisi} onChange={(e) => setChoisi(e.target.value)} aria-label="Filtrer par ingénieur">
            <option value="">Tous les ingénieurs</option>
            {ingenieurs.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
          {choisi && (
            <button className="btn-ghost btn-xs" onClick={() => setChoisi("")}>
              <Icon name="x" size={12} />
              Effacer
            </button>
          )}
        </div>
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
            {visibles.map((ing) => {
              const d = dossierDe(ing);
              const h = heuresDepuis(d);
              return (
                <tr key={ing} className="cursor-pointer" onClick={() => setChoisi(choisi === ing ? "" : ing)} title="Voir ses dossiers">
                  <td>
                    <span className="flex items-center gap-2 font-semibold capitalize">
                      <Avatar nom={ing} taille={26} />
                      {ing}
                    </span>
                  </td>
                  <td className="font-medium">{d?.nom_dossier || <span className="badge badge-neutral">Disponible</span>}</td>
                  <td className="text-ink/70">{d?.nom_operation || "—"}</td>
                  <td className="text-ink/70">{d?.client || "—"}</td>
                  <td className="text-ink/55">{d?.nature_prod || "—"}</td>
                  <td className="text-right tabular text-ink/60">{h === null ? "—" : formatDuree(h)}</td>
                </tr>
              );
            })}
            {visibles.length === 0 && (
              <tr>
                <td colSpan={6} className="table-empty">
                  Aucun ingénieur.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {choisi && (
        <div className="border-t border-line">
          <div className="px-5 py-3 flex flex-wrap items-center gap-2">
            <p className="font-semibold text-sm flex-1">
              Dossiers de <span className="capitalize">{choisi}</span> <span className="text-ink/45 font-normal">({siens.length}, sur la période filtrée)</span>
            </p>
            <input className="input input-sm w-48" placeholder="Rechercher…" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
            <button className="btn-secondary btn-sm" onClick={() => exporterDossiers(siens, `HILLSOLUTION_${choisi.replace(/\s+/g, "_")}`)} disabled={!siens.length}>
              <Icon name="download" size={14} />
              Exporter
            </button>
          </div>
          <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Dossier</th>
                  <th>Client</th>
                  <th>Fiche</th>
                  <th>Nature</th>
                  <th>Statut</th>
                  <th>Retours</th>
                  <th>Audité par</th>
                </tr>
              </thead>
              <tbody>
                {siens.map((d) => (
                  <tr key={d.id}>
                    <td className="whitespace-nowrap">{formatDate(d.date)}</td>
                    <td className="font-medium">{d.nom_dossier}</td>
                    <td>{d.client || "—"}</td>
                    <td>{d.nom_operation || "—"}</td>
                    <td>{d.nature_prod || "—"}</td>
                    <td>
                      <StatutDossier dossier={d} />
                    </td>
                    <td>
                      {d.nb_retours ? (
                        <span className="flex items-center gap-1.5">
                          {d.nb_retours} <BadgeTypeRetour dossier={d} court />
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="capitalize">{d.valide_par || "—"}</td>
                  </tr>
                ))}
                {siens.length === 0 && (
                  <tr>
                    <td colSpan={8} className="table-empty">
                      Aucun dossier sur la période.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
