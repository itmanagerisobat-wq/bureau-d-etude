"use client";
import { useState } from "react";
import TuilesCockpit from "@/components/TuilesCockpit";
import FiltrePeriode from "@/components/FiltrePeriode";
import Avatar from "@/components/ui/Avatar";
import { S } from "@/lib/constants";
import { serieCompte } from "@/lib/series";
import { bornes, bornesPrecedentes, dansBornes, libelleComparaison, libellePeriode } from "@/lib/periode";
import { ingenieurResponsable } from "@/lib/rapportQualite";

export const C_NOUVEAU = "#1F6FA8";
export const C_MODIF = "#E3A23B";
const T_MODIF = "#B7791F";
const C_AUDIT = "#3E8A2F";
const C_RI = "#A8700E";
const C_RC = "#C23A33";

export const estNouveau = (d) => d.nature_prod === "Nouveau dossier";
export const estModification = (d) => d.nature_prod === "Modification";
const estAudite = (d) => d.etat === S.VALIDE || d.etat === "Dossier vérifié" || d.etat === S.PAS_DE_MODIF;
const nomEgal = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();

/**
 * Retours d'une période : la table dossier_retours si elle existe, sinon les indicateurs des dossiers.
 * Renvoie [{ type: "interne" | "client", date, ingenieur, operation, client }]
 */
export function listeRetours(dossiers, retours) {
  const parId = Object.fromEntries(dossiers.map((d) => [d.id, d]));
  if (retours) {
    return retours.map((r) => {
      const d = parId[r.dossier_id];
      return { type: r.type === "client" ? "client" : "interne", date: r.created_at, ingenieur: r.ingenieur || (d && ingenieurResponsable(d)), operation: r.operation || d?.nom_operation, client: d?.client };
    });
  }
  const l = [];
  for (const d of dossiers) {
    if (d.retour_interne) l.push({ type: "interne", date: d.date_verification || d.date, ingenieur: ingenieurResponsable(d), operation: d.nom_operation, client: d.client });
    if (d.retour_client) l.push({ type: "client", date: d.date_retour_client || d.date, ingenieur: ingenieurResponsable(d), operation: d.nom_operation, client: d.client });
  }
  return l;
}

/** Chiffres d'une période pour une fiche (ou toutes). */
function chiffres(dossiers, retours, b, fiche) {
  const ds = dossiers.filter((d) => d.etat !== "Annulé" && (fiche === "Tous" || d.nom_operation === fiche));
  const rs = retours.filter((r) => (fiche === "Tous" || r.operation === fiche) && dansBornes(r.date, b));
  const audites = ds.filter((d) => estAudite(d) && dansBornes(d.date_verification, b));
  return {
    nouveaux: ds.filter((d) => estNouveau(d) && dansBornes(d.date, b)).length,
    modifs: ds.filter((d) => estModification(d) && dansBornes(d.date, b)).length,
    audites: audites.length,
    premierCoup: audites.length ? Math.round((audites.filter((d) => !d.nb_retours).length / audites.length) * 100) : null,
    ri: rs.filter((r) => r.type === "interne").length,
    rc: rs.filter((r) => r.type === "client").length,
  };
}

function ecart(a, b, comp, baisseBonne = false) {
  if (a === b) return { note: `= ${comp}`, ton: "neutre" };
  const d = a - b;
  const bon = baisseBonne ? d < 0 : d > 0;
  let txt;
  if (b > 0 && Math.abs(d) >= 10) txt = `${d > 0 ? "+" : "−"}${Math.round(Math.abs(d / b) * 100)} %`;
  else txt = `${d > 0 ? "+" : "−"}${Math.abs(d)}`;
  return { note: `${txt} ${comp}`, ton: bon ? "vert" : "rouge" };
}

const nf = (n) => n.toLocaleString("fr-FR");

/** Barre empilée Nouveaux / Modifications. */
function Repartition({ a, b, max, hauteur = 12 }) {
  const t = a + b;
  if (!t) return <span className="text-ink/25">—</span>;
  return (
    <span className="flex rounded-r overflow-hidden" style={{ height: hauteur, width: `${(t / max) * 100}%`, minWidth: 6 }} title={`${a} nouveau(x), ${b} modification(s)`}>
      <i className="block h-full" style={{ width: `${(a / t) * 100}%`, background: C_NOUVEAU }} />
      <i className="block h-full" style={{ width: `${(b / t) * 100}%`, background: C_MODIF }} />
    </span>
  );
}

