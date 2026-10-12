"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState, Fragment } from "react";
import Navbar from "@/components/Navbar";
import HistoriqueComplet from "@/components/HistoriqueComplet";
import FicheBeneficiaire from "@/components/FicheBeneficiaire";
import FichiersDossier from "@/components/FichiersDossier";
import CelluleFichiers, { useFichiers } from "@/components/CelluleFichiers";
import { exporterDossiers } from "@/lib/exportDossiers";
import { StatutDossier } from "@/components/DossierTable";
import PageHeader from "@/components/ui/PageHeader";
import Icon from "@/components/ui/Icon";
import Avatar from "@/components/ui/Avatar";
import UndoToast from "@/components/ui/UndoToast";
import { gardePage } from "@/components/ui/Screens";
import { useAppData } from "@/lib/useAppData";
import { useValidateurActif } from "@/lib/useValidateurActif";
import { supprimerDossierAvecTrace } from "@/lib/suppressionDossier";
import { formatDate, formatDuree, S, STATUTS_MANUELS, TYPES_RETOUR, ETATS, rangsModifs } from "@/lib/constants";
import { couleurEtat } from "@/lib/couleurs";
import { enregistrerEvenement, annulerAction, instantane } from "@/lib/actions";
import { attribuerAutomatiquement, equipeDuClient } from "@/lib/dispatch";

const ETATS_CIRCUIT = [S.FILE, S.ASSIGNE, S.EN_COURS, S.ATTENTE_INFO, S.A_CONTROLER, S.VERIF, S.VALIDE];

/** Depuis quand le dossier est dans son étape actuelle (heures). */
function heuresDansEtape(d) {
  const ref = {
    [S.FILE]: d.date_mise_en_file || d.created_at,
    [S.ASSIGNE]: d.date_assignation || d.created_at,
    [S.EN_COURS]: d.date_acceptation,
    [S.A_CONTROLER]: d.date_soumission,
    [S.VERIF]: d.date_prise_en_charge || d.date_soumission,
  }[d.etat];
  if (!ref) return null;
  return (Date.now() - new Date(ref).getTime()) / 3600000;
}

