"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import Navbar from "@/components/Navbar";
import PageHeader from "@/components/ui/PageHeader";
import Icon from "@/components/ui/Icon";
import EmptyState from "@/components/ui/EmptyState";
import { EcranChargement, EcranErreurProfil } from "@/components/ui/Screens";
import { useAppData } from "@/lib/useAppData";
import { useIngenieurSelectionne, useValidateurSelectionne } from "@/lib/useNomSelectionne";
import { TYPES_RETOUR } from "@/lib/constants";

/**
 * Bibliothèque des erreurs : les retours marqués « utiles » par la Qualité,
 * classés par fiche CEE, + le classement des causes les plus fréquentes.
 */
export default function ErreursPage() {
  const { profile, erreurProfil, options, loading, supabase } = useAppData();
  const { nom: nomChoisi } = useIngenieurSelectionne();
  const nomIngenieur = profile?.role === "ingenieur" ? profile?.ingenieur_ref || "" : nomChoisi;
  const { nom: nomValidateur } = useValidateurSelectionne();
  const [retours, setRetours] = useState([]);
  const [fiche, setFiche] = useState("Toutes");
  const [edition, setEdition] = useState(null); // id en cours d'édition
  const [texte, setTexte] = useState("");

  async function charger() {
    const { data } = await supabase
      .from("dossier_retours")
      .select("id, cause, type, operation, commentaire, explication, bibliotheque, created_at")
      .order("created_at", { ascending: false })
      .limit(5000);
    setRetours(data || []);
  }

  useEffect(() => {
    if (profile) charger();
  }, [profile]);

  if (erreurProfil) return <EcranErreurProfil message={erreurProfil} />;
  if (loading || !profile) return <EcranChargement />;

  const peutModifier = ["admin", "qualite"].includes(profile.role);
  const nomAffiche = profile.role === "ingenieur" ? nomIngenieur : profile.nom_complet || nomValidateur;

  const filtres = retours.filter((r) => fiche === "Toutes" || r.operation === fiche);
  const bibliotheque = filtres.filter((r) => r.bibliotheque);

  const compte = {};
  for (const r of filtres) compte[r.cause] = (compte[r.cause] || 0) + 1;
  const top = Object.entries(compte)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  const max = top[0]?.[1] || 1;

  const parFiche = {};
  for (const r of bibliotheque) {
    const f = r.operation || "Sans fiche";
    if (!parFiche[f]) parFiche[f] = [];
    parFiche[f].push(r);
  }

  async function enregistrer(id) {
    const { error } = await supabase.from("dossier_retours").update({ explication: texte.trim() || null }).eq("id", id);
    if (error) return alert("Enregistrement impossible : " + error.message);
    setEdition(null);
    charger();
  }

  async function retirer(id) {
    if (!confirm("Retirer cette erreur de la bibliothèque ? (le retour reste dans les statistiques)")) return;
    await supabase.from("dossier_retours").update({ bibliotheque: false }).eq("id", id);
    charger();
  }

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

        <div className="grid lg:grid-cols-[1fr_2fr] gap-6 items-start">
          <div className="card">
            <div className="card-header border-b border-line">
              <p className="card-title">
                <Icon name="chart" size={15} className="text-ink/40" />
                Causes les plus fréquentes
              </p>
              <span className="text-xs text-ink/45">{filtres.length} retours</span>
            </div>
            {top.length === 0 ? (
              <EmptyState icone="checkCircle" texte="Aucun retour enregistré." compact />
            ) : (
              <ol className="p-4 flex flex-col gap-3">
                {top.map(([cause, n], i) => (
                  <li key={cause} className="text-sm">
                    <div className="flex justify-between gap-2 mb-1">
                      <span className="font-medium">
                        <span className="text-ink/35 tabular mr-1.5">{i + 1}.</span>
                        {cause}
                      </span>
                      <span className="font-semibold tabular text-ink/60">{n}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-ink/[0.06] overflow-hidden">
                      <div className="h-full rounded-full bg-isoRed" style={{ width: `${(n / max) * 100}%` }} />
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <div className="flex flex-col gap-6">
            {Object.keys(parFiche).length === 0 && (
              <div className="card">
                <EmptyState
                  icone="list"
                  texte="La bibliothèque est vide pour l'instant."
                  sousTexte="Lors d'un retour, la Qualité coche « Ajouter à la bibliothèque des erreurs » pour les cas instructifs."
                />
              </div>
            )}
            {Object.entries(parFiche)
              .sort((a, b) => b[1].length - a[1].length)
              .map(([f, liste]) => (
                <section key={f} className="card">
                  <div className="card-header border-b border-line">
                    <p className="card-title">
                      <span className="badge badge-brand">{f}</span>
                      {liste.length} erreur(s) documentée(s)
                    </p>
                  </div>
                  <ul className="divide-y divide-line">
                    {liste.map((r) => (
                      <li key={r.id} className="px-5 py-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-semibold flex items-center gap-2 flex-wrap">
                              {r.cause}
                              <span className={`badge badge-${(TYPES_RETOUR[r.type] || TYPES_RETOUR.interne).ton}`}>
                                {(TYPES_RETOUR[r.type] || TYPES_RETOUR.interne).libelle}
                              </span>
                            </p>
                            <p className="text-xs text-ink/45 mt-0.5">{new Date(r.created_at).toLocaleDateString("fr-FR")}</p>
                          </div>
                          {peutModifier && edition !== r.id && (
                            <div className="flex gap-1 shrink-0">
                              <button
                                className="btn-ghost btn-xs"
                                onClick={() => {
                                  setEdition(r.id);
                                  setTexte(r.explication || r.commentaire || "");
                                }}
                              >
                                <Icon name="pencil" size={13} />
                                Expliquer
                              </button>
                              <button className="btn-ghost btn-xs text-isoRed" onClick={() => retirer(r.id)}>
                                Retirer
                              </button>
                            </div>
                          )}
                        </div>
                        {edition === r.id ? (
                          <div className="mt-3 flex flex-col gap-2">
                            <textarea
                              className="input"
                              rows={3}
                              placeholder="Ce qui était faux, et comment bien faire"
                              value={texte}
                              onChange={(e) => setTexte(e.target.value)}
                            />
                            <div className="flex justify-end gap-2">
                              <button className="btn-secondary btn-sm" onClick={() => setEdition(null)}>
                                Annuler
                              </button>
                              <button className="btn-primary btn-sm" onClick={() => enregistrer(r.id)}>
                                Enregistrer
                              </button>
                            </div>
                          </div>
                        ) : (
                          (r.explication || r.commentaire) && (
                            <p className="mt-2 text-sm text-ink/75 bg-paper rounded-lg px-3 py-2">{r.explication || r.commentaire}</p>
                          )
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
          </div>
        </div>
      </main>
    </div>
  );
}
