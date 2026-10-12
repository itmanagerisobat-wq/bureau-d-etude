"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import FilterBar from "@/components/FilterBar";
import KPICard from "@/components/KPICard";
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
import DossiersParAgent from "@/components/DossiersParAgent";

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
        />
        </div>

        <div className="flex gap-1 mb-6 border-b border-line no-print">
          {[
            ["apercu", "Vue d'ensemble", "dashboard"],
            ["stats", "Statistiques agents", "chart"],
            ["rapport", "Rapport qualité", "shield"],
          ].map(([v, label, icone]) => (
            <button
              key={v}
              onClick={() => setOnglet(v)}
              className={`flex items-center gap-2 px-4 h-11 -mb-px border-b-2 text-sm font-semibold transition-colors ${
                onglet === v ? "border-brand-500 text-brand-600" : "border-transparent text-ink/55 hover:text-ink"
              }`}
            >
              <Icon name={icone} size={16} />
              {label}
            </button>
          ))}
        </div>

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

        {/* Indicateurs, dans l'ordre du circuit d'un dossier */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <KPICard label="Dans la file" value={parEtat(S.FILE)} accent="neutral" icone="inbox" />
          <KPICard label="À faire (pas commencés)" value={parEtat(S.ASSIGNE)} accent="neutral" icone="user" />
          <KPICard label="En cours (ingénieurs)" value={parEtat(S.EN_COURS)} accent="brand" icone="pencil" />
          <KPICard label="En attente d'info" value={parEtat(S.ATTENTE_INFO)} accent="gold" icone="clock" />
          <KPICard label="À contrôler" value={parEtat(S.A_CONTROLER) + parEtat("En cours de vérification")} accent="gold" icone="shield" />
          <KPICard label="Audités" value={parEtat(S.VALIDE)} accent="green" icone="checkCircle" />
          <KPICard label="Total dossiers" value={filtres_.length} accent="brand" icone="folder" />
          <KPICard
            label="Délai moyen de contrôle"
            value={delaiVerif !== null ? formatDuree(delaiVerif) : "—"}
            accent="gold"
            icone="target"
          />
        </section>

        <div className="mb-6">
          <AlertesQualite dossiers={filtres_} />
        </div>

        <div className="mb-6">
          <ChargeParIngenieurTable ingenieurs={options.ingenieurs} dossiersEnCours={enCoursIngenieurs} />
        </div>

        <div className="mb-6">
          <DossiersParAgent dossiers={filtres_} />
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

        {/* Accès rapide aux graphiques */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {GRAPHIQUES.map((g) => (
            <button
              key={g.type}
              onClick={() => setGraphiqueOuvert(g.type)}
              className="card p-4 flex items-center gap-3 text-left hover:border-brand-300 hover:shadow-md transition"
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
        </>
        )}
      </main>

      {graphiqueOuvert && (
        <GraphiquePopup type={graphiqueOuvert} dossiers={filtres_} onFermer={() => setGraphiqueOuvert(null)} />
      )}
    </div>
  );
}
