"use client";
import { useEffect, useMemo, useState } from "react";
import Icon from "@/components/ui/Icon";
import StatutBadge from "@/components/ui/StatutBadge";
import { formatDate, TYPES_RETOUR } from "@/lib/constants";
import { calculerRapport, anomalies, niveau, NIVEAUX, GRILLE_DEFAUT, fmtPct, ingenieurResponsable } from "@/lib/rapportQualite";

const moisCourant = () => new Date().toISOString().slice(0, 7);
const finDeMois = (m) => {
  const [a, mo] = m.split("-").map(Number);
  return new Date(Date.UTC(a, mo, 0)).toISOString().slice(0, 10);
};
const fr = (iso) => (iso ? iso.split("-").reverse().join("/") : "");
const libOp = (op) => String(op).replace(/^BAR-TH-/i, "");

/* ---------------------------------------------------------------- graphiques */

function Classement({ section, grille }) {
  const lignes = section.classement;
  if (!lignes.length) return null;
  const max = Math.max(60, Math.ceil(Math.max(...lignes.map((l) => l.taux)) / 20) * 20);
  const moyenne = section.kpi.tauxMoyen;
  const H = 24;
  const G = 170; // marge gauche (noms)
  const W = 640;
  const D = 70; // marge droite (valeurs)
  const largeur = W - G - D;
  const x = (v) => G + (Math.min(v, max) / max) * largeur;
  const T = 16; // bandeau haut (libellé de la moyenne)
  const hauteur = lignes.length * H + 40 + T;
  return (
    <figure className="card p-4 bg-[#FAFAF8] avoid-break">
      <div className="flex flex-wrap justify-center gap-4 text-[11px] mb-2">
        {NIVEAUX.map((n, i) => (
          <span key={n.cle} className="flex items-center gap-1.5">
            <span className="w-4 h-2.5 rounded-sm" style={{ background: n.couleur }} />
            {n.libelle} ({["≤ " + grille.excellent, grille.excellent + " – " + grille.bon, grille.bon + " – " + grille.surveiller, "> " + grille.surveiller][i]} %)
          </span>
        ))}
      </div>
      <p className="text-center font-bold text-[#1F3A5F] text-sm mb-2">
        Classement des ingénieurs par taux de retour interne — Dossiers {libOp(section.operation)}
      </p>
      <svg viewBox={`0 0 ${W} ${hauteur}`} className="w-full h-auto max-w-3xl mx-auto block" role="img" aria-label="Classement des ingénieurs">
        <g transform={`translate(0 ${T})`}>
        {[0, 0.2, 0.4, 0.6, 0.8, 1].map((t) => (
          <g key={t}>
            <line x1={G + t * largeur} x2={G + t * largeur} y1={0} y2={lignes.length * H} stroke="#E5E7EB" />
            <text x={G + t * largeur} y={lignes.length * H + 14} fontSize="10" textAnchor="middle" fill="#555">
              {Math.round(t * max)}
            </text>
          </g>
        ))}
        {lignes.map((l, i) => (
          <g key={l.cle}>
            <text x={G - 6} y={i * H + H / 2 + 4} fontSize="11" textAnchor="end" fill="#222">
              {l.cle} (n={l.total})
            </text>
            <rect x={G} y={i * H + 5} width={Math.max(0, x(l.taux) - G)} height={H - 10} fill={niveau(l.taux, grille).couleur} />
            <text x={W - D + 8} y={i * H + H / 2 + 4} fontSize="11" fontWeight="700" fill="#222">
              {fmtPct(l.taux)}
            </text>
          </g>
        ))}
        <line x1={x(moyenne)} x2={x(moyenne)} y1={-4} y2={lignes.length * H} stroke="#333" strokeDasharray="4 3" />
        <text x={x(moyenne) + 4} y={-6} fontSize="9" textAnchor="start" fill="#555">
          Moyenne {fmtPct(moyenne)}
        </text>
        <text x={G + largeur / 2} y={hauteur - T - 4} fontSize="11" textAnchor="middle" fill="#333">
          Taux de retour interne (%)
        </text>
        </g>
      </svg>
    </figure>
  );
}

