"use client";
import { ingenieurResponsable } from "@/lib/rapportQualite";
import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import Modal from "@/components/ui/Modal";
import Icon from "@/components/ui/Icon";
import { S, ETATS, emailValide, siretValide, telephoneValide, normaliserAdresse } from "@/lib/constants";

/**
 * Import en masse de dossiers depuis un fichier Excel (.xlsx / .xls) ou CSV.
 * Tous les dossiers importés vont dans la FILE D'ATTENTE (non attribués) :
 * ils sont ensuite distribués automatiquement aux ingénieurs (bouton « Terminé → suivant »)
 * ou attribués par la Qualité.
 * Aperçu obligatoire avant import : erreurs bloquantes et avertissements par ligne.
 */

const COLONNES = {
  nom_dossier: ["nom dossier", "dossier", "n dossier", "no dossier", "numero dossier", "reference", "ref"],
  date: ["date", "date dossier", "date de creation"],
  nom_operation: ["operation", "fiche", "fiche cee", "nom operation", "nom de l operation", "nom de operation", "operation cee"],
  nature_prod: ["nature", "nature production", "nature prod", "nature de production"],
  client: ["client"],
  beneficiaire_nom: ["beneficiaire", "raison sociale", "nom beneficiaire", "nom ou raison sociale", "nom"],
  beneficiaire_siret: ["siret"],
  beneficiaire_responsable: ["responsable", "contact", "interlocuteur", "personne a contacter"],
  beneficiaire_adresse: ["adresse", "adresse beneficiaire"],
  beneficiaire_email: ["email", "e mail", "mail", "courriel"],
  beneficiaire_telephone: ["telephone", "tel", "portable", "mobile"],
  prioritaire: ["prioritaire", "priorite", "urgent"],
  commentaire: ["commentaire", "remarque", "note", "commentaires"],
  // Production déjà traitée
  ingenieur: ["ingenieur", "ingenieurs", "nom ingenieur", "ingenieur production", "ingenieur traitement", "agent", "charge d etude"],
  ingenieur_modif: ["ingenieur de modif", "ingenieur modif", "ingenieur modification", "ingenieur de modification", "ingenieur modifs", "modif par"],
  etat: ["statut", "etat", "status", "etat dossier", "statut dossier"],
  retour_interne: ["retour interne"],
  cause_retour_interne: ["cause retour interne", "cause de retour interne", "cause interne", "motif retour interne", "cause du retour interne"],
  retour_client: ["retour client"],
  cause_retour_client: ["cause retour client", "cause de retour client", "cause client", "motif retour client", "cause du retour client"],
  date_retour_client: ["date retour client", "date du retour client", "date de retour client"],
  date_modification: ["date nouvelle modification", "date de modification", "date modification", "date modif", "date de la modification"],
  valide_par: ["valide par", "audite par", "verifie par", "validateur", "auditeur", "controle par", "verificateur", "service qualite"],
  date_verification: ["date verification", "date de verification", "date audit", "audite le", "valide le", "date validation"],
};

const OUI = ["oui", "o", "x", "1", "true", "vrai", "yes", "ok"];

/**
 * Statut lu dans le fichier → statut de l'app.
 * Renvoie { etat, retour: null | "interne" | "qualite" | "client", inconnu }.
 */
function lireStatut(texte, options) {
  const t = normTexte(texte);
  if (!t) return { etat: null };
  if (t.includes("retour")) {
    const retour = t.includes("client") || t.includes("modif") ? "client" : t.includes("qualite") ? "qualite" : "interne";
    return { etat: S.ASSIGNE, retour };
  }
  const table = [
    [["audite", "valide", "dossier verifie", "verifie", "termine", "traite", "ok", "fait", "fini"], S.VALIDE],
    [["dans la file", "file", "en file", "non attribue", "a attribuer"], S.FILE],
    [["en attente de traitement", "assigne", "a faire", "attribue", "a traiter"], S.ASSIGNE],
    [["encours", "en cours", "en production", "en traitement"], S.EN_COURS],
    [["en attente d info", "attente info", "en attente info"], S.ATTENTE_INFO],
    [["en attente de verification", "a controler", "en attente de verif", "encours de verif", "a verifier"], S.A_CONTROLER],
    [["en cours de verification", "en verification", "en verification q", "en controle"], S.VERIF],
    [["suspendue", "suspendu"], "Suspendue"],
    [["en pause", "pause"], "en pause"],
    [["annule", "annulee"], "Annulé"],
  ];
  for (const [mots, etat] of table) if (mots.includes(t)) return { etat };
  // Libellés de l'app (y compris renommés) et statuts ajoutés dans Paramètres
  for (const [etat, m] of Object.entries(ETATS)) if (normTexte(m.court) === t || normTexte(etat) === t) return { etat };
  return { etat: null, inconnu: true };
}

/** Nom tel qu'il existe déjà dans une liste (sans tenir compte des majuscules/accents), sinon nettoyé. */
function nomCanonique(brut, liste) {
  const n = String(brut ?? "").replace(/\s+/g, " ").trim();
  if (!n) return "";
  return (liste || []).find((x) => normTexte(x) === normTexte(n)) || n;
}

