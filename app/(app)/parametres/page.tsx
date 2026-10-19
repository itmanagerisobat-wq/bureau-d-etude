import Link from "next/link";
import { redirect } from "next/navigation";
import { getUtilisateur } from "@/lib/supabase/server";
import { TableEditable } from "@/components/TableEditable";
import { ParamsSociete } from "@/components/ParamsSociete";
import { ParamsNdd } from "@/components/ParamsNdd";
import { ParamsModelesDocuments } from "@/components/ParamsModelesDocuments";
import { ParamsCadre } from "@/components/ParamsCadre";
import { MODELES as MODELES_OPERATIONS } from "@/lib/operations";
import { fusionnerModeles } from "@/lib/ndd/modeles";

export const dynamic = "force-dynamic";

const ONGLETS = [
  { v: "societe", l: "Société & numérotation" },
  { v: "montants", l: "Montants des fiches" },
  { v: "delegataires", l: "Délégataires" },
  { v: "soustraitants", l: "Sous-traitants RGE" },
  { v: "references", l: "Références" },
  { v: "zones", l: "Zones climatiques" },
  { v: "modeles", l: "Modèles devis & factures" },
  { v: "cadre", l: "Cadre de contribution" },
  { v: "ndd", l: "Notes de dimensionnement" },
];

