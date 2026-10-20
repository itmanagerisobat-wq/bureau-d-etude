"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import Navbar from "@/components/Navbar";
import SelectionPersonne from "@/components/SelectionPersonne";
import HistoriqueComplet from "@/components/HistoriqueComplet";
import VueCalendrier from "@/components/VueCalendrier";
import FicheBeneficiaire from "@/components/FicheBeneficiaire";
import FichiersDossier from "@/components/FichiersDossier";
import TuilesCockpit from "@/components/TuilesCockpit";
import { serieCompte, serieMoyenne, ecartHier } from "@/lib/series";
import EchangesDossier, { ajouterEchange, resumeEchanges, PastilleEchanges } from "@/components/EchangesDossier";
import { StatutDossier } from "@/components/DossierTable";
import PageHeader, { SectionTitle } from "@/components/ui/PageHeader";
import StatutBadge from "@/components/ui/StatutBadge";
import Icon from "@/components/ui/Icon";
import Modal from "@/components/ui/Modal";
import EmptyState from "@/components/ui/EmptyState";
import UndoToast from "@/components/ui/UndoToast";
import { EcranChargement, EcranErreurProfil } from "@/components/ui/Screens";
import { useAppData } from "@/lib/useAppData";
import { useRafraichissement } from "@/lib/useRafraichissement";
import { useIngenieurSelectionne } from "@/lib/useNomSelectionne";
import { formatDate, formatDuree, S, typeDernierRetour, TYPES_RETOUR } from "@/lib/constants";
import { enregistrerEvenement, annulerAction, instantane } from "@/lib/actions";
import { secondesTraitement, heuresTraitementFini, figerTemps, majDossier } from "@/lib/tempsTraitement";

const AUJOURD_HUI_ISO = new Date().toISOString().slice(0, 10);

// Chrono du dossier en cours : temps passé dessus, pauses exclues
function Chrono({ dossier, delaiMaxHeures }) {
  const [, forcer] = useState(0);
  useEffect(() => {
    const id = setInterval(() => forcer((n) => n + 1), 30000);
    return () => clearInterval(id);
  }, []);
  if (!dossier?.date_acceptation) return null;
  const ecoule = secondesTraitement(dossier) / 3600;
  const reste = delaiMaxHeures ? delaiMaxHeures - ecoule : null;
  const depasse = reste !== null && reste < 0;
  return (
    <div className="flex flex-col items-end">
      <span className="font-display chiffre text-[42px] font-bold leading-none">{formatDuree(ecoule)}</span>
      {reste !== null && (
        <span className={`text-xs font-semibold mt-1 ${depasse ? "text-isoRed" : "text-isoGold-dark"}`}>
          {depasse ? `Délai dépassé de ${formatDuree(-reste)}` : `Il te reste ${formatDuree(reste)}`}
        </span>
      )}
    </div>
  );
}