/** Distance d'édition (nombre de lettres différentes) entre deux textes. */
function distance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

/**
 * Rapproche un nom des noms connus : identique (majuscules/accents ignorés), sinon très proche
 * (une lettre d'écart sur un nom complet, ex. « mariem nechi » → « Meriem Nechi »).
 * Renvoie { nom, rapproche } — rapproche = nom d'origine quand il a été corrigé.
 */
function rapprocherNom(brut, connus) {
  const n = String(brut ?? "").replace(/\s+/g, " ").trim();
  if (!n) return { nom: "" };
  const k = normTexte(n);
  const exact = connus.find((x) => normTexte(x) === k);
  if (exact) return { nom: exact, rapproche: exact !== n && normTexte(exact) !== k ? n : null };
  if (k.length >= 6) {
    const proche = connus.find((x) => {
      const kx = normTexte(x);
      return kx.length >= 6 && distance(kx, k) <= 1;
    });
    if (proche) return { nom: proche, rapproche: n };
  }
  return { nom: n };
}

/** Fiche CEE, y compris abrégée : « 174 » ou « TH-174 » → « BAR-TH-174 » (si une seule fiche correspond). */
function trouverOperation(valeur, liste) {
  if (!valeur) return null;
  const exact = dansListe(valeur, liste);
  if (exact) return exact;
  const n = normTexte(valeur);
  const compact = n.replace(/ /g, "");
  const candidats = (liste || []).filter((op) => {
    const o = normTexte(op);
    return o.endsWith(" " + n) || o.replace(/ /g, "").endsWith(compact);
  });
  return candidats.length === 1 ? candidats[0] : null;
}

/**
 * Lit une feuille en trouvant la vraie ligne d'entête (celle qui contient le plus d'intitulés connus
 * parmi les 15 premières lignes) — gère les titres de groupe au-dessus et les colonnes vides.
 */
function lireFeuille(ws) {
  const grille = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: true });
  const tousAlias = new Set(Object.values(COLONNES).flat());
  let iEntete = 0;
  let meilleur = -1;
  grille.slice(0, 15).forEach((ligne, i) => {
    const score = ligne.filter((c) => tousAlias.has(normEntete(c))).length;
    if (score > meilleur) {
      meilleur = score;
      iEntete = i;
    }
  });
  const entetes = (grille[iEntete] || []).map((h, j) => (String(h).trim() ? String(h).trim() : `__col${j}`));
  const lignes = grille.slice(iEntete + 1).map((ligne) => Object.fromEntries(entetes.map((h, j) => [h, ligne[j] ?? ""])));
  return { lignes, ligneEntete: iEntete + 1 };
}