export function Legende() {
  return (
    <span className="flex gap-4 text-xs text-ink/60">
      <span className="flex items-center gap-1.5">
        <i className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: C_NOUVEAU }} />
        Nouveaux dossiers
      </span>
      <span className="flex items-center gap-1.5">
        <i className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: C_MODIF }} />
        Modifications
      </span>
    </span>
  );
}

/** Tableau « Production par ingénieur » avec son propre filtre (période + fiche). */
function ProductionParIngenieur({ dossiers, retours, ingenieurs, operations, periodeHaut, ficheHaut }) {
  const [periode, setPeriode] = useState(null); // null = suit le filtre du haut
  const [fiche, setFiche] = useState(null);
  const p = periode || periodeHaut;
  const f = fiche || ficheHaut;
  const b = bornes(p);

  const ds = dossiers.filter((d) => d.etat !== "Annulé" && (f === "Tous" || d.nom_operation === f) && dansBornes(d.date, b));
  const rs = retours.filter((r) => (f === "Tous" || r.operation === f) && dansBornes(r.date, b));
  const noms = new Map();
  for (const n of ingenieurs) noms.set(String(n).trim().toLowerCase(), n);
  for (const d of ds) {
    const n = ingenieurResponsable(d);
    if (n && n !== "—" && !noms.has(n.toLowerCase())) noms.set(n.toLowerCase(), n);
  }
  const lignes = [...noms.values()]
    .map((n) => {
      const siens = ds.filter((d) => nomEgal(ingenieurResponsable(d), n));
      const r = rs.filter((x) => nomEgal(x.ingenieur, n));
      return {
        nom: n,
        nv: siens.filter(estNouveau).length,
        md: siens.filter(estModification).length,
        ri: r.filter((x) => x.type === "interne").length,
        rc: r.filter((x) => x.type === "client").length,
      };
    })
    .sort((x, y) => y.nv + y.md - (x.nv + x.md) || x.nom.localeCompare(y.nom));
  const max = Math.max(1, ...lignes.map((l) => l.nv + l.md));
  const tot = lignes.reduce((t, l) => ({ nv: t.nv + l.nv, md: t.md + l.md, ri: t.ri + l.ri, rc: t.rc + l.rc }), { nv: 0, md: 0, ri: 0, rc: 0 });

  return (
    <section className="card mb-6">
      <div className="card-header flex-wrap gap-3">
        <div>
          <p className="card-title">Production par ingénieur</p>
          <p className="text-xs text-ink/50 mt-0.5 first-letter:uppercase">
            {libellePeriode(p)} · {f === "Tous" ? "toutes les fiches" : f}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FiltrePeriode valeur={p} onChange={setPeriode} />
          <select className="input input-sm w-48" value={f} onChange={(e) => setFiche(e.target.value)} aria-label="Fiche CEE du tableau">
            <option value="Tous">Toutes les fiches</option>
            {operations.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="px-5 pt-1 pb-2">
        <Legende />
      </div>
      <div className="overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Ingénieur</th>
              <th className="text-right">Nouveaux dossiers</th>
              <th className="text-right">Modifications</th>
              <th className="text-right">Retours internes</th>
              <th className="text-right">Retours client</th>
              <th className="w-[28%]">Répartition</th>
              <th className="text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {lignes.map((l) => (
              <tr key={l.nom}>
                <td>
                  <span className="flex items-center gap-2.5 font-medium capitalize whitespace-nowrap">
                    <Avatar nom={l.nom} taille={26} />
                    {l.nom}
                  </span>
                </td>
                <td className="text-right tabular font-medium" style={{ color: C_NOUVEAU }}>{l.nv}</td>
                <td className="text-right tabular font-medium" style={{ color: T_MODIF }}>{l.md}</td>
                <td className="text-right tabular" style={{ color: l.ri ? C_RI : undefined }}>{l.ri}</td>
                <td className="text-right tabular" style={{ color: l.rc ? C_RC : undefined }}>{l.rc}</td>
                <td>
                  <Repartition a={l.nv} b={l.md} max={max} hauteur={14} />
                </td>
                <td className="text-right tabular font-semibold">{l.nv + l.md}</td>
              </tr>
            ))}
            {lignes.length === 0 && (
              <tr>
                <td colSpan={7} className="table-empty">
                  Aucune production sur cette période.
                </td>
              </tr>
            )}
            {lignes.length > 0 && (
              <tr className="bg-paper/60 font-semibold">
                <td>Équipe</td>
                <td className="text-right tabular" style={{ color: C_NOUVEAU }}>{nf(tot.nv)}</td>
                <td className="text-right tabular" style={{ color: T_MODIF }}>{nf(tot.md)}</td>
                <td className="text-right tabular" style={{ color: C_RI }}>{nf(tot.ri)}</td>
                <td className="text-right tabular" style={{ color: C_RC }}>{nf(tot.rc)}</td>
                <td />
                <td className="text-right tabular">{nf(tot.nv + tot.md)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Onglet « Vue d'ensemble » : 5 tuiles, production par ingénieur, volume par client. */
export default function VueEnsemble({ dossiers, retours, options, periode, fiche }) {
  const rets = listeRetours(dossiers, retours);
  const b = bornes(periode);
  const c = chiffres(dossiers, rets, b, fiche);
  const avant = chiffres(dossiers, rets, bornesPrecedentes(periode), fiche);
  const comp = libelleComparaison(periode);
  const dsF = dossiers.filter((d) => d.etat !== "Annulé" && (fiche === "Tous" || d.nom_operation === fiche));
  const rsF = rets.filter((r) => fiche === "Tous" || r.operation === fiche);

  const tuiles = [
    { label: "Nouveaux dossiers", valeur: nf(c.nouveaux), ...ecart(c.nouveaux, avant.nouveaux, comp), serie: serieCompte(dsF, "date", estNouveau), couleur: C_NOUVEAU, couleurSerie: ["#BBD4EA", C_NOUVEAU], actif: true },
    { label: "Modifications", valeur: nf(c.modifs), ...ecart(c.modifs, avant.modifs, comp, true), serie: serieCompte(dsF, "date", estModification), couleur: T_MODIF, couleurSerie: ["#F2D9AE", C_MODIF] },
    { label: "Audités", valeur: nf(c.audites), note: c.premierCoup === null ? "" : `${c.premierCoup} % du 1er coup`, ton: "vert", serie: serieCompte(dsF, "date_verification", estAudite), couleur: C_AUDIT, couleurSerie: ["#C7E1BF", C_AUDIT] },
    { label: "Retours internes", valeur: nf(c.ri), ...ecart(c.ri, avant.ri, comp, true), serie: serieCompte(rsF, "date", (r) => r.type === "interne"), couleur: C_RI, couleurSerie: ["#EBD7AE", C_RI] },
    { label: "Retours client", valeur: nf(c.rc), ...ecart(c.rc, avant.rc, comp, true), serie: serieCompte(rsF, "date", (r) => r.type === "client"), couleur: C_RC, couleurSerie: ["#F1C9C5", C_RC] },
  ];

  // Par client (période et fiche du haut)
  const parClient = {};
  for (const d of dsF) {
    if (!dansBornes(d.date, b)) continue;
    const k = d.client || "Sans client";
    parClient[k] = parClient[k] || { nv: 0, md: 0 };
    if (estNouveau(d)) parClient[k].nv += 1;
    else if (estModification(d)) parClient[k].md += 1;
  }
  const clients = Object.entries(parClient)
    .map(([nom, v]) => ({ nom, ...v }))
    .filter((x) => x.nv + x.md > 0)
    .sort((x, y) => y.nv + y.md - (x.nv + x.md));
  const maxC = Math.max(1, ...clients.map((x) => x.nv + x.md));

  return (
    <>
      <TuilesCockpit cinq items={tuiles} />

      <ProductionParIngenieur
        dossiers={dossiers}
        retours={rets}
        ingenieurs={options.ingenieursAssignables?.length ? options.ingenieursAssignables : options.ingenieurs}
        operations={options.operations}
        periodeHaut={periode}
        ficheHaut={fiche}
      />

      <section className="card mb-6">
        <div className="card-header">
          <p className="card-title">Par client</p>
          <span className="text-xs text-ink/50 first-letter:uppercase">
            {libellePeriode(periode)} · {fiche === "Tous" ? "toutes les fiches" : fiche}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Client</th>
                <th className="text-right">Nouveaux</th>
                <th className="text-right">Modifs</th>
                <th className="text-right">Total</th>
                <th className="w-[40%]">Volume</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((x) => (
                <tr key={x.nom}>
                  <td className="font-medium">{x.nom}</td>
                  <td className="text-right tabular">{x.nv}</td>
                  <td className="text-right tabular">{x.md}</td>
                  <td className="text-right tabular font-semibold">{x.nv + x.md}</td>
                  <td>
                    <Repartition a={x.nv} b={x.md} max={maxC} />
                  </td>
                </tr>
              ))}
              {clients.length === 0 && (
                <tr>
                  <td colSpan={5} className="table-empty">
                    Aucun dossier sur cette période.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
