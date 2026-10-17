"use client";
import { useEffect, useState } from "react";
import { presence } from "@/lib/presence";
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
export default function ChargeParIngenieurTable({ ingenieurs, dossiersEnCours, dossiers = [], supabase, delaiMax = 8 }) {
  const [choisi, setChoisi] = useState("");
  const [recherche, setRecherche] = useState("");
  const [pres, setPres] = useState({});
  useEffect(() => {
    if (!supabase) return;
    supabase.rpc("fn_presence_ingenieurs").then(({ data }) => setPres(Object.fromEntries((data || []).map((p) => [String(p.ingenieur || "").toLowerCase(), p]))));
  }, [supabase]);
  const aujourdhui = new Date().toDateString();
  const envoyesJour = (ing) =>
    dossiers.filter((d) => memeNom(ingenieurResponsable(d), ing) && d.date_soumission && new Date(d.date_soumission).toDateString() === aujourdhui).length;

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
          L'atelier en ce moment
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
              <th>Temps passé / délai {delaiMax} h</th>
              <th className="text-right">Aujourd'hui</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((ing) => {
              const d = dossierDe(ing);
              const h = heuresDepuis(d);
              return (
                <tr key={ing} className="cursor-pointer" onClick={() => setChoisi(choisi === ing ? "" : ing)} title="Voir ses dossiers">
                  <td>
                    <span className="flex items-center gap-2.5 font-semibold capitalize">
                      {(() => {
                        const p = presence(pres[String(ing).toLowerCase()]);
                        return supabase ? (
                          <span className="w-[9px] h-[9px] rounded-full shrink-0" style={{ background: p.couleur, boxShadow: p.cle === "on" ? `0 0 0 3px ${p.couleur}22` : undefined }} title={p.libelle} />
                        ) : null;
                      })()}
                      <Avatar nom={ing} taille={24} />
                      {ing}
                    </span>
                  </td>
                  <td>{d ? <span className="nom-dossier-sm">{d.nom_dossier}</span> : <span className="text-ink/45">Libre, aucun dossier en cours</span>}</td>
                  <td className="text-ink/70">{d?.nom_operation || "—"}</td>
                  <td className="text-ink/70">{d?.client || "—"}</td>
                  <td className="text-ink/55">{d?.nature_prod || "—"}</td>
                  <td>
                    {h === null ? (
                      <span className="text-ink/25">—</span>
                    ) : (
                      <div className={`flex flex-col gap-1 min-w-[150px] text-xs ${h >= delaiMax * 0.85 ? "text-isoGold-dark font-semibold" : "text-ink/60"}`}>
                        <span className="block h-1.5 rounded-full bg-paper overflow-hidden">
                          <span className={`block h-full rounded-full ${h >= delaiMax * 0.85 ? "bg-isoGold" : "bg-brand-500"}`} style={{ width: `${Math.min(100, (h / delaiMax) * 100)}%` }} />
                        </span>
                        {formatDuree(h)}
                        {h >= delaiMax ? ", hors délai" : h >= delaiMax * 0.85 ? ", bientôt hors délai" : ""}
                      </div>
                    )}
                  </td>
                  <td className="text-right">
                    <b className="font-display chiffre text-[17px]">{envoyesJour(ing)}</b>
                    <span className="block text-[11px] text-ink/45">envoyé(s)</span>
                  </td>
                </tr>
              );
            })}
            {visibles.length === 0 && (
              <tr>
                <td colSpan={7} className="table-empty">
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