function Pareto({ pareto: toutes, total }) {
  const pareto = toutes.filter((p) => p.n > 0);
  if (!pareto.length || !total)
    return <p className="text-sm italic text-ink/55 avoid-break">Aucun retour interne sur la période : pas d'analyse de Pareto.</p>;
  const W = 640;
  const Hh = 260;
  const m = { g: 44, d: 48, h: 30, b: 46 };
  const lw = W - m.g - m.d;
  const lh = Hh - m.h - m.b;
  const maxN = Math.max(1, ...pareto.map((p) => p.n));
  const pas = lw / pareto.length;
  const yN = (n) => m.h + lh - (n / (maxN * 1.15)) * lh;
  const yP = (p) => m.h + lh - (p / 120) * lh;
  const points = pareto.map((p, i) => `${m.g + pas * i + pas / 2},${yP(p.cumul)}`).join(" ");
  return (
    <figure className="card p-4 avoid-break">
      <p className="text-center font-bold text-[#1F3A5F] text-sm mb-1">Analyse de Pareto — Causes des retours internes (n = {total})</p>
      <svg viewBox={`0 0 ${W} ${Hh}`} className="w-full h-auto max-w-3xl mx-auto block" role="img" aria-label="Pareto des causes">
        <rect x={m.g} y={m.h} width={lw} height={lh} fill="none" stroke="#333" />
        {[0, 20, 40, 60, 80, 100, 120].map((p) => (
          <g key={p}>
            <line x1={m.g} x2={m.g + lw} y1={yP(p)} y2={yP(p)} stroke="#F0F0F0" />
            <text x={m.g + lw + 6} y={yP(p) + 3} fontSize="9" fill="#555">
              {p}%
            </text>
          </g>
        ))}
        <line x1={m.g} x2={m.g + lw} y1={yP(80)} y2={yP(80)} stroke="#999" strokeDasharray="4 3" />
        <text x={m.g + lw - 4} y={yP(80) - 3} fontSize="9" textAnchor="end" fill="#999">
          seuil 80%
        </text>
        {pareto.map((p, i) => {
          const cx = m.g + pas * i + pas / 2;
          return (
            <g key={p.cause}>
              <rect x={cx - pas * 0.28} y={yN(p.n)} width={pas * 0.56} height={m.h + lh - yN(p.n)} fill="#D9453B" />
              <text x={cx} y={yN(p.n) - 14} fontSize="10" textAnchor="middle" fontWeight="700" fill="#1F3A5F">
                {p.n}
              </text>
              <text x={cx} y={yN(p.n) - 3} fontSize="9" textAnchor="middle" fill="#1F3A5F">
                ({fmtPct(p.part)})
              </text>
              <text x={cx} y={m.h + lh + 14} fontSize="10" textAnchor="middle" fill="#1F3A5F">
                {p.cause.length > 26 ? p.cause.slice(0, 25) + "…" : p.cause}
              </text>
              <circle cx={cx} cy={yP(p.cumul)} r="3.5" fill="#1F3A5F" />
              <text x={cx + 7} y={yP(p.cumul) + 12} fontSize="9" textAnchor="start" fontWeight="700" fill="#1F3A5F" stroke="#fff" strokeWidth="3" paintOrder="stroke">
                {Math.round(p.cumul)}%
              </text>
            </g>
          );
        })}
        <polyline points={points} fill="none" stroke="#1F3A5F" strokeWidth="2" />
        <text x={12} y={m.h + lh / 2} fontSize="10" fill="#1F3A5F" transform={`rotate(-90 12 ${m.h + lh / 2})`} textAnchor="middle">
          Nombre de retours internes
        </text>
      </svg>
    </figure>
  );
}

/* ---------------------------------------------------------------- tableaux */

