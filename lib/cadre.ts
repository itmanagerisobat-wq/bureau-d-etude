// Cadre de contribution CEE : document à part, généré à partir du devis du dossier
// (bénéficiaire, opérations, kWh cumac, prime, délégataire, date du devis).
import type { SupabaseClient } from "@supabase/supabase-js";
import { calcDossier } from "./calcul";
import { chargerDossier, chargerParams, journaliser } from "./data";
import { cp5, dateFr, eur, num, parseDate, slug, txt } from "./format";
import { archiverEtDeposer, type ResultatGeneration } from "./generation";
import { modele } from "./operations";
import { genererPdfCadre, PREMIUM_PAR_DEFAUT, type DonneesCadre } from "./pdf/cadre";
import type { Dossier } from "./types";

/** Nature des travaux par défaut (texte du tableau « Nature des travaux ») ; modifiable dans Paramètres › Cadre de contribution */
export const NATURES_DEFAUT: Record<string, string> = {
  "BAT-TH-142": "Mise en place d’un système de déstratification d’air pour l’homogénéisation de la température de l’air d’un local de grande hauteur chauffé par un système convectif et/ou radiatif",
  "IND-BA-110": "Mise en place d’un système de déstratification d’air pour l’homogénéisation de la température de l’air d’un local industriel de grande hauteur chauffé par un système convectif et/ou radiatif",
  "BAR-TH-171": "Mise en place d’une pompe à chaleur (PAC) de type air/eau",
};

/** Le volume est compté en « CEE précarité » pour les ménages modestes et très modestes, sinon en « CEE classique » */
export const estPrecarite = (d: Pick<Dossier, "type_client" | "precarite">) => d.type_client === "BtoC" && /modeste/i.test(txt(d.precarite));

async function lireImage(sb: SupabaseClient, chemins: string[]): Promise<Buffer | null> {
  for (const c of chemins) {
    const { data } = await sb.storage.from("documents").download(c);
    if (data) return Buffer.from(await data.arrayBuffer());
  }
  return null;
}
export const cheminLogoDelegataire = (nom: string) => `ressources/deleg-${slug(nom.toUpperCase())}`;

