"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import Navbar from "@/components/Navbar";
import DossierFormSaisie from "@/components/DossierFormSaisie";
import CommentThread from "@/components/CommentThread";
import HistoriqueDossier from "@/components/HistoriqueDossier";
import ObjectifJour from "@/components/ObjectifJour";
import PageHeader, { SectionTitle } from "@/components/ui/PageHeader";
import Modal from "@/components/ui/Modal";
import Icon from "@/components/ui/Icon";
import StatutBadge from "@/components/ui/StatutBadge";
import { gardePage } from "@/components/ui/Screens";
import { useAppData } from "@/lib/useAppData";
import { useValidateurActif } from "@/lib/useValidateurActif";
import { chargeParIngenieur as calculerCharge } from "@/lib/scoring";
import { enregistrerEvenement, annulerAction, instantane } from "@/lib/actions";
import { S, formatDate, formatDuree, ETATS, TYPES_RETOUR, typeDernierRetour, rangsModifs } from "@/lib/constants";
import FicheBeneficiaire from "@/components/FicheBeneficiaire";
import ImportDossiers, { exporterFile } from "@/components/ImportDossiers";
import { BadgeRetour } from "@/components/DossierTable";
import UndoToast from "@/components/ui/UndoToast";
import { attribuerAutomatiquement } from "@/lib/dispatch";
import EditionDossier from "@/components/EditionDossier";
import { supprimerDossierAvecTrace } from "@/lib/suppressionDossier";
import ListeIngenieurs from "@/components/ListeIngenieurs";
import FiltreColonne, { valeursColonne } from "@/components/ui/FiltreColonne";
import FiltrePeriode, { PERIODE_INITIALE, dansPeriode } from "@/components/ui/FiltrePeriode";
import { StatutDossier } from "@/components/DossierTable";
import { equipeDuClient } from "@/lib/dispatch";
import FichiersDossier from "@/components/FichiersDossier";
import CelluleFichiers, { useFichiers } from "@/components/CelluleFichiers";