export default function MesDossiersPage() {
  const { profile, erreurProfil, loading, supabase } = useAppData();
  const choix = useIngenieurSelectionne();
  // Chaque ingénieur se connecte avec son propre compte (plus de code PIN) ;
  // seul l'admin choisit l'ingénieur dont il veut voir l'écran.
  const estAdmin = profile?.role === "admin";
  const nom = estAdmin ? choix.nom : profile?.ingenieur_ref || null;
  const pret = estAdmin ? choix.pret : true;
  const selectionner = choix.selectionner;
  const changerDePersonne = estAdmin ? choix.changerDePersonne : undefined;
  const [ingenieursAvecPin, setIngenieursAvecPin] = useState([]);
  const [aModifier, setAModifier] = useState(null); // dossier envoyé au contrôle, encore modifiable
  const [autoValidation, setAutoValidation] = useState(true); // réglage admin : validation par l'ingénieur après retour
  const [fileManuelle, setFileManuelle] = useState(false); // distribution manuelle de la file
  const [dossiers, setDossiers] = useState([]);
  const [objectifsJour, setObjectifsJour] = useState([]);
  const [dossiersEquipeAujourdHui, setDossiersEquipeAujourdHui] = useState([]);
  const [dossierHistorique, setDossierHistorique] = useState(null);
  const [commentaire, setCommentaire] = useState("");
  const [vue, setVue] = useState("liste");
  const [delaiMaxHeures, setDelaiMaxHeures] = useState(null);
  const [derniereAction, setDerniereAction] = useState(null);
  const [dernierRetour, setDernierRetour] = useState(null);
  const [erreursFiche, setErreursFiche] = useState([]);
  const [prise, setPrise] = useState({ enCours: false, message: "" });
  const [ouvert, setOuvert] = useState(null); // dossier ouvert depuis une liste (pièces + échanges)
  const [resumes, setResumes] = useState({}); // échanges par dossier (pastilles)

  useEffect(() => {
    if (!profile) return;
    (async () => {
      const [{ data: ings }, { data: config }] = await Promise.all([
        supabase.from("parametres_ingenieurs").select("nom, pin").eq("actif", true).order("nom"),
        supabase.from("parametres_config").select("*").limit(1).maybeSingle(),
      ]);
      setIngenieursAvecPin(ings || []);
      if (config) {
        setDelaiMaxHeures(config.delai_max_traitement_heures);
        setAutoValidation(config.validation_ingenieur_apres_retour !== false);
        setFileManuelle(config.file_mode === "manuel");
      }
    })();
  }, [profile]);

  async function chargerDossiers() {
    if (!nom) return;
    // Ingénieur du dossier OU ingénieur de modif (dossier réassigné), sans tenir compte des majuscules
    const q = `"${String(nom).trim().replace(/["\\%]/g, "")}"`;
    const { data } = await supabase
      .from("dossiers")
      .select("*")
      .or(`ingenieur.ilike.${q},ingenieur_modif.ilike.${q}`)
      .order("date", { ascending: false })
      .limit(300);
    const lc = (v) => String(v || "").trim().toLowerCase();
    const moi = lc(nom);
    const TERMINES = [S.VALIDE, "Dossier vérifié", S.PAS_DE_MODIF, "Annulé", "Suspendue"];
    // Dossier en circuit : il appartient à celui qui doit le traiter (l'ingénieur de modif s'il y en a un).
    // Dossier terminé : visible par les deux (historique).
    const miens = (data || []).filter((d) =>
      TERMINES.includes(d.etat) ? lc(d.ingenieur) === moi || lc(d.ingenieur_modif) === moi : (lc(d.ingenieur_modif) || lc(d.ingenieur)) === moi
    );
    setDossiers(miens);
    setResumes(await resumeEchanges(supabase, miens.filter((d) => !TERMINES.includes(d.etat)).map((d) => d.id)));
  }

  async function chargerProgressionEquipe() {
    const [{ data: objs }, { data: doss }] = await Promise.all([
      supabase.from("objectifs_journaliers").select("*").eq("date", AUJOURD_HUI_ISO),
      supabase.from("dossiers").select("nom_operation, nature_prod, date").eq("date", AUJOURD_HUI_ISO),
    ]);
    setObjectifsJour(objs || []);
    setDossiersEquipeAujourdHui(doss || []);
  }

  useEffect(() => {
    chargerDossiers();
    chargerProgressionEquipe();
  }, [nom]);
  useRafraichissement(() => {
    chargerDossiers();
    chargerProgressionEquipe();
  }, !!nom);

  const enCours = dossiers.find((d) => d.etat === S.EN_COURS) || null;

  // Remarques du dernier retour + erreurs fréquentes de la fiche, pour le dossier en cours
  useEffect(() => {
    if (!enCours) {
      setDernierRetour(null);
      setErreursFiche([]);
      return;
    }
    (async () => {
      const [{ data: ret }, { data: fiche }] = await Promise.all([
        supabase.from("dossier_retours").select("*").eq("dossier_id", enCours.id).order("created_at", { ascending: false }).limit(1),
        supabase
          .from("dossier_retours")
          .select("*")
          .eq("operation", enCours.nom_operation)
          .order("created_at", { ascending: false })
          .limit(400),
      ]);
      setDernierRetour(enCours.a_corriger ? ret?.[0] || null : null);
      const compte = {};
      for (const r of (fiche || []).filter((x) => x.annule !== true)) {
        if (!compte[r.cause]) compte[r.cause] = { cause: r.cause, total: 0, explication: null, bib: false };
        compte[r.cause].total += 1;
        if (r.bibliotheque) {
          compte[r.cause].bib = true;
          compte[r.cause].explication = compte[r.cause].explication || r.explication;
        }
      }
      setErreursFiche(
        Object.values(compte)
          .sort((a, b) => (b.bib ? 1 : 0) - (a.bib ? 1 : 0) || b.total - a.total)
          .slice(0, 3)
      );
    })();
  }, [enCours?.id]);

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

  async function prendreLeSuivant() {
    setPrise({ enCours: true, message: "" });
    const { data, error } = await supabase.rpc("fn_prendre_suivant", { p_ingenieur: nom });
    if (error) {
      setPrise({
        enCours: false,
        message: error.message.includes("deja_en_cours")
          ? "Tu as déjà un dossier en cours : termine-le d'abord."
          : "Impossible de prendre un dossier : " + error.message,
      });
      return;
    }
    const pris = Array.isArray(data) ? data[0] : data;
    setPrise({
      enCours: false,
      message: pris
        ? ""
        : fileManuelle
          ? "Distribution manuelle : aucun dossier ne t'est attribué pour l'instant."
          : "Aucun dossier disponible pour tes fiches. La Qualité peut t'en assigner un à la main.",
    });
    chargerDossiers();
  }

  async function terminer(d, suivant = false) {
    const { error } = await majDossier(supabase, d.id, { etat: S.A_CONTROLER, date_soumission: new Date().toISOString(), a_corriger: false, ...figerTemps(d) });
    if (error) return alert("Action impossible : " + error.message);
    const evt = await enregistrerEvenement(supabase, d.id, "soumission_verification", { nom });
    if (commentaire.trim()) await ajouterEchange(supabase, d.id, nom, commentaire);
    memoriser(d, "Envoyé au contrôle", evt);
    setCommentaire("");
    if (suivant) {
      // « Terminé → suivant » : le dossier suivant est attribué automatiquement
      await prendreLeSuivant();
    } else {
      chargerDossiers();
    }
  }

  async function mettreEnAttente(d) {
    const motif = window.prompt("Quelle info manque ? (obligatoire)");
    if (!motif || !motif.trim()) return;
    // Le chrono s'arrête pendant l'attente d'info
    const { error } = await majDossier(supabase, d.id, { etat: S.ATTENTE_INFO, motif_statut: motif.trim(), ...figerTemps(d) });
    if (error) return alert("Action impossible : " + error.message);
    const evt = await enregistrerEvenement(supabase, d.id, "attente_info", { nom, cause: motif.trim() });
    memoriser(d, "Mis en attente d'info", evt);
    chargerDossiers();
  }

  // Après un retour : l'ingénieur corrige et valide lui-même, sans repasser par le contrôle.
  // « Audité par » reste la personne de la Qualité qui avait contrôlé le dossier.
  async function validerApresRetour(d) {
    const auditeur = d.pris_en_charge_par || d.valide_par;
    if (!auditeur)
      return alert("Impossible de valider toi-même : on ne sait pas qui a contrôlé ce dossier. Utilise « Terminé » pour l'envoyer au contrôle.");
    if (!confirm(`Tu confirmes avoir corrigé « ${d.nom_dossier} » ?\nLe dossier sera validé directement (Audité par ${auditeur}), sans nouveau contrôle.`)) return;
    const maintenant = new Date().toISOString();
    const champs = { etat: S.VALIDE, date_soumission: maintenant, date_verification: maintenant, valide_par: auditeur, a_corriger: false, ...figerTemps(d) };
    let { error } = await majDossier(supabase, d.id, { ...champs, valide_par_ingenieur: true });
    if (error && /valide_par_ingenieur/.test(error.message)) ({ error } = await majDossier(supabase, d.id, champs));
    if (error)
      return alert(
        /foreign key|valide_par/i.test(error.message)
          ? `« ${auditeur} » n'est pas dans la liste Service qualité : utilise « Terminé » pour l'envoyer au contrôle.`
          : "Action impossible : " + error.message
      );
    const evt = await enregistrerEvenement(supabase, d.id, "validation_ingenieur", { nom, cause: commentaire.trim() || null });
    if (commentaire.trim()) await ajouterEchange(supabase, d.id, nom, commentaire);
    setCommentaire("");
    memoriser(d, "Corrigé et validé", evt);
    chargerDossiers();
  }

  // Pause : le dossier en cours est mis de côté (ex. pour traiter un dossier urgent)
  async function mettreEnPause(d, silencieux = false) {
    const motif = silencieux ? "Mis en pause pour un dossier urgent" : window.prompt("Pourquoi mettre ce dossier en pause ? (facultatif)", "");
    if (motif === null) return false;
    // Le temps de traitement s'arrête jusqu'à la reprise
    const { error } = await majDossier(supabase, d.id, { etat: "en pause", motif_statut: motif.trim() || null, ...figerTemps(d) });
    if (error) {
      alert("Action impossible : " + error.message);
      return false;
    }
    const evt = await enregistrerEvenement(supabase, d.id, "mise_en_pause", { nom, cause: motif.trim() || null });
    memoriser(d, "Mis en pause", evt);
    if (!silencieux) chargerDossiers();
    return true;
  }

  // Dossier urgent : met en pause le dossier en cours et démarre l'urgent
  async function passerALUrgent(urgent) {
    if (enCours && !(await mettreEnPause(enCours, true))) return;
    const { error } = await majDossier(supabase, urgent.id, { etat: S.EN_COURS, date_acceptation: new Date().toISOString() });
    if (error) return alert("Action impossible : " + error.message);
    await enregistrerEvenement(supabase, urgent.id, "acceptation", { nom, cause: "Dossier urgent" });
    chargerDossiers();
  }

  // Après un retour (souvent un retour client) : la modification demandée est déjà faite.
  // Le dossier passe « Pas de modif à faire », avec l'explication de l'ingénieur (visible par la Qualité).
  async function pasDeModif(d, texteSaisi = "") {
    const explication = String(texteSaisi || "").trim() || window.prompt("Pourquoi aucune modification n'est nécessaire ? (obligatoire)", "");
    if (!explication || !explication.trim()) return;
    const maintenant = new Date().toISOString();
    const { error } = await majDossier(supabase, d.id, {
      etat: S.PAS_DE_MODIF,
      a_corriger: false,
      motif_statut: explication.trim(),
      date_soumission: maintenant,
      ...(d.etat === S.EN_COURS ? figerTemps(d) : {}),
    });
    if (error)
      return alert(
        /foreign key|parametres_etats/i.test(error.message)
          ? "Le statut « Pas de modif à faire » n'existe pas encore : l'administrateur doit exécuter la migration V28."
          : "Action impossible : " + error.message
      );
    const evt = await enregistrerEvenement(supabase, d.id, "pas_de_modif", { nom, cause: explication.trim() });
    await ajouterEchange(supabase, d.id, nom, `Pas de modif à faire : ${explication.trim()}`);
    if (texteSaisi) setCommentaire("");
    memoriser(d, "Pas de modif à faire", evt);
    setOuvert(null);
    chargerDossiers();
  }

  // Commencer un dossier précis de sa liste (sans passer par « Prendre le suivant »)
  async function commencer(d) {
    if (enCours) return alert("Termine ou mets en pause ton dossier en cours d'abord.");
    // Nouvelle prise en charge : le chrono repart de zéro
    const { data, error } = await majDossier(
      supabase,
      d.id,
      { etat: S.EN_COURS, motif_statut: null, date_acceptation: new Date().toISOString(), temps_traitement_s: 0 },
      (q) => q.eq("etat", S.ASSIGNE),
      true
    );
    if (error) return alert("Action impossible : " + error.message);
    if (!data?.length) {
      chargerDossiers();
      return alert("Ce dossier a changé de statut entre-temps.");
    }
    const evt = await enregistrerEvenement(supabase, d.id, "acceptation", { nom });
    memoriser(d, "Dossier commencé", evt);
    setOuvert(null);
    chargerDossiers();
  }

  async function reprendre(d) {
    if (enCours) return alert("Termine d'abord ton dossier en cours.");
    // Reprise après une pause : le chrono repart du temps déjà passé
    const { error } = await majDossier(supabase, d.id, { etat: S.EN_COURS, motif_statut: null, date_acceptation: new Date().toISOString() });
    if (error) return alert("Action impossible : " + error.message);
    const evt = await enregistrerEvenement(supabase, d.id, "reprise", { nom });
    memoriser(d, "Dossier repris", evt);
    chargerDossiers();
  }

  if (erreurProfil) return <EcranErreurProfil message={erreurProfil} />;
  if (loading || !profile || !pret) return <EcranChargement />;
  if (!nom) {
    return profile.role === "admin" ? (
      <SelectionPersonne
        personnes={ingenieursAvecPin}
        onSelection={selectionner}
        sansCode
        titre="Vue ingénieur"
        sousTitre="Aperçu admin : choisis l'ingénieur dont tu veux voir l'écran."
      />
    ) : (
      <EcranErreurProfil message="Ce compte n'est relié à aucun ingénieur. Demande à l'administrateur de lier ton compte à ton nom (Paramètres → Comptes → Renommer)." />
    );
  }

  const parPriorite = (a, b) => (b.prioritaire ? 1 : 0) - (a.prioritaire ? 1 : 0);
  const enRetour = dossiers.filter((d) => d.etat === S.ASSIGNE && d.a_corriger).sort(parPriorite);
  const aFaire = dossiers.filter((d) => d.etat === S.ASSIGNE && !d.a_corriger).sort(parPriorite);
  const maListe = [...enRetour, ...aFaire];
  const enPause = dossiers.filter((d) => d.etat === "en pause");
  // Urgents qui attendent alors qu'un autre dossier est en cours
  const urgents = enCours ? dossiers.filter((d) => d.prioritaire && d.etat === S.ASSIGNE && d.id !== enCours.id) : [];

  async function majBeneficiaire(d, champs) {
    const { error } = await supabase.from("dossiers").update(champs).eq("id", d.id);
    if (error) return error.message;
    chargerDossiers();
    return null;
  }
  // Envoyé au contrôle mais pas encore pris par la Qualité : l'ingénieur peut encore le modifier ou le récupérer
  const modifiable = (d) => d.etat === S.A_CONTROLER && !d.pris_en_charge_par;

  async function encoreModifiable(d) {
    const { data } = await supabase.from("dossiers").select("etat, pris_en_charge_par").eq("id", d.id).maybeSingle();
    return data && modifiable(data);
  }

  async function majApresEnvoi(d, champs) {
    if (!(await encoreModifiable(d))) {
      chargerDossiers();
      return "La Qualité a déjà pris ce dossier en contrôle : il n'est plus modifiable.";
    }
    return majBeneficiaire(d, champs);
  }

  async function recuperer(d) {
    if (enCours) return alert("Termine d'abord ton dossier en cours.");
    const { data, error } = await supabase
      .from("dossiers")
      .update({ etat: S.EN_COURS, date_soumission: null, date_acceptation: new Date().toISOString() })
      .eq("id", d.id)
      .eq("etat", S.A_CONTROLER)
      .is("pris_en_charge_par", null)
      .select("id");
    if (error) return alert("Action impossible : " + error.message);
    if (!data?.length) {
      chargerDossiers();
      return alert("La Qualité a déjà pris ce dossier en contrôle : il ne peut plus être récupéré.");
    }
    const evt = await enregistrerEvenement(supabase, d.id, "reprise", { nom, cause: "Récupéré avant contrôle" });
    memoriser(d, "Dossier récupéré", evt);
    setAModifier(null);
    chargerDossiers();
  }

  const attenteInfo = dossiers.filter((d) => d.etat === S.ATTENTE_INFO);
  const auControle = dossiers.filter((d) => [S.A_CONTROLER, "En cours de vérification"].includes(d.etat));
  const traites = dossiers.filter((d) => [S.VALIDE, "Dossier vérifié", S.PAS_DE_MODIF].includes(d.etat));

  // Progression du jour, par opération (équipe + perso)
  const traitesAujourdHui = dossiers.filter((d) => d.date === AUJOURD_HUI_ISO);
  const operationsAvecActivite = [...new Set([...objectifsJour.map((o) => o.operation), ...traitesAujourdHui.map((d) => d.nom_operation)])];
  const progression = operationsAvecActivite.map((op) => {
    const objectif = objectifsJour.find((o) => o.operation === op);
    const equipeOp = dossiersEquipeAujourdHui.filter((d) => d.nom_operation === op);
    return {
      operation: op,
      objectif,
      equipeNv: equipeOp.filter((d) => d.nature_prod === "Nouveau dossier").length,
      equipeModif: equipeOp.filter((d) => d.nature_prod === "Modification").length,
    };
  });

  function barre(valeur, objectif) {
    if (!objectif) return null;
    const pct = Math.min(100, Math.round((valeur / objectif) * 100));
    return (
      <div className="h-1.5 rounded-full bg-ink/[0.06] overflow-hidden mt-1">
        <div className={`h-full rounded-full ${pct >= 100 ? "bg-isoGreen" : "bg-brand-500"}`} style={{ width: `${pct}%` }} />
      </div>
    );
  }

  // Bloc de la colonne de droite : une ligne par dossier, clic = ouvrir (pièces, dépôt, échanges)
  function blocListe(titre, lignes, action, couleur, vide, sousTitre) {
    return (
      <div className="card overflow-hidden">
        <h3 className="text-[15px] font-bold px-[18px] pt-4 pb-2 flex items-center justify-between">
          {titre} <span className="text-[13px] font-medium text-ink/45">{lignes.length}</span>
        </h3>
        {lignes.length === 0 && <p className="px-[18px] pb-4 text-sm text-ink/45">{vide}</p>}
        {lignes.map((d) => (
          <div
            key={d.id}
            className="grid grid-cols-[4px_1fr_auto] gap-3 items-center pr-[18px] py-2.5 border-t border-line cursor-pointer hover:bg-paper/60"
            onClick={() => setOuvert(d)}
            title="Ouvrir : pièces, dépôt des livrables et échanges"
          >
            <i className="self-stretch rounded-r" style={{ background: couleur ? couleur(d) : "#D9E3EC" }} />
            <div className="min-w-0">
              <p className="nom-dossier-sm flex items-center gap-1.5">
                {d.prioritaire && <Icon name="flame" size={13} className="text-isoRed" />}
                <span className="truncate">{d.nom_dossier}</span>
                <PastilleEchanges resume={resumes[d.id]} moi={nom} />
              </p>
              <p className="text-xs text-ink/45 truncate">
                {sousTitre ? sousTitre(d) : [d.nom_operation, d.beneficiaire_nom, d.motif_statut && `Motif : ${d.motif_statut}`].filter(Boolean).join(", ")}
              </p>
            </div>
            <div onClick={(e) => e.stopPropagation()}>{action ? action(d) : <StatutDossier dossier={d} />}</div>
          </div>
        ))}
      </div>
    );
  }

  // Ma journée : envoyés aujourd'hui, validés du premier coup, temps moyen par dossier
  const jour = new Date().toDateString();
  const envoyesJour = dossiers.filter((d) => d.date_soumission && new Date(d.date_soumission).toDateString() === jour).length;
  const premierCoup = traites.length ? Math.round((traites.filter((d) => !d.nb_retours).length / traites.length) * 100) : null;
  const durees = traites.map(heuresTraitementFini).filter((h) => h !== null && h > 0 && h < 24 * 30);
  const tempsMoyen = durees.length ? durees.reduce((a, b) => a + b, 0) / durees.length : null;

  return (
    <div className="min-h-screen">
      <Navbar role={profile.role} nom={nom} onChangerPersonne={changerDePersonne} />

      <main className="max-w-[1360px] mx-auto px-3 sm:px-4 lg:px-6 py-6">
        <PageHeader
          titre={<span className="capitalize">Bonjour {nom}</span>}
          horloge={false}
          sousTitre={`${enCours ? "1 dossier en cours" : "Aucun dossier en cours"}, ${maListe.length} qui t'attendent${
            maListe.filter((d) => d.a_corriger).length ? ` dont ${maListe.filter((d) => d.a_corriger).length} retour(s)` : ""
          }.`}
          actions={
            <div className="flex items-center gap-7">
              <div className="segmented">
                <button data-active={vue === "liste"} onClick={() => setVue("liste")}>
                  <Icon name="list" size={13} />
                  Liste
                </button>
                <button data-active={vue === "calendrier"} onClick={() => setVue("calendrier")}>
                  <Icon name="calendar" size={13} />
                  Calendrier
                </button>
              </div>
            </div>
          }
        />

        {(() => {
          const envois = serieCompte(dossiers, "date_soumission");
          const ec = ecartHier(envois);
          return (
            <TuilesCockpit
              items={[
                { label: "Envoyés aujourd'hui", valeur: envoyesJour, note: ec.texte, ton: ec.ton, serie: envois, actif: true },
                { label: "Validés du premier coup", valeur: premierCoup === null ? "—" : `${premierCoup} %`, note: "mes audités", serie: serieMoyenne(traites, "date_verification", (d) => (d.nb_retours ? 0 : 100)) },
                { label: "Temps moyen par dossier", valeur: tempsMoyen === null ? "—" : formatDuree(tempsMoyen), note: "pauses exclues", serie: serieMoyenne(traites, "date_soumission", heuresTraitementFini) },
                { label: "Retours à corriger", valeur: enRetour.length, note: enRetour.length ? "à traiter en premier" : "aucun", ton: enRetour.length ? "ambre" : "vert", serie: [] },
              ]}
            />
          );
        })()}

        {vue === "calendrier" ? (
          <VueCalendrier dossiers={dossiers} />
        ) : (
          <>
            {urgents.length > 0 && (
              <section className="alert alert-red mb-5 flex-col !gap-2">
                {urgents.map((u) => (
                  <div key={u.id} className="flex flex-wrap items-center gap-3">
                    <Icon name="flame" size={18} className="text-isoRed" />
                    <p className="flex-1 min-w-[220px] text-sm text-ink">
                      <strong>Dossier urgent : {u.nom_dossier}</strong>
                      <span className="text-ink/60"> · {u.nom_operation}</span>
                    </p>
                    <button className="btn-danger btn-sm" onClick={() => passerALUrgent(u)}>
                      Mettre « {enCours?.nom_dossier} » en pause et commencer l'urgent
                    </button>
                  </div>
                ))}
              </section>
            )}

            <div className="grid lg:grid-cols-[minmax(0,1fr)_370px] gap-5 items-start mb-8 [&>*]:min-w-0">
              {/* La fiche du dossier en cours */}
              {enCours ? (
                <article className="card overflow-hidden">
                  <div className="px-6 pt-5 pb-4 grid grid-cols-[1fr_auto] gap-4 border-b border-line">
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-brand-600">Dossier en cours</p>
                      <h2 className="nom-dossier text-[52px] flex items-center gap-3 flex-wrap mt-1">
                        {enCours.nom_dossier}
                        {enCours.prioritaire && (
                          <span className="badge badge-red">
                            <Icon name="flame" size={12} />
                            Prioritaire
                          </span>
                        )}
                      </h2>
                      <dl className="flex flex-wrap gap-x-7 gap-y-1 mt-3">
                        {[
                          ["Fiche CEE", enCours.nom_operation],
                          ["Client", enCours.client],
                          ["Bénéficiaire", enCours.beneficiaire_nom],
                          ["Nature", enCours.nature_prod],
                        ].map(([l, v]) => (
                          <div key={l}>
                            <dt className="text-xs text-ink/45">{l}</dt>
                            <dd className="font-semibold">{v || "—"}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                    <Chrono dossier={enCours} delaiMaxHeures={delaiMaxHeures} />
                  </div>

                  {/* Parcours du dossier */}
                  <div className="grid grid-cols-4 px-6 pt-4 pb-4 bg-paper border-b border-line">
                    {[
                      { l: "Attribué", s: enCours.date_assignation ? `le ${new Date(enCours.date_assignation).toLocaleDateString("fr-FR")}` : "", fait: true },
                      enCours.a_corriger
                        ? { l: (TYPES_RETOUR[typeDernierRetour(enCours)] || TYPES_RETOUR.interne).libelle, s: `${enCours.nb_retours || 1} retour(s)`, fait: true, retour: true }
                        : { l: "Pris", s: "par toi", fait: true },
                      { l: "En cours", s: enCours.date_acceptation ? `depuis ${new Date(enCours.date_acceptation).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}` : "", ici: true },
                      { l: "Contrôle", s: "Qualité" },
                    ].map((e, i) => (
                      <div key={i} className="relative pt-[18px] text-xs text-ink/45">
                        <span
                          className="absolute top-[5px] left-0 right-0 h-[3px]"
                          style={{
                            background: e.retour
                              ? "repeating-linear-gradient(90deg,#C98A1B 0 6px,transparent 6px 10px)"
                              : e.fait
                                ? "#1F6FA8"
                                : "#D9E3EC",
                          }}
                        />
                        <span
                          className="absolute top-0 left-0 w-[13px] h-[13px] rounded-full border-[3px]"
                          style={{
                            background: e.fait ? "#1F6FA8" : "#fff",
                            borderColor: e.fait || e.ici ? "#1F6FA8" : "#D9E3EC",
                            boxShadow: e.ici ? "0 0 0 4px rgba(31,111,168,.18)" : undefined,
                          }}
                        />
                        <span className={`block ${e.ici ? "text-ink font-bold" : ""}`}>{e.l}</span>
                        <span className="block">{e.s}</span>
                      </div>
                    ))}
                  </div>

                  {dernierRetour && (
                    <div className="mx-6 mt-4 border-l-4 border-isoGold bg-isoGold-light rounded-r-lg px-4 py-3">
                      <p className="font-semibold">
                        {(TYPES_RETOUR[typeDernierRetour(enCours)] || TYPES_RETOUR.interne).libelle} : {dernierRetour.cause}
                      </p>
                      {dernierRetour.commentaire && <p className="text-ink/70 mt-0.5">« {dernierRetour.commentaire} »</p>}
                      <p className="text-xs text-ink/50 mt-1">
                        Le {new Date(dernierRetour.created_at).toLocaleDateString("fr-FR")}
                        {dernierRetour.effectue_par_nom ? `, par ${dernierRetour.effectue_par_nom}` : ""}
                      </p>
                    </div>
                  )}

                  <div className="grid md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                    <section className="px-6 py-5 flex flex-col gap-5 min-w-0">
                      <div>
                        <h3 className="text-[15px] font-bold mb-2.5">Pièces</h3>
                        <FichiersDossier
                          key={"f" + enCours.id}
                          supabase={supabase}
                          dossier={enCours}
                          auteur={nom}
                          peutDeposerPieces={false}
                          peutDeposerLivrables
                          peutSupprimer={(f) => f.categorie === "livrable"}
                          compact
                        />
                      </div>
                      <div>
                        <h3 className="text-[15px] font-bold mb-2.5">Bénéficiaire</h3>
                        <FicheBeneficiaire key={enCours.id} dossier={enCours} onSave={(c) => majBeneficiaire(enCours, c)} compact />
                      </div>
                    </section>
                    <section className="px-6 py-5 flex flex-col gap-5 md:border-l border-line min-w-0">
                      <div>
                        <h3 className="text-[15px] font-bold mb-2.5">Échanges avec la Qualité</h3>
                        <EchangesDossier key={"e" + enCours.id} supabase={supabase} dossier={enCours} auteur={nom} compact />
                      </div>
                      <div>
                        <h3 className="text-[15px] font-bold mb-2.5">Erreurs fréquentes sur {enCours.nom_operation}</h3>
                        {erreursFiche.length === 0 ? (
                          <p className="text-sm text-ink/45">Aucun retour enregistré sur cette fiche pour l'instant.</p>
                        ) : (
                          <ol className="flex flex-col gap-2">
                            {erreursFiche.map((e, i) => (
                              <li key={e.cause} className="flex gap-3 text-sm bg-isoGold-light/60 rounded-lg px-3 py-2">
                                <span className="font-display chiffre font-bold text-isoGold-dark text-base">{i + 1}</span>
                                <span>
                                  <span className="font-semibold">{e.cause}</span>
                                  <span className="text-ink/45"> · {e.total} retour{e.total > 1 ? "s" : ""}</span>
                                  {e.explication && <span className="block text-ink/65 text-xs mt-0.5">{e.explication}</span>}
                                </span>
                              </li>
                            ))}
                          </ol>
                        )}
                      </div>
                    </section>
                  </div>

                  <div className="px-6 py-4 border-t border-line bg-[#FAFCFE] flex flex-wrap items-center gap-2">
                    <input
                      className="input flex-1 min-w-[220px]"
                      placeholder="Commentaire pour la Qualité, joint à l'envoi (facultatif)"
                      value={commentaire}
                      onChange={(e) => setCommentaire(e.target.value)}
                    />
                    <button className="btn-secondary" onClick={() => mettreEnPause(enCours)} title="Mettre ce dossier de côté (ex. pour traiter un dossier urgent)">
                      Pause
                    </button>
                    <button className="btn-secondary" onClick={() => mettreEnAttente(enCours)}>
                      En attente d'info
                    </button>
                    {enCours.a_corriger && (
                      <button className="btn-secondary" onClick={() => pasDeModif(enCours, commentaire)} title="La modification demandée est déjà faite (le commentaire saisi sert d'explication)">
                        Pas de modif à faire
                      </button>
                    )}
                    {enCours.a_corriger && autoValidation && (
                      <button className="btn-success" onClick={() => validerApresRetour(enCours)} title="Après un retour : tu as corrigé, tu valides toi-même sans renvoyer au contrôle">
                        <Icon name="checkCircle" size={15} />
                        Corrigé, je valide
                      </button>
                    )}
                    <button className="btn-secondary" onClick={() => terminer(enCours, false)} title="Envoie au contrôle sans prendre de nouveau dossier (pause, fin de journée)">
                      Terminé, je m'arrête
                    </button>
                    <button className="btn-primary" onClick={() => terminer(enCours, true)}>
                      <Icon name="send" size={15} />
                      Terminé, suivant
                    </button>
                    <button className="btn-icon" title="Historique" onClick={() => setDossierHistorique(enCours)}>
                      <Icon name="history" size={16} />
                    </button>
                  </div>
                </article>
              ) : (
                <section className="card px-6 py-14 flex flex-col items-center text-center gap-3">
                  <span className="w-14 h-14 rounded-2xl bg-brand-50 text-brand-500 flex items-center justify-center">
                    <Icon name="inbox" size={26} />
                  </span>
                  <p className="titre-page text-2xl">Aucun dossier en cours</p>
                  <p className="text-sm text-ink/55 max-w-md">
                    {maListe.length
                      ? `${maListe.length} dossier(s) t'attendent (retours en premier). Clique pour commencer le suivant.`
                      : "Prends le prochain dossier de la file, parmi les fiches sur lesquelles tu es habilité."}
                  </p>
                  <button className="btn-primary h-11 px-6 text-[15px] mt-2" onClick={prendreLeSuivant} disabled={prise.enCours}>
                    <Icon name="chevronRight" size={16} />
                    {prise.enCours ? "Recherche…" : "Prendre le suivant"}
                  </button>
                  {prise.message && <p className="text-sm text-isoGold-dark">{prise.message}</p>}
                </section>
              )}

              {/* Colonne de droite : ce qui attend */}
              <aside className="flex flex-col gap-4">
                {enCours && (
                  <div className="rounded-card bg-ink text-white p-[18px]">
                    <p className="font-bold text-[17px]">Après ce dossier</p>
                    <p className="text-[13px] text-white/70 mt-1 mb-3.5">
                      {maListe[0]
                        ? `${maListe[0].nom_dossier} passera en premier${maListe[0].a_corriger ? " (retour)" : ""}, puis les autres par ordre d'arrivée.`
                        : fileManuelle
                          ? "Aucun autre dossier ne t'est attribué pour l'instant."
                          : "Le prochain dossier de tes fiches sera pris dans la file."}
                    </p>
                    <button className="btn-primary w-full" onClick={() => terminer(enCours, true)}>
                      Terminé, prendre le suivant
                    </button>
                  </div>
                )}

                {blocListe(
                  "Qui t'attendent",
                  maListe,
                  (d) => (
                    <span className={`badge ${d.a_corriger ? "badge-gold" : d.prioritaire ? "badge-red" : "badge-neutral"}`}>
                      {d.a_corriger ? (TYPES_RETOUR[typeDernierRetour(d)] || TYPES_RETOUR.interne).libelle : d.prioritaire ? "Urgent" : "À faire"}
                    </span>
                  ),
                  (d) => (d.a_corriger ? "#C98A1B" : d.prioritaire ? "#D33A3A" : "#D9E3EC"),
                  "Rien en attente."
                )}
                {enPause.length > 0 &&
                  blocListe("En pause", enPause, (d) => (
                    <button className="btn-secondary btn-sm" onClick={(e) => (e.stopPropagation(), reprendre(d))} disabled={!!enCours} title={enCours ? "Termine ou mets en pause ton dossier en cours" : ""}>
                      Reprendre
                    </button>
                  ), null, null, (d) => `Chrono arrêté à ${formatDuree(secondesTraitement(d) / 3600)}${d.motif_statut ? `, ${d.motif_statut}` : ""}`)}
                {attenteInfo.length > 0 &&
                  blocListe("En attente d'info", attenteInfo, (d) => (
                    <button className="btn-secondary btn-sm" onClick={(e) => (e.stopPropagation(), reprendre(d))} disabled={!!enCours} title={enCours ? "Termine d'abord ton dossier en cours" : ""}>
                      Reprendre
                    </button>
                  ), null, null, (d) => `Chrono arrêté à ${formatDuree(secondesTraitement(d) / 3600)}${d.motif_statut ? `, info manquante : ${d.motif_statut}` : ""}`)}
                {auControle.length > 0 &&
                  blocListe(
                    "Envoyés au contrôle",
                    auControle,
                    (d) =>
                      modifiable(d) ? (
                        <span className="flex gap-1.5">
                          <button className="btn-secondary btn-sm" onClick={(e) => (e.stopPropagation(), setAModifier(d))}>
                            Modifier
                          </button>
                          <button className="btn-ghost btn-sm" onClick={(e) => (e.stopPropagation(), recuperer(d))} disabled={!!enCours} title={enCours ? "Termine d'abord ton dossier en cours" : "Le remettre en cours chez toi"}>
                            Récupérer
                          </button>
                        </span>
                      ) : (
                        <span className="badge badge-brand">En vérification</span>
                      ),
                    null,
                    null,
                    (d) => (modifiable(d) ? "Pas encore pris par la Qualité" : `En contrôle${d.pris_en_charge_par ? ` par ${d.pris_en_charge_par}` : ""}`)
                  )}

                {progression.length > 0 && (
                  <div className="card">
                    <h3 className="text-[15px] font-bold px-[18px] pt-4 pb-1">L'équipe aujourd'hui</h3>
                    <div className="px-[18px] pb-4">
                      {progression.map((p) => {
                        const fait = p.equipeNv + p.equipeModif;
                        const obj = p.objectif ? (p.objectif.objectif_nv_dossier || 0) + (p.objectif.objectif_modif || 0) : 0;
                        const pct = obj ? Math.min(100, Math.round((fait / obj) * 100)) : 0;
                        return (
                          <div key={p.operation} className="grid grid-cols-[100px_1fr_52px] gap-2.5 items-center text-[12.5px] mt-2.5" title={`Nouveaux ${p.equipeNv}${p.objectif ? "/" + p.objectif.objectif_nv_dossier : ""} · Modifs ${p.equipeModif}${p.objectif ? "/" + p.objectif.objectif_modif : ""}`}>
                            <span className="truncate">{p.operation}</span>
                            <span className="h-2 rounded bg-paper overflow-hidden">
                              <span className={`block h-full rounded ${pct >= 100 ? "bg-isoGreen" : "bg-brand-500"}`} style={{ width: obj ? `${pct}%` : "0%" }} />
                            </span>
                            <b className="text-right tabular">{obj ? `${fait}/${obj}` : fait}</b>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </aside>
            </div>

            <section>
              <SectionTitle titre="Mes dossiers audités" compteur={traites.length} />
              <div className="card overflow-x-auto">
                <table className="table table-hover">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Dossier</th>
                      <th>Fiche</th>
                      <th>Retours</th>
                      <th>Audité par</th>
                      <th>Le</th>
                    </tr>
                  </thead>
                  <tbody>
                    {traites.map((d) => (
                      <tr key={d.id} className="cursor-pointer" onClick={() => setDossierHistorique(d)}>
                        <td className="whitespace-nowrap text-ink/60 tabular">{formatDate(d.date)}</td>
                        <td>
                          <span className="nom-dossier-sm">{d.nom_dossier}</span>
                          {d.etat === S.PAS_DE_MODIF && <span className="badge badge-green ml-1.5">Pas de modif</span>}
                          {d.beneficiaire_nom && <span className="block text-xs text-ink/50">{d.beneficiaire_nom}</span>}
                        </td>
                        <td className="text-ink/70">{d.nom_operation}</td>
                        <td>{d.nb_retours ? <span className="badge badge-gold">{d.nb_retours}</span> : <span className="badge badge-green">1er coup</span>}</td>
                        <td className="capitalize">{d.valide_par || "—"}</td>
                        <td className="text-ink/60 tabular">{d.date_verification ? new Date(d.date_verification).toLocaleDateString("fr-FR") : "—"}</td>
                      </tr>
                    ))}
                    {traites.length === 0 && (
                      <tr>
                        <td colSpan={6}>
                          <EmptyState icone="checkCircle" texte="Aucun dossier validé pour l'instant." compact />
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </main>

      {dossierHistorique && (
        <HistoriqueComplet supabase={supabase} dossier={dossierHistorique} onFermer={() => setDossierHistorique(null)} />
      )}

      {ouvert && (
        <Modal
          titre={ouvert.nom_dossier}
          sousTitre={[ouvert.nom_operation, ouvert.client, ouvert.a_corriger ? "en retour" : null].filter(Boolean).join(" · ")}
          onFermer={() => {
            setOuvert(null);
            chargerDossiers();
          }}
          taille="lg"
        >
          {(() => {
            // Dépôt possible tant que le dossier n'est pas parti au contrôle (ou pas encore pris par la Qualité)
            const depot = [S.ASSIGNE, S.EN_COURS, S.ATTENTE_INFO, "en pause"].includes(ouvert.etat) || modifiable(ouvert);
            return (
              <div className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center gap-2">
                  <StatutDossier dossier={ouvert} />
                  {ouvert.motif_statut && <span className="text-xs text-ink/55">Motif : {ouvert.motif_statut}</span>}
                </div>
                <div>
                  <p className="eyebrow mb-2">Pièces du dossier</p>
                  <FichiersDossier
                    key={"o" + ouvert.id}
                    supabase={supabase}
                    dossier={ouvert}
                    auteur={nom}
                    peutDeposerPieces={false}
                    peutDeposerLivrables={depot}
                    peutSupprimer={depot ? (f) => f.categorie === "livrable" : false}
                    compact
                  />
                </div>
                <div>
                  <p className="eyebrow mb-2 flex items-center gap-1.5">
                    <Icon name="message" size={12} />
                    Échanges avec la Qualité
                  </p>
                  <EchangesDossier key={"oe" + ouvert.id} supabase={supabase} dossier={ouvert} auteur={nom} />
                </div>
                <div className="flex flex-wrap justify-end gap-2 pt-3 border-t border-line">
                  {ouvert.a_corriger && ouvert.etat === S.ASSIGNE && (
                    <button className="btn-secondary" onClick={() => pasDeModif(ouvert)} title="La modification demandée est déjà faite">
                      <Icon name="checkCircle" size={14} />
                      Pas de modif à faire
                    </button>
                  )}
                  {ouvert.etat === S.ASSIGNE && (
                    <button className="btn-primary" onClick={() => commencer(ouvert)} disabled={!!enCours} title={enCours ? "Termine ou mets en pause ton dossier en cours" : ""}>
                      <Icon name="chevronRight" size={14} />
                      Commencer ce dossier
                    </button>
                  )}
                  {[S.ATTENTE_INFO, "en pause"].includes(ouvert.etat) && (
                    <button
                      className="btn-primary"
                      onClick={async () => {
                        await reprendre(ouvert);
                        setOuvert(null);
                      }}
                      disabled={!!enCours}
                    >
                      <Icon name="reset" size={14} />
                      Reprendre
                    </button>
                  )}
                  <button
                    className="btn-secondary"
                    onClick={() => {
                      setOuvert(null);
                      chargerDossiers();
                    }}
                  >
                    Fermer
                  </button>
                </div>
              </div>
            );
          })()}
        </Modal>
      )}

      {aModifier && (
        <Modal titre={`Modifier ${aModifier.nom_dossier}`} sousTitre="Dossier envoyé au contrôle, pas encore pris par la Qualité" onFermer={() => setAModifier(null)} taille="lg">
          <div className="flex flex-col gap-4">
            <div>
              <p className="eyebrow mb-2">Bénéficiaire</p>
              <FicheBeneficiaire key={"m" + aModifier.id} dossier={aModifier} onSave={(c) => majApresEnvoi(aModifier, c)} compact />
            </div>
            <div>
              <p className="eyebrow mb-2">Pièces du dossier</p>
              <FichiersDossier
                key={"mf" + aModifier.id}
                supabase={supabase}
                dossier={aModifier}
                auteur={nom}
                peutDeposerPieces={false}
                peutDeposerLivrables
                peutSupprimer={(f) => f.categorie === "livrable"}
                compact
              />
            </div>
            <p className="text-xs text-ink/50">
              Pour corriger plus en profondeur, utilise « Récupérer » : le dossier repasse en cours chez toi, puis renvoie-le au contrôle.
            </p>
            <div className="flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => recuperer(aModifier)} disabled={!!enCours}>
                <Icon name="undo" size={14} />
                Récupérer
              </button>
              <button className="btn-primary" onClick={() => setAModifier(null)}>
                Terminé
              </button>
            </div>
          </div>
        </Modal>
      )}

      {derniereAction && (
      <UndoToast message={`${derniereAction.libelle} — « ${derniereAction.nomDossier} »`} onAnnuler={annulerDerniereAction} />
      )}
    </div>
  );
}