function TableauDetail({ lignes, total, colonnes, premiereColonne, grille, avecEquipe }) {
  const autres = lignes.some((l) => l.autres) || total.autres;
  return (
    <div className="overflow-x-auto avoid-break">
      <table className="rapport-table">
        <thead>
          <tr>
            <th className="text-left">{premiereColonne}</th>
            <th>Nb. nouveaux</th>
            <th>Nb. modifiés</th>
            <th>Total traité</th>
            <th>Nb. retours internes</th>
            {colonnes.map((c) => (
              <th key={c}>{c}</th>
            ))}
            {autres && <th>Autres causes</th>}
            <th>Taux de retour %</th>
            {avecEquipe && <th>Moyenne équipe</th>}
          </tr>
        </thead>
        <tbody>
          {lignes.map((l) => (
            <tr key={l.cle}>
              <td className="text-left">{l.cle}</td>
              <td>{l.nouveaux}</td>
              <td>{l.modifies}</td>
              <td>{l.total}</td>
              <td>{l.internes}</td>
              {colonnes.map((c) => (
                <td key={c}>{l.parCause[c] || 0}</td>
              ))}
              {autres && <td>{l.autres}</td>}
              <td>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ background: niveau(l.taux, grille).couleur }} />
                  {fmtPct(l.taux, 2)}
                </span>
              </td>
              {avecEquipe && <td className="text-ink/55">{fmtPct(l.tauxEquipe)}</td>}
            </tr>
          ))}
          <tr className="total">
            <td className="text-left">TOTAL / MOYENNE</td>
            <td>{total.nouveaux}</td>
            <td>{total.modifies}</td>
            <td>{total.total}</td>
            <td>{total.internes}</td>
            {colonnes.map((c) => (
              <td key={c}>{total.parCause[c] || 0}</td>
            ))}
            {autres && <td>{total.autres}</td>}
            <td>{fmtPct(total.taux, 2)}</td>
            {avecEquipe && <td>{fmtPct(total.tauxEquipe)}</td>}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function TableauKpi({ kpi, grille }) {
  const lignes = [
    ["Dossiers nouveaux traités", kpi.nouveaux],
    ["Dossiers modifiés traités", kpi.modifies],
    ["Total dossiers traités", kpi.total],
    ["Part des modifications dans le volume total", fmtPct(kpi.partModifs, 2)],
    ["Retours internes (avant transmission client)", kpi.internes],
    ["Taux global de retour interne (pondéré)", fmtPct(kpi.tauxPondere, 2)],
    [`Taux moyen simple par ingénieur (non pondéré, ≥ ${grille.seuilMin} dossiers)`, fmtPct(kpi.tauxMoyen, 2)],
    ["Rendement qualité global (1er passage conforme)", fmtPct(kpi.rendement, 2)],
    ["Retours clients enregistrés", kpi.clients],
    ["Volume moyen traité par ingénieur", `${kpi.volumeMoyen.toFixed(1).replace(".", ",")} dossiers`],
  ];
  return (
    <table className="rapport-table rapport-kpi avoid-break">
      <thead>
        <tr>
          <th className="text-left">Indicateur</th>
          <th>Résultat</th>
        </tr>
      </thead>
      <tbody>
        {lignes.map(([k, v]) => (
          <tr key={k}>
            <td className="text-left font-semibold">{k}</td>
            <td className="font-semibold">{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ---------------------------------------------------------------- page */

export default function RapportQualite({ supabase, options }) {
  const [mode, setMode] = useState("mois");
  const [mois, setMois] = useState(moisCourant());
  const [debut, setDebut] = useState(`${moisCourant()}-01`);
  const [fin, setFin] = useState(new Date().toISOString().slice(0, 10));
  const [operation, setOperation] = useState("");
  const [ingenieur, setIngenieur] = useState("");
  const [grille, setGrille] = useState(GRILLE_DEFAUT);
  const [entete, setEntete] = useState({ redigePar: "Contrôle Qualité — Hill Solution", diffusion: "Direction" });
  const [donnees, setDonnees] = useState(null);
  const [chargement, setChargement] = useState(false);

  const periode = mode === "mois" ? { debut: `${mois}-01`, fin: finDeMois(mois) } : { debut, fin };

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("parametres_config").select("*").limit(1).maybeSingle();
      if (!data) return;
      setGrille({
        excellent: Number(data.grille_excellent ?? GRILLE_DEFAUT.excellent),
        bon: Number(data.grille_bon ?? GRILLE_DEFAUT.bon),
        surveiller: Number(data.grille_surveiller ?? GRILLE_DEFAUT.surveiller),
        seuilMin: Number(data.seuil_min_dossiers ?? GRILLE_DEFAUT.seuilMin),
      });
      setEntete((e) => ({
        redigePar: data.rapport_redige_par || e.redigePar,
        diffusion: data.rapport_diffusion || e.diffusion,
      }));
    })();
  }, []);

  useEffect(() => {
    (async () => {
      setChargement(true);
      const dossiers = [];
      for (let page = 0; page < 20; page++) {
        const { data } = await supabase
          .from("dossiers")
          .select("id, date, nom_dossier, nom_operation, nature_prod, ingenieur, ingenieur_modif, etat, valide_par, client, beneficiaire_nom, nb_retours")
          .gte("date", periode.debut)
          .lte("date", periode.fin)
          .order("id")
          .range(page * 1000, page * 1000 + 999);
        dossiers.push(...(data || []));
        if (!data || data.length < 1000) break;
      }
      const retours = [];
      const ids = dossiers.map((d) => d.id);
      for (let i = 0; i < ids.length; i += 150) {
        const { data } = await supabase.from("dossier_retours").select("dossier_id, type, cause, created_at").in("dossier_id", ids.slice(i, i + 150));
        retours.push(...(data || []));
      }
      setDonnees({ dossiers, retours });
      setChargement(false);
    })();
  }, [periode.debut, periode.fin]);

  const rapport = useMemo(
    () =>
      donnees &&
      calculerRapport({
        dossiers: donnees.dossiers,
        retours: donnees.retours,
        causes: options.causesInterne || [],
        grille,
        operation: operation || null,
        ingenieur: ingenieur || null,
      }),
    [donnees, options.causesInterne, grille, operation, ingenieur]
  );

  const operationsPeriode = useMemo(() => [...new Set((donnees?.dossiers || []).map((d) => d.nom_operation).filter(Boolean))].sort(), [donnees]);
  const ingenieursPeriode = useMemo(() => {
    const m = new Map();
    for (const d of donnees?.dossiers || []) {
      const n = ingenieurResponsable(d);
      if (n && n !== "—" && !m.has(n.toLowerCase())) m.set(n.toLowerCase(), n);
    }
    return [...m.values()].sort((a, b) => a.localeCompare(b));
  }, [donnees]);

  async function exporterExcel() {
    if (!rapport) return;
    const XLSX = await import("xlsx");
    const classeur = XLSX.utils.book_new();
    const versLignes = (lignes, total, premiere, equipe) =>
      [...lignes, total].map((l) => ({
        [premiere]: l === total ? "TOTAL / MOYENNE" : l.cle,
        "Nb. nouveaux": l.nouveaux,
        "Nb. modifiés": l.modifies,
        "Total traité": l.total,
        "Nb. retours internes": l.internes,
        ...Object.fromEntries(rapport.colonnes.map((c) => [c, l.parCause[c] || 0])),
        "Autres causes": l.autres,
        "Taux de retour %": Number(l.taux.toFixed(2)),
        ...(equipe ? { "Moyenne équipe %": Number((l.tauxEquipe || 0).toFixed(2)) } : {}),
        "Retours clients": l.clients,
      }));
    if (rapport.parOperation) {
      const po = rapport.parOperation;
      XLSX.utils.book_append_sheet(classeur, XLSX.utils.json_to_sheet(versLignes(po.lignes, po.total, "Opération", true)), "Par opération");
      XLSX.utils.book_append_sheet(
        classeur,
        XLSX.utils.json_to_sheet(
          po.dossiers.map((d) => ({
            Date: d.date,
            Dossier: d.nom_dossier,
            Fiche: d.nom_operation,
            Nature: d.nature_prod,
            Statut: d.etat,
            "Retours internes": (po.retoursParDossier.get(d.id) || []).filter((r) => r.type !== "client").length,
            "Causes": (po.retoursParDossier.get(d.id) || []).map((r) => r.cause).join(" ; "),
            "Validé par": d.valide_par,
          }))
        ),
        "Dossiers"
      );
    } else {
      for (const s of rapport.sections) {
        const nom = `Dossiers ${libOp(s.operation)}`.slice(0, 31).replace(/[\\/?*[\]:]/g, "-");
        XLSX.utils.book_append_sheet(classeur, XLSX.utils.json_to_sheet(versLignes(s.lignes, s.total, "Ingénieur")), nom);
      }
    }
    XLSX.writeFile(classeur, `RAPPORT_QUALITE_${periode.debut}_${periode.fin}${ingenieur ? "_" + ingenieur : ""}.xlsx`);
  }

  const dateRapport = new Date().toLocaleDateString("fr-FR");

  return (
    <div className="flex flex-col gap-4">
      {/* Réglages (non imprimés) */}
      <div className="card px-4 py-3 flex flex-col gap-3 no-print">
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-ink/50 uppercase tracking-wider w-20">
            <Icon name="calendar" size={13} />
            Période
          </span>
          <div className="segmented">
            <button data-active={mode === "mois"} onClick={() => setMode("mois")}>
              Un mois
            </button>
            <button data-active={mode === "dates"} onClick={() => setMode("dates")}>
              Dates libres
            </button>
          </div>
          {mode === "mois" ? (
            <input type="month" className="input input-sm w-40" value={mois} onChange={(e) => setMois(e.target.value)} aria-label="Mois" />
          ) : (
            <span className="flex items-center gap-2 text-sm">
              du <input type="date" className="input input-sm w-40" value={debut} onChange={(e) => setDebut(e.target.value)} aria-label="Début" />
              au <input type="date" className="input input-sm w-40" value={fin} onChange={(e) => setFin(e.target.value)} aria-label="Fin" />
            </span>
          )}
          <div className="ml-auto flex gap-2">
            <button className="btn-secondary btn-sm" onClick={exporterExcel} disabled={!rapport}>
              <Icon name="download" size={14} />
              Excel
            </button>
            <button className="btn-primary btn-sm" onClick={() => window.print()} disabled={!rapport}>
              <Icon name="file" size={14} />
              Imprimer / PDF
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-ink/50 uppercase tracking-wider w-20">
            <Icon name="filter" size={13} />
            Filtres
          </span>
          <select className="input input-sm w-48" value={operation} onChange={(e) => setOperation(e.target.value)} aria-label="Opération">
            <option value="">Toutes les opérations</option>
            {operationsPeriode.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
          <select className="input input-sm w-56" value={ingenieur} onChange={(e) => setIngenieur(e.target.value)} aria-label="Ingénieur">
            <option value="">Tous les ingénieurs</option>
            {ingenieursPeriode.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
          <span className="text-xs text-ink/50 ml-auto">
            Rédigé par{" "}
            <input className="input input-sm w-60 inline-block" value={entete.redigePar} onChange={(e) => setEntete((x) => ({ ...x, redigePar: e.target.value }))} />{" "}
            Diffusion{" "}
            <input className="input input-sm w-36 inline-block" value={entete.diffusion} onChange={(e) => setEntete((x) => ({ ...x, diffusion: e.target.value }))} />
          </span>
        </div>
      </div>

      {chargement && <p className="text-sm text-ink/50 no-print">Calcul du rapport…</p>}

      {rapport && (
        <article className="rapport card p-8 bg-white">
          {/* En-tête du rapport */}
          <p className="text-right text-[11px] text-ink/45">Rapport de contrôle qualité — {dateRapport}</p>
          <h1 className="text-center font-serif text-3xl font-bold text-[#1F3A5F] mt-4">RAPPORT DE CONTRÔLE QUALITÉ</h1>
          <p className="text-center italic text-ink/60 mb-5">
            Équipe Qualité — Vérification des dossiers{ingenieur ? ` — Fiche ingénieur : ${ingenieur}` : ""}
          </p>
          <table className="rapport-entete mb-6">
            <tbody>
              <tr>
                <th>Cellule</th>
                <td>Qualité</td>
                <th>Activité</th>
                <td>Dossiers {(operation ? [operation] : operationsPeriode).map(libOp).join(" - ") || "—"}</td>
              </tr>
              <tr>
                <th>Périmètre</th>
                <td>Production / Vérification</td>
                <th>Date du rapport</th>
                <td>{dateRapport}</td>
              </tr>
              <tr>
                <th>Rédigé par</th>
                <td>{entete.redigePar}</td>
                <th>Diffusion</th>
                <td>{entete.diffusion}</td>
              </tr>
              <tr>
                <th>Période</th>
                <td colSpan={3}>
                  {fr(periode.debut)} → {fr(periode.fin)}
                </td>
              </tr>
            </tbody>
          </table>

          <h2 className="rapport-h2">Méthodologie et lecture du rapport</h2>
          <p className="text-sm mb-2">
            Dossiers audités sur la période (date de production). Un dossier modifié est compté pour l'ingénieur de modif. Taux de
            retour = retours internes ÷ dossiers traités. Le taux moyen simple ne retient que les ingénieurs ayant au moins{" "}
            {grille.seuilMin} dossiers.
          </p>
          <div className="grid grid-cols-4 text-white text-xs font-bold text-center mb-2">
            {NIVEAUX.map((n, i) => (
              <span key={n.cle} className="py-1.5" style={{ background: n.couleur }}>
                {n.libelle} ({["≤ " + grille.excellent, grille.excellent + " – " + grille.bon, grille.bon + " – " + grille.surveiller, "> " + grille.surveiller][i]} %)
              </span>
            ))}
          </div>

          {rapport.nbTraites === 0 && <p className="text-center text-ink/50 py-10">Aucun dossier audité sur cette période.</p>}

          {/* Vue d'un ingénieur : une ligne par opération */}
          {rapport.parOperation && rapport.parOperation.total.total > 0 && (
            <section className="saut-page">
              <h2 className="rapport-h1">{ingenieur}</h2>
              <h3 className="rapport-h2">Détail par opération</h3>
              <TableauDetail
                lignes={rapport.parOperation.lignes}
                total={rapport.parOperation.total}
                colonnes={rapport.colonnes}
                premiereColonne="Opération"
                grille={grille}
                avecEquipe
              />
              <p className="text-sm mt-2">
                Taux de retour interne : <strong>{fmtPct(rapport.parOperation.total.taux, 2)}</strong> ({niveau(rapport.parOperation.total.taux, grille).libelle})
                — moyenne de l'équipe sur le même périmètre : {fmtPct(rapport.parOperation.total.tauxEquipe, 2)}. Retours clients :{" "}
                {rapport.parOperation.total.clients}.
              </p>
              <h3 className="rapport-h2 mt-6">Analyse de Pareto — causes de ses retours internes</h3>
              <Pareto pareto={rapport.parOperation.pareto} total={rapport.parOperation.total.internes} />

              <h3 className="rapport-h2 mt-6">Liste de ses dossiers ({rapport.parOperation.dossiers.length})</h3>
              <div className="overflow-x-auto">
                <table className="rapport-table">
                  <thead>
                    <tr>
                      <th className="text-left">Date</th>
                      <th className="text-left">Dossier</th>
                      <th>Fiche</th>
                      <th>Nature</th>
                      <th>Statut</th>
                      <th>Retours internes</th>
                      <th className="text-left">Causes</th>
                      <th>Retours clients</th>
                      <th>Validé par</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...rapport.parOperation.dossiers]
                      .sort((a, b) => String(b.date).localeCompare(String(a.date)))
                      .map((d) => {
                        const rs = rapport.parOperation.retoursParDossier.get(d.id) || [];
                        const internes = rs.filter((r) => r.type !== "client");
                        return (
                          <tr key={d.id}>
                            <td className="text-left whitespace-nowrap">{formatDate(d.date)}</td>
                            <td className="text-left font-semibold">{d.nom_dossier}</td>
                            <td>{libOp(d.nom_operation || "—")}</td>
                            <td>{d.nature_prod}</td>
                            <td>
                              <StatutBadge etat={d.etat} />
                            </td>
                            <td>{internes.length || ""}</td>
                            <td className="text-left text-xs">
                              {internes.map((r, i) => (
                                <span key={i} className="block">
                                  {(TYPES_RETOUR[r.type] || TYPES_RETOUR.interne).court} — {r.cause}
                                </span>
                              ))}
                            </td>
                            <td>{rs.length - internes.length || ""}</td>
                            <td className="capitalize">{d.valide_par || "—"}</td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </section>
          )}
          {rapport.parOperation && rapport.parOperation.total.total === 0 && (
            <p className="text-center text-ink/50 py-10">Aucun dossier audité pour {ingenieur} sur cette période.</p>
          )}

          {/* Rapport complet : une section par opération */}
          {!rapport.parOperation &&
            rapport.sections
              .filter((s) => s.total.total > 0)
              .map((s) => (
                <section key={s.operation} className="saut-page">
                  <h2 className="rapport-h1">Dossiers {libOp(s.operation)}</h2>
                  <h3 className="rapport-h2">Indicateurs clés</h3>
                  <TableauKpi kpi={s.kpi} grille={grille} />
                  <h3 className="rapport-h2 mt-6">Détail par ingénieur</h3>
                  <TableauDetail lignes={s.lignes} total={s.total} colonnes={rapport.colonnes} premiereColonne="Ingénieur" grille={grille} />
                  {anomalies(s).length > 0 && (
                    <p className="text-xs italic text-ink/55 mt-2">Note : {anomalies(s).join(" ; ")}.</p>
                  )}
                  <h3 className="rapport-h2 mt-6">Classement des ingénieurs par taux de retour interne</h3>
                  <Classement section={s} grille={grille} />
                  <h3 className="rapport-h2 mt-6">Analyse de Pareto — Causes des retours internes</h3>
                  <Pareto pareto={s.pareto} total={s.total.internes} />
                </section>
              ))}
        </article>
      )}
    </div>
  );
}
