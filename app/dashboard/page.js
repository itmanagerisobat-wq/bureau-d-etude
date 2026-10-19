"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import FilterBar from "@/components/FilterBar";
import { BandeChiffres } from "@/components/KPICard";
import TuilesCockpit from "@/components/TuilesCockpit";
import { serieCompte, serieMoyenne, ecartHier } from "@/lib/series";
import AlertesQualite from "@/components/AlertesQualite";
import ChargeDetaillee from "@/components/ChargeDetaillee";
import ChargeParIngenieurTable from "@/components/ChargeParIngenieurTable";
import GraphiquePopup, { GRAPHIQUES } from "@/components/GraphiquePopup";
import HeatmapHebdo from "@/components/HeatmapHebdo";
import NavigationOnglets from "@/components/NavigationOnglets";
import PageHeader from "@/components/ui/PageHeader";
import Icon from "@/components/ui/Icon";
import { gardePage } from "@/components/ui/Screens";
import { useAppData, appliquerFiltres, FILTRES_INITIAUX } from "@/lib/useAppData";
import { useValidateurActif } from "@/lib/useValidateurActif";
import { delaiMoyenVerification, repartitionParJourSemaine } from "@/lib/scoring";
import { formatDuree, S } from "@/lib/constants";
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
  const [onglet, setOnglet] = useState("apercu"); // apercu | stats | rapport
  const [objectifs, setObjectifs] = useState({});
  const [retours, setRetours] = useState(null);
  const [delaiMax, setDelaiMax] = useState(8);

  useEffect(() => {
    try {
      const o = new URLSearchParams(window.location.search).get("onglet");
      if (["stats", "rapport"].includes(o)) setOnglet(o);
    } catch {}
  }, []);

  useEffect(() => {
    if (!profile) return;
    (async () => {
      const [{ data }, { data: objs }, ret] = await Promise.all([
        supabase.from("dossiers").select("*").order("date", { ascending: false }).limit(10000),
        supabase.from("objectifs").select("*"),
        supabase.from("dossier_retours").select("dossier_id, type, cause, ingenieur").limit(20000),
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
      setRetours(ret.error ? null : ret.data || []);
    })();
  }, [profile]);

  const ecran = gardePage({ erreurProfil, loading, profile, estAdmin: nominatif, pretPersonne, nomActif, validateurs, selectionner });
  if (ecran) return ecran;

  const filtres_ = appliquerFiltres(dossiers, filtres);
  const parEtat = (etat) => filtres_.filter((d) => d.etat === etat).length;
  const delaiVerif = delaiMoyenVerification(filtres_);

  const enCoursIngenieurs = filtres_.filter((d) => d.etat === S.EN_COURS);
  const assignesEnAttente = filtres_.filter((d) => d.etat === S.ASSIGNE);
  const bloques = filtres_.filter((d) => d.etat === S.ATTENTE_INFO);

  return (
    <div className="min-h-screen">
      <Navbar role={profile.role} nom={nomActif} onChangerPersonne={nominatif ? undefined : changerDePersonne} />
      <main className="max-w-[1800px] mx-auto px-3 sm:px-4 lg:px-5 py-6">
        <div className="no-print">
        <PageHeader
          icone="dashboard"
          titre="Tableau de bord"
          sousTitre={
            <>
              Bonjour <span className="capitalize font-medium text-ink/80">{nomActif}</span> — vue d'ensemble de la production.
            </>
          }
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
          <div className="onglets-hero flex gap-1 -mb-2 mt-2">
            {[
              ["apercu", "Vue d'ensemble", "dashboard"],
              ["stats", "Statistiques agents", "chart"],
              ["rapport", "Rapport qualité", "shield"],
            ].map(([v, label, icone]) => (
              <button
                key={v}
                onClick={() => setOnglet(v)}
                aria-current={onglet === v ? "page" : undefined}
                className="flex items-center gap-2 px-4 h-11 border-b-2 text-sm font-semibold transition-colors"
              >
                <Icon name={icone} size={16} />
                {label}
              </button>
            ))}
          </div>
        </PageHeader>
        </div>


        {onglet === "apercu" && (() => {
          const audites = filtres_.filter((d) => d.etat === S.VALIDE);
          const pc = audites.length ? Math.round((audites.filter((d) => !d.nb_retours).length / audites.length) * 100) : null;
          const traites = serieCompte(dossiers, "date_verification", (d) => d.etat === S.VALIDE);
          const clients = filtres_.filter((d) => d.retour_client);
          const ec = ecartHier(traites);
          return (
            <TuilesCockpit
              items={[
                { label: "Dossiers audités", valeur: audites.length, note: `${traites[6]} aujourd'hui`, ton: ec.ton, serie: traites, actif: true },
                { label: "Audités du premier coup", valeur: pc === null ? "—" : `${pc} %`, note: "filtres choisis", serie: serieMoyenne(dossiers.filter((d) => d.etat === S.VALIDE), "date_verification", (d) => (d.nb_retours ? 0 : 100)) },
                {
                  label: "Délai moyen de contrôle",
                  valeur: delaiVerif !== null ? formatDuree(delaiVerif) : "—",
                  note: "Terminé → audit",
                  serie: serieMoyenne(dossiers.filter((d) => d.date_verification && d.date_soumission), "date_verification", (d) => (new Date(d.date_verification) - new Date(d.date_soumission)) / 3600000),
                },
                { label: "Retours clients", valeur: clients.length, note: `${filtres_.filter((d) => d.etat === S.PAS_DE_MODIF).length} « pas de modif »`, serie: serieCompte(dossiers, "date_retour_client", (d) => d.retour_client) },
              ]}
            />
          );
        })()}

        {onglet !== "rapport" && <FilterBar filtres={filtres} setFiltres={setFiltres} options={options} />}

        {onglet === "rapport" ? (
          <RapportQualite supabase={supabase} options={options} />
        ) : onglet === "stats" ? (
          <StatistiquesAgents dossiers={filtres_} objectifs={objectifs} retours={retours} />
        ) : (
        <>

        <NavigationOnglets
          operations={options.operations}
          operationActive={filtres.operation}
          onChange={(op) => setFiltres((f) => ({ ...f, operation: op }))}
        />

        {/* Accès rapide aux graphiques */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {GRAPHIQUES.map((g) => (
            <button
              key={g.type}
              onClick={() => setGraphiqueOuvert(g.type)}
              className="card px-4 py-3.5 flex items-center gap-3 text-left hover:border-brand-300 transition-colors"
            >
              <span className="w-9 h-9 rounded-lg bg-brand-50 text-brand-500 flex items-center justify-center shrink-0">
                <Icon name={g.icone} size={17} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{g.label}</span>
                <span className="block text-xs text-ink/45 truncate">{g.sousTitre}</span>
              </span>
            </button>
          ))}
        </section>

        {/* Indicateurs, dans l'ordre du circuit d'un dossier */}
        <section className="mb-6">
          <BandeChiffres
            items={(() => {
              const fileD = filtres_.filter((d) => d.etat === S.FILE);
              const vieux = fileD.length ? Math.max(...fileD.map((d) => (Date.now() - new Date(d.date_mise_en_file || d.created_at).getTime()) / 3600000)) : null;
              const audites = filtres_.filter((d) => d.etat === S.VALIDE);
              const pc = audites.length ? Math.round((audites.filter((d) => !d.nb_retours).length / audites.length) * 100) : null;
              return [
                { label: "Dans la file", value: parEtat(S.FILE), sous: vieux !== null ? `plus ancien : ${formatDuree(vieux)}` : "file vide" },
                { label: "À faire (pas commencés)", value: parEtat(S.ASSIGNE), sous: `${assignesEnAttente.filter((d) => d.a_corriger).length} retour(s) à corriger` },
                { label: "En cours (ingénieurs)", value: parEtat(S.EN_COURS), sous: `${new Set(enCoursIngenieurs.map((d) => d.ingenieur)).size} ingénieur(s) occupé(s)` },
                { label: "En attente d'info", value: parEtat(S.ATTENTE_INFO), sous: parEtat(S.ATTENTE_INFO) ? "dossiers bloqués" : "aucun blocage", alerte: parEtat(S.ATTENTE_INFO) > 0 },
                { label: "À contrôler", value: parEtat(S.A_CONTROLER) + parEtat("En cours de vérification"), sous: `dont ${parEtat("En cours de vérification")} en vérification` },
                { label: "Audités", value: parEtat(S.VALIDE), sous: pc !== null ? `${pc} % du premier coup` : null, ton: "green" },
                { label: "Total dossiers", value: filtres_.length, sous: "sur les filtres choisis" },
                { label: "Délai moyen de contrôle", value: delaiVerif !== null ? formatDuree(delaiVerif) : "—", sous: "entre « Terminé » et l'audit" },
              ];
            })()}
          />
        </section>

        <div className="mb-6">
          <AlertesQualite dossiers={filtres_} />
        </div>

        <div className="mb-6">
          <ChargeParIngenieurTable supabase={supabase} delaiMax={delaiMax} ingenieurs={options.ingenieursAssignables || options.ingenieurs} dossiersEnCours={enCoursIngenieurs} dossiers={filtres_} />
        </div>

        <div className="grid lg:grid-cols-3 gap-6 mb-6">
          <HeatmapHebdo data={repartitionParJourSemaine(filtres_)} />
          <ChargeDetaillee
            titre="À faire — pas encore commencés"
            dossiers={assignesEnAttente}
            champPersonne="ingenieur"
            badgeTexte="en attente"
            icone="user"
          />
          <ChargeDetaillee
            titre="Bloqués en attente d'info"
            dossiers={bloques}
            champPersonne="ingenieur"
            badgeTexte="bloqués"
            icone="clock"
          />
        </div>

        </>
        )}
      </main>

      {graphiqueOuvert && (
        <GraphiquePopup type={graphiqueOuvert} dossiers={filtres_} onFermer={() => setGraphiqueOuvert(null)} />
      )}
    </div>
  );
}
