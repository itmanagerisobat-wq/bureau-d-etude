// NDD autonome → structures « dossier / lignes » utilisées par les calculs et le modèle PDF
import { choisirVersion, zoneDe } from "../calcul";
import { cp5, num, txt } from "../format";
import type { CalcLigne, Dossier, Ligne, Params, TypeBatiment } from "../types";
import type { DocumentNdd, LocalSaisi, ModeleNdd } from "./types";
import { debitEquipement } from "./construire";

export const LOCAL_VIDE: LocalSaisi = { nom: "", hauteur: null, surface: null, consigne: 18, p_allouee: null, reference: "", nb: 1, clos: true, entrepot: false };

export const typeBatimentDe = (fiche: string): TypeBatiment => (fiche === "IND-BA-110" ? "Industriel" : "Tertiaire");

export function nddVide(fiche = "BAT-TH-142"): DocumentNdd {
  return {
    numero: null, version: 0, fiche, type_client: "BtoB", date_etude: new Date().toISOString().slice(0, 10),
    raison_sociale: "", siret: "", adresse: "", cp: "", ville: "", civilite: "", rep_nom: "", rep_prenom: "", fonction: "", telephone: "", mail: "",
    nom_site: "", site_adresse: "", site_cp: "", site_ville: "", locaux: [{ ...LOCAL_VIDE }], saisie: {},
  };
}

/** Site des travaux : uniquement l'adresse des travaux (jamais celle du siège du bénéficiaire) */
export const siteDe = (n: DocumentNdd) => ({
  nom: txt(n.nom_site) || (n.type_client === "BtoC" ? [txt(n.civilite), txt(n.rep_nom).toUpperCase(), txt(n.rep_prenom)].filter(Boolean).join(" ") : txt(n.raison_sociale)),
  adresse: txt(n.site_adresse),
  cp: cp5(txt(n.site_cp)),
  ville: txt(n.site_ville),
});

/** Devis préparé à partir d'une note (la NDD se fait avant le devis) : bénéficiaire, site des travaux et locaux */
export function devisDepuisNdd(n: DocumentNdd): { dossier: Partial<Dossier>; lignes: Ligne[] } {
  const s = siteDe(n);
  const btoc = n.type_client === "BtoC";
  const dossier: Partial<Dossier> = {
    type_client: n.type_client, type_batiment: typeBatimentDe(n.fiche), civilite: n.civilite,
    raison_sociale: btoc ? [txt(n.civilite), txt(n.rep_nom).toUpperCase(), txt(n.rep_prenom)].filter(Boolean).join(" ") : n.raison_sociale,
    siret: n.siret, adresse_siege: n.adresse, cp_siege: n.cp, ville_siege: n.ville, telephone: n.telephone, mail: n.mail,
    rep_nom: n.rep_nom, rep_prenom: n.rep_prenom, fonction: n.fonction, secteur: n.saisie?.activite ?? null,
    travaux_adresse: s.adresse || null, travaux_cp: s.cp || null, travaux_ville: s.ville || null,
  };
  const lignes = btoc ? [] : n.locaux.map((l, i) => ({
    ordre: i, nom_site: txt(l.nom) || txt(n.nom_site) || null, adresse_travaux: s.adresse || null, cp_travaux: s.cp || null, ville_travaux: s.ville || null,
    p_conv: num(l.p_allouee as any), p_rad: 0, hauteur: num(l.hauteur as any), reference: txt(l.reference) || null, nb: num(l.nb as any),
    consigne: num(l.consigne as any), surface: num(l.surface as any), volume: null, clos: !!l.clos, entrepot: !!l.entrepot, version_fiche: null,
  })) as Ligne[];
  return { dossier, lignes };
}

/** Faux dossier + lignes pour réutiliser la mise en page des notes */
export function versDossier(n: DocumentNdd): { dossier: Dossier; lignes: Ligne[] } {
  const s = siteDe(n);
  const dossier = {
    id: n.id ?? "ndd", ref_dossier: n.numero ?? "", numero_devis: n.numero, date_devis: n.date_etude, delegataire: null,
    type_batiment: typeBatimentDe(n.fiche), type_client: n.type_client, civilite: n.civilite,
    raison_sociale: n.type_client === "BtoC" ? [txt(n.civilite), txt(n.rep_nom).toUpperCase(), txt(n.rep_prenom)].filter(Boolean).join(" ") : n.raison_sociale,
    siret: n.siret, adresse_siege: n.adresse, cp_siege: n.cp, ville_siege: n.ville, telephone: n.telephone, mail: n.mail,
    rep_nom: n.rep_nom, rep_prenom: n.rep_prenom, fonction: n.fonction, secteur: n.saisie?.activite ?? null,
    type_logement: n.saisie?.activite ?? null,
    travaux_adresse: s.adresse, travaux_cp: s.cp, travaux_ville: s.ville, operations: [], ndd: n.saisie,
  } as unknown as Dossier;
  const lignes = n.locaux.map((l, i) => ({
    ordre: i, nom_site: txt(l.nom) || s.nom, adresse_travaux: s.adresse, cp_travaux: s.cp, ville_travaux: s.ville,
    p_conv: num(l.p_allouee as any), p_rad: 0, hauteur: num(l.hauteur as any), reference: txt(l.reference), nb: num(l.nb as any),
    consigne: num(l.consigne as any), surface: num(l.surface as any), volume: null, clos: !!l.clos, entrepot: !!l.entrepot, version_fiche: null,
  })) as Ligne[];
  return { dossier, lignes };
}

