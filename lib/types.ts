export type TypeBatiment = "Tertiaire" | "Industriel";
export type Zone = "H1" | "H2" | "H3";

export interface FicheMontant {
  type_batiment: TypeBatiment;
  zone: Zone;
  kwhc_conv: number;
  kwhc_rad: number;
  fiche: string;
  version: string;
  date_effet: string; // AAAA-MM-JJ
}

export interface Delegataire {
  nom: string;
  siren: string | null;
  valorisation: number;
  valorisation_btoc?: number | null;
  texte_cee: string | null;
  actif?: boolean;
  // cadre de contribution
  contact_site?: string | null;
  contact_tel?: string | null;
  mediateur_adresse?: string | null;
  mediateur_site?: string | null;
  mediateur_mail?: string | null;
}

export interface Equipement {
  reference: string;
  marque: string | null;
  libelle: string | null;
  debit?: number | null; // m³/h
  couleur?: string | null; // couleur sur le plan de calepinage (#rrggbb ; vide = automatique)
  actif?: boolean;
}

export interface FicheTextes {
  fiche: string;
  version: string;
  date_effet: string | null;
  statut: string;
  importee_le?: string | null;
  titre?: string | null;
  denomination?: string | null;
  exclusions?: string | null;
  h_min?: number | null;
  c_min?: number | null;
  limite?: string | null;
  vertical?: string | null;
  preuve?: string | null;
  modifications?: string | null;
  pdf_path?: string | null;
  texte_complet?: string | null;
  partiel?: string | null;
}

/** Ensemble des paramètres chargés (équivalent de P dans le script Python) */
export interface Params {
  fiches: FicheMontant[];
  deleg: Record<string, Delegataire>; // clé = NOM en majuscules
  equip: Record<string, Equipement>;
  zones: Record<string, Zone>;
  societe: Record<string, string>;
  tva: number;
  hmin: number;
  cmin: number;
  kwmax: number | null;
  textes: Record<string, FicheTextes>; // clé "FICHE|version"
  blocages: { fiche: string; version: string; effet: string }[];
}

export interface Dossier {
  id: string;
  ref_dossier: string;
  numero_devis: string | null;
  date_devis: string | null;
  delegataire: string | null;
  type_batiment: TypeBatiment | null;
  raison_sociale: string | null;
  siret: string | null;
  adresse_siege: string | null;
  cp_siege: string | null;
  ville_siege: string | null;
  telephone: string | null;
  mail: string | null;
  rep_nom: string | null;
  rep_prenom: string | null;
  fonction: string | null;
  secteur: string | null;
  statut: "Brouillon" | "Généré" | "Erreur";
  type_client: "BtoB" | "BtoC";
  civilite: string | null;
  facture_directe: boolean;
  controles: string | null;
  a_verifier: boolean;
  kwh: number | null;
  prime: number | null;
  genere_le: string | null;
  pdf_devis: string | null;
  statut_facture: "Générée" | "Erreur" | null;
  date_facture: string | null;
  numero_facture: string | null;
  pdf_facture: string | null;
  id_delegataire: string | null;
  aide_libelle: string | null;
  precarite: string | null;
  type_chauffage: string | null;
  type_logement: string | null;
  travaux_adresse: string | null;
  travaux_cp: string | null;
  travaux_ville: string | null;
  operations: OperationBtoc[];
  soustraitant_id: string | null;
  aide_montant: number | null;
  total_ht?: number | null;
  total_ttc?: number | null;
  ndd?: import("./ndd/types").SaisieNdd | null;
  pdf_ndd?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface Ligne {
  id?: string;
  dossier_id?: string;
  ordre: number;
  nom_site: string | null;
  adresse_travaux: string | null;
  cp_travaux: string | null;
  ville_travaux: string | null;
  p_conv: number | null;
  p_rad: number | null;
  hauteur: number | null;
  reference: string | null;
  nb: number | null;
  consigne: number | null;
  surface: number | null;
  volume: number | null;
  clos: boolean;
  entrepot: boolean;
  version_fiche: string | null;
  kwh?: number | null;
  prime?: number | null;
  pu?: number | null;
}

/** Résultat de calcul d'une ligne (équivalent du dict renvoyé par calc_ligne) */
export interface CalcLigne {
  typ: TypeBatiment;
  zone: Zone;
  pc: number;
  pr: number;
  h: number;
  nb: number;
  cons: number;
  ref: string;
  kwh: number;
  prime: number;
  fiche: string;
  version: string;
  pu: number;
}

/** Ligne libre de devis / facture (produit ou prestation) */
export interface LigneLibre {
  id?: string;
  dossier_id?: string;
  ordre: number;
  designation: string | null;
  quantite: number | null;
  pu_ht: number | null;
  tva: number | null; // 0.2 = 20 %
  unite?: string | null;
  detail?: string | null;
  nom?: string | null;   // nom du produit imprimé sur la ligne des prix (ex. PAC Mont-blanc R290)
}

/** Opération CEE résidentielle (BtoC) : fiche, caractéristiques imprimées sur le devis, kWh cumac, prime */
export interface OperationBtoc {
  fiche: string;                         // ex. BAR-TH-171
  intitule: string;                      // ex. Mise en place d'une pompe à chaleur (PAC) de type air/eau
  caracs: Record<string, string>;        // valeurs des caractéristiques (voir lib/operations.ts)
  kwh: number | null;                    // kWh cumac
  valorisation: number | null;           // €/MWh cumac
  prime: number | null;                  // prime (calculée ou saisie)
  libelle_prime: string;                 // ex. Prime Coup de pouce CEE
}

export interface SousTraitant {
  id: string; nom: string; adresse: string | null; representant: string | null; siret: string | null;
  rge_numero: string | null; rge_date: string | null; rge_validite: string | null; actif?: boolean;
}
