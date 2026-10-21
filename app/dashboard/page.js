"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import FilterBar from "@/components/FilterBar";
import GraphiquePopup from "@/components/GraphiquePopup";
import VueEnsemble from "@/components/VueEnsemble";
import ProductionEnCeMoment, { FiltreEquipe } from "@/components/ProductionEnCeMoment";
import FiltrePeriode, { FiltreFiche } from "@/components/FiltrePeriode";
import { libellePeriode } from "@/lib/periode";
import { chargerVerifications, debutHistorique, listeVerifications } from "@/lib/verifications";
import PageHeader from "@/components/ui/PageHeader";
import Icon from "@/components/ui/Icon";
import { gardePage } from "@/components/ui/Screens";
import { useAppData, appliquerFiltres, FILTRES_INITIAUX } from "@/lib/useAppData";
import { useValidateurActif } from "@/lib/useValidateurActif";
import { useRafraichissement } from "@/lib/useRafraichissement";
import { useTempsReel } from "@/lib/useTempsReel";
import StatistiquesAgents from "@/components/StatistiquesAgents";
import RapportQualite from "@/components/RapportQualite";

export default function DashboardPage() {
  const { profile, erreurProfil, options, loading, supabase } = useAppData();
  const { nom: nomSelectionne, pret: pretPersonne, selectionner, changerDePersonne, validateurs } =
    useValidateurActif(profile, supabase);
  const estAdmin = profile?.role === "admin";
  // Admin et Qualité ont chacun leur propre compte : pas de code PIN
  const nominatif = ["admin", "qualite"].includes(profile?.role);
  const nomActif = nominatif ? profile?.nom_complet : nomSelectionne;

  const router = useRouter();

  const [dossiers, setDossiers] = useState([]);
  const [filtres, setFiltres] = useState(FILTRES_INITIAUX);
  const [graphiqueOuvert, setGraphiqueOuvert] = useState(null);
  const [onglet, setOnglet] = useState("apercu"); // apercu | live | stats | rapport
  const [periode, setPeriode] = useState({ type: "mois", jour: "" });
  const [fiche, setFiche] = useState("Tous");
  const [equipe, setEquipe] = useState("tous");
  const [objectifs, setObjectifs] = useState({});
  const [retours, setRetours] = useState(null);
  const [verifs, setVerifs] = useState(null); // chaque audit compte, même si le dossier revient
  const [delaiMax, setDelaiMax] = useState(8);

  useEffect(() => {
    try {
      const o = new URLSearchParams(window.location.search).get("onglet");
      if (["live", "stats", "rapport"].includes(o)) setOnglet(o);
    } catch {}
  }, []);

  async function chargerTout() {
    {
      const [{ data }, { data: objs }, ret] = await Promise.all([
        supabase.from("dossiers").select("*").order("date", { ascending: false }).limit(10000),
        supabase.from("objectifs").select("*"),
        supabase.from("dossier_retours").select("*").limit(20000),
        supabase
          .from("parametres_config")
          .select("delai_max_traitement_heures")
          .limit(1)
          .maybeSingle()
          .then((r) => r.data?.delai_max_traitement_heures && setDelaiMax(r.data.delai_max_traitement_heures)),
      ]);
      setDossiers(data || []);
      const map = {};
      (objs || []).forEach((o) => (map[o.ingenieur] = o));
      setObjectifs(map);
      // Sans la migration v9, les statistiques retombent sur les anciens indicateurs.
      // Les retours annulés (erreur Qualité) ne comptent pas dans les statistiques
      setRetours(ret.error ? null : (ret.data || []).filter((r) => r.annule !== true));
      setVerifs(await chargerVerifications(supabase, debutHistorique()));
    }
  }

  useEffect(() => {
    if (profile) chargerTout();
  }, [profile]);
  useRafraichissement(chargerTout, !!profile);
  useTempsReel(supabase, ["dossiers"], chargerTout, !!profile);

  const ecran = gardePage({ erreurProfil, loading, profile, estAdmin: nominatif, pretPersonne, nomActif, validateurs, selectionner });
  if (ecran) return ecran;

  const filtres_ = appliquerFiltres(dossiers, filtres);
  const sousTitre = {
    apercu: `Nouveaux dossiers, modifications et retours · ${libellePeriode(periode)} · ${fiche === "Tous" ? "toutes les fiches" : fiche}.`,
    live: "Qui fait quoi en ce moment, ingénieurs et service qualité.",
    stats: "Statistiques par agent et par opération.",
    rapport: "Rapport de contrôle qualité et classement des ingénieurs.",
  }[onglet];

  return (
    <div className="min-h-screen">
      <Navbar role={profile.role} nom={nomActif} onChangerPersonne={nominatif ? undefined : changerDePersonne} />
      <main className="max-w-[1800px] mx-auto px-3 sm:px-4 lg:px-5 py-6">
        <div className="no-print">
        <PageHeader
          icone="dashboard"
          titre="Tableau de bord"
          sousTitre={sousTitre}
          actions={
            <>
              <button onClick={() => setGraphiqueOuvert("evolution")} className="btn-secondary">
                <Icon name="chart" size={16} />
                Graphiques
              </button>
              <button onClick={() => router.push("/saisie")} className="btn-primary">
                <Icon name="plus" size={16} />
                Nouveau dossier
              </button>
            </>
          }
        >
          <div className="onglets-hero flex flex-wrap gap-1 -mb-2 mt-2 border-b border-white/25">
            {[
              ["apercu", "Vue d'ensemble", "dashboard"],
              ["live", "Production en ce moment", "users"],
              ["stats", "Statistiques agents", "chart"],
              ["rapport", "Rapport qualité", "shield"],
            ].map(([v, label, icone]) => (
              <button
                key={v}
                onClick={() => setOnglet(v)}
                aria-current={onglet === v ? "page" : undefined}
                className="flex items-center gap-2 px-4 h-11 border-b-2 -mb-px text-sm font-semibold transition-colors whitespace-nowrap"
              >
                {v === "live" ? <i className="w-2 h-2 rounded-full bg-[#7DDB6A] inline-block" aria-hidden="true" /> : <Icon name={icone} size={16} />}
                {label}
              </button>
            ))}
          </div>
          {(onglet === "apercu" || onglet === "live") && (
            <div className="filtres-hero">
              {onglet === "live" && (
                <>
                  <span>Équipe</span>
                  <FiltreEquipe valeur={equipe} onChange={setEquipe} grand />
                </>
              )}
              <span className={onglet === "live" ? "sm:ml-3" : ""}>Fiche CEE</span>
              <FiltreFiche operations={options.operations} valeur={fiche} onChange={setFiche} grand />
              {onglet === "apercu" && (
                <span className="flex items-center gap-3 lg:ml-auto">
                  <span>Période</span>
                  <FiltrePeriode valeur={periode} onChange={setPeriode} grand />
                </span>
              )}
            </div>
          )}
        </PageHeader>
        </div>


        {onglet === "apercu" && <VueEnsemble dossiers={dossiers} retours={retours} verifications={listeVerifications(dossiers, verifs)} options={options} periode={periode} fiche={fiche} />}

        {onglet === "live" && <ProductionEnCeMoment dossiers={dossiers} verifications={listeVerifications(dossiers, verifs)} options={options} supabase={supabase} delaiMax={delaiMax} equipe={equipe} fiche={fiche} />}

        {onglet === "stats" && (
          <>
            <FilterBar filtres={filtres} setFiltres={setFiltres} options={options} />
            <StatistiquesAgents dossiers={filtres_} objectifs={objectifs} retours={retours} />
          </>
        )}

        {onglet === "rapport" && <RapportQualite supabase={supabase} options={options} />}
      </main>

      {graphiqueOuvert && (
        <GraphiquePopup type={graphiqueOuvert} dossiers={onglet === "stats" ? filtres_ : dossiers.filter((d) => fiche === "Tous" || d.nom_operation === fiche)} onFermer={() => setGraphiqueOuvert(null)} />
      )}
    </div>
  );
}