export default function SaisiePage() {
  const { profile, erreurProfil, options, loading, supabase } = useAppData();
  const { nom: nomSelectionne, pret: pretPersonne, selectionner, changerDePersonne, validateurs } =
    useValidateurActif(profile, supabase);
  const estAdmin = profile?.role === "admin";
  // Admin et Qualité ont chacun leur propre compte : pas de code PIN
  const nominatif = ["admin", "qualite"].includes(profile?.role);
  const nomActif = nominatif ? profile?.nom_complet : nomSelectionne;
  const nomTrace = nomActif || null;
  const [dossiers, setDossiers] = useState([]);
  const [dossierOuvert, setDossierOuvert] = useState(null);
  const [commentaires, setCommentaires] = useState([]);
  const [evenements, setEvenements] = useState([]);
  const [formulaireOuvert, setFormulaireOuvert] = useState(false);
  const [importOuvert, setImportOuvert] = useState(false);
  const [listeIngenieursOuverte, setListeIngenieursOuverte] = useState(false);
  // Filtres « façon Excel » dans les en-têtes : null = pas de filtre, sinon Set des valeurs gardées
  const [periode, setPeriode] = useState(PERIODE_INITIALE);
  const [filtresCol, setFiltresCol] = useState({ ingenieur: null, fiche: null, statut: null, ficheFile: null });
  const [edition, setEdition] = useState(false);

  const [file, setFile] = useState([]);
  const [recherche, setRecherche] = useState("");
  const [assignation, setAssignation] = useState({}); // { [dossierId]: ingénieur choisi }
  const [derniereAction, setDerniereAction] = useState(null);
  const [message, setMessage] = useState(null);
  // Distribution de la file : « auto » (les ingénieurs prennent eux-mêmes) ou « manuel » (attribution ici)
  const [fileMode, setFileMode] = useState("auto");
  const [config, setConfig] = useState(null);
  const [distribution, setDistribution] = useState(false);
  const fichiers = useFichiers(supabase, !!profile);
  const celluleFichiers = (d, sansInserer = false) => (
    <td onClick={(e) => e.stopPropagation()}>
      <CelluleFichiers
        sansInserer={sansInserer}
        supabase={supabase}
        dossier={d}
        fichiers={fichiers.parDossier[d.id]}
        auteur={nomActif}
        onChange={fichiers.recharger}
        desactive={fichiers.indisponible}
      />
    </td>
  );

  async function chargerDossiers() {
    const [{ data: f }, { data: autres }] = await Promise.all([
      supabase.from("dossiers").select("*").eq("etat", S.FILE).limit(5000),
      supabase
        .from("dossiers")
        .select("*")
        .neq("etat", S.FILE)
        .order("created_at", { ascending: false })
        .limit(500),
    ]);
    setFile(
      (f || []).sort(
        (a, b) =>
          (b.prioritaire ? 1 : 0) - (a.prioritaire ? 1 : 0) ||
          String(a.date_mise_en_file || a.created_at).localeCompare(String(b.date_mise_en_file || b.created_at))
      )
    );
    setDossiers(autres || []);
  }

  function memoriser(d, libelle, evenementId) {
    const action = { dossierId: d.id, nomDossier: d.nom_dossier, libelle, ancienChamps: instantane(d), evenementId };
    setDerniereAction(action);
    setTimeout(() => setDerniereAction((a) => (a === action ? null : a)), 9000);
  }

  async function annulerDerniereAction() {
    if (!derniereAction) return;
    await annulerAction(supabase, derniereAction);
    setDerniereAction(null);
    chargerDossiers();
  }

  async function assignerManuel(d) {
    const ing = assignation[d.id];
    if (!ing) return;
    const horsHab = !(options.habilitations?.[ing] || []).includes(d.nom_operation);
    const { error } = await supabase
      .from("dossiers")
      .update({ etat: S.ASSIGNE, ingenieur: ing, date_assignation: new Date().toISOString(), hors_habilitation: horsHab })
      .eq("id", d.id);
    if (error) return alert("Attribution impossible : " + error.message);
    const evt = await enregistrerEvenement(supabase, d.id, "assignation", {
      nom: nomTrace,
      cause: `→ ${ing}${horsHab ? " (hors fiche habituelle)" : ""}`,
    });
    memoriser(d, `Attribué à ${ing}`, evt);
    setAssignation((a) => ({ ...a, [d.id]: "" }));
    chargerDossiers();
  }

  useEffect(() => {
    if (!profile) return;
    (async () => {
      const { data } = await supabase.from("parametres_config").select("*").order("id").limit(1).maybeSingle();
      setConfig(data);
      if (data?.file_mode) setFileMode(data.file_mode);
    })();
  }, [profile]);

  async function changerMode(mode) {
    if (!config || !("file_mode" in config)) return setMessage({ ton: "red", texte: "Exécutez la migration V24 dans Supabase pour enregistrer ce réglage." });
    const avant = fileMode;
    setFileMode(mode);
    const { error } = await supabase.from("parametres_config").update({ file_mode: mode }).eq("id", config.id);
    if (error) {
      setFileMode(avant);
      setMessage({ ton: "red", texte: "Réglage non enregistré : " + error.message });
    }
  }

  // Mode auto : attribue d'un coup tous les dossiers de la file à l'ingénieur le plus disponible
  async function toutAttribuer() {
    const liste = fileFiltree.filter((d) => d.nom_operation);
    if (!liste.length) return;
    if (!confirm(`Attribuer automatiquement les ${liste.length} dossier(s) de la file aux ingénieurs disponibles ?`)) return;
    setDistribution(true);
    let ok = 0;
    const echecs = [];
    for (const d of liste) {
      // eslint-disable-next-line no-await-in-loop
      const r = await attribuerAutomatiquement(supabase, d, options, nomTrace);
      if (r.ok) ok++;
      else echecs.push(`${d.nom_dossier} : ${r.erreur}`);
    }
    setDistribution(false);
    setMessage({ ton: echecs.length ? "red" : "green", texte: `${ok} dossier(s) attribué(s).${echecs.length ? ` Non attribués : ${echecs.slice(0, 5).join(" ; ")}` : ""}` });
    chargerDossiers();
  }


  useEffect(() => {
    if (!profile) return;
    chargerDossiers();
  }, [profile]);

  async function ouvrirDossier(d) {
    setDossierOuvert(d);
    const [{ data: coms }, { data: evts }] = await Promise.all([
      supabase.from("dossier_commentaires").select("*").eq("dossier_id", d.id).order("created_at", { ascending: true }),
      supabase.from("dossier_evenements").select("*").eq("dossier_id", d.id).order("created_at", { ascending: true }),
    ]);
    setCommentaires(coms || []);
    setEvenements(evts || []);
  }

  async function ajouterCommentaire(texte) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    await supabase.from("dossier_commentaires").insert({
      dossier_id: dossierOuvert.id,
      auteur_id: user.id,
      auteur_nom: nomTrace,
      contenu: texte,
    });
    ouvrirDossier(dossierOuvert);
  }

  async function soumettreDossier(form) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const dansLaFile = form.mode === "file";
    const maintenant = new Date().toISOString();
    const payload = {
      date: form.date,
      nom_dossier: form.nom_dossier.trim(),
      nom_operation: form.nom_operation,
      client: form.client || null,
      nature_prod: form.nature_prod,
      commentaire: form.commentaire || null,
      beneficiaire_nom: form.beneficiaire_nom.trim() || null,
      beneficiaire_siret: form.beneficiaire_siret.replace(/\s/g, "") || null,
      beneficiaire_responsable: form.beneficiaire_responsable.trim() || null,
      beneficiaire_adresse: form.beneficiaire_adresse.trim() || null,
      beneficiaire_email: form.beneficiaire_email.trim() || null,
      beneficiaire_telephone: form.beneficiaire_telephone.trim() || null,
      prioritaire: form.prioritaire,
      ingenieur: dansLaFile ? null : form.ingenieur,
      hors_habilitation: dansLaFile ? false : form.hors_habilitation,
      etat: dansLaFile ? S.FILE : S.ASSIGNE,
      date_mise_en_file: dansLaFile ? maintenant : null,
      date_assignation: dansLaFile ? null : maintenant,
      created_by: user.id,
    };

    const { data, error } = await supabase.from("dossiers").insert(payload).select().single();
    if (error) {
      alert("Erreur à l'enregistrement : " + error.message);
      return;
    }

    await enregistrerEvenement(supabase, data.id, dansLaFile ? "mise_en_file" : "assignation", {
      nom: nomTrace,
      cause: dansLaFile ? null : `→ ${form.ingenieur}${form.hors_habilitation ? " (hors fiche habituelle)" : ""}`,
    });

    chargerDossiers();
    setFormulaireOuvert(false);
  }

  async function majDossier(champs) {
    const { error } = await supabase.from("dossiers").update(champs).eq("id", dossierOuvert.id);
    if (error) return error.message;
    setDossierOuvert((d) => ({ ...d, ...champs }));
    setEdition(false);
    chargerDossiers();
    return null;
  }

  const ecran = gardePage({ erreurProfil, loading, profile, estAdmin: nominatif, pretPersonne, nomActif, validateurs, selectionner });
  if (ecran) return ecran;

  const charge = calculerCharge(dossiers);
  const occupes = new Set(dossiers.filter((d) => d.etat === S.EN_COURS).map((d) => d.ingenieur));
  const q = recherche.trim().toLowerCase();
  const modifs = rangsModifs([...file, ...dossiers]);
  const libelleStatut = (d) =>
    d.a_corriger && [S.ASSIGNE, S.FILE].includes(d.etat)
      ? (TYPES_RETOUR[typeDernierRetour(d)] || TYPES_RETOUR.interne).libelle
      : ETATS[d.etat]?.court || d.etat;
  const COLS = { ingenieur: (d) => d.ingenieur, fiche: (d) => d.nom_operation, statut: libelleStatut };
  const garde = (cle, d) => !filtresCol[cle] || filtresCol[cle].has(COLS[cle](d) || "—");
  const autresRecherche = dossiers.filter(
    (d) =>
      dansPeriode(d, periode) &&
      (!q ||
      [d.nom_dossier, d.beneficiaire_nom, d.beneficiaire_adresse, d.ingenieur, d.nom_operation]
        .filter(Boolean)
        .some((v) => v.toLowerCase().includes(q)))
  );
  const autres = autresRecherche.filter((d) => garde("ingenieur", d) && garde("fiche", d) && garde("statut", d));
  // Chaque liste de valeurs tient compte des autres filtres (comme Excel)
  const valeursPour = (cle) =>
    valeursColonne(
      autresRecherche.filter((d) => Object.keys(COLS).every((k) => k === cle || garde(k, d))),
      COLS[cle]
    );
  const filtreCol = (cle, libelle, alignDroite) => (
    <FiltreColonne
      libelle={libelle}
      valeurs={valeursPour(cle)}
      selection={filtresCol[cle]}
      onChange={(sel) => setFiltresCol((f) => ({ ...f, [cle]: sel }))}
      alignDroite={alignDroite}
    />
  );
  const fileFiltree = file.filter(
    (d) => dansPeriode(d, periode) && (!filtresCol.ficheFile || filtresCol.ficheFile.has(d.nom_operation || "—"))
  );

  return (
    <div className="min-h-screen">
      <Navbar role={profile.role} nom={nomActif} onChangerPersonne={nominatif ? undefined : changerDePersonne} />
      <main className="max-w-[1800px] mx-auto px-3 sm:px-4 lg:px-5 py-6">
        <PageHeader
          icone="pencil"
          titre="Saisie"
          sousTitre={
            <>
              Bonjour <span className="capitalize font-medium text-ink/80">{nomActif}</span> — alimente la file d'attente et
              suis tous les dossiers.
            </>
          }
          actions={
            <>
              <button onClick={() => setListeIngenieursOuverte(true)} className="btn-secondary">
                <Icon name="users" size={16} />
                Ingénieurs
              </button>
              <button onClick={() => setFormulaireOuvert(true)} className="btn-primary">
                <Icon name="plus" size={16} />
                Nouveau dossier
              </button>
            </>
          }
        />

        <ObjectifJour supabase={supabase} operations={options.operations} />

        {/* Filtre Date : s'applique aux deux tableaux (date du dossier) */}
        <div className="card px-4 py-3 mb-6 flex flex-wrap items-center justify-between gap-3">
          <FiltrePeriode periode={periode} onChange={setPeriode} />
          {periode.mode !== "tout" && (
            <span className="text-xs text-ink/55">
              <strong className="text-ink tabular">{fileFiltree.length}</strong> en file ·{" "}
              <strong className="text-ink tabular">{autres.length}</strong> en cours sur la période
              <button className="btn-ghost btn-xs ml-2" onClick={() => setPeriode(PERIODE_INITIALE)}>
                <Icon name="reset" size={12} />
                Tout afficher
              </button>
            </span>
          )}
        </div>

        {/* ---------- Tableau 1 : file d'attente ---------- */}
        <section className="mb-10">
          <SectionTitle
            icone="inbox"
            titre="File d'attente"
            compteur={fileFiltree.length !== file.length ? `${fileFiltree.length} / ${file.length}` : file.length}
            ton={file.length ? "brand" : "neutral"}
            actions={
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-xs font-semibold text-ink/50 uppercase tracking-wider">Distribution</span>
                <div className="segmented" title="Réglage commun à toute l'équipe">
                  <button data-active={fileMode === "auto"} onClick={() => changerMode("auto")}>
                    <Icon name="users" size={13} />
                    Automatique
                  </button>
                  <button data-active={fileMode === "manuel"} onClick={() => changerMode("manuel")}>
                    <Icon name="user" size={13} />
                    Manuelle
                  </button>
                </div>
                {fileMode === "auto" && (
                  <button onClick={toutAttribuer} className="btn-primary btn-sm" disabled={distribution || !fileFiltree.some((d) => d.nom_operation)}>
                    <Icon name="send" size={14} />
                    {distribution ? "Attribution…" : "Tout attribuer maintenant"}
                  </button>
                )}
                <button onClick={() => setImportOuvert(true)} className="btn-secondary btn-sm">
                  <Icon name="upload" size={14} />
                  Importer Excel
                </button>
                <button onClick={() => exporterFile(file)} className="btn-secondary btn-sm" disabled={!file.length}>
                  <Icon name="download" size={14} />
                  Exporter
                </button>
              </div>
            }
          />
          <p className="text-xs text-ink/50 mb-3">
            {fileMode === "auto"
              ? "Distribution automatique : chaque ingénieur qui clique « Prendre le suivant » ou « Terminé → suivant » reçoit le premier dossier de ses fiches (prioritaires d'abord, puis les plus anciens). « Tout attribuer maintenant » répartit tout de suite la file entre les ingénieurs disponibles."
              : "Distribution manuelle : choisissez l'ingénieur de chaque dossier. Les ingénieurs ne prennent plus eux-mêmes dans la file : ils traitent uniquement ce qui leur est attribué."}
          </p>

          {message && (
            <div className={`alert ${message.ton === "red" ? "alert-red" : "alert-green"} mb-3`}>
              <Icon name={message.ton === "red" ? "alert" : "checkCircle"} size={16} className="mt-0.5" />
              <span className="flex-1">{message.texte}</span>
              <button onClick={() => setMessage(null)} className="opacity-60 hover:opacity-100" aria-label="Fermer">
                <Icon name="x" size={14} />
              </button>
            </div>
          )}

          <div className="card overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Dossier</th>
                  <th>
                    <FiltreColonne
                      libelle="Fiche"
                      valeurs={valeursColonne(file, (d) => d.nom_operation)}
                      selection={filtresCol.ficheFile}
                      onChange={(sel) => setFiltresCol((f) => ({ ...f, ficheFile: sel }))}
                    />
                  </th>
                  <th>Nature</th>
                  <th>Dans la file depuis</th>
                  <th className="!text-right">Fichiers</th>
                  <th className="!text-right">Attribuer</th>
                </tr>
              </thead>
              <tbody>
                {fileFiltree.map((d) => (
                  <tr key={d.id} className="hover:bg-brand-50/30">
                    <td className="cursor-pointer" onClick={() => ouvrirDossier(d)}>
                      <span className="font-semibold flex items-center gap-1.5">
                        {d.prioritaire && <Icon name="flame" size={14} className="text-isoRed" />}
                        {d.nom_dossier}
                        {(!d.nom_operation || !d.beneficiaire_nom || !d.beneficiaire_adresse || d.nom_dossier?.startsWith("À compléter")) && (
                          <span className="badge badge-gold" title="Importé avec des champs vides : ouvre le dossier → Modifier les informations">
                            À compléter
                          </span>
                        )}
                        {equipeDuClient(d.client, options.equipes) && (
                          <span className="badge badge-brand" title="Réservé aux ingénieurs de l'équipe de ce client">
                            <Icon name="users" size={11} />
                            Équipe {d.client}
                          </span>
                        )}
                      </span>
                      {d.beneficiaire_nom && <span className="block text-xs text-ink/50">{d.beneficiaire_nom}</span>}
                    </td>
                    <td className="text-ink/70 whitespace-nowrap">{d.nom_operation || <span className="text-isoGold-dark">À compléter</span>}</td>
                    <td className="text-ink/60">{d.nature_prod || "—"}</td>
                    <td className="text-ink/60 tabular whitespace-nowrap">
                      {formatDuree((Date.now() - new Date(d.date_mise_en_file || d.created_at).getTime()) / 3600000)}
                    </td>
                    {celluleFichiers(d)}
                    <td>
                      {fileMode === "auto" ? (
                        <span className="block text-right text-xs text-ink/45">automatique</span>
                      ) : (
                      <div className="flex items-center justify-end gap-1.5">
                        <select
                          className="input input-sm w-44"
                          value={assignation[d.id] || ""}
                          onChange={(e) => setAssignation((a) => ({ ...a, [d.id]: e.target.value }))}
                        >
                          <option value="">Choisir un ingénieur…</option>
                          {(options.ingenieursAssignables || options.ingenieurs).map((i) => (
                            <option key={i} value={i}>
                              {i}
                              {occupes.has(i) ? " · occupé" : " · libre"}
                              {equipeDuClient(d.client, options.equipes)
                                ? equipeDuClient(d.client, options.equipes).includes(i)
                                  ? " · équipe"
                                  : " · hors équipe"
                                : !(options.habilitations?.[i] || []).includes(d.nom_operation)
                                ? " · hors fiche"
                                : ""}
                            </option>
                          ))}
                        </select>
                        <button className="btn-primary btn-xs" disabled={!assignation[d.id]} onClick={() => assignerManuel(d)}>
                          Assigner
                        </button>
                      </div>
                      )}
                    </td>
                  </tr>
                ))}
                {fileFiltree.length === 0 && file.length > 0 && (
                  <tr>
                    <td colSpan={6} className="table-empty">
                      Aucun dossier pour ce filtre.
                    </td>
                  </tr>
                )}
                {file.length === 0 && (
                  <tr>
                    <td colSpan={6} className="table-empty">
                      La file est vide. Ajoute des dossiers avec « Nouveau dossier » ou « Importer Excel ».
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* ---------- Tableau 2 : dossiers en cours (tous sauf la file) ---------- */}
        <section>
          <SectionTitle
            icone="list"
            titre="Dossiers en cours"
            compteur={autres.length !== dossiers.length ? `${autres.length} / ${dossiers.length}` : dossiers.length}
            actions={
              <div className="relative w-64">
                <Icon name="search" size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink/35 pointer-events-none" />
                <input
                  className="input input-sm pl-8"
                  placeholder="Rechercher…"
                  value={recherche}
                  onChange={(e) => setRecherche(e.target.value)}
                />
              </div>
            }
          />
          <div className="card overflow-x-auto">
            <table className="table table-hover">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Dossier</th>
                  <th>{filtreCol("ingenieur", "Ingénieur")}</th>
                  <th>{filtreCol("fiche", "Fiche")}</th>
                  <th>Retours</th>
                  <th>{filtreCol("statut", "Statut")}</th>
                  <th className="!text-right">Fichiers</th>
                </tr>
              </thead>
              <tbody>
                {autres.map((d) => (
                  <tr key={d.id} className="cursor-pointer" onClick={() => ouvrirDossier(d)}>
                    <td className="whitespace-nowrap text-ink/60 tabular">{formatDate(d.date)}</td>
                    <td>
                      <span className="font-semibold flex items-center gap-1.5">
                        {d.prioritaire && <Icon name="flame" size={13} className="text-isoRed" />}
                        {d.nom_dossier}
                        {modifs.get(d.id) && (
                          <span className="badge badge-brand" title="Même dossier modifié plusieurs fois">
                            Modif {modifs.get(d.id).n}/{modifs.get(d.id).total}
                          </span>
                        )}
                      </span>
                      {d.beneficiaire_nom && <span className="block text-xs text-ink/50">{d.beneficiaire_nom}</span>}
                    </td>
                    <td className="capitalize">
                      {d.ingenieur || "—"}
                      {d.ingenieur_modif && <span className="block text-[11px] text-ink/50">modif : {d.ingenieur_modif}</span>}
                    </td>
                    <td className="text-ink/70 whitespace-nowrap">{d.nom_operation}</td>
                    <td>
                      <BadgeRetour dossier={d} />
                    </td>
                    <td>
                      <StatutDossier dossier={d} />
                    </td>
                    {celluleFichiers(d, true)}
                  </tr>
                ))}
                {autres.length === 0 && (
                  <tr>
                    <td colSpan={7} className="table-empty">
                      Aucun dossier.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {dossiers.length >= 500 && (
            <p className="text-xs text-ink/45 mt-2">Les 500 derniers dossiers sont affichés. L'historique complet est dans Export.</p>
          )}
        </section>
      </main>

      {formulaireOuvert && (
        <Modal titre="Nouveau dossier" sousTitre="Saisie — dispatching" onFermer={() => setFormulaireOuvert(false)} taille="lg">
          <DossierFormSaisie
            options={options}
            dossiersExistants={[...file, ...dossiers]}
            chargeParIngenieur={charge}
            onSubmit={soumettreDossier}
            onAnnuler={() => setFormulaireOuvert(false)}
          />
        </Modal>
      )}

      {dossierOuvert && (
        <Modal
          titre={dossierOuvert.nom_dossier}
          sousTitre={`${dossierOuvert.ingenieur || "Dans la file"} · ${dossierOuvert.nom_operation || "—"}`}
          onFermer={() => {
            setDossierOuvert(null);
            setEdition(false);
          }}
          taille="lg"
        >
          {edition ? (
            <EditionDossier dossier={dossierOuvert} options={options} onSave={majDossier} onAnnuler={() => setEdition(false)} />
          ) : (
            <>
              <div className="mb-4 flex items-center justify-between gap-3">
                <StatutBadge etat={dossierOuvert.etat} />
                <span className="flex gap-2">
                  <button className="btn-secondary btn-sm" onClick={() => setEdition(true)}>
                    <Icon name="pencil" size={14} />
                    Modifier les informations
                  </button>
                  {profile?.role === "admin" && (
                    <button
                      className="btn-danger btn-sm"
                      title="Suppression définitive, tracée dans le journal de l'admin"
                      onClick={async () => {
                        if (await supprimerDossierAvecTrace(supabase, dossierOuvert)) {
                          setDossierOuvert(null);
                          chargerDossiers();
                        }
                      }}
                    >
                      <Icon name="x" size={14} />
                      Supprimer
                    </button>
                  )}
                </span>
              </div>
              <p className="eyebrow mb-2">Bénéficiaire</p>
              <div className="mb-6">
                <FicheBeneficiaire key={dossierOuvert.id} dossier={dossierOuvert} />
              </div>
              <p className="eyebrow mb-2">Pièces jointes</p>
              <div className="mb-6">
                <FichiersDossier
                  key={"f" + dossierOuvert.id}
                  supabase={supabase}
                  dossier={dossierOuvert}
                  auteur={nomActif}
                  peutDeposerPieces
                  peutDeposerLivrables={false}
                  peutSupprimer
                  onChange={fichiers.recharger}
                />
              </div>
              <p className="eyebrow mb-3">Historique</p>
              <HistoriqueDossier evenements={evenements} />

              <p className="eyebrow mb-3 mt-6">Commentaires</p>
              <CommentThread commentaires={commentaires} onAjouter={ajouterCommentaire} auteurNom={nomActif} />
            </>
          )}
        </Modal>
      )}

      {listeIngenieursOuverte && (
        <ListeIngenieurs supabase={supabase} options={options} onFermer={() => setListeIngenieursOuverte(false)} />
      )}

      {importOuvert && (
        <ImportDossiers
          options={options}
          supabase={supabase}
          nomTrace={nomTrace}
          onFermer={() => setImportOuvert(false)}
          onTermine={chargerDossiers}
        />
      )}

      {derniereAction && (
        <UndoToast message={`${derniereAction.libelle} — « ${derniereAction.nomDossier} »`} onAnnuler={annulerDerniereAction} />
      )}
    </div>
  );
}
