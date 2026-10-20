"use client";
import { useEffect, useState } from "react";
import Avatar from "@/components/ui/Avatar";
import Icon from "@/components/ui/Icon";
import { presence } from "@/lib/presence";
import { heuresTraitement } from "@/lib/tempsTraitement";
import { EVENEMENTS, S, formatDuree } from "@/lib/constants";
import { ingenieurResponsable } from "@/lib/rapportQualite";
import { useRafraichissement } from "@/lib/useRafraichissement";

const cle = (n) => String(n || "").trim().toLowerCase();
const auj = () => new Date().toDateString();
const estAujourdhui = (v) => !!v && new Date(v).toDateString() === auj();
const heure = (v) => new Date(v).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
const heuresDepuis = (v) => (v ? Math.max(0, (Date.now() - new Date(v).getTime()) / 3600000) : null);

const ETAT = {
  trait: { texte: "En traitement", cls: "badge-brand" },
  pause: { texte: "En pause", cls: "badge-gold" },
  attente: { texte: "Attente d'info", cls: "badge-red" },
  verif: { texte: "En vérification", cls: "badge-green" },
  libre: { texte: "Libre", cls: "badge-neutral" },
  absent: { texte: "Absent", cls: "badge-neutral" },
  off: { texte: "Hors ligne", cls: "badge-neutral" },
};

function Point({ p }) {
  return <span className="w-[9px] h-[9px] rounded-full shrink-0" style={{ background: p.couleur, boxShadow: p.cle === "on" ? `0 0 0 3px ${p.couleur}22` : undefined }} title={p.libelle} />;
}

function Compteur({ valeur, label, sous, couleur, alerte }) {
  return (
    <div className="tuile-cockpit">
      <b className="block font-display chiffre text-[38px] font-semibold leading-tight" style={{ color: couleur }}>
        {valeur}
      </b>
      <span className="text-sm text-ink/70">{label}</span>
      <span className={`block text-xs mt-1 truncate ${alerte ? "text-isoRed font-medium" : "text-ink/50"}`}>{sous || " "}</span>
    </div>
  );
}

const VERBES = {
  prise_file: "a pris",
  acceptation: "a accepté",
  reprise: "a repris",
  assignation: "a assigné",
  reassignation: "a réassigné",
  mise_en_file: "a mis dans la file",
  soumission_verification: "a envoyé au contrôle",
  prise_en_charge: "a commencé la vérification de",
  verification_ok: "a audité",
  retour_interne_avant_audit: "a fait un retour interne sur",
  retour_interne_apres_audit: "a fait un retour interne sur",
  retour_client: "a enregistré un retour client sur",
  attente_info: "attend une info pour",
  mise_en_pause: "a mis en pause",
  validation_ingenieur: "a corrigé et validé",
  pas_de_modif: "a indiqué « pas de modif » pour",
  retour_annule: "a annulé le retour interne de",
  changement_statut_manuel: "a changé le statut de",
};

/** Texte d'un événement de l'historique pour le fil d'activité. */
function texteEvenement(e, d) {
  const qui = e.effectue_par_nom || "";
  const dos = d?.nom_dossier || "un dossier";
  const t = EVENEMENTS[e.type]?.texte || e.type;
  return { qui, quoi: VERBES[e.type] || `${t.charAt(0).toLowerCase()}${t.slice(1)} :`, dos, cause: e.cause };
}

/**
 * Onglet « Production en ce moment » : qui fait quoi, ingénieurs et service Qualité, en direct.
 */