const normEntete = (h) =>
  String(h || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const normTexte = (v) => normEntete(v);

function versDateIso(v) {
  if (!v) return new Date().toISOString().slice(0, 10);
  if (v instanceof Date && !isNaN(v)) {
    const d = new Date(v.getTime() - v.getTimezoneOffset() * 60000);
    return d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/); // JJ/MM/AAAA
  if (m) {
    const annee = m[3].length === 2 ? "20" + m[3] : m[3];
    return `${annee}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

/** Retrouve la valeur officielle d'une liste (insensible à la casse et aux accents). */
function dansListe(valeur, liste) {
  if (!valeur) return "";
  const n = normTexte(valeur);
  return liste.find((x) => normTexte(x) === n) || null;
}

export function telechargerModele(options) {
  const exemple = {
    "Nom dossier": "DUPONT 2026-001",
    Date: new Date().toLocaleDateString("fr-FR"),
    Opération: options.operations?.[0] || "BAR-TH-171",
    Nature: options.naturesProd?.[0] || "Nouveau dossier",
    Client: options.clients?.[0] || "",
    "Nom ou raison sociale": "M. Jean Dupont",
    SIRET: "",
    Responsable: "",
    Adresse: "12 avenue de la Gare, 69003 Lyon",
    "E-mail": "jean.dupont@mail.fr",
    Téléphone: "06 12 34 56 78",
    Prioritaire: "non",
    Commentaire: "",
    Ingénieur: "",
    "Ingénieur de modif": "",
    Statut: "",
    "Retour interne": "",
    "Cause retour interne": "",
    "Retour client": "",
    "Cause retour client": "",
    "Validé par": "",
  };
  const feuille = XLSX.utils.json_to_sheet([exemple]);
  feuille["!cols"] = Object.keys(exemple).map((k) => ({ wch: Math.max(14, k.length + 4) }));
  const aide = XLSX.utils.aoa_to_sheet([
    ["Colonne", "Obligatoire", "Règle"],
    ["Nom dossier", "Oui", "Identifiant du dossier"],
    ["Date", "Non", "JJ/MM/AAAA — aujourd'hui si vide"],
    ["Opération", "Oui", `Une de : ${(options.operations || []).join(", ")}`],
    ["Nature", "Non", `Une de : ${(options.naturesProd || []).join(", ")} — « Nouveau dossier » si vide`],
    ["Client", "Non", `Une de : ${(options.clients || []).join(", ")}`],
    ["Nom ou raison sociale", "Oui", "Bénéficiaire des travaux"],
    ["SIRET", "Non", "14 chiffres, personne morale uniquement"],
    ["Responsable", "Non", "Personne à contacter"],
    ["Adresse", "Oui", "Adresse complète en une seule cellule"],
    ["E-mail / Téléphone", "Non", "Téléphone français à 10 chiffres"],
    ["Prioritaire", "Non", "oui / non"],
    ["Ingénieur / Ingénieur de modif", "Non", "Nom de l'ingénieur ; ajouté à la liste s'il n'existe pas (vide → « Autre » pour la production)"],
    ["Statut", "Non", "Audité, En cours, À contrôler, Retour interne, Retour client, Retour qualité, En pause, Annulé… (vide → Audité pour la production)"],
    ["Retour interne / Retour client", "Non", "oui / non, avec leur cause dans les colonnes « Cause retour … »"],
    ["Validé par", "Non", "Nom de la personne du service qualité ; ajouté à la liste s'il n'existe pas"],
  ]);
  aide["!cols"] = [{ wch: 22 }, { wch: 12 }, { wch: 80 }];
  const classeur = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(classeur, feuille, "Dossiers");
  XLSX.utils.book_append_sheet(classeur, aide, "Aide");
  XLSX.writeFile(classeur, "HILLSOLUTION_modele_import_dossiers.xlsx");
}

export default function ImportDossiers({ options, supabase, nomTrace, onFermer, onTermine }) {
  const [lignes, setLignes] = useState(null);
  const [fichier, setFichier] = useState("");
  const [colonnesTrouvees, setColonnesTrouvees] = useState([]);
  const [envoi, setEnvoi] = useState(false);
  const [resultat, setResultat] = useState(null);
  const [filtre, setFiltre] = useState("tout"); // tout | erreurs
  const [classeur, setClasseur] = useState(null);
  const [feuille, setFeuille] = useState("");
  const [mode, setMode] = useState("file"); // file : à traiter → file d'attente | historique : production déjà faite
  const [nouveaux, setNouveaux] = useState({ ingenieurs: [], validateurs: [], causesInterne: [], causesClient: [], rapprochements: [] });
  const [inactifs, setInactifs] = useState(new Set()); // noms « Validé par » ajoutés mais pas membres actifs du service qualité
  const ref = useRef(null);

  async function lire(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFichier(f.name);
    setResultat(null);
    const c = XLSX.read(await f.arrayBuffer(), { cellDates: true });
    // Onglet par défaut : « Production » s'il existe, sinon le premier qui n'est pas l'aide
    const f0 =
      c.SheetNames.find((n) => /production/i.test(n)) || c.SheetNames.find((n) => !/^aide$/i.test(n)) || c.SheetNames[0];
    setClasseur(c);
    setFeuille(f0);
    analyser(c, f0, null);
    if (ref.current) ref.current.value = "";
  }

  async function analyser(c, nomFeuille, modeChoisi) {
    const { lignes: brut, ligneEntete } = lireFeuille(c.Sheets[nomFeuille]);

    // Correspondance entêtes du fichier → champs de l'app
    const entetes = Object.keys(brut[0] || {});
    const correspondance = {};
    for (const [champ, alias] of Object.entries(COLONNES)) {
      const trouve = entetes.find((h) => alias.includes(normEntete(h)));
      if (trouve) correspondance[champ] = trouve;
    }
    setColonnesTrouvees(Object.keys(correspondance));
    // Mode par défaut : « production déjà faite » si le fichier a un statut, un ingénieur ou « Validé par »
    const m = modeChoisi || (correspondance.etat || correspondance.ingenieur || correspondance.valide_par ? "historique" : "file");
    setMode(m);
    const historique = m === "historique";
    const nvIng = new Map();
    const nvVal = new Map();
    const nvCausesI = new Map();
    const nvCausesC = new Map();
    const rapprochements = new Map(); // « nom du fichier » → « nom retenu »
    const toutesCauses = [...(options.causesInterne || []), ...(options.causesClient || [])].map(normTexte);

    // 1er passage sur tout le fichier : un seul nom retenu par personne, quelle que soit la colonne
    // (ingénieur, ingénieur de modif, validé par) et l'ordre des lignes. Priorité aux noms déjà dans l'app,
    // puis aux noms des colonnes ingénieur ; les nouveaux noms sont mis en forme (« maryem bouabsa » → « Maryem Bouabsa »).
    const majuscules = (n) => n.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (m, sep, l) => sep + l.toUpperCase());
    const colEnt = (champ) => correspondance[champ];
    const brutsIng = [];
    const brutsVal = [];
    for (const row of brut) {
      for (const champ of ["ingenieur", "ingenieur_modif"]) if (colEnt(champ)) brutsIng.push(row[colEnt(champ)]);
      if (colEnt("valide_par")) brutsVal.push(row[colEnt("valide_par")]);
    }
    const reserve = [...(options.ingenieurs || []), ...(options.validateurs || [])];
    const canon = new Map(); // nom normalisé du fichier → nom retenu
    for (const b0 of [...brutsIng, ...brutsVal]) {
      const n = String(b0 ?? "").replace(/\s+/g, " ").trim();
      if (!n || canon.has(normTexte(n))) continue;
      if (normTexte(n) === "autre") {
        canon.set("autre", reserve.find((x) => normTexte(x) === "autre") || "Autre");
        continue;
      }
      const r0 = rapprocherNom(n, reserve);
      const retenu = reserve.some((x) => x === r0.nom) ? r0.nom : majuscules(n);
      if (!reserve.includes(retenu)) reserve.push(retenu);
      canon.set(normTexte(n), retenu);
      if (r0.rapproche && normTexte(r0.rapproche) !== normTexte(retenu)) rapprochements.set(n, retenu);
    }
    const nom = (b0) => {
      const n = String(b0 ?? "").replace(/\s+/g, " ").trim();
      return n ? canon.get(normTexte(n)) || n : "";
    };
    const dansListeCi = (n, liste) => (liste || []).some((x) => normTexte(x) === normTexte(n));

    // Contrôle des doublons contre la base (nom de dossier + adresse sur la même fiche)
    const { data: existants } = await supabase
      .from("dossiers")
      .select("nom_dossier, nom_operation, beneficiaire_adresse")
      .limit(20000);
    const nomsExistants = new Set((existants || []).map((d) => normTexte(d.nom_dossier)));
    const adressesExistantes = new Set(
      (existants || []).filter((d) => d.beneficiaire_adresse).map((d) => `${d.nom_operation}|${normaliserAdresse(d.beneficiaire_adresse)}`)
    );
    const vusFichier = new Set();

    const resultatLignes = brut
      .map((r, i) => {
        const v = (champ) => (correspondance[champ] ? r[correspondance[champ]] : "");
        const txt = (champ) => String(v(champ) ?? "").trim();
        const erreurs = [];
        const avert = [];

        // Import tolérant : aucune ligne n'est refusée. Les champs vides ou illisibles sont laissés vides
        // (« à compléter ») et se complètent ensuite dans Saisie → Modifier les informations.
        const aCompleter = [];
        // Nettoyage du nom : parenthèse fermante orpheline en fin (ex. « DE1-4193) » → « DE1-4193 »)
        let nomBrut = txt("nom_dossier").replace(/\s+/g, " ");
        while (nomBrut.endsWith(")") && (nomBrut.match(/\)/g) || []).length > (nomBrut.match(/\(/g) || []).length)
          nomBrut = nomBrut.slice(0, -1).trim();
        const nom_dossier = nomBrut || `À compléter — ligne ${i + ligneEntete + 1}`;
        if (!txt("nom_dossier")) aCompleter.push("nom du dossier");

        const operation = trouverOperation(txt("nom_operation"), options.operations) || null;
        if (!txt("nom_operation")) aCompleter.push("fiche CEE");
        else if (!operation) avert.push(`Fiche inconnue « ${txt("nom_operation")} » → laissée vide`);

        let nature = dansListe(txt("nature_prod"), options.naturesProd);
        if (!nature) {
          if (txt("nature_prod")) avert.push(`Nature inconnue « ${txt("nature_prod")} » → « Nouveau dossier »`);
          nature = options.naturesProd.includes("Nouveau dossier") ? "Nouveau dossier" : options.naturesProd[0];
        }

        let client = null;
        if (txt("client")) {
          client = dansListe(txt("client"), options.clients) || null;
          if (!client) avert.push(`Client inconnu « ${txt("client")} » → laissé vide (à ajouter dans Paramètres)`);
        }

        if (!historique && operation && !Object.values(options.habilitations || {}).some((ops) => ops.includes(operation)))
          avert.push("Aucun ingénieur habilité sur cette fiche");

        let date = versDateIso(v("date"));
        if (!date) {
          if (txt("date")) avert.push(`Date illisible « ${txt("date")} » → aujourd'hui`);
          date = new Date().toISOString().slice(0, 10);
        }

        const benefNom = txt("beneficiaire_nom");
        const adresse = txt("beneficiaire_adresse");
        if (!benefNom) aCompleter.push("bénéficiaire");
        if (!adresse) aCompleter.push("adresse");

        let siret = txt("beneficiaire_siret").replace(/\s/g, "");
        if (siret && !siretValide(siret)) {
          avert.push("SIRET invalide → laissé vide");
          siret = "";
        }
        let email = txt("beneficiaire_email");
        if (email && !emailValide(email)) {
          avert.push("E-mail invalide → laissé vide");
          email = "";
        }
        const tel = txt("beneficiaire_telephone");
        if (tel && !telephoneValide(tel)) avert.push("Téléphone non standard");
        // Production déjà faite : coordonnées du bénéficiaire manquantes sans importance (seuls nom et fiche sont signalés)
        if (historique) aCompleter.splice(0, aCompleter.length, ...aCompleter.filter((x) => x === "nom du dossier" || x === "fiche CEE"));
        if (aCompleter.length) avert.unshift(`À compléter : ${aCompleter.join(", ")}`);

        const cleNom = normTexte(nom_dossier);
        if (nom_dossier && nomsExistants.has(cleNom)) avert.push("Nom déjà existant en base");
        if (nom_dossier && vusFichier.has(cleNom)) avert.push("Déjà présent plus haut dans le fichier (autre ligne) — importé quand même");
        vusFichier.add(cleNom);
        if (operation && adresse && adressesExistantes.has(`${operation}|${normaliserAdresse(adresse)}`))
          avert.push(`Adresse déjà existante sur ${operation}`);

        const prio = OUI.includes(normTexte(v("prioritaire")));

        // Ingénieurs, statut, retours, « Validé par »
        const ing = nom(v("ingenieur"));
        const ingModif = nom(v("ingenieur_modif"));
        const valideur = nom(v("valide_par"));
        for (const n of [ing, ingModif]) if (n && !dansListeCi(n, options.ingenieurs)) nvIng.set(normTexte(n), n);
        if (valideur && !dansListeCi(valideur, options.validateurs)) nvVal.set(normTexte(valideur), valideur);
        // Causes de retour absentes de la liste : ajoutées automatiquement
        for (const [col, carte] of [
          ["cause_retour_interne", nvCausesI],
          ["cause_retour_client", nvCausesC],
        ]) {
          const c = txt(col).replace(/\s+/g, " ");
          if (c && !toutesCauses.includes(normTexte(c))) carte.set(normTexte(c), c);
        }
        const dateModif = txt("date_modification") ? versDateIso(v("date_modification")) : null;
        const dateRetourClient = txt("date_retour_client") ? versDateIso(v("date_retour_client")) : null;

        const ri = OUI.includes(normTexte(v("retour_interne"))) || !!txt("cause_retour_interne");
        const rc = OUI.includes(normTexte(v("retour_client"))) || !!txt("cause_retour_client");
        const st = lireStatut(v("etat"), options);
        if (st.inconnu) avert.push(`Statut inconnu « ${txt("etat")} » → ${historique ? "Audité" : "selon l'ingénieur"}`);

        let circuit;
        if (historique) {
          const ingenieur = ing || "Autre";
          if (!ing) {
            avert.push("Ingénieur vide → « Autre » (à corriger ensuite)");
            if (!dansListeCi("Autre", options.ingenieurs)) nvIng.set("autre", "Autre");
          }
          const etat = st.etat || S.VALIDE;
          const jour = `${date}T12:00:00`;
          circuit = {
            ingenieur: etat === S.FILE ? null : ingenieur,
            ingenieur_modif: ingModif || null,
            etat,
            retour_interne: ri,
            cause_retour_interne: txt("cause_retour_interne") || null,
            retour_client: rc,
            cause_retour_client: txt("cause_retour_client") || null,
            date_retour_client: rc ? dateRetourClient || date : null,
            date_modification: dateModif,
            nb_retours: Number(ri) + Number(rc),
            date_mise_en_file: etat === S.FILE ? jour : null,
            date_assignation: etat === S.FILE ? null : jour,
            date_acceptation: [S.EN_COURS, S.ATTENTE_INFO, S.A_CONTROLER, S.VERIF, S.VALIDE].includes(etat) ? jour : null,
            date_soumission: [S.A_CONTROLER, S.VERIF, S.VALIDE].includes(etat) ? jour : null,
          };
          if (etat === S.VALIDE) {
            const auditeur = valideur || "Autre";
            if (!valideur) {
              avert.push("« Validé par » vide → « Autre »");
              if (!dansListeCi("Autre", options.validateurs)) nvVal.set("autre", "Autre");
            }
            const dv = txt("date_verification") ? versDateIso(v("date_verification")) : null;
            Object.assign(circuit, { valide_par: auditeur, date_verification: `${dv || date}T12:00:00` });
          }
          if (st.retour) {
            Object.assign(circuit, { a_corriger: true, dernier_retour_type: st.retour, nb_retours: Math.max(1, circuit.nb_retours) });
          }
        } else {
          // À traiter : assigné directement s'il y a un ingénieur, sinon dans la file
          circuit = ing
            ? { ingenieur: ing, ingenieur_modif: ingModif || null, etat: S.ASSIGNE, date_assignation: new Date().toISOString() }
            : { ingenieur: null, ingenieur_modif: ingModif || null, etat: S.FILE, date_mise_en_file: new Date().toISOString() };
          if (dateModif) circuit.date_modification = dateModif;
        }

        return {
          ligne: i + ligneEntete + 1, // n° de ligne Excel
          erreurs,
          avert,
          incomplet: aCompleter.length > 0,
          vide: !txt("nom_dossier") && !benefNom && !adresse && !txt("nom_operation"),
          payload: {
            nom_dossier,
            date,
            nom_operation: operation,
            nature_prod: nature,
            client,
            beneficiaire_nom: benefNom || null,
            beneficiaire_siret: siret || null,
            beneficiaire_responsable: txt("beneficiaire_responsable") || null,
            beneficiaire_adresse: adresse || null,
            beneficiaire_email: email || null,
            beneficiaire_telephone: tel || null,
            prioritaire: prio,
            commentaire: txt("commentaire") || null,
            ...circuit,
          },
          retours: historique
            ? [
                ...(ri ? [{ type: "interne", cause: txt("cause_retour_interne") || "Non précisée" }] : []),
                ...(rc ? [{ type: "client", cause: txt("cause_retour_client") || "Non précisée", date: dateRetourClient }] : []),
              ]
            : [],
        };
      })
      .filter((l) => !l.vide); // ignore les lignes entièrement vides
    setNouveaux({
      ingenieurs: [...nvIng.values()],
      validateurs: [...nvVal.values()],
      causesInterne: [...nvCausesI.values()],
      causesClient: [...nvCausesC.values()],
      rapprochements: [...rapprochements.entries()],
    });
    // « Autre » n'est pas une personne : enregistré mais pas membre actif du service qualité
    setInactifs(new Set([...nvVal.values()].filter((n) => normTexte(n) === "autre")));
    setLignes(resultatLignes);
  }

  const valides = useMemo(() => (lignes || []).filter((l) => l.erreurs.length === 0), [lignes]);
  const enErreur = (lignes || []).length - valides.length;

  async function importer() {
    setEnvoi(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    // 1. Ingénieurs et noms « Validé par » absents des listes : créés d'abord
    if (nouveaux.ingenieurs.length || nouveaux.validateurs.length || nouveaux.causesInterne.length || nouveaux.causesClient.length) {
      const { error } = await supabase.rpc("fn_import_referentiels_v2", {
        p_ingenieurs: nouveaux.ingenieurs,
        p_validateurs: nouveaux.validateurs.filter((n) => !inactifs.has(n)),
        p_validateurs_inactifs: nouveaux.validateurs.filter((n) => inactifs.has(n)),
        p_causes_interne: nouveaux.causesInterne,
        p_causes_client: nouveaux.causesClient,
      });
      if (error) {
        setEnvoi(false);
        setResultat({
          crees: 0,
          erreurs: [
            /fn_import_referentiels|Could not find the function/i.test(error.message)
              ? "Impossible de créer les nouveaux noms : exécute supabase/migration_workflow_v16.sql dans Supabase."
              : "Création des nouveaux noms impossible : " + error.message,
          ],
        });
        return;
      }
    }
    const lignesDb = valides.map(({ payload: p }) => ({ ...p, created_by: user?.id }));

    let crees = [];
    const erreursEnvoi = [];
    for (let i = 0; i < lignesDb.length; i += 200) {
      const lot = lignesDb.slice(i, i + 200);
      const sources = valides.slice(i, i + 200);
      const { data, error } = await supabase.from("dossiers").insert(lot).select("id");
      if (error) erreursEnvoi.push(error.message);
      else {
        crees = crees.concat(data || []);
        // Historique des retours (comptent dans les statistiques des ingénieurs)
        const retours = (data || []).flatMap((d, k) =>
          sources[k].retours.map((rt) => ({
            dossier_id: d.id,
            type: rt.type,
            cause: rt.cause,
            ingenieur: ingenieurResponsable(sources[k].payload) === "—" ? null : ingenieurResponsable(sources[k].payload),
            operation: sources[k].payload.nom_operation,
            created_at: `${rt.date || sources[k].payload.date}T12:00:00`,
          }))
        );
        if (retours.length) await supabase.from("dossier_retours").insert(retours);
      }
    }
    if (crees.length) {
      await supabase.from("dossier_evenements").insert(
        crees.map((d) => ({
          dossier_id: d.id,
          type: mode === "historique" ? "changement_statut_manuel" : "mise_en_file",
          cause: mode === "historique" ? "Import de la production (fichier Excel)" : "Import fichier",
          effectue_par_nom: nomTrace,
        }))
      );
    }
    setEnvoi(false);
    setResultat({ crees: crees.length, erreurs: erreursEnvoi });
    if (crees.length) onTermine?.();
  }

  const affichees = (lignes || []).filter((l) => filtre === "tout" || l.erreurs.length || l.avert.length);

  return (
    <Modal titre="Importer des dossiers" sousTitre="Fichier Excel (.xlsx, .xls) ou CSV — dossiers à traiter ou production déjà faite" onFermer={onFermer} taille="xl">
      {!lignes && (
        <div className="flex flex-col gap-5">
          <div className="alert alert-info">
            <Icon name="inbox" size={16} className="mt-0.5" />
            <span>
              <strong>Dossiers à traiter</strong> : ils vont dans la file d'attente (ou chez l'ingénieur indiqué).{" "}
              <strong>Production déjà faite</strong> : le statut, l'ingénieur, l'ingénieur de modif, les retours et « Validé par »
              du fichier sont repris tels quels ; les nouveaux noms sont ajoutés aux listes. Les lignes incomplètes sont importées
              quand même (« À compléter »).
            </span>
          </div>

          <label className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-brand-200 bg-brand-50/40 px-6 py-10 cursor-pointer hover:bg-brand-50 transition-colors text-center">
            <Icon name="upload" size={26} className="text-brand-500" />
            <span className="font-semibold">Choisir un fichier</span>
            <span className="text-xs text-ink/50">Un aperçu s'affiche avant tout enregistrement</span>
            <input ref={ref} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={lire} />
          </label>

          <button className="btn-ghost btn-sm self-center" onClick={() => telechargerModele(options)}>
            <Icon name="download" size={14} />
            Télécharger le modèle Excel
          </button>
        </div>
      )}

      {lignes && !resultat && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold truncate max-w-[260px]">{fichier}</span>
            <span className="badge badge-neutral">{lignes.length} ligne(s)</span>
            <span className="badge badge-green">{valides.length} à importer</span>
            {lignes.filter((l) => l.incomplet).length > 0 && (
              <span className="badge badge-gold">{lignes.filter((l) => l.incomplet).length} à compléter après import</span>
            )}
            {enErreur > 0 && <span className="badge badge-red">{enErreur} en erreur (ignorée(s))</span>}
            <button className="btn-ghost btn-xs ml-auto" onClick={() => setLignes(null)}>
              Changer de fichier
            </button>
          </div>

          <div className="card p-4 flex flex-col gap-3">
            {classeur && classeur.SheetNames.length > 1 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-ink/55 w-28">Onglet</span>
                <select
                  className="input input-sm w-56"
                  value={feuille}
                  onChange={(e) => {
                    setFeuille(e.target.value);
                    analyser(classeur, e.target.value, null);
                  }}
                >
                  {classeur.SheetNames.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-ink/55 w-28">Ces dossiers sont</span>
              <div className="segmented">
                <button data-active={mode === "file"} onClick={() => analyser(classeur, feuille, "file")}>
                  À traiter
                </button>
                <button data-active={mode === "historique"} onClick={() => analyser(classeur, feuille, "historique")}>
                  Déjà traités (production)
                </button>
              </div>
              <span className="text-xs text-ink/50">
                {mode === "historique"
                  ? "Statut, ingénieur, ingénieur de modif, retours et « Validé par » repris du fichier (Audité si le statut est vide)."
                  : "Assignés à l'ingénieur du fichier s'il est renseigné, sinon dans la file d'attente."}
              </span>
            </div>
            {mode === "historique" && (
              <div className="flex flex-wrap gap-1.5 text-xs">
                {Object.entries(
                  lignes.reduce((m, l) => {
                    const k = l.payload.a_corriger ? `Retour ${l.payload.dernier_retour_type}` : ETATS[l.payload.etat]?.court || l.payload.etat;
                    m[k] = (m[k] || 0) + 1;
                    return m;
                  }, {})
                ).map(([k, n]) => (
                  <span key={k} className="badge badge-neutral">
                    {k} : {n}
                  </span>
                ))}
              </div>
            )}
            {(nouveaux.ingenieurs.length > 0 ||
              nouveaux.validateurs.length > 0 ||
              nouveaux.causesInterne.length + nouveaux.causesClient.length > 0 ||
              nouveaux.rapprochements.length > 0) && (
              <div className="alert alert-info">
                <Icon name="users" size={15} className="mt-0.5" />
                <div className="flex flex-col gap-2 min-w-0">
                  {nouveaux.ingenieurs.length > 0 && (
                    <span>
                      <strong>{nouveaux.ingenieurs.length} ingénieur(s) ajouté(s) :</strong> {nouveaux.ingenieurs.join(", ")}
                    </span>
                  )}
                  {nouveaux.validateurs.length > 0 && (
                    <div>
                      <strong>{nouveaux.validateurs.length} nom(s) « Validé par » ajouté(s) au Service qualité</strong>
                      <span className="text-xs opacity-75"> — décoche ceux qui ne font pas partie de la qualité (ils restent enregistrés, désactivés)</span>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
                        {nouveaux.validateurs.map((n) => (
                          <label key={n} className="flex items-center gap-1.5 text-sm cursor-pointer">
                            <input
                              type="checkbox"
                              className="w-4 h-4 accent-[#1F6FA8]"
                              checked={!inactifs.has(n)}
                              onChange={() =>
                                setInactifs((s0) => {
                                  const s1 = new Set(s0);
                                  s1.has(n) ? s1.delete(n) : s1.add(n);
                                  return s1;
                                })
                              }
                            />
                            {n}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                  {nouveaux.causesInterne.length + nouveaux.causesClient.length > 0 && (
                    <span>
                      <strong>Causes de retour ajoutées :</strong>{" "}
                      {[...nouveaux.causesInterne.map((c) => `${c} (interne)`), ...nouveaux.causesClient.map((c) => `${c} (client)`)].join(", ")}
                    </span>
                  )}
                  {nouveaux.rapprochements.length > 0 && (
                    <span>
                      <strong>Noms rapprochés :</strong>{" "}
                      {nouveaux.rapprochements.map(([de, vers]) => `« ${de} » → ${vers}`).join(" · ")}
                    </span>
                  )}
                  <span className="text-xs opacity-75">Les noms déjà présents sont reconnus sans tenir compte des majuscules ni des accents.</span>
                </div>
              </div>
            )}
          </div>

          {colonnesTrouvees.length < 4 && (
            <div className="alert alert-gold">
              <Icon name="alert" size={16} className="mt-0.5" />
              <span>
                Peu de colonnes reconnues ({colonnesTrouvees.length}). Vérifie les entêtes, ou pars du modèle Excel.
              </span>
            </div>
          )}


          <div className="segmented w-fit">
            <button data-active={filtre === "tout"} onClick={() => setFiltre("tout")}>
              Toutes les lignes
            </button>
            <button data-active={filtre === "erreurs"} onClick={() => setFiltre("erreurs")}>
              Erreurs et avertissements
            </button>
          </div>

          <div className="card overflow-auto max-h-[45vh]">
            <table className="table text-xs">
              <thead>
                <tr>
                  <th>Ligne</th>
                  <th>Dossier</th>
                  <th>Fiche</th>
                  <th>Ingénieur</th>
                  <th>Statut</th>
                  <th>Bénéficiaire</th>
                  <th>Priorité</th>
                  <th>Contrôle</th>
                </tr>
              </thead>
              <tbody>
                {affichees.map((l) => (
                  <tr key={l.ligne} className={l.erreurs.length ? "bg-isoRed-light/40" : ""}>
                    <td className="tabular text-ink/50">{l.ligne}</td>
                    <td className="font-semibold">{l.payload.nom_dossier || "—"}</td>
                    <td>{l.payload.nom_operation || "—"}</td>
                    <td className="whitespace-nowrap">
                      {l.payload.ingenieur || "—"}
                      {l.payload.ingenieur_modif && <span className="block text-ink/45">modif : {l.payload.ingenieur_modif}</span>}
                    </td>
                    <td className="whitespace-nowrap">
                      {l.payload.a_corriger ? `Retour ${l.payload.dernier_retour_type}` : ETATS[l.payload.etat]?.court || l.payload.etat}
                      {l.payload.valide_par && <span className="block text-ink/45">par {l.payload.valide_par}</span>}
                      {l.retours.length > 0 && <span className="block text-ink/45">{l.retours.length} retour(s)</span>}
                    </td>
                    <td>
                      {l.payload.beneficiaire_nom || "—"}
                      <span className="block text-ink/45 truncate max-w-[200px]">{l.payload.beneficiaire_adresse}</span>
                    </td>
                    <td className="whitespace-nowrap">
                      {l.payload.prioritaire ? (
                        <span className="badge badge-red">
                          <Icon name="flame" size={11} />
                          Prioritaire
                        </span>
                      ) : (
                        <span className="text-ink/30">—</span>
                      )}
                    </td>
                    <td>
                      {l.erreurs.map((e) => (
                        <span key={e} className="block text-isoRed-dark font-medium">
                          ✕ {e}
                        </span>
                      ))}
                      {l.avert.map((e) => (
                        <span key={e} className="block text-isoGold-dark">
                          ! {e}
                        </span>
                      ))}
                      {!l.erreurs.length && !l.avert.length && <span className="text-isoGreen-dark">✓ OK</span>}
                    </td>
                  </tr>
                ))}
                {affichees.length === 0 && (
                  <tr>
                    <td colSpan={8} className="table-empty">
                      Aucune ligne à afficher.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end gap-2 border-t border-line -mx-6 px-6 pt-4">
            <button className="btn-secondary" onClick={onFermer}>
              Annuler
            </button>
            <button className="btn-primary" disabled={!valides.length || envoi} onClick={importer}>
              <Icon name="upload" size={15} />
              {envoi
                ? "Import en cours…"
                : mode === "historique"
                ? `Importer ${valides.length} dossier(s) de production`
                : `Ajouter ${valides.length} dossier(s)`}
            </button>
          </div>
        </div>
      )}

      {resultat && (
        <div className="flex flex-col items-center text-center gap-3 py-6">
          <span
            className={`w-14 h-14 rounded-2xl flex items-center justify-center ${
              resultat.erreurs.length ? "bg-isoGold-light text-isoGold-dark" : "bg-isoGreen-light text-isoGreen-dark"
            }`}
          >
            <Icon name={resultat.erreurs.length ? "alert" : "checkCircle"} size={26} />
          </span>
          <p className="font-display text-xl font-bold">
            {resultat.crees} dossier(s) importé(s){mode === "historique" ? " avec leur statut" : ""}
          </p>
          {resultat.erreurs.map((e) => (
            <p key={e} className="text-sm text-isoRed">
              {e}
            </p>
          ))}
          <button className="btn-primary mt-2" onClick={onFermer}>
            Fermer
          </button>
        </div>
      )}
    </Modal>
  );
}

/** Export de la file d'attente, au même format que l'import (réimportable). */
export function exporterFile(dossiers) {
  const lignes = dossiers.map((d) => ({
    "Nom dossier": d.nom_dossier,
    Date: d.date ? new Date(d.date).toLocaleDateString("fr-FR") : "",
    Opération: d.nom_operation,
    Nature: d.nature_prod || "",
    Client: d.client || "",
    "Nom ou raison sociale": d.beneficiaire_nom || "",
    SIRET: d.beneficiaire_siret || "",
    Responsable: d.beneficiaire_responsable || "",
    Adresse: d.beneficiaire_adresse || "",
    "E-mail": d.beneficiaire_email || "",
    Téléphone: d.beneficiaire_telephone || "",
    Prioritaire: d.prioritaire ? "oui" : "non",
    Commentaire: d.commentaire || "",
    "Dans la file depuis": d.date_mise_en_file ? new Date(d.date_mise_en_file).toLocaleString("fr-FR") : "",
  }));
  const feuille = XLSX.utils.json_to_sheet(lignes.length ? lignes : [{ "Nom dossier": "" }]);
  feuille["!cols"] = Object.keys(lignes[0] || { a: 1 }).map((k) => ({ wch: Math.max(14, k.length + 4) }));
  const classeur = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(classeur, feuille, "File d'attente");
  XLSX.writeFile(classeur, `HILLSOLUTION_file_attente_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
