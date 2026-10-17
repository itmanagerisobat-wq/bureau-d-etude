"use client";
import { useMemo, useState } from "react";
import Icon from "@/components/ui/Icon";
import Avatar from "@/components/ui/Avatar";
import EmptyState from "@/components/ui/EmptyState";
import { StatutDossier, BadgeTypeRetour } from "@/components/DossierTable";
import { formatDate } from "@/lib/constants";
import { ingenieurResponsable } from "@/lib/rapportQualite";
import { exporterDossiers } from "@/lib/exportDossiers";

/**
 * Liste des dossiers par agent (tableau de bord) : un dossier de modification est
 * compté pour l'ingénieur de modif, les autres pour l'ingénieur.
 */
export default function DossiersParAgent({ dossiers }) {
  const [agent, setAgent] = useState("");
  const [recherche, setRecherche] = useState("");

  const parAgent = useMemo(() => {
    const m = new Map();
    for (const d of dossiers) {
      const nom = ingenieurResponsable(d);
      if (!nom || nom === "—") continue;
      const k = nom.toLowerCase();
      if (!m.has(k)) m.set(k, { nom, liste: [] });
      m.get(k).liste.push(d);
    }
    return [...m.values()].sort((a, b) => b.liste.length - a.liste.length);
  }, [dossiers]);

  const choisi = parAgent.find((a) => a.nom.toLowerCase() === agent.toLowerCase());
  const liste = (choisi?.liste || [])
    .filter((d) => !recherche || `${d.nom_dossier} ${d.nom_operation} ${d.client}`.toLowerCase().includes(recherche.toLowerCase()))
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));

  return (
    <div className="card">
      <div className="card-header border-b border-line flex-wrap gap-3">
        <p className="card-title">
          <Icon name="users" size={15} className="text-ink/40" />
          Dossiers par agent
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <select className="input h-9 w-56" value={agent} onChange={(e) => setAgent(e.target.value)}>
            <option value="">— Choisir un agent —</option>
            {parAgent.map((a) => (
              <option key={a.nom} value={a.nom}>
                {a.nom} ({a.liste.length})
              </option>
            ))}
          </select>
          {choisi && (
            <>
              <input className="input h-9 w-48" placeholder="Rechercher…" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
              <button className="btn-secondary h-9" onClick={() => exporterDossiers(liste, `HILLSOLUTION_${choisi.nom.replace(/\s+/g, "_")}`)}>
                <Icon name="download" size={15} />
                Exporter
              </button>
            </>
          )}
        </div>
      </div>

      {!choisi ? (
        <div className="flex flex-wrap gap-2 p-4">
          {parAgent.map((a) => (
            <button key={a.nom} onClick={() => setAgent(a.nom)} className="chip flex items-center gap-2 capitalize">
              <Avatar nom={a.nom} taille={20} />
              {a.nom}
              <span className="badge badge-brand">{a.liste.length}</span>
            </button>
          ))}
          {parAgent.length === 0 && <EmptyState texte="Aucun dossier sur la période." compact />}
        </div>
      ) : (
        <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Dossier</th>
                <th>Fiche</th>
                <th>Client</th>
                <th>Nature</th>
                <th>Statut</th>
                <th>Retours</th>
                <th>Audité par</th>
              </tr>
            </thead>
            <tbody>
              {liste.map((d) => (
                <tr key={d.id}>
                  <td className="whitespace-nowrap">{formatDate(d.date)}</td>
                  <td className="font-medium">{d.nom_dossier}</td>
                  <td>{d.nom_operation || "—"}</td>
                  <td>{d.client || "—"}</td>
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
            </tbody>
          </table>
          {liste.length === 0 && <EmptyState texte="Aucun dossier." compact />}
        </div>
      )}
    </div>
  );
}