/** Contrôles de saisie et « calcul » de chaque local (fiche et version selon la zone et la date d'étude) */
export function calculsNdd(n: DocumentNdd, P: Params, modele: ModeleNdd | null): { lignes: { ligne: Ligne; calc: CalcLigne }[]; erreurs: string[]; alertes: string[] } {
  const erreurs: string[] = [];
  const alertes: string[] = [];
  const { lignes } = versDossier(n);
  const s = siteDe(n);
  if (n.type_client === "BtoB" && !txt(n.raison_sociale)) erreurs.push("Raison sociale du bénéficiaire manquante");
  if (n.type_client === "BtoC" && !txt(n.rep_nom)) erreurs.push("Nom du bénéficiaire manquant");
  if (!s.adresse || !s.cp) erreurs.push("Adresse du site des travaux manquante");
  if (!modele) { erreurs.push(`Aucun modèle de NDD pour ${n.fiche}`); return { lignes: [], erreurs, alertes }; }
  const sa = n.saisie ?? {};
  if (!sa.parcelle?.section || !sa.parcelle?.numero) alertes.push("Parcelle cadastrale non renseignée (« Remplir depuis l’adresse »)");
  if (!num(sa.altitude as any)) alertes.push("Altitude du site non renseignée");
  if (sa.temp_base === null || sa.temp_base === undefined || String(sa.temp_base) === "") alertes.push("Température extérieure de base non renseignée");
  if (modele.moteur !== "destratification") return { lignes: [], erreurs, alertes };
  if (!(sa.chauffages ?? []).some((c) => txt(c.dispositif))) alertes.push("Moyens de chauffage non détaillés : une ligne « Chauffage existant » sera imprimée");
  const typ = typeBatimentDe(n.fiche);
  const { dep, zone } = zoneDe(P, s.cp);
  if (s.cp && !zone) erreurs.push(`Zone climatique inconnue pour le département ${dep}`);
  const date = n.date_etude ? new Date(n.date_etude) : new Date();
  const [fm] = zone ? choisirVersion(P, typ, zone, date) : [null];
  if (!lignes.length) erreurs.push("Aucun local saisi");
  const out = lignes.map((L, i) => {
    const nom = txt(L.nom_site) || `Local ${i + 1}`;
    if (!num(L.hauteur)) erreurs.push(`${nom} : hauteur sous plafond manquante`);
    if (!num(L.nb)) erreurs.push(`${nom} : nombre de déstratificateurs manquant`);
    if (!txt(L.reference)) erreurs.push(`${nom} : modèle de déstratificateur manquant`);
    if (!num(L.p_conv)) erreurs.push(`${nom} : puissance de chauffage allouée manquante`);
    // conformité à la fiche : bloquant, la note imprimerait « Non conforme »
    const tv = fm ? P.textes[`${fm.fiche}|${fm.version}`] : undefined;
    const hmin = num(tv?.h_min as any) || P.hmin, cmin = num(tv?.c_min as any) || P.cmin;
    const h = num(L.hauteur) ?? 0, c = num(L.consigne) ?? 0, s2 = num(L.surface) ?? 0, nb = num(L.nb) ?? 0;
    const taux = num(modele.taux_brassage as any) || 1, deb = debitEquipement(P, txt(L.reference)) ?? 0;
    if (h && h < hmin) erreurs.push(`${nom} : hauteur ${String(h).replace(".", ",")} m < ${hmin} m exigés par la fiche`);
    if (num(L.consigne) !== null && txt(L.consigne) !== "" && c < cmin) erreurs.push(`${nom} : consigne ${c} °C < ${cmin} °C exigés par la fiche`);
    if (!L.clos) erreurs.push(`${nom} : local non complètement clos (inéligible)`);
    if (L.entrepot) erreurs.push(`${nom} : entrepôt / local de stockage (exclu de la fiche)`);
    if (!s2) erreurs.push(`${nom} : surface manquante`);
    if (txt(L.reference) && !deb) erreurs.push(`${nom} : débit du modèle « ${txt(L.reference)} » inconnu (Paramètres › Références)`);
    if (h && s2 && deb && nb) {
      const req = h * s2 * taux;
      if (nb * deb + 1e-9 < req) erreurs.push(`${nom} : ${nb} déstratificateur(s) pour ${Math.ceil(req / deb - 1e-9)} nécessaire(s) (volume ${Math.round(h * s2)} m³ / débit ${deb} m³/h${taux !== 1 ? ` × taux ${taux}` : ""})`);
    }
    const calc: CalcLigne = {
      typ, zone: (zone ?? "H1") as any, pc: num(L.p_conv) ?? 0, pr: 0, h: num(L.hauteur) ?? 0, nb: num(L.nb) ?? 0, cons: num(L.consigne) ?? 0,
      ref: txt(L.reference), kwh: 0, prime: 0, fiche: fm?.fiche ?? n.fiche, version: fm?.version ?? "", pu: 0,
    };
    return { ligne: L, calc };
  });
  return { lignes: out, erreurs, alertes };
}
