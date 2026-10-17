"use client";
import Leaderboard from "@/components/Leaderboard";
import TopCausesChart from "@/components/TopCausesChart";
import KPICard from "@/components/KPICard";
import Avatar from "@/components/ui/Avatar";
import Icon from "@/components/ui/Icon";
import { Badge } from "@/components/ui/StatutBadge";
import { grouperParIngenieur, calculerStatsIngenieur, topCausesRetour, topCausesDepuisRetours } from "@/lib/scoring";

const TON_ATTEINTE = {
  Atteint: "green",
  "Partiellement atteint": "gold",
  "Non atteint": "red",
};

function Score({ valeur, max }) {
  if (valeur === null || valeur === undefined) return <span className="text-ink/25">—</span>;
  const pct = Math.max(0, Math.min(100, (valeur / max) * 100));
  const couleur = pct >= 80 ? "bg-isoGreen" : pct >= 50 ? "bg-[#D09A2E]" : "bg-isoRed";
  return (
    <div className="flex items-center gap-2 justify-end">
      <div className="w-12 h-1.5 rounded-full bg-ink/[0.06] overflow-hidden">
        <div className={`h-full rounded-full ${couleur}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="font-semibold tabular w-7 text-right">{Math.round(valeur)}</span>
    </div>
  );
}

/**
 * Rubrique « Statistiques agents » du Dashboard : scores qualité / productivité
 * par ingénieur, classement et top causes de retour, sur les dossiers filtrés.
 */
export default function StatistiquesAgents({ dossiers: filtres_, objectifs, retours }) {
  const parIngenieur = grouperParIngenieur(filtres_);
  // Retours rattachés aux dossiers de la période filtrée
  const idsFiltres = new Set(filtres_.map((d) => d.id));
  const retoursFiltres = retours ? retours.filter((r) => idsFiltres.has(r.dossier_id)) : null;
  const lignes = Object.entries(parIngenieur).map(([ingenieur, dossiersIng]) => ({
    ingenieur,
    stats: calculerStatsIngenieur(
      dossiersIng,
      objectifs[ingenieur],
      retoursFiltres ? retoursFiltres.filter((r) => r.ingenieur === ingenieur) : undefined
    ),
  }));

  const totalTraite = lignes.reduce((s, l) => s + l.stats.dossierTraiteTotal, 0);
  const totalRetInt = lignes.reduce((s, l) => s + l.stats.nbRetourInterne, 0);
  const totalRetCli = lignes.reduce((s, l) => s + l.stats.nbRetourClient, 0);
  const scores = lignes.map((l) => l.stats.scoreGlobal).filter((v) => v !== null && v !== undefined);
  const scoreMoyen = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;

  return (
    <>
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <KPICard label="Dossiers audités" value={totalTraite} accent="brand" icone="folder" />
          <KPICard label="Retours internes" value={totalRetInt} accent="gold" icone="undo" />
          <KPICard label="Retours client" value={totalRetCli} accent="red" icone="building" />
          <KPICard label="Score global moyen" value={scoreMoyen ?? "—"} accent="green" icone="trophy" />
        </section>

        <div className="card overflow-x-auto mb-6">
          <div className="card-header">
            <p className="card-title">
              <Icon name="users" size={15} className="text-ink/40" />
              Détail par ingénieur
            </p>
            <span className="text-xs text-ink/45">Seuls les dossiers audités comptent · chaque retour compte · qualité /50, productivité /50</span>
          </div>
          <table className="table table-hover [&_td]:px-2.5 [&_th]:px-2.5 [&_th]:tracking-normal">
            <thead>
              <tr>
                <th>Ingénieur</th>
                <th className="!text-right">Objectif</th>
                <th className="!text-right">Nv. dossier</th>
                <th className="!text-right">Modif.</th>
                <th className="!text-right">Total</th>
                <th>Atteinte</th>
                <th className="!text-right">Ret. int.</th>
                <th className="!text-right">Ret. client</th>
                <th className="!text-right">Délai moy.</th>
                <th className="!text-right">Qualité</th>
                <th className="!text-right">Product.</th>
                <th className="!text-right">Global</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {lignes.map(({ ingenieur, stats }) => (
                <tr key={ingenieur}>
                  <td>
                    <span className="flex items-center gap-2 font-semibold capitalize whitespace-nowrap">
                      <Avatar nom={ingenieur} taille={26} />
                      {ingenieur}
                    </span>
                  </td>
                  <td className="text-right text-ink/50">
                    {objectifs[ingenieur]
                      ? `${objectifs[ingenieur].objectif_nv_dossier}/${objectifs[ingenieur].objectif_modif}`
                      : "—"}
                  </td>
                  <td className="text-right">{stats.nvDossierTraite}</td>
                  <td className="text-right">{stats.modifTraite}</td>
                  <td className="text-right font-semibold">{stats.dossierTraiteTotal}</td>
                  <td>
                    <Badge ton={TON_ATTEINTE[stats.statutAtteinte] || "neutral"} dot>
                      {stats.statutAtteinte}
                    </Badge>
                  </td>
                  <td className={`text-right ${stats.nbRetourInterne ? "text-isoGold-dark font-semibold" : "text-ink/40"}`}>
                    {stats.nbRetourInterne}
                  </td>
                  <td className={`text-right ${stats.nbRetourClient ? "text-isoRed-dark font-semibold" : "text-ink/40"}`}>
                    {stats.nbRetourClient}
                  </td>
                  <td className="text-right text-ink/65 whitespace-nowrap">
                    {stats.delaiMoyenJours !== null ? `${stats.delaiMoyenJours.toFixed(1)} j` : "—"}
                  </td>
                  <td>
                    <Score valeur={stats.scoreQualite} max={50} />
                  </td>
                  <td>
                    <Score valeur={stats.scoreProductivite} max={50} />
                  </td>
                  <td className="text-right">
                    {stats.scoreGlobal !== null ? (
                      <span className="inline-flex items-center justify-center min-w-[44px] h-7 px-2 rounded-lg bg-brand-50 text-brand-700 font-display font-extrabold">
                        {stats.scoreGlobal.toFixed(0)}
                      </span>
                    ) : (
                      <span className="text-ink/25">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {lignes.length === 0 && (
                <tr>
                  <td colSpan={12} className="table-empty">Aucune donnée pour ces filtres.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <Leaderboard classement={lignes} />
          <TopCausesChart data={retoursFiltres ? topCausesDepuisRetours(retoursFiltres) : topCausesRetour(filtres_)} />
        </div>
    </>
  );
}
