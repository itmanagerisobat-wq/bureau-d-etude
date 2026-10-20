"use client";
export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import Navbar from "@/components/Navbar";
import PageHeader from "@/components/ui/PageHeader";
import Icon from "@/components/ui/Icon";
import Modal from "@/components/ui/Modal";
import FactureDocument from "@/components/FactureDocument";
import { EcranChargement, EcranErreurProfil } from "@/components/ui/Screens";
import { useAppData } from "@/lib/useAppData";
import { exporterDossiers } from "@/lib/exportDossiers";
import {
  CONFIG_DEFAUT,
  ajouterJours,
  bornesMois,
  completerConfig,
  construireLignes,
  dateFr,
  dossiersAFacturer,
  euros,
  moisPrecedent,
  numeroSuivant,
  totaux,
} from "@/lib/facturation";

const ONGLETS = [
  ["nouvelle", "Nouvelle facture", "plus"],
  ["historique", "Factures enregistrées", "history"],
  ["parametres", "Paramètres de facturation", "settings"],
];
const aujourdhui = () => new Date().toLocaleDateString("sv-SE");
const debutJour = (iso) => new Date(`${iso}T00:00:00`).toISOString();
const finJour = (iso) => new Date(`${iso}T23:59:59.999`).toISOString();

function Champ({ label, children, aide, className = "" }) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-sm font-medium text-ink/80 mb-1.5">{label}</span>
      {children}
      {aide && <span className="block text-xs text-ink/50 mt-1">{aide}</span>}
    </label>
  );
}