export async function genererCadre(sb: SupabaseClient, id: string, motif?: string): Promise<ResultatGeneration & { document?: string | null }> {
  const [P, { dossier: d, lignes, libres }, { data: natRows }] = await Promise.all([
    chargerParams(sb), chargerDossier(sb, id), sb.from("cadre_natures").select("fiche, nature"),
  ]);
  const erreurs: string[] = [];
  if (!txt(d.numero_devis)) erreurs.push("générez d’abord le devis : le cadre de contribution reprend son numéro, sa date et ses montants");
  const del = P.deleg[txt(d.delegataire).toUpperCase()];
  if (!del) erreurs.push("délégataire du dossier manquant ou inconnu (Paramètres › Délégataires)");
  const r = calcDossier(d, lignes, P, libres);
  if (!r.ok) erreurs.push(...r.erreurs);
  if (erreurs.length) return { ok: false, message: "Cadre de contribution non généré", erreurs };

  const natures: Record<string, string> = { ...NATURES_DEFAUT };
  for (const n of natRows ?? []) if (txt(n.nature)) natures[txt(n.fiche).toUpperCase()] = txt(n.nature);

  // opérations (une ligne par fiche)
  const travaux: { fiche: string; nature: string }[] = [];
  let kwh = 0;
  if (d.type_client === "BtoC") {
    for (const o of d.operations ?? []) {
      const code = o.fiche === "AUTRE" ? txt(o.caracs?.code) : o.fiche;
      const nature = natures[code.toUpperCase()] || txt(o.fiche === "AUTRE" ? o.caracs?.intitule : o.intitule) || modele(o.fiche).intitule;
      if (code && !travaux.some((t) => t.fiche === code)) travaux.push({ fiche: code, nature });
      kwh += num(o.kwh as any) ?? 0;
    }
  } else {
    for (const x of r.lignes) {
      const fiche = x.calc?.fiche ?? "";
      if (fiche && !travaux.some((t) => t.fiche === fiche)) travaux.push({ fiche, nature: natures[fiche] ?? "" });
    }
    kwh = r.totKwh;
  }
  if (!travaux.length) return { ok: false, message: "Cadre de contribution non généré", erreurs: ["aucune opération CEE dans le dossier"] };
  const prime = r.totaux.primeCee;
  if (!(prime > 0)) return { ok: false, message: "Cadre de contribution non généré", erreurs: ["prime CEE nulle : rien à proposer au bénéficiaire"] };

  const btoc = d.type_client === "BtoC";
  const nomBenef = btoc
    ? [txt(d.civilite), txt(d.rep_nom).toUpperCase(), txt(d.rep_prenom)].filter(Boolean).join(" ")
    : txt(d.raison_sociale).toUpperCase();
  const rep = [txt(d.rep_nom).toUpperCase(), txt(d.rep_prenom)].filter(Boolean).join(" ");
  const precarite = estPrecarite(d);
  const dateDevis = parseDate(d.date_devis);
  const prem = del!.nom.toUpperCase() === "PREMIUM ENERGY";
  const defaut = (v: string | null | undefined, k: keyof typeof PREMIUM_PAR_DEFAUT) => txt(v) || (prem ? PREMIUM_PAR_DEFAUT[k] : "");
  const donnees: DonneesCadre = {
    delegataire: {
      nom: del!.nom,
      logo: await lireImage(sb, [`${cheminLogoDelegataire(del!.nom)}.png`, `${cheminLogoDelegataire(del!.nom)}.jpg`]),
      site: defaut(del!.contact_site, "site"),
      telephone: defaut(del!.contact_tel, "telephone"),
      mediateur_adresse: defaut(del!.mediateur_adresse, "mediateur_adresse"),
      mediateur_site: defaut(del!.mediateur_site, "mediateur_site"),
      mediateur_mail: defaut(del!.mediateur_mail, "mediateur_mail"),
    },
    societe: P.societe.raison_sociale || "ISOBAT",
    prime,
    travaux,
    kwhClassique: precarite ? 0 : kwh,
    kwhPrecarite: precarite ? kwh : 0,
    beneficiaire: btoc ? nomBenef : `${nomBenef} , N° SIRET : ${txt(d.siret)}`,
    adresse: [txt(d.adresse_siege), `${cp5(d.cp_siege)} ${txt(d.ville_siege).toUpperCase()}`.trim()].filter(Boolean).join(", "),
    telephone: txt(d.telephone),
    mail: txt(d.mail),
    representant: btoc ? "" : [rep, txt(d.fonction)].filter(Boolean).join(", "),
    date: dateFr(dateDevis ?? new Date()),
    cachet: await lireImage(sb, ["ressources/cadre-cachet.png", "ressources/cadre-cachet.jpg"]),
  };
  const { pdf } = await genererPdfCadre(donnees);
  const numero = txt(d.numero_devis);
  const nom = `Cadre_de_contribution_${numero}_${slug(btoc ? nomBenef : txt(d.raison_sociale))}.pdf`;
  const dep = await archiverEtDeposer(sb, id, "cadre", numero, nom, pdf, undefined, [`prime ${eur(prime)}`, travaux.map((t) => t.fiche).join(", "), txt(motif) ? `— ${txt(motif)}` : ""].filter(Boolean).join(" · "));
  await journaliser(sb, id, dep.remplace ? "Cadre de contribution régénéré" : "Cadre de contribution généré", `${numero} — prime ${eur(prime)}`);
  return {
    ok: true, message: `Cadre de contribution du devis ${numero} généré — prime ${eur(prime)}`, document: dep.id,
    alertes: [
      ...(del!.nom.toUpperCase() !== "PREMIUM ENERGY" && !donnees.delegataire.logo ? [`Logo de ${del!.nom} absent : ajoutez-le dans Paramètres › Cadre de contribution`] : []),
      ...(!donnees.delegataire.site ? [`Site / téléphone de ${del!.nom} à renseigner dans Paramètres › Délégataires`] : []),
    ],
  };
}
