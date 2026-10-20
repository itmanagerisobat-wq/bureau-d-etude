"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import Navbar from "@/components/Navbar";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";
import TuilesCockpit from "@/components/TuilesCockpit";
import { serieCompte, ecartHier } from "@/lib/series";
import { EcranChargement, EcranErreurProfil } from "@/components/ui/Screens";
import { useAppData } from "@/lib/useAppData";
import { useIngenieurSelectionne, useValidateurSelectionne } from "@/lib/useNomSelectionne";

/**
 * Bibliothèque des erreurs : chiffres des retours et classement des causes les plus fréquentes.
 * (Les explications documentées restent visibles par l'ingénieur sur son dossier en cours.)
 */
export default function ErreursPage() {
  const { profile, erreurProfil, options, loading, supabase } = useAppData();
  const { nom: nomChoisi } = useIngenieurSelectionne();
  const nomIngenieur = profile?.role === "ingenieur" ? profile?.ingenieur_ref || "" : nomChoisi;
  const { nom: nomValidateur } = useValidateurSelectionne();
  const [retours, setRetours] = useState([]);
  const [fiche, setFiche] = useState("Toutes");

  async function charger() {
    const { data } = await supabase
      .from("dossier_retours")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(5000);
    setRetours((data || []).filter((r) => r.annule !== true)); // retours annulés : hors statistiques
  }

  useEffect(() => {
    if (profile) charger();
  }, [profile]);

  if (erreurProfil) return <EcranErreurProfil message={erreurProfil} />;
  if (loading || !profile) return <EcranChargement />;

  const nomAffiche = profile.role === "ingenieur" ? nomIngenieur : profile.nom_complet || nomValidateur;

  const filtres = retours.filter((r) => fiche === "Toutes" || r.operation === fiche);
  const bibliotheque = filtres.filter((r) => r.bibliotheque);

  const compte = {};
  for (const r of filtres) compte[r.cause] = (compte[r.cause] || 0) + 1;
  const top = Object.entries(compte)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  const max = top[0]?.[1] || 1;

  return (
    <div className="min-h-screen">
      <Navbar role={profile.role} nom={nomAffiche} />
      <main className="max-w-[1800px] mx-auto px-3 sm:px-4 lg:px-5 py-6">
        <PageHeader
          icone="alert"
          titre="Bibliothèque des erreurs"
          sousTitre="Les erreurs à connaître, par fiche CEE — pour les éviter avant l'envoi au contrôle."
          actions={
            <select className="input w-48" value={fiche} onChange={(e) => setFiche(e.target.value)}>
              <option>Toutes</option>
              {options.operations.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          }
        />

        {(() => {
          const mois = new Date().toLocaleDateString("sv-SE").slice(0, 7);
          const duMois = filtres.filter((r) => String(r.created_at || "").slice(0, 7) === mois);
          const serie = serieCompte(filtres, "created_at");
          const ec = ecartHier(serie);
          const parOp = {};
          for (const r of duMois) parOp[r.operation || "Sans fiche"] = (parOp[r.operation || "Sans fiche"] || 0) + 1;
          const fichePire = Object.entries(parOp).sort((a, b) => b[1] - a[1])[0];
          return (
            <TuilesCockpit
              items={[
                { label: "Retours ce mois", valeur: duMois.length, note: `${serie[6]} aujourd'hui`, ton: serie[6] > serie[5] ? "rouge" : "vert", serie, actif: true },
                { label: "Erreurs documentées", valeur: bibliotheque.length, note: "dans la bibliothèque", serie: serieCompte(bibliotheque, "created_at") },
                { label: "Fiche la plus touchée", valeur: fichePire ? fichePire[0] : "—", note: fichePire ? `${fichePire[1]} retour(s) ce mois` : "aucun retour", ton: fichePire ? "rouge" : "neutre", serie: [] },
                { label: "Cause n° 1", valeur: top[0] ? top[0][0] : "—", note: top[0] ? `${top[0][1]} retour(s)` : "", serie: [] },
              ]}
            />
          );
        })()}

        <div className="card">
          <div className="card-header border-b border-line">
            <p className="card-title">Causes les plus fréquentes</p>
            <span className="text-xs text-ink/45">{filtres.length} retours</span>
          </div>
          {top.length === 0 ? (
            <EmptyState icone="checkCircle" texte="Aucun retour enregistré." compact />
          ) : (
            <ol className="p-5 grid md:grid-cols-2 gap-x-10 gap-y-4">
              {top.map(([cause, n], i) => (
                <li key={cause} className="text-sm">
                  <div className="flex justify-between gap-2 mb-1.5">
                    <span className="font-medium">
                      <span className="text-ink/45 tabular mr-1.5">{i + 1}.</span>
                      {cause}
                    </span>
                    <span className="font-semibold tabular text-ink/70">{n}</span>
                  </div>
                  <div className="h-2.5 rounded-r bg-paper overflow-hidden">
                    <div className="h-full rounded-r" style={{ width: `${(n / max) * 100}%`, background: i === 0 ? "#1F6FA8" : "#7FB0D9" }} />
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </main>
    </div>
  );
}
