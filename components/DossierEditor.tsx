"use client";
import { ListeDocuments } from "./ListeDocuments";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { calcDossier, zoneDe } from "@/lib/calcul";
import { controlesDossier } from "@/lib/controles";
import { cp5, dateFr, eur, fr, num } from "@/lib/format";
import { CHAMPS_SAISIE, COULEURS, type ChampSaisie } from "@/lib/champs";
import type { Dossier, Ligne, LigneLibre, Params, SousTraitant } from "@/lib/types";
import { ClientBtoB } from "./editeur/ClientBtoB";
import { ClientBtoC } from "./editeur/ClientBtoC";
import { OperationsBtoC } from "./editeur/OperationsBtoC";
import { LignesProduits } from "./editeur/LignesProduits";
import { BadgeFacture, BadgeStatut } from "./Badges";

type Doc = { id: string; type: string; numero: string; fichier: string; archive: boolean; created_at: string; fiche?: string | null; detail?: string | null };
type Evt = { id: number; action: string; detail: string | null; at: string };
type Extrait = { dossier: Partial<Dossier>; lignes: Partial<Ligne>[]; libelle?: string };

const LIGNE_VIDE: Ligne = {
  ordre: 0, nom_site: "", adresse_travaux: "", cp_travaux: "", ville_travaux: "", p_conv: null, p_rad: null,
  hauteur: null, reference: "", nb: 1, consigne: 18, surface: null, volume: null, clos: true, entrepot: false, version_fiche: null,
};
const NUM_LIGNE: (keyof Ligne)[] = ["p_conv", "p_rad", "hauteur", "nb", "consigne", "surface", "volume"];
const C = (cle: string) => CHAMPS_SAISIE.find((c) => c.cle === cle)!;

/** Une cellule de l'onglet Saisie : même libellé, même couleur (jaune saisie / gris calcul / bleu généré). */
function Cellule({ c, children, className = "" }: { c: ChampSaisie; children: React.ReactNode; className?: string }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <label className="mb-1 flex min-h-[32px] items-end text-[12px] font-semibold leading-tight text-slate-700" title={c.aide ?? c.libelle}>
        <span>{c.libelle}{c.aide && <span className="ml-1 cursor-help text-slate-400">ⓘ</span>}</span>
      </label>
      {children}
    </div>
  );
}
const fond = (c: ChampSaisie) => ({ backgroundColor: COULEURS[c.genre] });