export default async function Parametres({ searchParams }: { searchParams: { o?: string } }) {
  const { supabase: sb, profil } = await getUtilisateur();
  if (profil?.role !== "admin") redirect("/");
  const o = searchParams.o ?? "societe";

  let contenu: React.ReactNode = null;
  if (o === "societe") {
    const [{ data: p }, { data: c }, { data: logo }] = await Promise.all([
      sb.from("parametres").select("cle, valeur"),
      sb.from("compteurs").select("*").order("type"),
      sb.storage.from("documents").list("ressources"),
    ]);
    const an = new Date().getFullYear();
    const comp = ["devis", "facture"].map((t) => c?.find((x) => x.type === t) ?? { type: t, annee: an, dernier: 0 });
    contenu = <ParamsSociete valeurs={Object.fromEntries((p ?? []).map((r) => [r.cle, r.valeur ?? ""]))} compteurs={comp} aLogo={!!logo?.some((f) => f.name === "logo.png")} />;
  } else if (o === "montants") {
    const { data } = await sb.from("fiches_montants").select("*").order("fiche").order("version").order("zone");
    contenu = <TableEditable table="fiches_montants" cleConflit="type_batiment,zone,version" lignes={data ?? []}
      aide="kWh cumac par kW de puissance de chauffage. La version appliquée est la plus récente dont la date d'effet est antérieure ou égale à la date du devis. Les nouvelles versions publiées sont ajoutées automatiquement par la veille."
      vide={{ type_batiment: "Tertiaire", zone: "H1", kwhc_conv: "", kwhc_rad: "", fiche: "BAT-TH-142", version: "", date_effet: "" }}
      colonnes={[
        { cle: "type_batiment", libelle: "Type bâtiment", type: "select", options: ["Tertiaire", "Industriel"] },
        { cle: "zone", libelle: "Zone", type: "select", options: ["H1", "H2", "H3"], largeur: "90px" },
        { cle: "kwhc_conv", libelle: "kWhc/kW convectif", type: "number" },
        { cle: "kwhc_rad", libelle: "kWhc/kW radiatif", type: "number" },
        { cle: "fiche", libelle: "Fiche" },
        { cle: "version", libelle: "Version" },
        { cle: "date_effet", libelle: "Date d'effet", type: "date" },
      ]} />;
  } else if (o === "delegataires") {
    const { data } = await sb.from("delegataires").select("*").order("nom");
    contenu = <TableEditable table="delegataires" cleConflit="nom" lignes={data ?? []}
      aide="Texte CEE : laisser vide pour le texte standard. Variables possibles : {DELEGATAIRE}, {SIREN}, {MONTANT}."
      vide={{ nom: "", siren: "", valorisation: "", texte_cee: "", contact_site: "", contact_tel: "", mediateur_adresse: "", mediateur_site: "", mediateur_mail: "", actif: true }}
      colonnes={[
        { cle: "nom", libelle: "Délégataire" },
        { cle: "siren", libelle: "SIREN", largeur: "140px" },
        { cle: "valorisation", libelle: "Valorisation BtoB (€/MWhc)", type: "number", largeur: "150px" },
        { cle: "valorisation_btoc", libelle: "Valorisation BtoC par défaut (€/MWhc)", type: "number", largeur: "150px" },
        { cle: "texte_cee", libelle: "Texte CEE spécifique", type: "textarea" },
        { cle: "contact_site", libelle: "Cadre : site « Où se renseigner »" },
        { cle: "contact_tel", libelle: "Cadre : téléphone", largeur: "130px" },
        { cle: "mediateur_adresse", libelle: "Médiateur : nom et adresse" },
        { cle: "mediateur_site", libelle: "Médiateur : site" },
        { cle: "mediateur_mail", libelle: "Médiateur : courriel" },
        { cle: "actif", libelle: "Actif", type: "bool", largeur: "60px" },
      ]} />;
  } else if (o === "soustraitants") {
    const { data } = await sb.from("soustraitants").select("*").order("nom");
    contenu = <TableEditable table="soustraitants" cleConflit="id" lignes={data ?? []}
      aide="Entreprises RGE auxquelles les travaux BtoC sont sous-traités : la mention (nom, adresse, représentant, SIRET, certificat RGE) est imprimée sur le devis."
      vide={{ nom: "", adresse: "", representant: "", siret: "", rge_numero: "", rge_date: "", rge_validite: "", actif: true }}
      colonnes={[
        { cle: "nom", libelle: "Entreprise" },
        { cle: "adresse", libelle: "Adresse" },
        { cle: "representant", libelle: "Représentée par" },
        { cle: "siret", libelle: "SIRET", largeur: "140px" },
        { cle: "rge_numero", libelle: "N° certificat RGE", largeur: "130px" },
        { cle: "rge_date", libelle: "Attribué le", type: "date", largeur: "140px" },
        { cle: "rge_validite", libelle: "Valable jusqu'au", type: "date", largeur: "140px" },
        { cle: "actif", libelle: "Actif", type: "bool", largeur: "60px" },
      ]} />;
  } else if (o === "references") {
    const { data } = await sb.from("equipements").select("*").order("reference");
    contenu = <TableEditable table="equipements" cleConflit="reference" lignes={data ?? []}
      aide="Débit : utilisé par la note de dimensionnement (vide = lu dans la référence, ex. « (6500m3/h) »). Couleur : pastille du modèle sur le plan de calepinage (vide = automatique : DS3 bleu, DS7 rouge, autres orange)."
      vide={{ reference: "", marque: "", libelle: "Destratificateur", debit: "", couleur: "", actif: true }}
      colonnes={[
        { cle: "reference", libelle: "Référence déstratificateur" },
        { cle: "marque", libelle: "Marque" },
        { cle: "libelle", libelle: "Libellé" },
        { cle: "debit", libelle: "Débit (m³/h)", type: "number", largeur: "120px" },
        { cle: "couleur", libelle: "Couleur sur le plan", type: "couleur", largeur: "170px" },
        { cle: "actif", libelle: "Actif", type: "bool", largeur: "60px" },
      ]} />;
  } else if (o === "modeles") {
    const [{ data: mods }, { data: ft }] = await Promise.all([
      sb.from("modeles_documents").select("*").order("fiche"),
      sb.from("fiches_textes").select("fiche"),
    ]);
    const fiches = [...new Set(["BAR-TH-171", "BAT-TH-142", "IND-BA-110", ...MODELES_OPERATIONS.map((x) => x.fiche).filter((f) => f !== "AUTRE"), ...(ft ?? []).map((x: any) => x.fiche)])].sort();
    contenu = <ParamsModelesDocuments modeles={(mods ?? []) as any} fiches={fiches} />;
  } else if (o === "cadre") {
    const [{ data: nat }, { data: dels }, { data: res }] = await Promise.all([
      sb.from("cadre_natures").select("*").order("fiche"),
      sb.from("delegataires").select("nom").order("nom"),
      sb.storage.from("documents").list("ressources"),
    ]);
    contenu = (
      <div className="space-y-8">
        <section>
          <h3 className="mb-1 text-sm font-semibold text-vert-900">Nature des travaux par opération</h3>
          <TableEditable table="cadre_natures" cleConflit="fiche" lignes={nat ?? []}
            aide="Texte imprimé dans la colonne « Nature des travaux » du cadre de contribution. Sans texte, l’intitulé de l’opération du devis est repris."
            vide={{ fiche: "", nature: "" }}
            colonnes={[
              { cle: "fiche", libelle: "Opération", largeur: "140px" },
              { cle: "nature", libelle: "Nature des travaux", type: "textarea" },
            ]} />
        </section>
        <ParamsCadre delegataires={(dels ?? []).map((x: any) => x.nom)} fichiers={(res ?? []).map((f) => f.name)} />
      </div>
    );
  } else if (o === "ndd") {
    const [{ data: p }, { data: res }, { data: mods }, { data: temp }] = await Promise.all([
      sb.from("parametres").select("cle, valeur").like("cle", "be_%"),
      sb.storage.from("documents").list("ressources"),
      sb.from("ndd_modeles").select("*").order("fiche"),
      sb.from("temperatures_base").select("*").order("departement"),
    ]);
    contenu = (
      <div className="space-y-8">
        <ParamsNdd valeurs={Object.fromEntries((p ?? []).map((r) => [r.cle, r.valeur ?? ""]))} images={(res ?? []).map((f) => f.name)} modeles={fusionnerModeles((mods ?? []) as any)} />
        <section>
          <h3 className="mb-1 text-sm font-semibold text-vert-900">Températures extérieures de base</h3>
          <TableEditable table="temperatures_base" cleConflit="departement" lignes={temp ?? []}
            aide="Zone A à I du département (carte NF EN 12831 / NF P 52-612). La température est déduite de la zone et de l’altitude du site ; la liste se complète aussi depuis les dossiers."
            vide={{ departement: "", zone: "C" }}
            colonnes={[
              { cle: "departement", libelle: "Département", largeur: "160px" },
              { cle: "zone", libelle: "Zone", type: "select", options: ["A", "B", "C", "D", "E", "F", "G", "H", "I"] },
            ]} />
        </section>
      </div>
    );
  } else if (o === "zones") {
    const { data } = await sb.from("zones").select("*").order("departement");
    contenu = <TableEditable table="zones" cleConflit="departement" lignes={data ?? []}
      aide="Source : arrêté du 26/10/2010 annexe I (zones H1a-H3), regroupées en H1/H2/H3 ; Corse (20) = H3."
      vide={{ departement: "", zone: "H1" }}
      colonnes={[
        { cle: "departement", libelle: "Département", largeur: "160px" },
        { cle: "zone", libelle: "Zone", type: "select", options: ["H1", "H2", "H3"] },
      ]} />;
  }

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-vert-900">Paramètres</h1>
      <p className="mb-5 text-sm text-slate-500">Modifiables uniquement par un administrateur.</p>
      <div className="mb-4 flex flex-wrap gap-1 border-b border-slate-200">
        {ONGLETS.map((x) => (
          <Link key={x.v} href={`/parametres?o=${x.v}`}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${o === x.v ? "border-vert-500 font-semibold text-vert-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}>{x.l}</Link>
        ))}
      </div>
      <div className="carte p-5" key={o}>{contenu}</div>
    </div>
  );
}