export default function QualitePage() {
  const { profile, erreurProfil, options, loading, supabase } = useAppData();
  const { nom: nomSelectionne, pret: pretPersonne, selectionner, changerDePersonne, validateurs } =
    useValidateurActif(profile, supabase);
  const estAdmin = profile?.role === "admin";
  // Admin et Qualité ont chacun leur propre compte (identifiant + mot de passe) : pas de code PIN
  const nominatif = ["admin", "qualite"].includes(profile?.role);
  const nomActif = nominatif ? profile?.nom_complet : nomSelectionne;
  const nomTrace = nomActif || null;

  const [dossiers, setDossiers] = useState([]);
  const [recherche, setRecherche] = useState("");
  const [seuilHeures, setSeuilHeures] = useState(1);
  const [seuilUrgence, setSeuilUrgence] = useState(24);
  const [dossierActif, setDossierActif] = useState(null);
  const [typeRetour, setTypeRetour] = useState(null); // interne | qualite | client
  const [periode, setPeriode] = useState({ mode: "tout", jour: new Date().toISOString().slice(0, 10), mois: new Date().toISOString().slice(0, 7) });
  const [form, setForm] = useState({ cause: "", commentaire: "", reassigner: "", bibliotheque: false });
  const [assignation, setAssignation] = useState("");
  const [dossierHistorique, setDossierHistorique] = useState(null);
  const [derniereAction, setDerniereAction] = useState(null);
  const [filtre, setFiltre] = useState("tous");
  const [operation, setOperation] = useState("toutes");
  const [limite, setLimite] = useState(150);
  const [exportEnCours, setExportEnCours] = useState(false);
  // Admin : « Audité par » doit être un nom de la liste des validateurs (contrainte en base)
  const [auditeurAdmin, setAuditeurAdmin] = useState("");
  const [choixAudit, setChoixAudit] = useState({}); // « Audité par » choisi par l'admin, dossier par dossier
  useEffect(() => {
    try {
      setAuditeurAdmin(localStorage.getItem("hillsolution_auditeur_admin") || "");
    } catch {}
  }, []);
  function choisirAuditeur(nom) {
    setAuditeurAdmin(nom);
    try {
      localStorage.setItem("hillsolution_auditeur_admin", nom);
    } catch {}
  }
  const fichiers = useFichiers(supabase, !!profile);

  async function chargerDossiers() {
    const { data } = await supabase
      .from("dossiers")
      .select("*")
      .in("etat", [...ETATS_CIRCUIT, ...STATUTS_MANUELS])
      .order("date", { ascending: false })
      .limit(3000);
    setDossiers(data || []);
  }

  useEffect(() => {
    if (!profile) return;
    chargerDossiers();
    (async () => {
      const { data } = await supabase.from("parametres_config").select("*").limit(1).maybeSingle();
      if (data) {
        setSeuilHeures(data.seuil_verification_heures);
        setSeuilUrgence(data.seuil_urgence_heures || 24);
      }
    })();
  }, [profile]);

  // Lien direct : /qualite?statut=aControler → ouvre la page filtrée
  useEffect(() => {
    try {
      const st = new URLSearchParams(window.location.search).get("statut");
      if (st) setFiltre(st);
    } catch {}
  }, []);

  function fermerPanneau() {
    setDossierActif(null);
    setTypeRetour(null);
    setForm({ cause: "", commentaire: "", reassigner: "", bibliotheque: false });
    setAssignation("");
  }

  function memoriser(d, libelle, evenementId, retourId) {
    const action = { dossierId: d.id, nomDossier: d.nom_dossier, libelle, ancienChamps: instantane(d), evenementId, retourId };
    setDerniereAction(action);
    setTimeout(() => setDerniereAction((a) => (a === action ? null : a)), 9000);
  }

  async function appliquer(d, champs, libelle, evenement, retour) {
    const { error } = await supabase.from("dossiers").update(champs).eq("id", d.id);
    if (error) {
      alert("Action impossible : " + error.message);
      return false;
    }
    let retourId = null;
    if (retour) {
      const { data: r, error: errR } = await supabase.from("dossier_retours").insert(retour).select("id").single();
      if (errR) console.error("Retour non enregistré :", errR.message);
      retourId = r?.id || null;
    }
    const evenementId = evenement ? await enregistrerEvenement(supabase, d.id, evenement.type, { cause: evenement.cause, nom: nomTrace }) : null;
    memoriser(d, libelle, evenementId, retourId);
    fermerPanneau();
    chargerDossiers();
    return true;
  }

  const habilite = (ing, op) => (options.habilitations?.[ing] || []).includes(op);

  function assigner(d, ing) {
    if (!ing) return;
    return appliquer(
      d,
      { etat: S.ASSIGNE, ingenieur: ing, date_assignation: new Date().toISOString(), hors_habilitation: !habilite(ing, d.nom_operation) },
      `Assigné à ${ing}`,
      { type: d.ingenieur ? "reassignation" : "assignation", cause: `→ ${ing}` }
    );
  }

  async function attribuerAuto(d) {
    const r = await attribuerAutomatiquement(supabase, d, options, nomTrace);
    if (!r.ok) return alert(r.erreur);
    memoriser(d, `Attribué automatiquement à ${r.ingenieur}`, r.evenementId, null);
    fermerPanneau();
    chargerDossiers();
  }

  function remettreEnFile(d) {
    return appliquer(
      d,
      { etat: S.FILE, ingenieur: null, date_mise_en_file: new Date().toISOString(), hors_habilitation: false, motif_statut: null },
      "Remis dans la file",
      { type: "mise_en_file" }
    );
  }

  function basculerPriorite(d) {
    return appliquer(d, { prioritaire: !d.prioritaire }, d.prioritaire ? "Priorité retirée" : "Marqué prioritaire", null);
  }

  const nomsValidateurs = (validateurs || []).map((v) => v.nom);
  const graphie = (n) => nomsValidateurs.find((v) => v.toLowerCase() === String(n).trim().toLowerCase()) || String(n || "").trim();
  // Le compte connecté est-il lui-même un membre de la Qualité ? (sinon on demande « Audité par »)
  const qualiteConnecte = profile?.role === "qualite" && !!nomActif;
  // Un Responsable valide à son propre nom, sans faire partie de l'équipe Qualité
  const estResponsable = profile?.role === "admin" && profile?.fonction === "Responsable" && !!profile?.nom_complet;
  // « Audité par » proposé : la personne connectée (Qualité), sinon le choix de l'admin, sinon celui qui a le dossier en contrôle
  const auditeurPour = (d) =>
    qualiteConnecte
      ? graphie(nomActif)
      : estResponsable
        ? profile.nom_complet.trim()
        : choixAudit[d?.id] || d?.pris_en_charge_par || auditeurAdmin || "";
  const choixAuditeurs = (d) =>
    [...new Set([...nomsValidateurs, d?.pris_en_charge_par, auditeurAdmin].filter(Boolean).map((n) => graphie(n)))].sort((a, b) => a.localeCompare(b));

  async function valider(d) {
    let auditeur = auditeurPour(d);
    if (!auditeur) return alert("Choisis d'abord « Audité par ».");
    // « Audité par » doit exister dans la liste du service Qualité (contrainte en base, majuscules comprises) :
    // on reprend l'orthographe enregistrée, ou on ajoute le nom s'il manque
    const { data: existant } = await supabase.from("parametres_validateurs").select("nom").ilike("nom", auditeur.replace(/[%_]/g, "")).limit(1);
    if (existant?.length) {
      auditeur = existant[0].nom;
    } else {
      // Responsable : nom enregistré mais désactivé, pour qu'il n'apparaisse pas dans la liste de l'équipe Qualité
      const { error } = await supabase.rpc(
        "fn_import_referentiels_v2",
        estResponsable ? { p_validateurs_inactifs: [auditeur] } : { p_validateurs: [auditeur] }
      );
      if (error) return alert(`« ${auditeur} » n'est pas dans la liste Service qualité (Paramètres → Listes) et n'a pas pu y être ajouté : ${error.message}`);
    }
    return appliquer(
      d,
      { etat: S.VALIDE, date_verification: new Date().toISOString(), valide_par: auditeur, a_corriger: false },
      "Dossier audité",
      { type: "verification_ok" }
    );
  }

  function enregistrerRetour(d) {
    if (!form.cause) return alert("Précise la cause du retour.");
    const type = typeRetour; // interne | qualite | client
    const ing = form.reassigner || d.ingenieur;
    const maintenant = new Date().toISOString();
    const champs = {
      etat: S.ASSIGNE,
      ingenieur: ing,
      a_corriger: true,
      dernier_retour_type: type,
      date_assignation: maintenant,
      date_verification: null,
      ingenieur_modif: form.reassigner || null,
      nb_retours: (d.nb_retours || 0) + 1,
      ...(type === "client"
        ? { retour_client: true, cause_retour_client: form.cause, date_retour_client: maintenant.slice(0, 10) }
        : { retour_interne: true, cause_retour_interne: form.cause }),
    };
    return appliquer(
      d,
      champs,
      `${TYPES_RETOUR[type].libelle} enregistré`,
      {
        type: { interne: "retour_interne_avant_audit", qualite: "retour_interne_apres_audit", client: "retour_client" }[type],
        cause: `${TYPES_RETOUR[type].libelle} : ${form.cause}` + (form.commentaire ? ` — ${form.commentaire}` : ""),
      },
      {
        dossier_id: d.id,
        type,
        cause: form.cause,
        commentaire: form.commentaire || null,
        ingenieur: d.ingenieur,
        operation: d.nom_operation,
        effectue_par_nom: nomTrace,
        bibliotheque: form.bibliotheque,
        explication: form.bibliotheque ? form.commentaire || null : null,
      }
    );
  }

  function changerStatutManuel(d, statut) {
    const motif = window.prompt(`Motif du passage en « ${statut} » (obligatoire) :`);
    if (!motif || !motif.trim()) return;
    return appliquer(d, { etat: statut, motif_statut: motif.trim() }, `Statut → ${statut}`, {
      type: "changement_statut_manuel",
      cause: `→ ${statut} : ${motif.trim()}`,
    });
  }

  // « Je contrôle » : le dossier passe « En vérification Q » au nom de la personne
  async function prendreEnControle(d) {
    const { data: frais } = await supabase.from("dossiers").select("etat, pris_en_charge_par").eq("id", d.id).maybeSingle();
    if (frais && frais.etat !== S.A_CONTROLER) {
      alert(
        frais.etat === S.VERIF
          ? `Ce dossier est déjà en contrôle par ${frais.pris_en_charge_par || "une autre personne"}.`
          : "Ce dossier n'est plus à contrôler."
      );
      return chargerDossiers();
    }
    const ok = await appliquer(
      d,
      { etat: S.VERIF, pris_en_charge_par: nomActif || null, date_prise_en_charge: new Date().toISOString() },
      "Contrôle commencé",
      { type: "prise_en_charge" }
    );
    if (ok) setDossierActif(d.id);
  }

  function relacherControle(d) {
    return appliquer(d, { etat: S.A_CONTROLER, pris_en_charge_par: null, date_prise_en_charge: null }, "Remis à contrôler", null);
  }

  async function exporterTout() {
    setExportEnCours(true);
    const { data, error } = await supabase.from("dossiers").select("*").order("date", { ascending: false }).limit(20000);
    setExportEnCours(false);
    if (error) return alert("Export impossible : " + error.message);
    await exporterDossiers(data || [], "HILLSOLUTION_qualite");
  }

  async function majBeneficiaire(d, champs) {
    const { error } = await supabase.from("dossiers").update(champs).eq("id", d.id);
    if (error) return error.message;
    chargerDossiers();
    return null;
  }

  async function annulerDerniereAction() {
    if (!derniereAction) return;
    const err = await annulerAction(supabase, derniereAction);
    if (err) alert("Annulation impossible : " + err.message);
    setDerniereAction(null);
    chargerDossiers();
  }

  const ecran = gardePage({ erreurProfil, loading, profile, estAdmin: nominatif, pretPersonne, nomActif, validateurs, selectionner });
  if (ecran) return ecran;

  function classeTemps(h, etat) {
    if (h === null) return "badge-neutral";
    if (etat !== S.A_CONTROLER && etat !== S.VERIF) return h >= seuilUrgence ? "badge-red" : "badge-neutral";
    const ratio = h / seuilHeures;
    if (ratio >= 1) return "badge-red";
    if (ratio >= 0.6) return "badge-gold";
    return "badge-green";
  }

  const q = recherche.trim().toLowerCase();
  const correspond = (d) =>
    !q ||
    [d.nom_dossier, d.beneficiaire_nom, d.beneficiaire_adresse, d.beneficiaire_telephone, d.ingenieur, d.nom_operation]
      .filter(Boolean)
      .some((v) => v.toLowerCase().includes(q));

  // Filtres (pastilles), dans l'ordre du circuit
  const CHEZ_INGENIEUR = [S.FILE, S.ASSIGNE, S.EN_COURS, S.ATTENTE_INFO];
  const estRetour = (d) => d.a_corriger && CHEZ_INGENIEUR.includes(d.etat);
  const GROUPES = [
    { cle: "file", libelle: "En file", couleur: couleurEtat(S.FILE), test: (d) => d.etat === S.FILE && !estRetour(d) },
    {
      cle: "production",
      libelle: "En production",
      couleur: couleurEtat(S.EN_COURS),
      test: (d) => [S.ASSIGNE, S.EN_COURS, S.ATTENTE_INFO].includes(d.etat) && !estRetour(d),
    },
    { cle: "aControler", libelle: "À contrôler", couleur: couleurEtat(S.A_CONTROLER), test: (d) => d.etat === S.A_CONTROLER },
    { cle: "verification", libelle: "En vérification Q", couleur: couleurEtat(S.VERIF), test: (d) => d.etat === S.VERIF },
    { cle: "retour", libelle: "Retour", couleur: "#C2410C", test: estRetour },
    { cle: "audites", libelle: "Audité", couleur: couleurEtat(S.VALIDE), test: (d) => [S.VALIDE, "Dossier vérifié"].includes(d.etat) },
    { cle: "annules", libelle: "Annulé", couleur: couleurEtat("Annulé"), test: (d) => ["Annulé", "Suspendue"].includes(d.etat) },
    { cle: "pause", libelle: "En pause", couleur: couleurEtat("en pause"), test: (d) => d.etat === "en pause", discret: true },
    // Dossiers contrôlés par la personne connectée (pris en charge ou audités par elle)
    {
      cle: "mes",
      libelle: "Mes contrôles",
      couleur: "#2563EB",
      test: (d) => !!nomActif && [d.valide_par, d.pris_en_charge_par].some((n) => String(n || "").trim().toLowerCase() === String(nomActif).trim().toLowerCase()),
    },
    // Statuts personnalisés (Paramètres → Statuts)
    ...(options.statutsPerso || []).map((st) => ({
      cle: "perso:" + st,
      libelle: ETATS[st]?.court || st,
      couleur: couleurEtat(st),
      test: (d) => d.etat === st,
      discret: true,
    })),
  ];
  const groupeActif = GROUPES.find((g) => g.cle === filtre);
  // Filtre par date du dossier : tout / aujourd'hui / un jour / un mois
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const parPeriode = (d) => {
    const dt = String(d.date || "").slice(0, 10);
    if (periode.mode === "aujourdhui") return dt === aujourdhui;
    if (periode.mode === "jour") return dt === periode.jour;
    if (periode.mode === "mois") return dt.slice(0, 7) === periode.mois;
    return true;
  };
  const parOperation = (d) => (operation === "toutes" || d.nom_operation === operation) && parPeriode(d);
  const parStatut = (d) => !groupeActif || groupeActif.test(d);
  GROUPES.forEach((g) => (g.total = dossiers.filter((d) => g.test(d) && parOperation(d)).length));
  const totalOperation = dossiers.filter(parOperation).length;
  // Filtre par opération (fiche CEE) : toutes les fiches paramétrées + celles présentes dans les dossiers
  const OPERATIONS = [...new Set([...(options.operations || []), ...dossiers.map((d) => d.nom_operation).filter(Boolean)])]
    .sort()
    .map((op) => ({ op, total: dossiers.filter((d) => d.nom_operation === op && parStatut(d) && parPeriode(d)).length }));

  // Tableau unique, du dossier le plus récent au plus ancien
  const modifs = rangsModifs(dossiers);
  const lignes = dossiers
    .filter((d) => parStatut(d) && parOperation(d))
    .filter(correspond)
    .sort(
      (a, b) =>
        String(b.date || "").localeCompare(String(a.date || "")) ||
        String(b.created_at || "").localeCompare(String(a.created_at || ""))
    );

  function panneauAction(d) {
    const peutAssigner = [S.FILE, S.ASSIGNE, S.ATTENTE_INFO].includes(d.etat) || STATUTS_MANUELS.includes(d.etat);
    const peutRetour = [S.A_CONTROLER, S.VERIF, S.VALIDE].includes(d.etat);
    return (
      <div className="grid lg:grid-cols-[1fr_1.2fr] gap-4 py-4">
        <div className="flex flex-col gap-2">
          <p className="eyebrow">Bénéficiaire</p>
          <FicheBeneficiaire key={d.id} dossier={d} onSave={(c) => majBeneficiaire(d, c)} compact />
          <p className="eyebrow mt-2">Pièces jointes</p>
          <FichiersDossier
            key={"f" + d.id}
            supabase={supabase}
            dossier={d}
            auteur={nomActif}
            peutDeposerPieces
            peutDeposerLivrables={false}
            peutSupprimer
            compact
            onChange={fichiers.recharger}
          />
          {d.motif_statut && (
            <p className="text-xs text-ink/60">
              <strong>Motif :</strong> {d.motif_statut}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <p className="eyebrow">Actions</p>
          <div className="flex flex-wrap items-center gap-2">
            {d.etat === S.A_CONTROLER && (
              <button onClick={() => prendreEnControle(d)} className="btn-primary btn-sm" title="Le dossier passe « En vérification Q » à ton nom">
                <Icon name="shield" size={14} />
                Je contrôle
              </button>
            )}
            {d.etat === S.VERIF && (
              <span className="badge badge-brand h-8 px-3">
                <Icon name="shield" size={13} />
                En contrôle par <span className="capitalize">{d.pris_en_charge_par || "—"}</span>
              </span>
            )}
            {(d.etat === S.A_CONTROLER || d.etat === S.VERIF) && (
              <>
                {estResponsable && (
                  <span className="text-xs text-ink/55" title="Le dossier sera enregistré « Audité par » à votre nom, en tant que Responsable">
                    Audité par <strong className="capitalize">{profile.nom_complet}</strong> (Responsable)
                  </span>
                )}
                {!qualiteConnecte && !estResponsable && (
                  <select
                    className={`input input-sm w-44 ${auditeurPour(d) ? "" : "border-isoRed/60"}`}
                    value={auditeurPour(d)}
                    onChange={(e) => {
                      choisirAuditeur(e.target.value);
                      setChoixAudit((c) => ({ ...c, [d.id]: e.target.value }));
                    }}
                    aria-label="Audité par"
                    title="Nom enregistré comme « Audité par »"
                  >
                    <option value="">Audité par…</option>
                    {choixAuditeurs(d).map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                )}
                <button onClick={() => valider(d)} className="btn-success btn-sm" disabled={!auditeurPour(d)}>
                  <Icon name="check" size={14} />
                  Valider
                </button>
                <button
                  onClick={() => setTypeRetour("interne")}
                  className={typeRetour === "interne" ? "btn-sm btn bg-isoGold-light text-isoGold-dark border border-isoGold/40" : "btn-danger btn-sm"}
                >
                  <Icon name="undo" size={14} />
                  Retour interne
                </button>
              </>
            )}
            {d.etat === S.VALIDE && (
              <div className="segmented">
                <button data-active={typeRetour === "qualite"} onClick={() => setTypeRetour("qualite")} title={TYPES_RETOUR.qualite.aide}>
                  Retour qualité
                </button>
                <button data-active={typeRetour === "client"} onClick={() => setTypeRetour("client")} title={TYPES_RETOUR.client.aide}>
                  Retour modif client
                </button>
              </div>
            )}
            {d.etat === S.VERIF && (
              <button onClick={() => relacherControle(d)} className="btn-ghost btn-sm" title="Le dossier repasse « À contrôler »">
                Remettre à contrôler
              </button>
            )}
            {d.etat === S.FILE && (
              <button onClick={() => attribuerAuto(d)} className="btn-primary btn-sm" title="À l'ingénieur habilité le plus disponible">
                <Icon name="users" size={14} />
                Attribuer automatiquement
              </button>
            )}
            {[S.FILE, S.ASSIGNE].includes(d.etat) && (
              <button onClick={() => basculerPriorite(d)} className="btn-secondary btn-sm">
                <Icon name="flame" size={14} className={d.prioritaire ? "text-isoRed" : ""} />
                {d.prioritaire ? "Retirer la priorité" : "Rendre prioritaire"}
              </button>
            )}
            {(d.etat === S.ASSIGNE || STATUTS_MANUELS.includes(d.etat) || d.etat === S.ATTENTE_INFO) && (
              <button onClick={() => remettreEnFile(d)} className="btn-secondary btn-sm">
                <Icon name="inbox" size={14} />
                Remettre dans la file
              </button>
            )}
          </div>

          {peutAssigner && (
            <div className="flex flex-wrap items-end gap-2">
              <div className="field flex-1 min-w-[200px]">
                <label className="label">{d.ingenieur ? "Réassigner à" : "Assigner à"}</label>
                <select className="input" value={assignation} onChange={(e) => setAssignation(e.target.value)}>
                  <option value="">Choisir un ingénieur…</option>
                  {(options.ingenieursAssignables || options.ingenieurs)?.map((i) => (
                    <option key={i} value={i}>
                      {i}
                      {equipeDuClient(d.client, options.equipes)
                        ? equipeDuClient(d.client, options.equipes).includes(i)
                          ? ` · équipe ${d.client}`
                          : " · hors équipe"
                        : !habilite(i, d.nom_operation)
                        ? " · hors fiche habituelle"
                        : ""}
                      {dossiers.some((x) => x.ingenieur === i && x.etat === S.EN_COURS) ? " · occupé" : " · libre"}
                    </option>
                  ))}
                </select>
              </div>
              <button className="btn-primary btn-sm h-9" disabled={!assignation} onClick={() => assigner(d, assignation)}>
                Assigner
              </button>
            </div>
          )}

          {peutRetour && typeRetour && (
            <div className="flex flex-col gap-2 bg-isoRed-light/60 border border-isoRed/20 rounded-lg p-3">
              <div className="grid sm:grid-cols-2 gap-2">
                <div className="field">
                  <label className="label">
                    Cause — {TYPES_RETOUR[typeRetour]?.libelle} <span className="text-ink/40 font-normal">({TYPES_RETOUR[typeRetour]?.aide})</span>
                  </label>
                  <select className="input" value={form.cause} onChange={(e) => setForm((f) => ({ ...f, cause: e.target.value }))}>
                    <option value="">Choisir…</option>
                    {(typeRetour === "client" ? options.causesClient : options.causesInterne)?.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label className="label">Renvoyer à</label>
                  <select className="input" value={form.reassigner} onChange={(e) => setForm((f) => ({ ...f, reassigner: e.target.value }))}>
                    <option value="">{d.ingenieur ? `${d.ingenieur} (même ingénieur)` : "Choisir…"}</option>
                    {(options.ingenieursAssignables || options.ingenieurs)?.filter((i) => i !== d.ingenieur).map((i) => (
                      <option key={i} value={i}>{i}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="field">
                <label className="label">Remarque pour l'ingénieur</label>
                <textarea
                  className="input"
                  rows={2}
                  placeholder="Ce qu'il faut corriger, précisément"
                  value={form.commentaire}
                  onChange={(e) => setForm((f) => ({ ...f, commentaire: e.target.value }))}
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    className="w-4 h-4 accent-[#1F6FA8]"
                    checked={form.bibliotheque}
                    onChange={(e) => setForm((f) => ({ ...f, bibliotheque: e.target.checked }))}
                  />
                  <Icon name="list" size={14} className="text-ink/45" />
                  Ajouter à la bibliothèque des erreurs
                </label>
                <button onClick={() => enregistrerRetour(d)} className="btn-primary btn-sm">
                  Enregistrer le retour
                </button>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 pt-3 border-t border-line">
            <span className="text-xs text-ink/45">Mettre de côté :</span>
            {["en pause", "Annulé", ...(options.statutsPerso || [])].filter((s) => s !== d.etat).map((s) => (
              <button key={s} className="btn-ghost btn-xs" onClick={() => changerStatutManuel(d, s)}>
                {s === "en pause" ? "En pause" : s === "Annulé" ? "Annuler le dossier" : ETATS[s]?.court || s}
              </button>
            ))}
            {profile?.role === "admin" && (
              <button
                className="btn-ghost btn-xs text-isoRed hover:bg-isoRed-light ml-auto"
                title="Suppression définitive, tracée dans le journal de l'admin"
                onClick={async () => {
                  if (await supprimerDossierAvecTrace(supabase, d)) {
                    fermerPanneau();
                    chargerDossiers();
                  }
                }}
              >
                <Icon name="x" size={13} />
                Supprimer le dossier
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Navbar role={profile.role} nom={nomActif} onChangerPersonne={nominatif ? undefined : changerDePersonne} />
      <main className="max-w-[1800px] mx-auto px-3 sm:px-4 lg:px-5 py-6">
        <PageHeader
          icone="shield"
          titre="Qualité"
          sousTitre="Tous les dossiers, du plus récent au plus ancien — clique sur « Traiter » pour agir."
          actions={
            <>
              <span className="badge badge-gold h-8 px-3 text-xs">
                <Icon name="target" size={13} />
                Contrôle sous {seuilHeures} h après « Terminé »
              </span>
              <button className="btn-secondary btn-sm" onClick={exporterTout} disabled={exportEnCours}>
                <Icon name="download" size={14} />
                {exportEnCours ? "Export…" : "Exporter"}
              </button>
            </>
          }
        />

        {/* Filtres par statut : une tuile par statut, avec son nombre */}
        <div className="grid grid-cols-[repeat(auto-fill,minmax(132px,1fr))] gap-2 mb-3">
          {[{ cle: "tous", libelle: "Tous", couleur: "#13212F", total: totalOperation }, ...GROUPES.filter((g) => !g.discret || g.total > 0 || filtre === g.cle)].map(
            (g) => {
              const actif = filtre === g.cle;
              return (
                <button
                  key={g.cle}
                  onClick={() => setFiltre(actif && g.cle !== "tous" ? "tous" : g.cle)}
                  aria-pressed={actif}
                  className={`relative overflow-hidden rounded-xl border bg-white pl-4 pr-3 py-2.5 text-left transition-all hover:shadow-card ${
                    actif ? "shadow-card" : "border-line"
                  }`}
                  style={actif ? { borderColor: g.couleur, background: `${g.couleur}14`, boxShadow: `0 0 0 1px ${g.couleur}` } : undefined}
                >
                  <span className="absolute left-0 top-0 bottom-0 w-1" style={{ background: g.couleur }} />
                  <span className="block font-display text-xl font-extrabold tabular leading-tight" style={{ color: actif ? g.couleur : undefined }}>
                    {g.total}
                  </span>
                  <span className={`block text-xs truncate ${actif ? "font-semibold text-ink" : "text-ink/60"}`}>{g.libelle}</span>
                </button>
              );
            }
          )}
        </div>

        {/* Opération + date + recherche, regroupés dans une carte */}
        <div className="card px-4 py-3 mb-4 flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-24 shrink-0 flex items-center gap-1.5 text-xs font-semibold text-ink/50 uppercase tracking-wider">
              <Icon name="layers" size={13} />
              Opération
            </span>
            <div className="flex flex-wrap gap-1.5">
              {[{ op: "toutes", total: null }, ...OPERATIONS].map(({ op, total }) => {
                const actif = operation === op;
                return (
                  <button
                    key={op}
                    onClick={() => setOperation(actif && op !== "toutes" ? "toutes" : op)}
                    aria-pressed={actif}
                    className={`h-8 px-3 rounded-lg border text-[13px] font-medium inline-flex items-center gap-1.5 transition-colors ${
                      actif ? "bg-brand-600 border-brand-600 text-white" : "bg-white border-line text-ink/75 hover:border-brand-300 hover:text-ink"
                    } ${total === 0 && !actif ? "opacity-45" : ""}`}
                  >
                    {op === "toutes" ? "Toutes" : op}
                    {total !== null && (
                      <span className={`tabular text-[11px] rounded-md px-1.5 ${actif ? "bg-white/20" : "bg-ink/[0.06] text-ink/55"}`}>{total}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="h-px bg-line" />

          <div className="flex flex-wrap items-center gap-2">
            <span className="w-24 shrink-0 flex items-center gap-1.5 text-xs font-semibold text-ink/50 uppercase tracking-wider">
              <Icon name="calendar" size={13} />
              Date
            </span>
            <div className="segmented">
              {[
                ["tout", "Tout"],
                ["aujourdhui", "Aujourd'hui"],
                ["jour", "Un jour"],
                ["mois", "Un mois"],
              ].map(([m, l]) => (
                <button key={m} data-active={periode.mode === m} onClick={() => setPeriode((p) => ({ ...p, mode: m }))}>
                  {l}
                </button>
              ))}
            </div>
            {periode.mode === "jour" && (
              <input
                type="date"
                className="input input-sm w-40"
                value={periode.jour}
                onChange={(e) => setPeriode((p) => ({ ...p, jour: e.target.value }))}
                aria-label="Jour"
              />
            )}
            {periode.mode === "mois" && (
              <input
                type="month"
                className="input input-sm w-40"
                value={periode.mois}
                onChange={(e) => setPeriode((p) => ({ ...p, mois: e.target.value }))}
                aria-label="Mois"
              />
            )}

            <div className="relative ml-auto w-full sm:w-80">
              <Icon name="search" size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/35 pointer-events-none" />
              <input
                className="input pl-9"
                placeholder="Rechercher : dossier, bénéficiaire, adresse, ingénieur…"
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
              />
            </div>
          </div>

          {(filtre !== "tous" || operation !== "toutes" || periode.mode !== "tout" || recherche) && (
            <div className="flex items-center justify-between gap-2 text-xs text-ink/55 -mb-1">
              <span>
                <strong className="text-ink tabular">{lignes.length}</strong> dossier(s) affiché(s)
              </span>
              <button
                className="btn-ghost btn-xs"
                onClick={() => {
                  setFiltre("tous");
                  setOperation("toutes");
                  setPeriode((p) => ({ ...p, mode: "tout" }));
                  setRecherche("");
                }}
              >
                <Icon name="reset" size={12} />
                Réinitialiser les filtres
              </button>
            </div>
          )}
        </div>

        <div className="card overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Dossier</th>
                <th>Ingénieur</th>
                <th>Fiche</th>
                <th>Depuis</th>
                <th>Statut</th>
                <th className="!text-right">Fichiers</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {lignes.slice(0, limite).map((d) => {
                const h = heuresDansEtape(d);
                const urgence = h !== null && h >= seuilUrgence && ![S.VALIDE, ...STATUTS_MANUELS].includes(d.etat);
                const ouvert = dossierActif === d.id;
                return (
                  <Fragment key={d.id}>
                    <tr className={`${ouvert ? "bg-brand-50/60" : urgence ? "bg-isoRed-light/40" : "hover:bg-brand-50/30"}`}>
                      <td className="whitespace-nowrap text-ink/60 tabular">{formatDate(d.date)}</td>
                      <td>
                        <span className="font-semibold flex items-center gap-1.5 flex-wrap">
                          {d.prioritaire && (
                            <span title="Prioritaire" className="text-isoRed">
                              <Icon name="flame" size={15} />
                            </span>
                          )}
                          {d.nom_dossier}
                          {modifs.get(d.id) && (
                            <span className="badge badge-brand" title="Même dossier modifié plusieurs fois">
                              Modif {modifs.get(d.id).n}/{modifs.get(d.id).total}
                            </span>
                          )}
                          {d.nb_retours >= 2 && <span className="badge badge-red">{d.nb_retours} retours</span>}
                        </span>
                        {d.beneficiaire_nom && <span className="block text-xs text-ink/50">{d.beneficiaire_nom}</span>}
                      </td>
                      <td>
                        {d.ingenieur ? (
                          <span className="flex items-center gap-2 capitalize whitespace-nowrap">
                            <Avatar nom={d.ingenieur} taille={22} />
                            {d.ingenieur}
                          </span>
                        ) : (
                          <span className="text-ink/35">—</span>
                        )}
                        {d.ingenieur_modif && <span className="block text-[11px] text-ink/50 capitalize">modif : {d.ingenieur_modif}</span>}
                        {d.hors_habilitation && d.ingenieur && !habilite(d.ingenieur, d.nom_operation) && <span className="block text-[11px] text-isoGold-dark">hors fiche habituelle</span>}
                        {d.valide_par_ingenieur && <span className="block text-[11px] text-isoGreen-dark">corrigé et validé par l'ingénieur</span>}
                      </td>
                      <td className="text-ink/70 whitespace-nowrap">{d.nom_operation}</td>
                      <td>
                        {h !== null && ![S.VALIDE, ...STATUTS_MANUELS].includes(d.etat) ? (
                          <span className={`badge tabular ${classeTemps(h, d.etat)}`}>{formatDuree(h)}</span>
                        ) : (
                          <span className="text-ink/25">—</span>
                        )}
                      </td>
                      <td>
                        <StatutDossier dossier={d} />
                        {d.valide_par && d.etat === S.VALIDE && <p className="text-[11px] text-ink/45 mt-1 capitalize">par {d.valide_par}</p>}
                        {d.etat === S.VERIF && d.pris_en_charge_par && (
                          <p className="text-[11px] text-ink/45 mt-1 capitalize">par {d.pris_en_charge_par}</p>
                        )}
                      </td>
                      <td>
                        <CelluleFichiers
                          supabase={supabase}
                          dossier={d}
                          fichiers={fichiers.parDossier[d.id]}
                          auteur={nomActif}
                          onChange={fichiers.recharger}
                          desactive={fichiers.indisponible}
                          sansInserer
                        />
                      </td>
                      <td>
                        <div className="flex gap-1.5 justify-end">
                          <button className="btn-ghost btn-xs" onClick={() => setDossierHistorique(d)} title="Historique">
                            <Icon name="history" size={14} />
                          </button>
                          <button
                            className={ouvert ? "btn-primary btn-xs" : "btn-secondary btn-xs"}
                            onClick={() => (ouvert ? fermerPanneau() : (fermerPanneau(), setDossierActif(d.id)))}
                            aria-expanded={ouvert}
                          >
                            Traiter
                            <Icon name="chevronDown" size={13} className={ouvert ? "rotate-180" : ""} />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {ouvert && (
                      <tr>
                        <td colSpan={8} className="bg-paper/70 !py-0">
                          {panneauAction(d)}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {lignes.length === 0 && (
                <tr>
                  <td colSpan={8} className="table-empty">
                    Aucun dossier pour ce filtre.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {lignes.length > limite && (
          <div className="flex justify-center mt-4">
            <button className="btn-secondary" onClick={() => setLimite((l) => l + 150)}>
              Afficher plus ({lignes.length - limite} restants)
            </button>
          </div>
        )}
      </main>

      {dossierHistorique && (
        <HistoriqueComplet supabase={supabase} dossier={dossierHistorique} onFermer={() => setDossierHistorique(null)} />
      )}

      {derniereAction && (
        <UndoToast message={`${derniereAction.libelle} — « ${derniereAction.nomDossier} »`} onAnnuler={annulerDerniereAction} />
      )}
    </div>
  );
}