export default function ProductionEnCeMoment({ dossiers, options, supabase, delaiMax = 24, equipe = "tous", fiche = "Tous" }) {
  const [choisi, setChoisi] = useState("");
  const [presIng, setPresIng] = useState({});
  const [presNom, setPresNom] = useState({});
  const [evts, setEvts] = useState([]);
  const [toutFil, setToutFil] = useState(false);
  const [majA, setMajA] = useState(new Date());

  async function chargerDirect() {
    const debut = new Date();
    debut.setHours(0, 0, 0, 0);
    const [p, a, e] = await Promise.all([
      supabase.rpc("fn_presence_ingenieurs"),
      supabase.rpc("fn_chat_annuaire"),
      supabase.from("dossier_evenements").select("*").gte("created_at", debut.toISOString()).order("created_at", { ascending: false }).limit(300),
    ]);
    setPresIng(Object.fromEntries((p.data || []).map((x) => [cle(x.ingenieur), x])));
    setPresNom(Object.fromEntries((a.data || []).map((x) => [cle(x.nom), x])));
    setEvts(e.error ? [] : e.data || []);
    setMajA(new Date());
  }
  useEffect(() => {
    chargerDirect();
  }, []);
  useRafraichissement(chargerDirect, true);

  const okFiche = (d) => fiche === "Tous" || d.nom_operation === fiche;
  const ds = dossiers.filter(okFiche);

  // ---------- Ingénieurs ----------
  const ingenieurs = options.ingenieursAssignables?.length ? options.ingenieursAssignables : options.ingenieurs;
  const enMain = (ing) => {
    const siens = ds.filter((d) => cle(d.ingenieur) === cle(ing));
    return siens.find((d) => d.etat === S.EN_COURS) || siens.find((d) => d.etat === "en pause") || siens.find((d) => d.etat === S.ATTENTE_INFO) || null;
  };
  const lignesIng = ingenieurs.map((ing) => {
    const d = enMain(ing);
    const p = presence(presIng[cle(ing)] || presNom[cle(ing)]);
    const etat = d ? (d.etat === S.EN_COURS ? "trait" : d.etat === "en pause" ? "pause" : "attente") : p.cle === "on" ? "libre" : p.cle === "absent" ? "absent" : "off";
    const envoyes = dossiers.filter((x) => cle(ingenieurResponsable(x)) === cle(ing) && estAujourdhui(x.date_soumission)).length;
    return { nom: ing, d, p, etat, h: d?.date_acceptation || d?.temps_traitement_s ? heuresTraitement(d) : null, envoyes };
  });
  const ordre = { trait: 0, attente: 1, pause: 2, libre: 3, absent: 4, off: 5 };
  lignesIng.sort((a, b) => ordre[a.etat] - ordre[b.etat] || a.nom.localeCompare(b.nom));
  const visiblesIng = choisi ? lignesIng.filter((l) => l.nom === choisi) : fiche === "Tous" ? lignesIng : lignesIng.filter((l) => l.d);

  // ---------- Service qualité ----------
  const enVerif = ds.filter((d) => d.etat === S.VERIF);
  const nomsQ = new Map((options.validateurs || []).map((n) => [cle(n), n]));
  for (const d of enVerif) if (d.pris_en_charge_par && !nomsQ.has(cle(d.pris_en_charge_par))) nomsQ.set(cle(d.pris_en_charge_par), d.pris_en_charge_par);
  const lignesQ = [...nomsQ.values()].map((n) => {
    const d = enVerif.find((x) => cle(x.pris_en_charge_par) === cle(n)) || null;
    const p = presence(presNom[cle(n)]);
    const audites = dossiers.filter((x) => cle(x.valide_par) === cle(n) && estAujourdhui(x.date_verification)).length;
    return { nom: n, d, p, etat: d ? "verif" : p.cle === "on" ? "libre" : p.cle === "absent" ? "absent" : "off", depuis: d ? heuresDepuis(d.date_prise_en_charge) : null, audites };
  });
  const ordreQ = { verif: 0, libre: 1, absent: 2, off: 3 };
  lignesQ.sort((a, b) => ordreQ[a.etat] - ordreQ[b.etat] || a.nom.localeCompare(b.nom));

  // ---------- Compteurs ----------
  const nb = (etat) => ds.filter((d) => d.etat === etat).length;
  const pauses = ds.filter((d) => d.etat === "en pause");
  const attentes = ds.filter((d) => d.etat === S.ATTENTE_INFO);
  const aControler = ds.filter((d) => d.etat === S.A_CONTROLER);
  const vieux = aControler.filter((d) => heuresDepuis(d.date_soumission) > 4).length;
  const connectes = lignesIng.filter((l) => l.p.cle !== "off").length;
  const qLibres = lignesQ.filter((l) => l.etat === "libre").map((l) => l.nom);
  const noms = (l) => [...new Set(l.map((d) => d.ingenieur))].slice(0, 2).join(", ");

  // ---------- Fil d'activité ----------
  const parId = Object.fromEntries(dossiers.map((d) => [d.id, d]));
  const fil = evts.filter((e) => fiche === "Tous" || parId[e.dossier_id]?.nom_operation === fiche);

  const dossierCell = (d) => (d ? <span className="nom-dossier-sm">{d.nom_dossier}</span> : null);

  return (
    <>
      <div className="tuiles-cockpit tuiles-cockpit-5">
        <Compteur valeur={nb(S.EN_COURS)} label="En traitement" sous={`sur ${connectes} ingénieur(s) connecté(s)`} couleur="#1F6FA8" />
        <Compteur valeur={pauses.length} label="En pause" sous={pauses.length ? noms(pauses) : "aucun"} couleur="#B7791F" />
        <Compteur valeur={attentes.length} label="Attente d'info" sous={attentes.length ? noms(attentes) : "aucun blocage"} couleur="#C23A33" />
        <Compteur valeur={`${enVerif.length} / ${lignesQ.length}`} label="Qualité en vérification" sous={qLibres.length ? `${qLibres.slice(0, 2).join(", ")} libre(s)` : "toute l'équipe est occupée"} couleur="#3E8A2F" />
        <Compteur valeur={aControler.length} label="À contrôler" sous={vieux ? `${vieux} envoyé(s) il y a plus de 4 h` : "rien en retard"} alerte={vieux > 0} />
      </div>

      <p className="text-xs text-ink/50 -mt-3 mb-3 flex items-center gap-1.5">
        <i className="w-2 h-2 rounded-full bg-isoGreen inline-block" />
        Mis à jour à {majA.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}, rafraîchi toutes les 30 secondes
      </p>
      <div className="grid xl:grid-cols-[minmax(0,1fr)_340px] gap-6 items-start">
        <div className="min-w-0 space-y-6">
          {equipe !== "qualite" && (
            <section className="card">
              <div className="card-header flex-wrap gap-3">
                <p className="card-title">
                  <Icon name="users" size={15} className="text-ink/40" />
                  Ingénieurs
                  <span className="text-xs font-normal text-ink/50">
                    {lignesIng.filter((l) => l.d).length} sur un dossier · {lignesIng.filter((l) => l.etat === "libre").length} libre(s)
                  </span>
                </p>
                <select className="input input-sm w-56" value={choisi} onChange={(e) => setChoisi(e.target.value)} aria-label="Filtrer par ingénieur">
                  <option value="">Tous les ingénieurs</option>
                  {ingenieurs.map((i) => (
                    <option key={i} value={i}>
                      {i}
                    </option>
                  ))}
                </select>
              </div>
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Ingénieur</th>
                      <th>État</th>
                      <th>Dossier en cours</th>
                      <th>Opération</th>
                      <th>Client</th>
                      <th>Temps passé / délai {delaiMax} h</th>
                      <th className="text-right">Aujourd'hui</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visiblesIng.map((l) => {
                      const hors = l.h !== null && l.h >= delaiMax * 0.8;
                      return (
                        <tr key={l.nom}>
                          <td>
                            <span className="flex items-center gap-2.5 font-semibold capitalize whitespace-nowrap">
                              <Point p={l.p} />
                              <Avatar nom={l.nom} taille={24} />
                              {l.nom}
                            </span>
                          </td>
                          <td>
                            <span className={`badge ${ETAT[l.etat].cls} whitespace-nowrap`}>{ETAT[l.etat].texte}</span>
                          </td>
                          <td>
                            {l.d ? (
                              <>
                                {dossierCell(l.d)}
                                <span className={`block text-xs mt-0.5 ${l.d.nature_prod === "Modification" ? "text-isoGold-dark" : "text-brand-600"}`}>{l.d.nature_prod}</span>
                              </>
                            ) : (
                              <span className="text-ink/40">{l.etat === "off" ? "Pas connecté" : "Aucun dossier en cours"}</span>
                            )}
                          </td>
                          <td className="text-ink/70 whitespace-nowrap">{l.d?.nom_operation || "—"}</td>
                          <td className="text-ink/70">{l.d?.client || "—"}</td>
                          <td>
                            {l.h === null ? (
                              <span className="text-ink/25">—</span>
                            ) : (
                              <div className={`flex flex-col gap-1 min-w-[120px] text-xs ${hors ? "text-isoRed font-semibold" : "text-ink/60"}`}>
                                <span className="block h-1.5 rounded-full bg-paper overflow-hidden">
                                  <span className={`block h-full rounded-full ${l.etat === "pause" ? "bg-ink/25" : hors ? "bg-isoRed" : "bg-brand-500"}`} style={{ width: `${Math.min(100, (l.h / delaiMax) * 100)}%` }} />
                                </span>
                                {formatDuree(l.h)}
                                {l.etat === "pause" ? ", chrono arrêté" : l.h >= delaiMax ? ", hors délai" : hors ? ", bientôt hors délai" : ""}
                              </div>
                            )}
                          </td>
                          <td className="text-right">
                            <b className="font-display chiffre text-[17px]">{l.envoyes}</b>
                            <span className="block text-[11px] text-ink/45">envoyé(s)</span>
                          </td>
                        </tr>
                      );
                    })}
                    {visiblesIng.length === 0 && (
                      <tr>
                        <td colSpan={7} className="table-empty">
                          Aucun ingénieur sur cette fiche en ce moment.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {equipe !== "ingenieurs" && (
            <section className="card">
              <div className="card-header">
                <p className="card-title">
                  <Icon name="shield" size={15} className="text-ink/40" />
                  Service qualité
                  <span className="text-xs font-normal text-ink/50">
                    {enVerif.length} vérification(s) en cours · {lignesQ.reduce((s, l) => s + l.audites, 0)} audité(s) aujourd'hui
                  </span>
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Contrôleur</th>
                      <th>État</th>
                      <th>Dossier en vérification</th>
                      <th>Opération</th>
                      <th>Ingénieur</th>
                      <th>Depuis</th>
                      <th className="text-right">Aujourd'hui</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lignesQ.map((l) => (
                      <tr key={l.nom}>
                        <td>
                          <span className="flex items-center gap-2.5 font-semibold capitalize whitespace-nowrap">
                            <Point p={l.p} />
                            <Avatar nom={l.nom} taille={24} />
                            {l.nom}
                          </span>
                        </td>
                        <td>
                          <span className={`badge ${ETAT[l.etat].cls} whitespace-nowrap`}>{ETAT[l.etat].texte}</span>
                        </td>
                        <td>{dossierCell(l.d) || <span className="text-ink/40">{l.etat === "off" ? "Pas connecté" : "Prêt à contrôler"}</span>}</td>
                        <td className="text-ink/70 whitespace-nowrap">{l.d?.nom_operation || "—"}</td>
                        <td className="text-ink/70 capitalize">{l.d ? ingenieurResponsable(l.d) : "—"}</td>
                        <td className={`whitespace-nowrap ${l.depuis > 1 ? "text-isoRed font-medium" : "text-ink/70"}`}>{l.depuis === null ? "—" : formatDuree(l.depuis)}</td>
                        <td className="text-right">
                          <b className="font-display chiffre text-[17px]">{l.audites}</b>
                          <span className="block text-[11px] text-ink/45">audité(s)</span>
                        </td>
                      </tr>
                    ))}
                    {lignesQ.length === 0 && (
                      <tr>
                        <td colSpan={7} className="table-empty">
                          Aucune personne dans la liste Service qualité (Paramètres).
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>

        <aside className="card min-w-0">
          <div className="card-header">
            <p className="card-title">
              <Icon name="history" size={15} className="text-ink/40" />
              Fil d'activité
            </p>
            <span className="text-xs text-ink/50">aujourd'hui</span>
          </div>
          {fil.length === 0 ? (
            <p className="px-5 pb-5 text-sm text-ink/50">Aucune action enregistrée aujourd'hui.</p>
          ) : (
            <ul className="px-5 pb-2">
              {(toutFil ? fil : fil.slice(0, 12)).map((e) => {
                const t = texteEvenement(e, parId[e.dossier_id]);
                return (
                  <li key={e.id} className="grid grid-cols-[44px_1fr] gap-2 py-2.5 border-t border-line first:border-t-0 text-[13px] text-ink/70">
                    <time className="text-xs text-ink/45 tabular pt-px">{heure(e.created_at)}</time>
                    <span>
                      {t.qui && <b className="font-semibold text-ink capitalize">{t.qui} </b>}
                      {t.quoi} <b className="font-semibold text-ink whitespace-nowrap">{t.dos}</b>
                      {t.cause ? <span className="text-ink/50"> ({t.cause})</span> : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {fil.length > 12 && (
            <div className="px-5 pb-5">
              <button className="btn-secondary w-full justify-center" onClick={() => setToutFil((v) => !v)}>
                {toutFil ? "Afficher les 12 dernières" : `Afficher toute la journée (${fil.length})`}
              </button>
            </div>
          )}
        </aside>
      </div>
      <p className="text-xs text-ink/45 mt-4">Cet écran est visible par l'administration et les responsables. L'équipe est informée que son activité y est affichée.</p>
    </>
  );
}

/** Choix de l'équipe affichée (Tous / Ingénieurs / Service qualité). */
export function FiltreEquipe({ valeur, onChange, grand = false }) {
  return (
    <div className={`segmented ${grand ? "segmented-lg" : ""}`} role="group" aria-label="Équipe">
      {[
        ["tous", "Tous"],
        ["ingenieurs", "Ingénieurs"],
        ["qualite", "Service qualité"],
      ].map(([v, l]) => (
        <button type="button" key={v} data-active={valeur === v} onClick={() => onChange(v)}>
          {l}
        </button>
      ))}
    </div>
  );
}