function Bloc({ titre, sous, children, action }: { titre: string; sous?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="carte p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-vert-900">{titre}</h2>
          {sous && <p className="text-xs text-slate-500">{sous}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function OuiNon({ c, value, onChange }: { c: ChampSaisie; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <select className="champ" style={fond(c)} value={value ? "OUI" : "NON"} onChange={(e) => onChange(e.target.value === "OUI")}>
      <option>OUI</option><option>NON</option>
    </select>
  );
}

export default function DossierEditor({
  P, initial, lignesInit, libresInit = [], soustraitants = [], documents = [], journal = [], role, factureDirecte = false, prefill, nddSource,
}: {
  P: Params; initial: Dossier | null; lignesInit: Ligne[]; libresInit?: LigneLibre[]; soustraitants?: SousTraitant[];
  documents?: Doc[]; journal?: Evt[]; role: string; factureDirecte?: boolean;
  prefill?: Partial<Dossier>; nddSource?: string;   // devis préparé depuis une NDD
}) {
  const router = useRouter();
  const sb = useMemo(() => createClient(), []);
  const auj = new Date().toISOString().slice(0, 10);
  const [d, setD] = useState<Partial<Dossier>>(initial ? { ...initial, type_client: initial.type_client ?? "BtoB", operations: initial.operations ?? [] } : {
    statut: "Brouillon", type_client: "BtoB", type_batiment: "Tertiaire", delegataire: Object.values(P.deleg)[0]?.nom ?? "",
    operations: [], facture_directe: factureDirecte, ...(factureDirecte ? { date_facture: auj } : { date_devis: auj }), ...(prefill ?? {}),
  });
  const [lignes, setLignes] = useState<Ligne[]>(lignesInit);
  const [libres, setLibresBrut] = useState<LigneLibre[]>(libresInit);
  const [libresSuppr, setLibresSuppr] = useState<string[]>([]);
  const setLibres = (l: LigneLibre[]) => {
    const ids = new Set(l.map((x) => x.id).filter(Boolean));
    setLibresSuppr((s) => [...s, ...libres.filter((x) => x.id && !ids.has(x.id)).map((x) => x.id!)]);
    setLibresBrut(l); setModifie(true);
  };
  const [supprimees, setSupprimees] = useState<string[]>([]);
  const [modifie, setModifie] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; texte: string; details?: string[]; lien?: string } | null>(
    nddSource ? { ok: true, texte: "Devis préparé depuis la note de dimensionnement : bénéficiaire, adresse des travaux et locaux repris. Complétez puis enregistrez." } : null);
  const [choix, setChoix] = useState<Extrait[] | null>(null);
  const fichier = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // message conservé après la création d'un dossier (changement d'adresse de page)
    try { const f = sessionStorage.getItem("flash"); if (f) { sessionStorage.removeItem("flash"); setMsg(JSON.parse(f)); } } catch {}
  }, []);
  const flash = (m: typeof msg) => { try { sessionStorage.setItem("flash", JSON.stringify(m)); } catch {} };

  const set = (k: keyof Dossier, v: any) => { setD((x) => ({ ...x, [k]: v })); setModifie(true); };
  const setL = (i: number, k: keyof Ligne, v: any) => { setLignes((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: v } : l))); setModifie(true); };

  const btoc = d.type_client === "BtoC";
  const direct = !!d.facture_directe;
  const res = useMemo(() => {
    const r = calcDossier(d as Dossier, lignes, P, libres);
    const st = soustraitants.find((x) => x.id === d.soustraitant_id);
    const cc = controlesDossier(d, st), ccDevis = controlesDossier({ ...d, date_facture: null }, st);
    // une date de facture incohérente bloque la facture (contrôlé à sa génération), pas le devis
    return { ...r, ok: r.ok && !ccDevis.erreurs.length, erreurs: [...r.erreurs, ...cc.erreurs], alertes: [...r.alertes, ...cc.alertes] };
  }, [d, lignes, P, libres, soustraitants]);
  const T = res.totaux;
  const ht = Math.round((res.totPrime / (1 + P.tva)) * 100) / 100;
  const delegs = Object.values(P.deleg);
  const refs = Object.values(P.equip);
  const genere = d.statut === "Généré";

  // ---------- pré-remplissage depuis un devis PDF ou un Excel
  function appliquer(x: Extrait) {
    const garde = initial ? { id: d.id, numero_devis: d.numero_devis, statut: d.statut, numero_facture: d.numero_facture, statut_facture: d.statut_facture } : {};
    const propre: Partial<Dossier> = Object.fromEntries(Object.entries(x.dossier).filter(([, v]) => v !== null && v !== undefined && v !== ""));
    setD((cur) => ({ ...cur, ...propre, ...(initial ? garde : { statut: "Brouillon", numero_devis: propre.numero_devis ?? null }) }));
    if (x.lignes.length) {
      if (initial) setSupprimees((s) => [...s, ...lignes.filter((l) => l.id).map((l) => l.id!)]);
      setLignes(x.lignes.map((l, i) => ({ ...LIGNE_VIDE, ...Object.fromEntries(Object.entries(l).filter(([, v]) => v !== null && v !== undefined)), id: undefined, ordre: i, version_fiche: null } as Ligne)));
    }
    setModifie(true);
    setChoix(null);
  }

  async function importer(f: File) {
    setBusy("import"); setMsg(null);
    try {
      const fd = new FormData(); fd.append("fichier", f);
      const j = await fetch("/api/extraire", { method: "POST", body: fd }).then((r) => r.json());
      if (!j.ok) throw new Error(j.message);
      const liste: Extrait[] = j.dossiers;
      if (liste.length === 1) appliquer(liste[0]); else setChoix(liste);
      setMsg({ ok: true, texte: `${j.source} : ${liste.length > 1 ? `${liste.length} devis trouvés, choisissez lequel reprendre` : "champs remplis automatiquement"}. Vérifiez puis enregistrez.`, details: j.avertissements });
    } catch (e: any) { setMsg({ ok: false, texte: e.message || String(e) }); }
    setBusy(null);
    if (fichier.current) fichier.current.value = "";
  }

  // ---------- enregistrement / génération
  async function enregistrer(): Promise<string | null> {
    const champs: any = { ...d };
    delete champs.id; delete champs.created_at; delete champs.updated_at;
    for (const k of ["date_devis", "date_facture"]) if (!champs[k]) champs[k] = null;
    if (!champs.numero_devis) champs.numero_devis = null;
    if (champs.type_client === "BtoC")
      champs.raison_sociale = [champs.civilite, (champs.rep_nom ?? "").toUpperCase(), champs.rep_prenom].filter(Boolean).join(" ") || null;
    if (!champs.ref_dossier) champs.ref_dossier = (champs.raison_sociale || "DOSSIER").toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 20);
    if (champs.type_client === "BtoC" && lignes.length) setSupprimees((s) => [...s, ...lignes.filter((l) => l.id).map((l) => l.id!)]);
    let id = initial?.id ?? (d.id as string | undefined);
    if (id) {
      const { error } = await sb.from("dossiers").update(champs).eq("id", id);
      if (error) throw new Error(error.message);
    } else {
      const { data: { user } } = await sb.auth.getUser();
      const { data, error } = await sb.from("dossiers").insert({ ...champs, created_by: user?.id }).select("id").single();
      if (error) throw new Error(error.message);
      id = data.id;
      setD((x) => ({ ...x, id }));
      // la note de dimensionnement d'origine est rattachée au nouveau devis
      if (nddSource) await sb.from("ndd_documents").update({ dossier_id: id }).eq("id", nddSource).is("dossier_id", null);
    }
    if (supprimees.length) await sb.from("lignes").delete().in("id", supprimees);
    const rows = lignes.map((l, i) => {
      const r: any = { ...l, ordre: i, dossier_id: id, cp_travaux: l.cp_travaux ? cp5(l.cp_travaux) : null };
      for (const k of NUM_LIGNE) r[k] = l[k] === null || (l[k] as any) === "" ? null : num(l[k]);
      if (!r.id) delete r.id;
      return r;
    });
    const nouv = rows.filter((r) => !r.id), exist = rows.filter((r) => r.id);
    if (exist.length) { const { error } = await sb.from("lignes").upsert(exist); if (error) throw new Error(error.message); }
    if (nouv.length) {
      const { data, error } = await sb.from("lignes").insert(nouv).select("id, ordre");
      if (error) throw new Error(error.message);
      setLignes((ls) => ls.map((l, i) => (l.id ? l : { ...l, id: data!.find((x) => x.ordre === i)?.id })));
    }
    // lignes produits / prestations
    if (libresSuppr.length) await sb.from("lignes_libres").delete().in("id", libresSuppr);
    const rl = libres.map((l, i) => {
      const r: any = { ...l, ordre: i, dossier_id: id, quantite: num(l.quantite) ?? 1, pu_ht: num(l.pu_ht) ?? 0, tva: num(l.tva) ?? 0 };
      if (!r.id) delete r.id;
      return r;
    });
    const rlN = rl.filter((r) => !r.id), rlE = rl.filter((r) => r.id);
    if (rlE.length) { const { error } = await sb.from("lignes_libres").upsert(rlE); if (error) throw new Error(error.message); }
    if (rlN.length) {
      const { data, error } = await sb.from("lignes_libres").insert(rlN).select("id, ordre");
      if (error) throw new Error(error.message);
      setLibresBrut((ls) => ls.map((l, i) => (l.id ? l : { ...l, id: data!.find((x) => x.ordre === i)?.id })));
    }
    setLibresSuppr([]);
    setSupprimees([]);
    setModifie(false);
    return id!;
  }

  async function action(nom: string, fn: () => Promise<void>) {
    setBusy(nom); setMsg(null);
    try { await fn(); } catch (e: any) { setMsg({ ok: false, texte: e.message || String(e) }); }
    setBusy(null);
  }

  const sauver = () => action("save", async () => {
    const id = await enregistrer();
    const m = { ok: true, texte: genere ? "Enregistré. Pensez à régénérer le devis pour mettre le PDF à jour." : "Enregistré." };
    setMsg(m);
    if (!initial) { flash(m); router.replace(`/dossiers/${id}`); }
    router.refresh();
  });

  const generer = (type: "devis" | "facture" | "cadre") => action(type, async () => {
    // régénération : motif facultatif, affiché avec le détail de la version dans la liste des PDF
    const deja = type === "devis" ? genere : type === "facture" ? !!d.numero_facture : documents.some((x) => x.type === "cadre");
    const motif = deja ? window.prompt("Motif de cette nouvelle version (facultatif) — ex. « ajout de 2 déstratificateurs »", "") : "";
    if (motif === null) return;
    const id = await enregistrer();
    const r = await fetch(`/api/dossiers/${id}/generer`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, motif }) });
    const j = await r.json();
    const m = { ok: j.ok, texte: j.message, details: [...(j.erreurs ?? []), ...(j.alertes ?? [])], lien: j.document ? `/api/documents/${j.document}` : undefined };
    setMsg(m);
    const { data: frais } = await sb.from("dossiers").select("*").eq("id", id).single();
    if (frais) setD(frais);
    if (!initial) { flash(m); router.replace(`/dossiers/${id}`); }
    router.refresh();
  });

  const supprimer = () => action("del", async () => {
    if (!initial || !confirm(`Supprimer définitivement ce dossier${initial.numero_devis ? ` (devis ${initial.numero_devis}${initial.numero_facture ? `, facture ${initial.numero_facture}` : ""})` : ""} et tous ses PDF ?\n\nLe numéro ne sera pas réattribué. Pour garder une trace, utilisez plutôt « Ignorer ».`)) return;
    const { data: docs } = await sb.from("documents").select("storage_path").eq("dossier_id", initial.id);
    if (docs?.length) await sb.storage.from("documents").remove(docs.map((x) => x.storage_path));
    await sb.from("documents").delete().eq("dossier_id", initial.id);
    const { error } = await sb.from("dossiers").delete().eq("id", initial.id);
    if (error) throw new Error(error.message);
    router.push("/"); router.refresh();
  });

  /** Dossier ignoré (erreur, doublon, client perdu) : gardé pour mémoire mais retiré des listes et des totaux */
  const ignorer = () => action("ign", async () => {
    if (!initial) return;
    const actif = !(d as any).ignore;
    const motif = actif ? window.prompt("Pourquoi ignorer ce dossier ? (ex. erreur de saisie, doublon, client perdu)", "") : "";
    if (motif === null) return;
    const { error } = await sb.from("dossiers").update({ ignore: actif, ignore_motif: actif ? motif || null : null }).eq("id", initial.id);
    if (error) throw new Error(error.message);
    await sb.from("journal").insert({ dossier_id: initial.id, action: actif ? "Dossier ignoré" : "Dossier réactivé", detail: motif || null });
    setD((x) => ({ ...x, ignore: actif, ignore_motif: actif ? motif || null : null } as any));
    setMsg({ ok: true, texte: actif ? "Dossier ignoré : il n’apparaît plus dans la liste ni dans les totaux (filtre « Ignorés »)." : "Dossier réactivé." });
    router.refresh();
  });

  /** Annule la facture générée par erreur : PDF supprimé, le dossier redevient « à facturer » (le numéro n'est pas réattribué) */
  const supprimerFacture = () => action("delf", async () => {
    if (!initial || !d.numero_facture) return;
    if (!confirm(`Supprimer la facture ${d.numero_facture} ?\n\nSon PDF est supprimé et le dossier redevient « à facturer ». Le numéro ${d.numero_facture} ne sera pas réattribué : la prochaine facture prendra le numéro suivant.`)) return;
    const { data: docs } = await sb.from("documents").select("id, storage_path").eq("dossier_id", initial.id).eq("type", "facture");
    if (docs?.length) { await sb.storage.from("documents").remove(docs.map((x) => x.storage_path)); await sb.from("documents").delete().in("id", docs.map((x) => x.id)); }
    const { error } = await sb.from("dossiers").update({ numero_facture: null, statut_facture: null, pdf_facture: null, modele_facture_id: null }).eq("id", initial.id);
    if (error) throw new Error(error.message);
    await sb.from("journal").insert({ dossier_id: initial.id, action: "Facture supprimée", detail: d.numero_facture });
    setD((x) => ({ ...x, numero_facture: null, statut_facture: null, pdf_facture: null }));
    setMsg({ ok: true, texte: `Facture ${d.numero_facture} supprimée.` });
    router.refresh();
  });

  const dupliquer = () => action("dup", async () => {
    const copie: any = { ...d, ref_dossier: (d.ref_dossier || "") + "-COPIE", statut: "Brouillon" };
    for (const k of ["id", "created_at", "updated_at", "ignore", "ignore_motif", "numero_devis", "numero_facture", "statut_facture", "pdf_devis", "pdf_facture", "pdf_ndd", "modele_devis_id", "modele_facture_id", "genere_le", "controles", "kwh", "prime", "date_facture", "id_delegataire"]) delete copie[k];
    copie.a_verifier = false;
    copie.date_devis = new Date().toISOString().slice(0, 10);
    const { data, error } = await sb.from("dossiers").insert(copie).select("id").single();
    if (error) throw new Error(error.message);
    if (lignes.length) await sb.from("lignes").insert(lignes.map((l, i) => { const r: any = { ...l, ordre: i, dossier_id: data.id, version_fiche: null }; delete r.id; return r; }));
    if (libres.length) await sb.from("lignes_libres").insert(libres.map((l, i) => { const r: any = { ...l, ordre: i, dossier_id: data.id }; delete r.id; return r; }));
    router.push(`/dossiers/${data.id}`);
  });

  const docsActifs = documents.filter((x) => !x.archive);
  const docsArchives = documents.filter((x) => x.archive);
  const docDevis = docsActifs.find((x) => x.type === "devis");
  const docFacture = docsActifs.find((x) => x.type === "facture");

  // champ texte simple d'un dossier
  const tx = (cle: keyof Dossier, className = "", extra: Partial<React.InputHTMLAttributes<HTMLInputElement>> = {}) => (
    <Cellule c={C(cle)} className={className}>
      <input className="champ" style={fond(C(cle))} value={(d[cle] as any) ?? ""} onChange={(e) => set(cle, e.target.value)} {...extra} />
    </Cellule>
  );
  const lu = (cle: string, valeur: React.ReactNode, className = "") => (
    <Cellule c={C(cle)} className={className}>
      <div className="champ min-h-[34px] truncate !text-slate-700" style={fond(C(cle))}>{valeur || <span className="text-slate-400">—</span>}</div>
    </Cellule>
  );

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-5">
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={() => router.push("/")} className="text-sm text-slate-500 hover:text-vert-700">← Dossiers</button>
          <h1 className="text-2xl font-bold text-vert-900">{direct ? (d.numero_facture ? `Facture ${d.numero_facture}` : "Nouvelle facture") : d.numero_devis ? `Devis ${d.numero_devis}` : initial ? "Devis en cours" : "Nouveau devis"}</h1>
          <span className={`badge ${btoc ? "bg-or-100 text-or-600" : "bg-vert-50 text-vert-700"}`}>{btoc ? "BtoC · particulier" : "BtoB · entreprise"}</span>
          {d.a_verifier && <span className="badge bg-or-100 text-or-600">À vérifier</span>}
          {d.statut_facture && <BadgeFacture statut={d.statut_facture} numero={d.numero_facture} />}
          {modifie && <span className="badge bg-or-100 text-or-600">modifications non enregistrées</span>}
          <div className="ml-auto flex items-center gap-2">
            <input ref={fichier} type="file" accept=".pdf,.xlsx,.xlsm,.csv" className="hidden" onChange={(e) => e.target.files?.[0] && importer(e.target.files[0])} />
            <button className="btn-ghost" disabled={!!busy} onClick={() => fichier.current?.click()}>
              {busy === "import" ? "Lecture du fichier…" : "⇪ Importer un devis / Excel"}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {([["BtoB", "Entreprise (BtoB)", "SIRET → coordonnées remplies automatiquement · modèle de devis entreprise"],
             ["BtoC", "Particulier (BtoC)", "Civilité, logement, précarité · modèle de devis particulier"]] as const).map(([v, t, sTxt]) => (
            <button key={v} type="button" onClick={() => set("type_client", v)}
              className={`rounded-xl border-2 p-4 text-left transition ${d.type_client === v ? "border-vert-500 bg-vert-50 shadow-sm" : "border-slate-200 bg-white hover:border-vert-500/40"}`}>
              <div className="flex items-center gap-2">
                <span className={`grid h-5 w-5 place-items-center rounded-full border-2 ${d.type_client === v ? "border-vert-500" : "border-slate-300"}`}>{d.type_client === v && <span className="h-2.5 w-2.5 rounded-full bg-vert-500" />}</span>
                <span className="text-lg font-bold text-vert-900">{t}</span>
              </div>
              <p className="mt-1 pl-7 text-xs text-slate-500">{sTxt}</p>
            </button>
          ))}
        </div>

        {choix && (
          <div className="carte border-or-500/40 p-4">
            <p className="mb-2 text-sm font-medium">Le fichier contient {choix.length} devis : lequel reprendre ?</p>
            <div className="flex flex-wrap gap-2">
              {choix.map((x, i) => (
                <button key={i} className="btn-ghost !text-xs" onClick={() => appliquer(x)}>
                  {x.libelle || `${x.dossier.ref_dossier ?? ""} — ${x.dossier.raison_sociale ?? ""}`} ({x.lignes.length} local{x.lignes.length > 1 ? "aux" : ""})
                </button>
              ))}
              <button className="btn-ghost !text-xs" onClick={() => setChoix(null)}>Annuler</button>
            </div>
          </div>
        )}

        <Bloc titre={direct ? "Facture" : "Devis"}>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
            {/* référence interne du dossier : calculée automatiquement, plus affichée (demande du 19/10) */}
            {!direct && (
              <Cellule c={C("numero_devis")}>
                <input className="champ" value={d.numero_devis ?? ""} placeholder="automatique"
                  readOnly={role !== "admin" || genere} onChange={(e) => set("numero_devis", e.target.value || null)} />
              </Cellule>
            )}
            {!direct && (
              <Cellule c={C("date_devis")} className="md:col-span-1">
                <input type="date" className="champ" value={d.date_devis ?? ""} onChange={(e) => set("date_devis", e.target.value)} />
              </Cellule>
            )}
            {!btoc && (
              <>
                <Cellule c={C("delegataire")} className="md:col-span-2">
                  <select className="champ" value={d.delegataire ?? ""} onChange={(e) => set("delegataire", e.target.value)}>
                    <option value="">—</option>
                    {delegs.map((x) => <option key={x.nom} value={x.nom}>{x.nom}</option>)}
                  </select>
                </Cellule>
                <Cellule c={C("type_batiment")}>
                  <select className="champ" value={d.type_batiment ?? ""} onChange={(e) => set("type_batiment", e.target.value)}>
                    <option value="">—</option><option>Tertiaire</option><option>Industriel</option>
                  </select>
                </Cellule>
              </>
            )}
          </div>
        </Bloc>

        <Bloc titre={btoc ? "Client particulier" : "Client entreprise"} sous={btoc ? undefined : "Saisissez le SIRET : les autres champs se remplissent automatiquement"}>
          {btoc ? <ClientBtoC d={d} set={set} /> : <ClientBtoB d={d} set={set} />}
        </Bloc>

        {btoc && <OperationsBtoC d={d} set={set} P={P} soustraitants={soustraitants} />}

        {!btoc && lignes.map((L, i) => {
          const c = res.lignes[i]?.calc;
          const { dep, zone } = zoneDe(P, L.cp_travaux);
          const t = (cle: keyof Ligne, className = "", nombre = false) => (
            <Cellule c={C(cle)} className={className}>
              <input className={`champ ${nombre ? "text-right" : ""}`} style={fond(C(cle))} inputMode={nombre ? "decimal" : undefined}
                value={(L[cle] as any) ?? ""} onChange={(e) => setL(i, cle, e.target.value)} />
            </Cellule>
          );
          return (
            <Bloc key={L.id ?? `n${i}`}
              titre={lignes.length > 1 ? `Local ${i + 1}${L.nom_site ? " — " + L.nom_site : ""}` : "Local / bâtiment"}
              sous={`Colonnes R à AJ${L.version_fiche ? ` · fiche figée à la 1re génération : ${c?.fiche ?? ""} ${L.version_fiche}` : ""}`}
              action={
                <div className="flex flex-wrap gap-2">
                  {i === 0 && (
                    <button type="button" className="btn-ghost !py-1 text-xs" onClick={() => {
                      setL(i, "adresse_travaux", d.adresse_siege ?? ""); setL(i, "cp_travaux", d.cp_siege ?? ""); setL(i, "ville_travaux", d.ville_siege ?? "");
                    }}>= adresse du siège</button>
                  )}
                  {L.version_fiche && role === "admin" && (
                    <button type="button" className="btn-ghost !py-1 text-xs" title="Recalculer avec la version de fiche en vigueur à la date du devis" onClick={() => setL(i, "version_fiche", null)}>Défiger la fiche</button>
                  )}
                  {lignes.length > 0 && (
                    <button type="button" className="btn-rouge !py-1 text-xs" onClick={() => {
                      if (L.id) setSupprimees((s) => [...s, L.id!]);
                      setLignes((ls) => ls.filter((_, j) => j !== i)); setModifie(true);
                    }}>Retirer</button>
                  )}
                </div>
              }>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
                {t("nom_site", "col-span-2")}
                {t("adresse_travaux", "col-span-2 md:col-span-4")}
                {t("cp_travaux")}
                {t("ville_travaux", "md:col-span-2")}
                {t("p_conv", "", true)}
                {t("p_rad", "", true)}
                {t("hauteur", "", true)}
                <Cellule c={C("reference")} className="col-span-2 md:col-span-3">
                  <select className="champ" style={fond(C("reference"))} value={L.reference ?? ""} onChange={(e) => setL(i, "reference", e.target.value)}>
                    <option value="">—</option>
                    {refs.map((x) => <option key={x.reference} value={x.reference}>{x.reference}</option>)}
                    {L.reference && !P.equip[L.reference] && <option value={L.reference}>{L.reference} (absente des Paramètres)</option>}
                  </select>
                </Cellule>
                {t("nb", "", true)}
                {t("consigne", "", true)}
                {t("surface", "", true)}
                {t("volume", "", true)}
                <Cellule c={C("clos")}><OuiNon c={C("clos")} value={L.clos} onChange={(v) => setL(i, "clos", v)} /></Cellule>
                <Cellule c={C("entrepot")}><OuiNon c={C("entrepot")} value={L.entrepot} onChange={(v) => setL(i, "entrepot", v)} /></Cellule>
                {lu("_dep", dep)}
                {lu("_zone", dep ? (zone ?? <span className="text-rouge-500">?</span>) : "")}
                {lu("_kwh", c ? fr(c.kwh, 0) : "", "text-right")}
                {lu("_prime", c ? eur(c.prime) : "")}
                {lu("_pu", c ? eur(c.pu) : "")}
              </div>
            </Bloc>
          );
        })}
        {!btoc && <button type="button" className="btn-ghost w-full border-dashed" onClick={() => {
          const base = lignes[lignes.length - 1];
          setLignes((ls) => [...ls, { ...LIGNE_VIDE, adresse_travaux: base?.adresse_travaux ?? "", cp_travaux: base?.cp_travaux ?? "", ville_travaux: base?.ville_travaux ?? "", reference: base?.reference ?? "", consigne: base?.consigne ?? 18 }]);
          setModifie(true);
        }}>+ Ajouter une opération de déstratification (BAT-TH-142 / IND-BA-110)</button>}

        <LignesProduits lignes={libres} setLignes={setLibres} prime={T.primeCee} tvaDefaut={btoc ? 0.055 : P.tva} btoc={btoc} />

        {!direct && <Bloc titre="Génération du devis" sous="Rempli automatiquement à la génération">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
            {lu("controles", d.controles, "col-span-2 md:col-span-6")}
            {lu("genere_le", d.genere_le ? new Date(d.genere_le).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "", "md:col-span-2")}
            {lu("pdf_devis", docDevis ? <a className="text-vert-700 underline" href={`/api/documents/${docDevis.id}`} target="_blank">{d.pdf_devis}</a> : d.pdf_devis, "col-span-2 md:col-span-4")}
          </div>
        </Bloc>}

        <div id="facture" />
        <Bloc titre="Facture" sous={direct ? "Facture sans devis préalable" : "Après les travaux : le devis doit avoir été généré"}>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
            <Cellule c={C("date_facture")}>
              <input type="date" className="champ" style={fond(C("date_facture"))} value={d.date_facture ?? ""} min={d.date_devis ?? undefined} onChange={(e) => set("date_facture", e.target.value)} />
            </Cellule>
            {lu("numero_facture", d.numero_facture)}
            {lu("pdf_facture", docFacture ? <a className="text-vert-700 underline" href={`/api/documents/${docFacture.id}`} target="_blank">{d.pdf_facture}</a> : d.pdf_facture, "md:col-span-2")}
            {tx("id_delegataire")}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button className="btn-or" onClick={() => generer("facture")} disabled={!!busy || (!genere && !direct) || !d.date_facture}>
              {busy === "facture" ? "Génération…" : d.numero_facture ? `Régénérer la facture ${d.numero_facture}` : "Générer la facture PDF"}
            </button>
            <span className="text-xs text-slate-500">{!genere && !direct ? "Disponible une fois le devis généré." : "Installation reportée : modifier la Date facture puis régénérer — même n° de facture, ancienne version archivée."}</span>
          </div>
        </Bloc>
      </div>

      {/* Colonne de droite */}
      <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
        <div className="carte overflow-hidden">
          <div className="fond-menu px-5 py-4 text-white">
            <div className="text-[11px] uppercase tracking-widest text-hill-400">Reste à payer</div>
            <div className="text-3xl font-bold tabular-nums">{eur(T.reste)}</div>
            <div className="text-sm text-vert-100/80 tabular-nums">{eur(T.ttc)} TTC{T.primeCee ? ` · prime ${eur(T.primeCee)}` : ""}{res.totKwh ? ` · ${fr(res.totKwh, 0)} kWhc` : ""}</div>
          </div>
          <dl className="grid grid-cols-2 gap-y-1 px-5 py-3 text-sm tabular-nums">
            <dt className="text-slate-500">Total H.T</dt><dd className="text-right">{eur(T.ht)}</dd>
            <dt className="text-slate-500">Total TVA{T.taux.length === 1 ? ` ${fr(T.taux[0] * 100, T.taux[0] === 0.055 ? 1 : 0)}%` : ""}</dt><dd className="text-right">{eur(T.tva)}</dd>
            <dt className="font-semibold">Total TTC</dt><dd className="text-right font-semibold">{eur(T.ttc)}</dd>
            {T.primeCee > 0 && <><dt className="text-slate-500">Prime CEE *</dt><dd className="text-right">- {eur(T.primeCee)}</dd></>}
            {T.aide > 0 && <><dt className="text-slate-500">{d.aide_libelle || "Aide"}</dt><dd className="text-right">- {eur(T.aide)}</dd></>}
            <dt className="font-semibold text-rouge-500">Reste à payer</dt><dd className="text-right font-semibold text-rouge-500">{eur(T.reste)}</dd>
          </dl>
        </div>

        <div className="carte p-4">
          <h3 className="mb-2 text-sm font-semibold text-vert-900">Contrôles en direct</h3>
          {res.erreurs.length === 0 && res.alertes.length === 0 && <p className="text-sm text-vert-600">✓ Dossier éligible, prêt à générer.</p>}
          <ul className="space-y-1.5 text-sm">
            {res.erreurs.map((e) => <li key={e} className="flex gap-2 text-rouge-600"><span>✕</span><span>{e}</span></li>)}
            {res.alertes.map((e) => <li key={e} className="flex gap-2 text-or-600"><span>!</span><span>{e}</span></li>)}
          </ul>
        </div>

        {msg && (
          <div className={`rounded-xl border p-3 text-sm ${msg.ok ? "border-vert-500/30 bg-vert-50 text-vert-700" : "border-rouge-500/30 bg-rouge-50 text-rouge-600"}`}>
            <div className="font-medium">{msg.texte}</div>
            {!!msg.details?.length && <ul className="mt-1 list-disc pl-5 text-xs">{msg.details.map((x) => <li key={x}>{x}</li>)}</ul>}
            {msg.lien && <a href={msg.lien} target="_blank" className="mt-2 inline-block font-semibold underline">Ouvrir le PDF →</a>}
          </div>
        )}

        <div className="carte space-y-2 p-4">
          <button className="btn-ghost w-full" onClick={sauver} disabled={!!busy}>{busy === "save" ? "Enregistrement…" : "Enregistrer"}</button>
          {!direct && <button className="btn-vert w-full" onClick={() => generer("devis")} disabled={!!busy || !res.ok}>
            {busy === "devis" ? "Génération…" : genere ? "Régénérer le devis (même n°)" : "Générer le devis PDF"}
          </button>}
          {!direct && genere && (
            <button className="btn-ghost w-full" onClick={() => generer("cadre")} disabled={!!busy} title="Reprend le devis : bénéficiaire, opérations, kWh cumac, prime, délégataire et date">
              {busy === "cadre" ? "Génération…" : docsActifs.some((x) => x.type === "cadre") ? "Régénérer le cadre de contribution" : "Générer le cadre de contribution"}
            </button>
          )}
          {!direct && !res.ok && <p className="text-center text-xs text-rouge-600">Génération impossible : corrigez les points en rouge des « Contrôles en direct ».</p>}
          {modifie && <p className="text-center text-xs text-or-600">Modifications non enregistrées</p>}
          {initial && documents.some((x) => !x.archive) && (
            <a className="btn-ghost w-full" href={`/api/dossiers/${initial.id}/zip`}>Télécharger le dossier complet (ZIP)</a>
          )}
          {initial && (
            <div className="flex gap-2 pt-1">
              <button className="btn-ghost flex-1 !text-xs" onClick={dupliquer} disabled={!!busy}>Dupliquer</button>
              <button className="btn-ghost flex-1 !text-xs" onClick={ignorer} disabled={!!busy} title="Garder le dossier pour mémoire mais le retirer de la liste et des totaux">{(d as any).ignore ? "Réactiver" : "Ignorer"}</button>
              {(!initial.numero_devis || role === "admin") && <button className="btn-rouge flex-1 !text-xs" onClick={supprimer} disabled={!!busy}>Supprimer</button>}
            </div>
          )}
          {initial && d.numero_facture && role === "admin" && (
            <button className="w-full text-center text-xs text-rouge-600 underline" onClick={supprimerFacture} disabled={!!busy}>Supprimer la facture {d.numero_facture} (erreur)</button>
          )}
          {(d as any).ignore && <p className="rounded bg-slate-100 px-2 py-1 text-center text-xs text-slate-600">Dossier ignoré{(d as any).ignore_motif ? ` : ${(d as any).ignore_motif}` : ""}</p>}
        </div>

        <ListeDocuments key={documents.map((x) => x.id + x.archive).join()} titre="Documents" documents={documents} role={role} badges={true} />

        {!!journal.length && (
          <details className="carte p-4 text-xs">
            <summary className="cursor-pointer text-sm font-semibold text-vert-900">Historique</summary>
            <ul className="mt-2 space-y-1.5">
              {journal.map((j) => <li key={j.id}><span className="text-slate-400">{new Date(j.at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</span> — <b>{j.action}</b>{j.detail ? ` : ${j.detail}` : ""}</li>)}
            </ul>
          </details>
        )}
        {d.date_devis && <p className="px-1 text-[11px] text-slate-400">Devis du {dateFr(d.date_devis)}</p>}
      </aside>
    </div>
  );
}