export default function FacturationPage() {
  const { profile, erreurProfil, options, loading, supabase } = useAppData();
  const [onglet, setOnglet] = useState("nouvelle");
  const [config, setConfig] = useState(CONFIG_DEFAUT);
  const [tablesOk, setTablesOk] = useState(true);
  const [factures, setFactures] = useState([]);
  const [message, setMessage] = useState(null); // { ton, texte }

  // Critères de la nouvelle facture
  const [client, setClient] = useState("");
  const [modePeriode, setModePeriode] = useState("mois"); // mois | libre
  const [mois, setMois] = useState(moisPrecedent());
  const [du, setDu] = useState(bornesMois(moisPrecedent()).du);
  const [au, setAu] = useState(bornesMois(moisPrecedent()).au);
  const [base, setBase] = useState("audit");
  const [nouveaux, setNouveaux] = useState(true);
  const [modifications, setModifications] = useState(false);
  const [exclureFactures, setExclureFactures] = useState(true);
  const [modele, setModele] = useState("simple");
  const [dateFacture, setDateFacture] = useState(aujourdhui());
  const [numero, setNumero] = useState("");
  const [numeroTouche, setNumeroTouche] = useState(false);
  const [dossiers, setDossiers] = useState([]);
  const [chargement, setChargement] = useState(false);
  const [enregistrement, setEnregistrement] = useState(false);

  // Historique
  const [factureVue, setFactureVue] = useState(null);
  const [aAnnuler, setAAnnuler] = useState(null);
  const [motif, setMotif] = useState("");

  const estAdmin = profile?.role === "admin";

  async function chargerReferentiel() {
    const [p, f] = await Promise.all([
      supabase.from("facturation_parametres").select("config").eq("id", 1).maybeSingle(),
      supabase.from("factures").select("*").order("created_at", { ascending: false }).limit(1000),
    ]);
    if (p.error || f.error) {
      setTablesOk(false);
      return;
    }
    setTablesOk(true);
    setConfig(completerConfig(p.data?.config || {}));
    setFactures(f.data || []);
  }

  useEffect(() => {
    if (profile && estAdmin) chargerReferentiel();
  }, [profile]);

  useEffect(() => {
    if (!client && options.clients?.length) setClient(options.clients[0]);
  }, [options.clients]);

  const periode = modePeriode === "mois" ? bornesMois(mois) : { du, au };

  // Dossiers de la période pour ce client (filtrés côté serveur sur la date)
  useEffect(() => {
    if (!profile || !estAdmin || !client || !periode.du || !periode.au) return;
    let fini = false;
    (async () => {
      setChargement(true);
      let q = supabase.from("dossiers").select("*").eq("client", client);
      q = base === "saisie" ? q.gte("date", periode.du).lte("date", periode.au) : q.gte("date_verification", debutJour(periode.du)).lte("date_verification", finJour(periode.au));
      const { data } = await q.limit(10000);
      if (!fini) {
        setDossiers(data || []);
        setChargement(false);
      }
    })();
    return () => {
      fini = true;
    };
  }, [profile, client, periode.du, periode.au, base]);

  const dejaFactures = useMemo(() => {
    const s = new Set();
    for (const f of factures) if (!f.annulee) for (const d of f.dossiers || []) s.add(d.id);
    return s;
  }, [factures]);

  const { retenus, dejaFactures: deja } = dossiersAFacturer(dossiers, { client, du: periode.du, au: periode.au, base, nouveaux, modifications, exclureFactures, dejaFactures });
  const lignes = construireLignes(retenus, config, base);
  const t = totaux(lignes, config.tva);
  const numeroAuto = numeroSuivant(config.prefixe, dateFacture, factures.map((f) => f.numero));
  useEffect(() => {
    if (!numeroTouche) setNumero(numeroAuto);
  }, [numeroAuto, numeroTouche]);

  const fiche = config.clients?.[client] || {};
  const facture = {
    numero: numero || numeroAuto,
    date_facture: dateFacture,
    date_echeance: ajouterJours(dateFacture, config.delai_jours),
    modele,
    periode_du: periode.du,
    periode_au: periode.au,
    clientNom: client,
    client: fiche,
    config,
    lignes,
    totaux: t,
  };

  function imprimer() {
    document.body.classList.add("impression-facture");
    const retirer = () => {
      document.body.classList.remove("impression-facture");
      window.removeEventListener("afterprint", retirer);
    };
    window.addEventListener("afterprint", retirer);
    setTimeout(() => window.print(), 50);
  }

  async function enregistrer() {
    if (!lignes.length) return;
    if (factures.some((f) => f.numero === facture.numero)) {
      setMessage({ ton: "red", texte: `Le numéro ${facture.numero} existe déjà. Choisissez un autre numéro.` });
      return;
    }
    setEnregistrement(true);
    const { error } = await supabase.from("factures").insert({
      numero: facture.numero,
      client,
      modele,
      periode_du: periode.du,
      periode_au: periode.au,
      date_facture: dateFacture,
      date_echeance: facture.date_echeance,
      inclut_nouveaux: nouveaux,
      inclut_modifications: modifications,
      total_ht: t.ht,
      total_tva: t.tva,
      total_ttc: t.ttc,
      lignes,
      dossiers: retenus.map((d) => ({ id: d.id, nom: d.nom_dossier, fiche: d.nom_operation, nature: d.nature_prod })),
      config: { ...config, client: fiche, clientNom: client },
      cree_par: profile.nom_complet || "",
    });
    setEnregistrement(false);
    if (error) {
      setMessage({ ton: "red", texte: `La facture n'a pas pu être enregistrée : ${error.message}` });
      return;
    }
    setMessage({ ton: "green", texte: `Facture ${facture.numero} enregistrée. Ses ${retenus.length} dossiers ne seront plus proposés sur une autre facture.` });
    setNumeroTouche(false);
    chargerReferentiel();
  }

  async function annulerFacture() {
    const { error } = await supabase.from("factures").update({ annulee: true, annulee_motif: motif.trim() }).eq("id", aAnnuler.id);
    if (error) {
      setMessage({ ton: "red", texte: `L'annulation n'a pas pu être enregistrée : ${error.message}` });
    } else {
      setMessage({ ton: "green", texte: `Facture ${aAnnuler.numero} annulée. Ses dossiers peuvent de nouveau être facturés.` });
    }
    setAAnnuler(null);
    setMotif("");
    chargerReferentiel();
  }

  if (erreurProfil) return <EcranErreurProfil message={erreurProfil} />;
  if (loading || !profile) return <EcranChargement />;

  if (!estAdmin) {
    return (
      <div className="min-h-screen">
        <Navbar role={profile.role} nom={profile.nom_complet} />
        <main className="max-w-3xl mx-auto px-4 py-16 text-center text-ink/60">La facturation est réservée aux comptes Admin.</main>
      </div>
    );
  }

  const vueFacture = factureVue && {
    numero: factureVue.numero,
    date_facture: factureVue.date_facture,
    date_echeance: factureVue.date_echeance,
    modele: factureVue.modele,
    periode_du: factureVue.periode_du,
    periode_au: factureVue.periode_au,
    clientNom: factureVue.client,
    client: factureVue.config?.client || {},
    config: completerConfig(factureVue.config || {}),
    lignes: factureVue.lignes || [],
    totaux: { ht: Number(factureVue.total_ht), tva: Number(factureVue.total_tva), ttc: Number(factureVue.total_ttc) },
  };

  return (
    <div className="min-h-screen">
      <Navbar role={profile.role} nom={profile.nom_complet} />
      <main className="max-w-[1800px] mx-auto px-3 sm:px-4 lg:px-5 py-6">
        <div className="no-print">
          <PageHeader icone="receipt" titre="Facturation" sousTitre="Factures mensuelles par client, à partir des dossiers de la période.">
            <div className="onglets-hero flex flex-wrap gap-1 -mb-2 mt-2 border-b border-white/25">
              {ONGLETS.map(([v, l, i]) => (
                <button key={v} onClick={() => (setOnglet(v), setFactureVue(null))} aria-current={onglet === v ? "page" : undefined} className="flex items-center gap-2 px-4 h-11 border-b-2 -mb-px text-sm font-semibold whitespace-nowrap">
                  <Icon name={i} size={16} />
                  {l}
                </button>
              ))}
            </div>
          </PageHeader>
        </div>

        <div className="zone-facture">
          {(!tablesOk || message) && (
            <div className="no-print space-y-3 mb-4">
              {!tablesOk && (
                <div className="alert alert-gold">
                  <Icon name="alert" size={16} />
                  <span>
                    La migration V31 n'est pas encore exécutée dans Supabase : les paramètres affichés sont ceux par défaut, et les factures ne peuvent pas être enregistrées (l'impression fonctionne).
                  </span>
                </div>
              )}
              {message && (
                <div className={`alert alert-${message.ton === "green" ? "green" : "red"} justify-between`}>
                  <span>{message.texte}</span>
                  <button className="btn-ghost btn-xs" onClick={() => setMessage(null)} aria-label="Fermer le message">
                    <Icon name="x" size={14} />
                  </button>
                </div>
              )}
            </div>
          )}

          {onglet === "nouvelle" && (
            <div className="grille-facture grid xl:grid-cols-[380px_minmax(0,1fr)] gap-6 items-start">
              <section className="card p-5 space-y-4 no-print">
                <Champ label="Client facturé">
                  <select className="input w-full" value={client} onChange={(e) => setClient(e.target.value)}>
                    {options.clients.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </Champ>
                {!fiche.raison_sociale && (
                  <p className="text-xs text-isoGold-dark -mt-2">
                    Adresse de facturation de ce client à compléter dans{" "}
                    <button className="underline font-medium" onClick={() => setOnglet("parametres")}>
                      Paramètres de facturation
                    </button>
                    .
                  </p>
                )}

                <fieldset>
                  <legend className="block text-sm font-medium text-ink/80 mb-1.5">Période facturée</legend>
                  <div className="segmented mb-2" role="group">
                    <button type="button" data-active={modePeriode === "mois"} onClick={() => setModePeriode("mois")}>
                      Un mois
                    </button>
                    <button type="button" data-active={modePeriode === "libre"} onClick={() => setModePeriode("libre")}>
                      Du… au…
                    </button>
                  </div>
                  {modePeriode === "mois" ? (
                    <input type="month" className="input w-full" value={mois} onChange={(e) => e.target.value && setMois(e.target.value)} aria-label="Mois facturé" />
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      <Champ label="Du">
                        <input type="date" className="input w-full" value={du} onChange={(e) => setDu(e.target.value)} />
                      </Champ>
                      <Champ label="Au">
                        <input type="date" className="input w-full" value={au} min={du} onChange={(e) => setAu(e.target.value)} />
                      </Champ>
                    </div>
                  )}
                </fieldset>

                <Champ label="Dossiers comptés" aide="Date qui fait entrer un dossier dans la période.">
                  <select className="input w-full" value={base} onChange={(e) => setBase(e.target.value)}>
                    <option value="audit">Audités dans la période (date d'audit)</option>
                    <option value="saisie">Saisis dans la période (date du dossier)</option>
                  </select>
                </Champ>

                <fieldset className="space-y-2">
                  <legend className="block text-sm font-medium text-ink/80 mb-1.5">Contenu de la facture</legend>
                  <label className="flex items-center gap-2.5 text-sm min-h-[32px]">
                    <input type="checkbox" className="w-4 h-4" checked={nouveaux} onChange={(e) => setNouveaux(e.target.checked)} />
                    Nouveaux dossiers
                  </label>
                  <label className="flex items-center gap-2.5 text-sm min-h-[32px]">
                    <input type="checkbox" className="w-4 h-4" checked={modifications} onChange={(e) => setModifications(e.target.checked)} />
                    Modifications <span className="text-xs text-ink/45">(prix dans les paramètres)</span>
                  </label>
                  <label className="flex items-center gap-2.5 text-sm min-h-[32px]">
                    <input type="checkbox" className="w-4 h-4" checked={exclureFactures} onChange={(e) => setExclureFactures(e.target.checked)} />
                    Exclure les dossiers déjà facturés
                  </label>
                  {deja.length > 0 && (
                    <p className="text-xs text-ink/55 pl-6">
                      {deja.length} dossier(s) de la période figurent déjà sur une facture{exclureFactures ? " et sont exclus" : " et sont inclus"}.
                    </p>
                  )}
                </fieldset>

                <fieldset>
                  <legend className="block text-sm font-medium text-ink/80 mb-1.5">Modèle</legend>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      ["simple", "Facture", "une ligne par fiche"],
                      ["detaillee", "Facture détaillée", "avec le nom des dossiers"],
                    ].map(([v, l, s]) => (
                      <button key={v} type="button" onClick={() => setModele(v)} aria-pressed={modele === v} className={`text-left rounded-lg border px-3 py-2.5 ${modele === v ? "border-brand-500 ring-1 ring-brand-500 bg-brand-50/40" : "border-line hover:border-ink/25"}`}>
                        <span className="block text-sm font-semibold">{l}</span>
                        <span className="block text-xs text-ink/55">{s}</span>
                      </button>
                    ))}
                  </div>
                </fieldset>

                <div className="grid grid-cols-2 gap-2">
                  <Champ label="Date de facture">
                    <input type="date" className="input w-full" value={dateFacture} onChange={(e) => e.target.value && setDateFacture(e.target.value)} />
                  </Champ>
                  <Champ label="Numéro" aide={numeroTouche ? <button className="underline" onClick={() => setNumeroTouche(false)}>Revenir au numéro automatique</button> : "Automatique"}>
                    <input
                      className="input w-full"
                      value={numero}
                      onChange={(e) => {
                        setNumero(e.target.value.trim());
                        setNumeroTouche(true);
                      }}
                    />
                  </Champ>
                </div>

                <div className="rounded-lg bg-paper px-4 py-3 text-sm">
                  <p className="flex justify-between">
                    <span className="text-ink/60">Dossiers facturés</span>
                    <b className="tabular">{chargement ? "…" : retenus.length}</b>
                  </p>
                  <p className="flex justify-between mt-1">
                    <span className="text-ink/60">Total HT</span>
                    <b className="tabular">{euros(t.ht)} €</b>
                  </p>
                  <p className="flex justify-between mt-1">
                    <span className="text-ink/60">Total TTC</span>
                    <b className="tabular">{euros(t.ttc)} €</b>
                  </p>
                </div>

                <div className="flex flex-col gap-2">
                  <button className="btn-primary justify-center" onClick={enregistrer} disabled={!tablesOk || !lignes.length || enregistrement}>
                    <Icon name="check" size={16} />
                    {enregistrement ? "Enregistrement…" : `Enregistrer la facture ${facture.numero}`}
                  </button>
                  <div className="grid grid-cols-2 gap-2">
                    <button className="btn-secondary justify-center" onClick={imprimer} disabled={!lignes.length}>
                      <Icon name="download" size={16} />
                      Imprimer / PDF
                    </button>
                    <button className="btn-secondary justify-center" onClick={() => exporterDossiers(retenus, `HILLSOLUTION_facture_${facture.numero}`)} disabled={!retenus.length}>
                      <Icon name="file" size={16} />
                      Liste Excel
                    </button>
                  </div>
                  <p className="text-xs text-ink/50">Pour un PDF : « Imprimer / PDF », puis choisir « Enregistrer au format PDF ».</p>
                </div>
              </section>

              <div className="apercu-facture">
                <FactureDocument facture={facture} />
              </div>
            </div>
          )}

          {onglet === "historique" && !factureVue && (
            <section className="card no-print">
              <div className="card-header">
                <p className="card-title">Factures enregistrées</p>
                <span className="text-xs text-ink/50">{factures.length} facture(s)</span>
              </div>
              <div className="overflow-x-auto">
                <table className="table table-hover">
                  <thead>
                    <tr>
                      <th>Numéro</th>
                      <th>Date</th>
                      <th>Client</th>
                      <th>Période</th>
                      <th>Modèle</th>
                      <th className="text-right">Dossiers</th>
                      <th className="text-right">Total HT</th>
                      <th className="text-right">Total TTC</th>
                      <th>État</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {factures.map((f) => (
                      <tr key={f.id} className={f.annulee ? "opacity-60" : ""}>
                        <td className="font-semibold whitespace-nowrap">{f.numero}</td>
                        <td className="whitespace-nowrap">{dateFr(f.date_facture)}</td>
                        <td>{f.client}</td>
                        <td className="whitespace-nowrap">
                          {dateFr(f.periode_du)} → {dateFr(f.periode_au)}
                        </td>
                        <td>{f.modele === "detaillee" ? "Détaillée" : "Simple"}</td>
                        <td className="text-right tabular">{(f.dossiers || []).length}</td>
                        <td className="text-right tabular whitespace-nowrap">{euros(f.total_ht)} €</td>
                        <td className="text-right tabular whitespace-nowrap font-semibold">{euros(f.total_ttc)} €</td>
                        <td>{f.annulee ? <span className="badge badge-neutral" title={f.annulee_motif || ""}>Annulée</span> : <span className="badge badge-green">Émise</span>}</td>
                        <td className="text-right whitespace-nowrap">
                          <button className="btn-secondary btn-sm" onClick={() => setFactureVue(f)}>
                            <Icon name="eye" size={14} />
                            Afficher
                          </button>
                          {!f.annulee && (
                            <button className="btn-ghost btn-sm text-isoRed ml-1" onClick={() => setAAnnuler(f)}>
                              Annuler
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {factures.length === 0 && (
                      <tr>
                        <td colSpan={10} className="table-empty">
                          Aucune facture enregistrée. Créez-en une dans « Nouvelle facture ».
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {onglet === "historique" && factureVue && (
            <>
              <div className="flex flex-wrap gap-2 mb-4 no-print">
                <button className="btn-secondary" onClick={() => setFactureVue(null)}>
                  <Icon name="chevronRight" size={16} className="rotate-180" />
                  Revenir à la liste
                </button>
                <button className="btn-primary" onClick={imprimer}>
                  <Icon name="download" size={16} />
                  Imprimer / PDF
                </button>
                {factureVue.annulee && <span className="badge badge-neutral self-center">Facture annulée{factureVue.annulee_motif ? ` : ${factureVue.annulee_motif}` : ""}</span>}
              </div>
              <div className="apercu-facture">
                <FactureDocument facture={vueFacture} />
              </div>
            </>
          )}

          {onglet === "parametres" && <ParametresFacturation config={config} options={options} supabase={supabase} actif={tablesOk} nom={profile.nom_complet} onEnregistre={(c, txt) => (setConfig(c), setMessage(txt))} />}
        </div>
      </main>

      {aAnnuler && (
        <Modal
          titre={`Annuler la facture ${aAnnuler.numero}`}
          sousTitre={`${aAnnuler.client} · ${euros(aAnnuler.total_ttc)} € TTC`}
          onFermer={() => setAAnnuler(null)}
          taille="sm"
          pied={
            <div className="flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setAAnnuler(null)}>
                Garder la facture
              </button>
              <button className="btn-danger" onClick={annulerFacture} disabled={!motif.trim()}>
                Annuler la facture {aAnnuler.numero}
              </button>
            </div>
          }
        >
          <p className="text-sm text-ink/70 mb-3">La facture reste dans l'historique, marquée « annulée ». Ses dossiers pourront être facturés à nouveau.</p>
          <Champ label="Motif de l'annulation">
            <textarea className="input w-full min-h-[80px]" value={motif} onChange={(e) => setMotif(e.target.value)} />
          </Champ>
        </Modal>
      )}
    </div>
  );
}

/** Onglet Paramètres : émetteur, banque, mentions, clients facturés, tarifs par fiche. */
function ParametresFacturation({ config, options, supabase, actif, nom, onEnregistre }) {
  const [b, setB] = useState(config);
  const [enCours, setEnCours] = useState(false);
  useEffect(() => setB(config), [config]);

  const maj = (groupe, champ) => (e) => setB((x) => ({ ...x, [groupe]: { ...x[groupe], [champ]: e.target.value } }));
  const majRacine = (champ) => (e) => setB((x) => ({ ...x, [champ]: e.target.value }));
  const majClient = (c, champ) => (e) => setB((x) => ({ ...x, clients: { ...x.clients, [c]: { ...(x.clients[c] || {}), [champ]: e.target.value } } }));
  const majTarif = (o, champ) => (e) => setB((x) => ({ ...x, tarifs: { ...x.tarifs, [o]: { ...(x.tarifs[o] || {}), [champ]: e.target.value } } }));

  async function enregistrer() {
    setEnCours(true);
    const { error } = await supabase.from("facturation_parametres").upsert({ id: 1, config: b, updated_at: new Date().toISOString(), updated_by: nom || "" });
    setEnCours(false);
    onEnregistre(error ? config : b, error ? { ton: "red", texte: `Les paramètres n'ont pas pu être enregistrés : ${error.message}` } : { ton: "green", texte: "Paramètres de facturation enregistrés." });
  }

  const champ = (label, valeur, onChange, props = {}) => (
    <Champ label={label}>
      <input className="input w-full" value={valeur ?? ""} onChange={onChange} {...props} />
    </Champ>
  );

  return (
    <div className="space-y-6 no-print">
      <div className="grid lg:grid-cols-3 gap-6">
        <section className="card p-5 space-y-3">
          <p className="card-title mb-1">Émetteur</p>
          {champ("Nom", b.emetteur.nom, maj("emetteur", "nom"))}
          {champ("Adresse", b.emetteur.adresse, maj("emetteur", "adresse"))}
          {champ("Code postal et ville", b.emetteur.cp_ville, maj("emetteur", "cp_ville"))}
          {champ("Téléphone", b.emetteur.tel, maj("emetteur", "tel"))}
          {champ("Email", b.emetteur.email, maj("emetteur", "email"))}
          {champ("Site web", b.emetteur.web, maj("emetteur", "web"))}
        </section>
        <section className="card p-5 space-y-3">
          <p className="card-title mb-1">Règlement</p>
          {champ("Conditions de règlement", b.conditions, majRacine("conditions"))}
          {champ("Bénéficiaire", b.banque.beneficiaire, maj("banque", "beneficiaire"))}
          {champ("IBAN", b.banque.iban, maj("banque", "iban"))}
          <div className="grid grid-cols-2 gap-2">
            {champ("BIC", b.banque.bic, maj("banque", "bic"))}
            {champ("Banque", b.banque.banque, maj("banque", "banque"))}
          </div>
          {champ("Adresse de la banque", b.banque.adresse, maj("banque", "adresse"))}
        </section>
        <section className="card p-5 space-y-3">
          <p className="card-title mb-1">Facture et mentions légales</p>
          <div className="grid grid-cols-3 gap-2">
            {champ("Préfixe", b.prefixe, majRacine("prefixe"))}
            {champ("TVA %", b.tva, majRacine("tva"), { inputMode: "decimal" })}
            {champ("Échéance (jours)", b.delai_jours, majRacine("delai_jours"), { inputMode: "numeric" })}
          </div>
          {champ("Catégorie d'opérations", b.categorie, majRacine("categorie"))}
          {champ("Forme juridique", b.pied.forme, maj("pied", "forme"))}
          <div className="grid grid-cols-2 gap-2">
            {champ("Capital", b.pied.capital, maj("pied", "capital"))}
            {champ("SIRET", b.pied.siret, maj("pied", "siret"))}
          </div>
          {champ("Numéro de TVA", b.pied.tva_intra, maj("pied", "tva_intra"))}
        </section>
      </div>

      <section className="card">
        <div className="card-header">
          <p className="card-title">Clients facturés</p>
          <span className="text-xs text-ink/50">Le nom affiché sur la facture peut être différent du nom dans l'application.</span>
        </div>
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Client (application)</th>
                <th>Raison sociale sur la facture</th>
                <th>Adresse</th>
                <th>Code postal et ville</th>
                <th>Code client</th>
              </tr>
            </thead>
            <tbody>
              {options.clients.map((c) => {
                const v = b.clients[c] || {};
                return (
                  <tr key={c}>
                    <td className="font-medium whitespace-nowrap">{c}</td>
                    <td>
                      <input className="input input-sm w-full min-w-[180px]" aria-label={`Raison sociale de ${c}`} value={v.raison_sociale || ""} onChange={majClient(c, "raison_sociale")} placeholder="ex. PRIME EVOLUTION" />
                    </td>
                    <td>
                      <input className="input input-sm w-full min-w-[200px]" aria-label={`Adresse de ${c}`} value={v.adresse || ""} onChange={majClient(c, "adresse")} />
                    </td>
                    <td>
                      <input className="input input-sm w-full min-w-[180px]" aria-label={`Code postal et ville de ${c}`} value={v.cp_ville || ""} onChange={majClient(c, "cp_ville")} />
                    </td>
                    <td>
                      <input className="input input-sm w-full min-w-[130px]" aria-label={`Code client de ${c}`} value={v.code_client || ""} onChange={majClient(c, "code_client")} placeholder="ex. CU2512-00007" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <div className="card-header flex-wrap gap-3">
          <p className="card-title">Tarifs par fiche</p>
          <div className="flex flex-wrap items-end gap-2">
            <Champ label="Désignation par défaut" className="w-64">
              <input className="input input-sm w-full" value={b.designation_defaut} onChange={majRacine("designation_defaut")} />
            </Champ>
            <Champ label="P.U. nouveau" className="w-28">
              <input className="input input-sm w-full" inputMode="decimal" value={b.pu_nouveau_defaut} onChange={majRacine("pu_nouveau_defaut")} />
            </Champ>
            <Champ label="P.U. modification" className="w-32">
              <input className="input input-sm w-full" inputMode="decimal" value={b.pu_modification_defaut} onChange={majRacine("pu_modification_defaut")} />
            </Champ>
          </div>
        </div>
        <p className="px-5 -mt-1 mb-2 text-xs text-ink/50">{"{fiche}"} est remplacé par le nom de la fiche. Laisser une case vide pour utiliser la valeur par défaut.</p>
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Fiche</th>
                <th>Désignation sur la facture</th>
                <th className="text-right">P.U. HT nouveau dossier</th>
                <th className="text-right">P.U. HT modification</th>
              </tr>
            </thead>
            <tbody>
              {options.operations.map((o) => {
                const v = b.tarifs[o] || {};
                return (
                  <tr key={o}>
                    <td className="font-medium whitespace-nowrap">{o}</td>
                    <td>
                      <input className="input input-sm w-full min-w-[320px]" aria-label={`Désignation ${o}`} value={v.designation || ""} onChange={majTarif(o, "designation")} placeholder={b.designation_defaut.replace("{fiche}", o)} />
                    </td>
                    <td className="text-right">
                      <input className="input input-sm w-28 text-right" aria-label={`Prix nouveau ${o}`} inputMode="decimal" value={v.pu_nouveau ?? ""} onChange={majTarif(o, "pu_nouveau")} placeholder={String(b.pu_nouveau_defaut)} />
                    </td>
                    <td className="text-right">
                      <input className="input input-sm w-28 text-right" aria-label={`Prix modification ${o}`} inputMode="decimal" value={v.pu_modification ?? ""} onChange={majTarif(o, "pu_modification")} placeholder={String(b.pu_modification_defaut)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <div className="flex justify-end gap-2 sticky bottom-4">
        <button className="btn-secondary" onClick={() => setB(config)}>
          Annuler les changements
        </button>
        <button className="btn-primary" onClick={enregistrer} disabled={!actif || enCours}>
          <Icon name="check" size={16} />
          {enCours ? "Enregistrement…" : "Enregistrer les paramètres"}
        </button>
      </div>
    </div>
  );
}
