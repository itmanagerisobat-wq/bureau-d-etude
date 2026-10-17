"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import Navbar from "@/components/Navbar";
import HistoriqueComplet from "@/components/HistoriqueComplet";
import FicheBeneficiaire from "@/components/FicheBeneficiaire";
import FichiersDossier from "@/components/FichiersDossier";
import EchangesDossier, { ajouterEchange, resumeEchanges, PastilleEchanges } from "@/components/EchangesDossier";
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
import { formatDate, formatDuree, S, STATUTS_MANUELS, TYPES_RETOUR, ETATS, rangsModifs, typeDernierRetour } from "@/lib/constants";
import { couleurEtat } from "@/lib/couleurs";
import { enregistrerEvenement, annulerAction, instantane } from "@/lib/actions";
import { attribuerAutomatiquement, equipeDuClient } from "@/lib/dispatch";

const ETATS_CIRCUIT = [S.FILE, S.ASSIGNE, S.EN_COURS, S.ATTENTE_INFO, S.A_CONTROLER, S.VERIF, S.VALIDE, S.PAS_DE_MODIF];
const ETATS_TERMINES = [S.VALIDE, "Dossier vérifié", S.PAS_DE_MODIF, "Annulé", "Suspendue"];

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
  const [noteAssignation, setNoteAssignation] = useState(""); // message pour l'ingénieur à l'attribution
  const [resumes, setResumes] = useState({}); // échanges par dossier (pastilles)
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
    setResumes(await resumeEchanges(supabase, (data || []).filter((d) => !ETATS_TERMINES.includes(d.etat)).map((d) => d.id)));
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
    setNoteAssignation("");
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

  async function assigner(d, ing) {
    if (!ing) return;
    const note = noteAssignation.trim();
    const ok = await appliquer(
      d,
      {
        etat: S.ASSIGNE,
        ingenieur: ing,
        // Dossier de modif réassigné : le nouvel ingénieur devient aussi l'ingénieur de modif (il peut déposer et envoyer)
        ...(d.ingenieur_modif ? { ingenieur_modif: ing } : {}),
        date_assignation: new Date().toISOString(),
        hors_habilitation: !habilite(ing, d.nom_operation),
      },
      `Assigné à ${ing}`,
      { type: d.ingenieur ? "reassignation" : "assignation", cause: `→ ${ing}` + (note ? ` — ${note}` : "") }
    );
    if (ok && note) await ajouterEchange(supabase, d.id, nomTrace || profile?.nom_complet, `Pour ${ing} : ${note}`);
    return ok;
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

  async function enregistrerRetour(d) {
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
    const message = `${TYPES_RETOUR[type].libelle} — ${form.cause}${form.commentaire ? ` : ${form.commentaire}` : ""}`;
    const ok = await appliquer(
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
    if (ok) await ajouterEchange(supabase, d.id, nomTrace || profile?.nom_complet, message);
    return ok;
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

  const q = recherche.trim().toLowerCase();
  const correspond = (d) =>
    !q ||
    [d.nom_dossier, d.beneficiaire_nom, d.beneficiaire_adresse, d.beneficiaire_telephone, d.ingenieur, d.nom_operation, d.client]
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
    { cle: "pasDeModif", libelle: "Pas de modif", couleur: couleurEtat(S.PAS_DE_MODIF), test: (d) => d.etat === S.PAS_DE_MODIF },
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

  // Barre « Depuis » : temps passé dans l'étape, comparé au délai (contrôle) ou au seuil d'urgence
  function barreDepuis(d) {
    const h = heuresDansEtape(d);
    if (h === null || [S.VALIDE, S.PAS_DE_MODIF, ...STATUTS_MANUELS].includes(d.etat)) return <span className="text-ink/25">—</span>;
    const limite_ = [S.A_CONTROLER, S.VERIF].includes(d.etat) ? seuilHeures : seuilUrgence;
    const ratio = limite_ ? h / limite_ : 0;
    const couleur = ratio >= 1 ? "bg-isoRed" : ratio >= 0.6 ? "bg-isoGold" : "bg-brand-500";
    return (
      <div className="flex flex-col gap-1 min-w-[84px]" title={`Délai : ${limite_} h`}>
        <span className={`font-semibold tabular text-[13px] ${ratio >= 1 ? "text-isoRed" : ""}`}>{formatDuree(h)}</span>
        <span className="block h-[5px] rounded-full bg-paper overflow-hidden">
          <span className={`block h-full rounded-full ${couleur}`} style={{ width: `${Math.min(100, Math.max(6, ratio * 100))}%` }} />
        </span>
      </div>
    );
  }

  function panneauAction(d) {
    const peutAssigner = [S.FILE, S.ASSIGNE, S.EN_COURS, S.ATTENTE_INFO].includes(d.etat) || STATUTS_MANUELS.includes(d.etat);
    const peutRetour = [S.A_CONTROLER, S.VERIF, S.VALIDE, S.PAS_DE_MODIF].includes(d.etat);
    const enControle = d.etat === S.A_CONTROLER || d.etat === S.VERIF;
    const ing = d.ingenieur_modif || d.ingenieur;
    const autres = [
      d.etat === S.FILE && (
        <button key="auto" onClick={() => attribuerAuto(d)} className="btn-secondary btn-sm" title="À l'ingénieur habilité le plus disponible">
          <Icon name="users" size={14} />
          Attribuer automatiquement
        </button>
      ),
      [S.FILE, S.ASSIGNE].includes(d.etat) && (
        <button key="prio" onClick={() => basculerPriorite(d)} className="btn-secondary btn-sm">
          <Icon name="flame" size={14} className={d.prioritaire ? "text-isoRed" : ""} />
          {d.prioritaire ? "Retirer la priorité" : "Rendre prioritaire"}
        </button>
      ),
      (d.etat === S.ASSIGNE || STATUTS_MANUELS.includes(d.etat) || d.etat === S.ATTENTE_INFO) && (
        <button key="file" onClick={() => remettreEnFile(d)} className="btn-secondary btn-sm">
          <Icon name="inbox" size={14} />
          Remettre dans la file
        </button>
      ),
    ].filter(Boolean);

    return (
      <aside className="card overflow-hidden flex flex-col xl:sticky xl:top-[84px] xl:max-h-[calc(100vh-100px)]">
        {/* En-tête : statut, nom du dossier en grand, fiche / client / ingénieur */}
        <div className="px-5 pt-4 pb-3.5 border-b border-line">
          <div className="flex items-center gap-2">
            <StatutDossier dossier={d} />
            {d.etat === S.VERIF && d.pris_en_charge_par && <span className="text-xs text-ink/55 capitalize">par {d.pris_en_charge_par}</span>}
            {d.valide_par && [S.VALIDE, S.PAS_DE_MODIF].includes(d.etat) && <span className="text-xs text-ink/55 capitalize">par {d.valide_par}</span>}
            <span className="ml-auto flex gap-1">
              <button className="btn-icon w-8 h-8" onClick={() => setDossierHistorique(d)} title="Historique">
                <Icon name="history" size={15} />
              </button>
              <button className="btn-icon w-8 h-8" onClick={fermerPanneau} title="Fermer">
                <Icon name="x" size={15} />
              </button>
            </span>
          </div>
          <h2 className="nom-dossier text-[38px] mt-1.5 mb-2.5 flex items-center gap-2 flex-wrap">
            {d.prioritaire && <Icon name="flame" size={22} className="text-isoRed" />}
            {d.nom_dossier}
          </h2>
          <dl className="flex flex-wrap gap-x-6 gap-y-1">
            {[
              ["Fiche", d.nom_operation],
              ["Client", d.client],
              ["Ingénieur", d.ingenieur ? d.ingenieur + (d.ingenieur_modif && d.ingenieur_modif !== d.ingenieur ? ` (modif : ${d.ingenieur_modif})` : "") : null],
              ["Date", formatDate(d.date)],
            ].map(([l, v]) => (
              <div key={l}>
                <dt className="text-xs text-ink/45">{l}</dt>
                <dd className="font-semibold">{v || "—"}</dd>
              </div>
            ))}
          </dl>
          {d.motif_statut && (
            <p className="text-xs text-ink/65 mt-2.5 bg-paper rounded-lg px-3 py-2">
              <strong>{d.etat === S.PAS_DE_MODIF ? "Explication de l'ingénieur :" : "Motif :"}</strong> {d.motif_statut}
            </p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          <section className="px-5 py-4 border-b border-line">
            <h3 className="text-[15px] font-bold mb-2.5">Pièces et livrables</h3>
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
          </section>
          <section className="px-5 py-4 border-b border-line">
            <h3 className="text-[15px] font-bold mb-2.5 flex items-center justify-between">
              <span>
                Échanges avec <span className="capitalize">{ing || "l'ingénieur"}</span>
              </span>
              <span className="font-medium text-ink/45 text-[13px]">{resumes[d.id]?.total ? `${resumes[d.id].total} message(s)` : ""}</span>
            </h3>
            <EchangesDossier
              key={"e" + d.id}
              supabase={supabase}
              dossier={d}
              auteur={nomTrace || profile?.nom_complet}
              compact
              onChange={() => resumeEchanges(supabase, [d.id]).then((r) => setResumes((x) => ({ ...x, ...r })))}
            />
          </section>
          <section className="px-5 py-4">
            <h3 className="text-[15px] font-bold mb-2.5">Bénéficiaire</h3>
            <FicheBeneficiaire key={d.id} dossier={d} onSave={(c) => majBeneficiaire(d, c)} compact />
          </section>
        </div>

        {/* Décision */}
        <div className="px-5 py-4 bg-[#FAFCFE] border-t border-line flex flex-col gap-3">
          {d.etat === S.A_CONTROLER && (
            <button onClick={() => prendreEnControle(d)} className="btn-primary w-full" title="Le dossier passe « En vérification Q » à ton nom">
              <Icon name="shield" size={15} />
              Je contrôle
            </button>
          )}
          {enControle && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[13px] text-ink/60">Audité par</span>
              {estResponsable ? (
                <strong className="capitalize mr-auto" title="Enregistré « Audité par » à votre nom, en tant que Responsable">
                  {profile.nom_complet} <span className="font-normal text-ink/50">(Responsable)</span>
                </strong>
              ) : qualiteConnecte ? (
                <strong className="capitalize mr-auto">{auditeurPour(d)}</strong>
              ) : (
                <select
                  className={`input input-sm w-36 mr-auto ${auditeurPour(d) ? "" : "border-isoRed/60"}`}
                  value={auditeurPour(d)}
                  onChange={(e) => {
                    choisirAuditeur(e.target.value);
                    setChoixAudit((c) => ({ ...c, [d.id]: e.target.value }));
                  }}
                  aria-label="Audité par"
                >
                  <option value="">Choisir…</option>
                  {choixAuditeurs(d).map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              )}
              <button
                onClick={() => setTypeRetour(typeRetour === "interne" ? null : "interne")}
                className={typeRetour === "interne" ? "btn bg-isoGold-light text-isoGold-dark border border-isoGold/40" : "btn-danger"}
              >
                <Icon name="undo" size={14} />
                Retour interne
              </button>
              <button onClick={() => valider(d)} className="btn-success" disabled={!auditeurPour(d)}>
                <Icon name="check" size={14} />
                Valider
              </button>
            </div>
          )}
          {[S.VALIDE, S.PAS_DE_MODIF].includes(d.etat) && (
            <div className="flex items-center gap-2">
              <span className="text-[13px] text-ink/60 mr-auto">Nouveau retour</span>
              <div className="segmented">
                <button data-active={typeRetour === "qualite"} onClick={() => setTypeRetour("qualite")} title={TYPES_RETOUR.qualite.aide}>
                  Retour qualité
                </button>
                <button data-active={typeRetour === "client"} onClick={() => setTypeRetour("client")} title={TYPES_RETOUR.client.aide}>
                  Retour modif client
                </button>
              </div>
            </div>
          )}

          {peutRetour && typeRetour && (
            <div className="flex flex-col gap-2 bg-isoRed-light/60 border border-isoRed/20 rounded-lg p-3">
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
                <label className="flex items-center gap-2 text-[13px] cursor-pointer">
                  <input
                    type="checkbox"
                    className="w-4 h-4 accent-[#1F6FA8]"
                    checked={form.bibliotheque}
                    onChange={(e) => setForm((f) => ({ ...f, bibliotheque: e.target.checked }))}
                  />
                  Ajouter à la bibliothèque des erreurs
                </label>
                <button onClick={() => enregistrerRetour(d)} className="btn-primary btn-sm">
                  Enregistrer le retour
                </button>
              </div>
            </div>
          )}

          {autres.length > 0 && <div className="flex flex-wrap gap-2">{autres}</div>}

          {peutAssigner && (
            <div className="flex flex-col gap-2 pt-3 border-t border-dashed border-line">
              <div className="flex items-center gap-2">
                <span className="text-[13px] text-ink/60 shrink-0">{d.ingenieur ? "Réassigner à" : "Assigner à"}</span>
                <select className="input input-sm flex-1 min-w-0" value={assignation} onChange={(e) => setAssignation(e.target.value)}>
                  <option value="">Ingénieur…</option>
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
              <div className="flex items-center gap-2">
                <input
                  className="input input-sm flex-1 border-dashed border-brand-200 bg-[#F8FBFE]"
                  placeholder="Message pour l'ingénieur (facultatif)"
                  value={noteAssignation}
                  onChange={(e) => setNoteAssignation(e.target.value)}
                />
                <button className="btn-secondary btn-sm" disabled={!assignation} onClick={() => assigner(d, assignation)}>
                  Assigner
                </button>
              </div>
              {d.etat === S.EN_COURS && (
                <p className="text-xs text-isoGold-dark">
                  En cours chez {ing} : en le réassignant, il passe « À faire » chez le nouvel ingénieur.
                </p>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-x-1 gap-y-1 pt-3 border-t border-dashed border-line text-[13px]">
            <span className="text-ink/45 mr-1">Mettre de côté :</span>
            {["en pause", "Annulé", ...(options.statutsPerso || [])].filter((st) => st !== d.etat).map((st) => (
              <button key={st} className="btn-ghost btn-xs" onClick={() => changerStatutManuel(d, st)}>
                {st === "en pause" ? "En pause" : st === "Annulé" ? "Annuler le dossier" : ETATS[st]?.court || st}
              </button>
            ))}
            {d.etat === S.VERIF && (
              <button onClick={() => relacherControle(d)} className="btn-ghost btn-xs" title="Le dossier repasse « À contrôler »">
                Remettre à contrôler
              </button>
            )}
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
                Supprimer le dossier
              </button>
            )}
          </div>
        </div>
      </aside>
    );
  }

  // Sous-titres du circuit (ce qui demande de l'attention à chaque étape)
  const parOp = dossiers.filter(parOperation);
  const plusAncien = (etat) => {
    const hs = parOp.filter((d) => d.etat === etat).map(heuresDansEtape).filter((h) => h !== null);
    return hs.length ? formatDuree(Math.max(...hs)) : null;
  };
  const enRetardCtrl = parOp.filter((d) => d.etat === S.A_CONTROLER && (heuresDansEtape(d) ?? 0) >= seuilHeures).length;
  const controleurs = [...new Set(parOp.filter((d) => d.etat === S.VERIF && d.pris_en_charge_par).map((d) => d.pris_en_charge_par))];
  const retoursClient = parOp.filter((d) => estRetour(d) && typeDernierRetour(d) === "client").length;
  const SOUS = {
    file: plusAncien(S.FILE) && { t: `depuis ${plusAncien(S.FILE)}` },
    production: { t: `${parOp.filter((d) => d.etat === S.EN_COURS).length} en cours` },
    aControler: enRetardCtrl ? { t: `${enRetardCtrl} au-delà de ${seuilHeures} h`, alerte: true } : { t: `délai : ${seuilHeures} h` },
    verification: controleurs.length ? { t: controleurs.join(", ") } : null,
    retour: GROUPES.find((g) => g.cle === "retour").total ? { t: `${retoursClient} client(s), ${GROUPES.find((g) => g.cle === "retour").total - retoursClient} interne(s)` } : null,
    pasDeModif: GROUPES.find((g) => g.cle === "pasDeModif").total ? { t: "à relire" } : null,
  };
  const CIRCUIT = ["file", "production", "aControler", "verification", "audites"];
  const tuile = (g, fleche) => {
    const actif = filtre === g.cle;
    const sous = SOUS[g.cle];
    return (
      <button
        key={g.cle}
        onClick={() => setFiltre(actif && g.cle !== "tous" ? "tous" : g.cle)}
        aria-pressed={actif}
        className={fleche ? "fleche" : ""}
        style={actif ? { backgroundColor: `color-mix(in srgb, ${g.couleur} 10%, white)` } : undefined}
      >
        <span className="block font-display chiffre text-[32px] font-bold leading-none" style={{ color: actif ? g.couleur : undefined }}>
          {g.total}
        </span>
        <span className={`block text-[13px] mt-1 truncate ${actif ? "font-semibold text-ink" : "text-ink/65"}`}>{g.libelle}</span>
        {sous && <span className={`block text-xs mt-0.5 truncate ${sous.alerte ? "text-isoRed font-semibold" : "text-ink/45"}`}>{sous.t}</span>}
        <span className="absolute left-0 right-0 bottom-0" style={{ background: g.couleur, height: actif ? 3 : 0 }} />
      </button>
    );
  };
  const actif_ = lignes.find((d) => d.id === dossierActif) || dossiers.find((d) => d.id === dossierActif) || null;
  const filtresActifs = filtre !== "tous" || operation !== "toutes" || periode.mode !== "tout" || recherche;

  return (
    <div className="min-h-screen">
      <Navbar role={profile.role} nom={nomActif} onChangerPersonne={nominatif ? undefined : changerDePersonne} />
      <main className="max-w-[1800px] mx-auto px-3 sm:px-4 lg:px-6 py-6">
        <PageHeader
          titre="Contrôle qualité"
          sousTitre={
            <>
              {GROUPES.find((g) => g.cle === "aControler").total} dossier(s) à contrôler
              {enRetardCtrl ? `, dont ${enRetardCtrl} envoyé(s) il y a plus de ${seuilHeures} h` : ""}. Clique sur une étape pour filtrer.
            </>
          }
          actions={
            <button className="btn-secondary" onClick={exporterTout} disabled={exportEnCours}>
              <Icon name="download" size={14} />
              {exportEnCours ? "Export…" : "Exporter"}
            </button>
          }
        />

        {/* Circuit : les étapes dans l'ordre du dossier, puis les vues à part */}
        <div className="flux mb-4">
          {CIRCUIT.map((c) => GROUPES.find((g) => g.cle === c)).map((g, i) => tuile(g, i < CIRCUIT.length - 1))}
          <span className="w-4 shrink-0 bg-paper border-r border-line" aria-hidden />
          {GROUPES.filter((g) => !CIRCUIT.includes(g.cle) && (!g.discret || g.total > 0 || filtre === g.cle)).map((g) => tuile(g, false))}
          {tuile({ cle: "tous", libelle: "Tous", couleur: "#17324A", total: totalOperation }, false)}
        </div>

        {/* Recherche, fiche, période sur une ligne */}
        <div className="flex flex-wrap items-center gap-2.5 mb-4">
          <div className="relative w-full sm:w-72">
            <Icon name="search" size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/35 pointer-events-none" />
            <input className="input pl-9 h-[38px]" placeholder="Rechercher un dossier, un client…" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
          </div>
          <div className="segmented flex-wrap">
            {[{ op: "toutes", total: null }, ...OPERATIONS].map(({ op, total }) => (
              <button
                key={op}
                data-active={operation === op}
                onClick={() => setOperation(operation === op && op !== "toutes" ? "toutes" : op)}
                className={total === 0 && operation !== op ? "opacity-45" : ""}
                title={total !== null ? `${total} dossier(s)` : undefined}
              >
                {op === "toutes" ? "Toutes les fiches" : op}
              </button>
            ))}
          </div>
          <div className="segmented">
            {[
              ["aujourdhui", "Aujourd'hui"],
              ["jour", "Un jour"],
              ["mois", "Un mois"],
              ["tout", "Tout"],
            ].map(([m, l]) => (
              <button key={m} data-active={periode.mode === m} onClick={() => setPeriode((p) => ({ ...p, mode: m }))}>
                {l}
              </button>
            ))}
          </div>
          {periode.mode === "jour" && (
            <input type="date" className="input input-sm w-40" value={periode.jour} onChange={(e) => setPeriode((p) => ({ ...p, jour: e.target.value }))} aria-label="Jour" />
          )}
          {periode.mode === "mois" && (
            <input type="month" className="input input-sm w-40" value={periode.mois} onChange={(e) => setPeriode((p) => ({ ...p, mois: e.target.value }))} aria-label="Mois" />
          )}
          <span className="ml-auto text-[13px] text-ink/60 flex items-center gap-2">
            <span>
              <strong className="text-ink tabular">{lignes.length}</strong> dossier(s) affiché(s)
            </span>
            {filtresActifs && (
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
                Réinitialiser
              </button>
            )}
          </span>
        </div>

        <div className="grid xl:grid-cols-[minmax(0,1fr)_420px] gap-4 items-start">
          <div className={`card overflow-x-auto ${actif_ ? "order-2 xl:order-1" : ""}`}>
            <table className="table table-serre">
              <thead>
                <tr>
                  <th>Dossier</th>
                  <th>Ingénieur</th>
                  <th>Client</th>
                  <th>Fiche</th>
                  <th>Depuis</th>
                  <th>Statut</th>
                  <th className="!text-right">Fichiers</th>
                </tr>
              </thead>
              <tbody>
                {lignes.slice(0, limite).map((d) => {
                  const h = heuresDansEtape(d);
                  const urgence = h !== null && h >= seuilUrgence && ![S.VALIDE, S.PAS_DE_MODIF, ...STATUTS_MANUELS].includes(d.etat);
                  const ouvert = dossierActif === d.id;
                  return (
                    <tr
                      key={d.id}
                      className={`cursor-pointer ${ouvert ? "bg-[#F3F8FC]" : urgence ? "bg-isoRed-light/30 hover:bg-isoRed-light/50" : "hover:bg-brand-50/40"}`}
                      style={ouvert ? { boxShadow: "inset 4px 0 0 #1F6FA8" } : undefined}
                      onClick={() => (ouvert ? fermerPanneau() : (fermerPanneau(), setDossierActif(d.id)))}
                    >
                      <td>
                        <span className="nom-dossier-sm flex items-center gap-1.5 whitespace-nowrap">
                          {d.prioritaire && <Icon name="flame" size={15} className="text-isoRed" />}
                          {d.nom_dossier}
                          {modifs.get(d.id) && (
                            <span className="badge badge-brand" title="Même dossier modifié plusieurs fois">
                              Modif {modifs.get(d.id).n}/{modifs.get(d.id).total}
                            </span>
                          )}
                          {d.nb_retours >= 2 && <span className="badge badge-red">{d.nb_retours} retours</span>}
                          <PastilleEchanges resume={resumes[d.id]} de={[d.ingenieur, d.ingenieur_modif]} />
                        </span>
                        <span className="block text-xs text-ink/50 whitespace-nowrap truncate max-w-[220px]">
                          {formatDate(d.date)}
                          {d.beneficiaire_nom ? ` · ${d.beneficiaire_nom}` : ""}
                        </span>
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
                        {d.hors_habilitation && d.ingenieur && !habilite(d.ingenieur, d.nom_operation) && <span className="block text-[11px] text-isoGold-dark whitespace-nowrap">hors fiche habituelle</span>}
                        {d.valide_par_ingenieur && <span className="block text-[11px] text-isoGreen-dark">corrigé et validé par l'ingénieur</span>}
                      </td>
                      <td className="text-ink/75 whitespace-nowrap">{d.client || "—"}</td>
                      <td className="text-ink/75 whitespace-nowrap">{d.nom_operation}</td>
                      <td>{barreDepuis(d)}</td>
                      <td>
                        <StatutDossier dossier={d} />
                        {d.valide_par && d.etat === S.VALIDE && <p className="text-[11px] text-ink/45 mt-1 capitalize">par {d.valide_par}</p>}
                        {d.etat === S.VERIF && d.pris_en_charge_par && <p className="text-[11px] text-ink/45 mt-1 capitalize">par {d.pris_en_charge_par}</p>}
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-2">
                          <CelluleFichiers
                            supabase={supabase}
                            dossier={d}
                            fichiers={fichiers.parDossier[d.id]}
                            auteur={nomActif}
                            onChange={fichiers.recharger}
                            desactive={fichiers.indisponible}
                            sansInserer
                          />
                          {ouvert ? (
                            <span className="badge badge-brand">Ouvert</span>
                          ) : d.etat === S.A_CONTROLER ? (
                            <button className="btn-primary btn-xs" onClick={() => (fermerPanneau(), prendreEnControle(d))}>
                              Je contrôle
                            </button>
                          ) : (
                            <button className="btn-secondary btn-xs" onClick={() => (fermerPanneau(), setDossierActif(d.id))}>
                              Traiter
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {lignes.length === 0 && (
                  <tr>
                    <td colSpan={7} className="table-empty">
                      Aucun dossier pour ce filtre.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {lignes.length > limite && (
              <div className="flex justify-center py-4 border-t border-line">
                <button className="btn-secondary" onClick={() => setLimite((l) => l + 150)}>
                  Afficher plus ({lignes.length - limite} restants)
                </button>
              </div>
            )}
          </div>

          <div className={actif_ ? "order-1 xl:order-2" : "hidden xl:block"}>
            {actif_ ? (
              panneauAction(actif_)
            ) : (
              <div className="card px-6 py-12 text-center text-ink/50 xl:sticky xl:top-[84px]">
                <Icon name="shield" size={26} className="mx-auto text-brand-500 mb-3" />
                <p className="font-semibold text-ink">Choisis un dossier dans la liste</p>
                <p className="text-[13px] mt-1">Ses pièces, les échanges avec l'ingénieur et les actions de contrôle s'affichent ici.</p>
              </div>
            )}
          </div>
        </div>
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
