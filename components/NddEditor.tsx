"use client";
// Note de dimensionnement : document à part (ni devis, ni facture). Saisie complète puis génération du PDF.
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cp5, dateFr, fr, num } from "@/lib/format";
import { calculsNdd, LOCAL_VIDE, siteDe } from "@/lib/ndd/document";
import { debitEquipement } from "@/lib/ndd/construire";
import { pointsParModele } from "@/lib/ndd/couleurs";
import { VENTILATION_DEFAUT } from "@/lib/ndd/modeles";
import { departementDe, ZONES_DEPARTEMENTS, ZONES_TEMP, temperatureBase } from "@/lib/ndd/temperatures";
import type { ChauffageNdd, DocumentNdd, LocalSaisi, ModeleNdd, SaisieNdd } from "@/lib/ndd/types";
import type { Dossier, Params } from "@/lib/types";
import { ClientBtoB } from "./editeur/ClientBtoB";
import { ListeDocuments } from "./ListeDocuments";
import { Bloc, Champ, Liste, Texte } from "./editeur/ui";

const CartePlan = dynamic(() => import("./editeur/CartePlan").then((m) => m.CartePlan), { ssr: false, loading: () => <div className="h-[360px] rounded-lg bg-slate-100" /> });

type Doc = { id: string; numero: string; fichier: string; archive: boolean; created_at: string; detail?: string | null };
type DevisSource = { id: string; numero_devis: string; raison_sociale: string | null };

export default function NddEditor({ P, initial, modeles, documents = [], devis = [], role }: {
  P: Params; initial: DocumentNdd; modeles: ModeleNdd[]; documents?: Doc[]; devis?: DevisSource[]; role: string;
}) {
  const router = useRouter();
  const sb = useMemo(() => createClient(), []);
  const [n, setN] = useState<DocumentNdd>(initial);
  const [modifie, setModifie] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; texte: string; details?: string[]; lien?: string } | null>(null);
  const [loc, setLoc] = useState(false);

  const maj = (p: Partial<DocumentNdd>) => { setN((x) => ({ ...x, ...p })); setModifie(true); };
  const s: SaisieNdd = n.saisie ?? {};
  const setS = (p: Partial<SaisieNdd>) => maj({ saisie: { ...s, ...p } });
  const actifs = modeles.filter((m) => m.actif);
  const modele = modeles.find((m) => m.fiche === n.fiche) ?? null;
  const destrat = modele?.moteur === "destratification";
  const btoc = n.type_client === "BtoC";
  const site = siteDe(n);
  const dep = departementDe(site.cp);
  const controle = calculsNdd(n, P, modele);
  const refs = Object.values(P.equip);

  // adaptateur pour le bloc SIRET du devis (mêmes champs, noms différents)
  const pseudo: Partial<Dossier> = { siret: n.siret, raison_sociale: n.raison_sociale, adresse_siege: n.adresse, cp_siege: n.cp, ville_siege: n.ville,
    telephone: n.telephone, mail: n.mail, rep_nom: n.rep_nom, rep_prenom: n.rep_prenom, fonction: n.fonction, secteur: s.activite ?? "", ref_dossier: "x" };
  const CLES: Record<string, keyof DocumentNdd> = { siret: "siret", raison_sociale: "raison_sociale", adresse_siege: "adresse", cp_siege: "cp", ville_siege: "ville",
    telephone: "telephone", mail: "mail", rep_nom: "rep_nom", rep_prenom: "rep_prenom", fonction: "fonction" };
  const setPseudo = (k: keyof Dossier, v: any) => {
    if (k === "secteur") setN((x) => ({ ...x, saisie: { ...(x.saisie ?? {}), activite: v } }));
    else if (CLES[k as string]) setN((x) => ({ ...x, [CLES[k as string]]: v }));
    setModifie(true);
  };

  // ---------- reprise depuis un devis (facultatif)
  async function reprendre(id: string) {
    if (!id) return;
    const [{ data: d }, { data: lg }] = await Promise.all([sb.from("dossiers").select("*").eq("id", id).single(), sb.from("lignes").select("*").eq("dossier_id", id).order("ordre")]);
    if (!d) return;
    const L = lg ?? [];
    const l0 = L[0];
    const fiche = d.type_client === "BtoC" ? n.fiche : String(d.type_batiment).toLowerCase().startsWith("ind") ? "IND-BA-110" : "BAT-TH-142";
    maj({
      dossier_id: id, fiche, type_client: d.type_client ?? "BtoB",
      raison_sociale: d.raison_sociale, siret: d.siret, adresse: d.adresse_siege, cp: d.cp_siege, ville: d.ville_siege, civilite: d.civilite,
      rep_nom: d.rep_nom, rep_prenom: d.rep_prenom, fonction: d.fonction, telephone: d.telephone, mail: d.mail,
      nom_site: l0?.nom_site ?? null, // site = adresse des TRAVAUX du devis, jamais celle du siège
      site_adresse: l0?.adresse_travaux || d.travaux_adresse || "", site_cp: l0?.cp_travaux || d.travaux_cp || "", site_ville: l0?.ville_travaux || d.travaux_ville || "",
      locaux: L.length ? L.map((l: any) => ({ nom: l.nom_site ?? "", hauteur: l.hauteur, surface: l.surface, consigne: l.consigne, p_allouee: (num(l.p_conv) ?? 0) + (num(l.p_rad) ?? 0), reference: l.reference ?? "", nb: l.nb, clos: l.clos, entrepot: l.entrepot })) : n.locaux,
      saisie: { ...s, activite: s.activite || d.secteur || null },
    });
    setMsg({ ok: true, texte: `Données reprises du devis ${d.numero_devis}. Vérifiez puis enregistrez.` });
  }

  // ---------- localisation automatique
  async function localiser(forcer: boolean) {
    setLoc(true); setMsg(null);
    try {
      const j = await fetch("/api/ndd/localiser", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adresse: [site.adresse, site.cp, site.ville].filter(Boolean).join(" "), cp: site.cp, saisie: s, forcer }) }).then((r) => r.json());
      if (!j.ok) throw new Error(j.message);
      maj({ saisie: j.saisie });
      setMsg({ ok: true, texte: "Site localisé : parcelle, altitude et température de base remplies. Vérifiez-les.", details: j.messages });
    } catch (e: any) { setMsg({ ok: false, texte: e.message || String(e) }); }
    setLoc(false);
  }
  // zone de température remplie automatiquement depuis le code postal du site (table du département, sinon valeur par défaut)
  useEffect(() => {
    if (!dep || s.zone_temp) return;
    let annule = false;
    sb.from("temperatures_base").select("zone").eq("departement", dep).maybeSingle().then(({ data }) => {
      const z = String(data?.zone ?? "") || ZONES_DEPARTEMENTS[dep] || "";
      if (annule || !z) return;
      const t = temperatureBase(z, num(s.altitude as any));
      setN((x) => (x.saisie?.zone_temp ? x : { ...x, saisie: { ...(x.saisie ?? {}), zone_temp: z, ...(t !== null ? { temp_base: t } : {}) } }));
      setModifie(true);
    });
    return () => { annule = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dep]);
  function choisirZone(z: string) {
    const t = temperatureBase(z, num(s.altitude as any));
    setS({ zone_temp: z, ...(t !== null ? { temp_base: t } : {}) });
    if (z && /^(\d{2}|2[AB])$/.test(dep)) sb.from("temperatures_base").upsert({ departement: dep, zone: z }).then(() => {});
  }
  async function importerPlan(f: File | null) {
    if (!f) return;
    const fd = new FormData(); fd.append("type", "plan"); fd.append("fichier", f); fd.append("dossier", String(n.id ?? "nouvelle"));
    const j = await fetch("/api/ndd/fichier", { method: "POST", body: fd }).then((r) => r.json());
    if (j.ok) setS({ plan_image: j.path }); else setMsg({ ok: false, texte: j.message });
  }

  // ---------- enregistrement / génération
  async function enregistrer(): Promise<string> {
    const row: any = { ...n, updated_at: new Date().toISOString() };
    delete row.id; delete row.created_at;
    if (!row.date_etude) row.date_etude = null;
    if (n.id) {
      const { error } = await sb.from("ndd_documents").update(row).eq("id", n.id);
      if (error) throw new Error(error.message);
      setModifie(false);
      return n.id;
    }
    const { data: { user } } = await sb.auth.getUser();
    const { data, error } = await sb.from("ndd_documents").insert({ ...row, created_by: user?.id }).select("id").single();
    if (error) throw new Error(error.message);
    setN((x) => ({ ...x, id: data.id }));
    setModifie(false);
    return data.id;
  }
  async function action(nom: string, fn: () => Promise<void>) {
    setBusy(nom); setMsg(null);
    try { await fn(); } catch (e: any) { setMsg({ ok: false, texte: e.message || String(e) }); }
    setBusy(null);
  }
  const sauver = () => action("save", async () => {
    const id = await enregistrer();
    setMsg({ ok: true, texte: "Enregistré." });
    if (!initial.id) router.replace(`/ndd/${id}`);
    router.refresh();
  });
  const generer = (nouvelle: boolean) => action("gen", async () => {
    // détail de la version (affiché dans la liste des PDF) : le contenu est résumé automatiquement, le motif est facultatif
    const motif = n.version ? window.prompt(`Motif de ${nouvelle ? `la V${n.version + 1}` : `cette régénération de la V${n.version}`} (facultatif) — ex. « ajout de 2 DS3 dans l’atelier »`, "") : "";
    if (motif === null) return;
    const id = await enregistrer();
    const j = await fetch(`/api/ndd/${id}/generer`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nouvelle_version: nouvelle, motif }) }).then((r) => r.json());
    setMsg({ ok: j.ok, texte: j.message, details: [...(j.erreurs ?? []), ...(j.alertes ?? [])], lien: j.document ? `/api/documents/${j.document}` : undefined });
    const { data } = await sb.from("ndd_documents").select("*").eq("id", id).single();
    if (data) setN(data as DocumentNdd);
    if (!initial.id) router.replace(`/ndd/${id}`);
    router.refresh();
  });
  const supprimer = () => action("del", async () => {
    if (!n.id || !confirm("Supprimer définitivement cette note ?")) return;
    const { error } = await sb.from("ndd_documents").delete().eq("id", n.id);
    if (error) throw new Error(error.message);
    router.push("/ndd"); router.refresh();
  });

  // ---------- locaux
  const setLocal = (i: number, p: Partial<LocalSaisi>) => maj({ locaux: n.locaux.map((l, j) => (j === i ? { ...l, ...p } : l)) });
  const taux = num(modele?.taux_brassage as any) || 1;
  const nbTotal = n.locaux.reduce((a, l) => a + (num(l.nb as any) || 0), 0);
  const chauffages: ChauffageNdd[] = s.chauffages ?? [];
  const setCh = (i: number, p: Partial<ChauffageNdd>) => setS({ chauffages: chauffages.map((c, j) => (j === i ? { ...c, ...p } : c)) });
  const totCh = chauffages.reduce((a, c) => a + (num(c.p_unit as any) ?? 0) * (num(c.nombre as any) ?? 0), 0);
  const pLocaux = n.locaux.reduce((a, l) => a + (num(l.p_allouee as any) ?? 0), 0);
  const valeurs = s.valeurs?.[n.fiche] ?? {};
  const setVal = (k: string, v: string) => setS({ valeurs: { ...(s.valeurs ?? {}), [n.fiche]: { ...valeurs, [k]: v } } });
  const docsActifs = documents.filter((x) => !x.archive), docsArch = documents.filter((x) => x.archive);

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-5">
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={() => router.push("/ndd")} className="text-sm text-slate-500 hover:text-vert-700">← Notes de dimensionnement</button>
          <h1 className="text-2xl font-bold text-vert-900">{n.numero ? `NDD ${n.numero}-V${n.version}` : "Nouvelle note de dimensionnement"}</h1>
          <span className="badge bg-sky-50 text-sky-700">{n.fiche}</span>
        </div>

        {/* 1. opération */}
        <Bloc titre="Opération" sous="Chaque opération a sa note ; de nouvelles opérations s’ajoutent dans Paramètres › Notes de dimensionnement">
          <div className="grid gap-3 md:grid-cols-3">
            {actifs.map((m) => {
              const on = n.fiche === m.fiche;
              return (
                <button key={m.fiche} type="button" disabled={!!n.numero && !on} onClick={() => maj({ fiche: m.fiche })}
                  className={`rounded-xl border-2 p-4 text-left transition ${on ? "border-vert-500 bg-vert-50" : "border-slate-200 bg-white hover:border-vert-500/50"} disabled:cursor-not-allowed disabled:opacity-50`}>
                  <div className="font-mono text-sm font-bold text-vert-900">{m.fiche}</div>
                  <div className="text-sm text-slate-600">{m.sous_titre}{m.libelle_batiment ? ` — ${m.libelle_batiment}` : ""}</div>
                </button>
              );
            })}
          </div>
          {!!devis.length && !n.numero && (
            <div className="mt-4 flex flex-wrap items-end gap-2 rounded-lg bg-slate-50 p-3">
              <Champ label="Reprendre les données d’un devis (facultatif)" className="min-w-[280px] flex-1">
                <select className="champ" defaultValue="" onChange={(e) => reprendre(e.target.value)}>
                  <option value="">— aucun —</option>
                  {devis.map((d) => <option key={d.id} value={d.id}>{d.numero_devis} — {d.raison_sociale}</option>)}
                </select>
              </Champ>
              <span className="pb-2 text-xs text-slate-500">Bénéficiaire, site et locaux sont recopiés ; la note reste un document à part.</span>
            </div>
          )}
        </Bloc>

        {/* 2. bénéficiaire */}
        <Bloc titre="Bénéficiaire" action={
          <div className="flex rounded-lg border border-slate-300 p-0.5 text-sm">
            {(["BtoB", "BtoC"] as const).map((t) => (
              <button key={t} type="button" onClick={() => maj({ type_client: t })} className={`rounded-md px-3 py-1 ${n.type_client === t ? "bg-vert-500 font-semibold text-white" : "text-slate-600"}`}>{t === "BtoB" ? "Entreprise" : "Particulier"}</button>
            ))}
          </div>}>
          {btoc ? (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
              <Champ label="Civilité"><Liste value={n.civilite} options={["Mr", "Mme", "M. et Mme"]} onChange={(v) => maj({ civilite: v })} /></Champ>
              <Champ label="Nom" className="md:col-span-2"><Texte value={n.rep_nom} onChange={(v) => maj({ rep_nom: v })} /></Champ>
              <Champ label="Prénom" className="md:col-span-3"><Texte value={n.rep_prenom} onChange={(v) => maj({ rep_prenom: v })} /></Champ>
              <Champ label="Adresse" className="col-span-2 md:col-span-3"><Texte value={n.adresse} onChange={(v) => maj({ adresse: v })} /></Champ>
              <Champ label="Code postal"><Texte value={n.cp} onChange={(v) => maj({ cp: v })} /></Champ>
              <Champ label="Ville" className="md:col-span-2"><Texte value={n.ville} onChange={(v) => maj({ ville: v })} /></Champ>
              <Champ label="Téléphone" className="md:col-span-2"><Texte value={n.telephone} onChange={(v) => maj({ telephone: v })} /></Champ>
              <Champ label="Mail" className="md:col-span-2"><Texte value={n.mail} onChange={(v) => maj({ mail: v })} /></Champ>
              <Champ label="Type de logement" className="md:col-span-2"><Texte value={s.activite ?? ""} onChange={(v) => setS({ activite: v })} placeholder="Maison individuelle" /></Champ>
            </div>
          ) : <ClientBtoB d={pseudo} set={setPseudo} />}
        </Bloc>

        {/* 3. site */}
        <Bloc titre="Site des travaux" action={
          <div className="flex gap-2">
            <button type="button" className="btn-vert !py-1 text-xs" disabled={loc || !site.adresse} onClick={() => localiser(false)}>{loc ? "Recherche…" : "Remplir depuis l’adresse"}</button>
            {(s.lon || s.parcelle?.numero) && <button type="button" className="btn-ghost !py-1 text-xs" disabled={loc} onClick={() => localiser(true)}>Tout relocaliser</button>}
          </div>}>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
            <Champ label="Nom du site" className="col-span-2"><Texte value={n.nom_site} placeholder={site.nom} onChange={(v) => maj({ nom_site: v })} /></Champ>
            <Champ label="Adresse des travaux" className="col-span-2"><Texte value={n.site_adresse} placeholder="adresse du chantier (pas celle du siège)" onChange={(v) => maj({ site_adresse: v })} /></Champ>
            <Champ label="Code postal"><Texte value={n.site_cp} onChange={(v) => maj({ site_cp: v })} /></Champ>
            <Champ label="Ville"><Texte value={n.site_ville} onChange={(v) => maj({ site_ville: v })} /></Champ>
            {!btoc && <Champ label="Activité du site" className="col-span-2"><Texte value={s.activite ?? ""} placeholder="ex. Atelier de production" onChange={(v) => setS({ activite: v })} /></Champ>}
            <Champ label="Parcelle : préfixe"><Texte value={s.parcelle?.prefixe ?? ""} placeholder="000" onChange={(v) => setS({ parcelle: { ...s.parcelle, prefixe: v } })} /></Champ>
            <Champ label="Section"><Texte value={s.parcelle?.section ?? ""} placeholder="0C" onChange={(v) => setS({ parcelle: { ...s.parcelle, section: v.toUpperCase() } })} /></Champ>
            <Champ label="N° de parcelle"><Texte value={s.parcelle?.numero ?? ""} placeholder="0390" onChange={(v) => setS({ parcelle: { ...s.parcelle, numero: v } })} /></Champ>
            <Champ label="Code INSEE"><Texte value={s.parcelle?.insee ?? ""} onChange={(v) => setS({ parcelle: { ...s.parcelle, insee: v } })} /></Champ>
            <Champ label="Altitude (m)"><Texte value={s.altitude ?? ""} inputMode="numeric" onChange={(v) => {
              const t = temperatureBase(s.zone_temp, num(v)); setS({ altitude: v === "" ? null : (num(v) as any), ...(t !== null ? { temp_base: t } : {}) });
            }} /></Champ>
            <Champ label={`Zone temp. (dép. ${dep || "?"})`} aide="Zone A à I du département (NF EN 12831), retenue pour les prochaines notes">
              <Liste value={s.zone_temp ?? ""} onChange={choisirZone} options={ZONES_TEMP} />
            </Champ>
            <Champ label="Temp. de base (°C)"><Texte value={s.temp_base ?? ""} onChange={(v) => setS({ temp_base: v === "" ? null : (num(v) as any) })} /></Champ>
            <Champ label="Date d’étude"><Texte type="date" value={n.date_etude ?? ""} onChange={(v) => maj({ date_etude: v || null })} /></Champ>
          </div>
        </Bloc>

        {destrat && (
          <>
            {/* 4. locaux */}
            <Bloc titre="Locaux à déstratifier" sous={`Volume = surface × hauteur · quantité nécessaire = volume ÷ débit du déstratificateur${taux !== 1 ? ` × ${fr(taux, 1)}` : ""} · taux de brassage = nombre × débit ÷ volume`}
              action={<button type="button" className="btn-ghost !py-1 text-xs" onClick={() => maj({ locaux: [...n.locaux, { ...LOCAL_VIDE }] })}>+ Local</button>}>
              <div className="space-y-3">
                {n.locaux.map((l, i) => {
                  const h = num(l.hauteur as any) ?? 0, sf = num(l.surface as any) ?? 0, v = h * sf, nb = num(l.nb as any) ?? 0;
                  const deb = debitEquipement(P, l.reference) ?? 0, req = v * taux, inst = nb * deb, t = v ? inst / v : 0;
                  const ok = v > 0 && deb > 0 && t + 1e-9 >= taux;
                  return (
                    <div key={i} className="rounded-lg border border-slate-200 p-3">
                      <div className="grid grid-cols-2 gap-2 md:grid-cols-12">
                        <Champ label="Local" className="col-span-2 md:col-span-4"><Texte value={l.nom} placeholder={site.nom} onChange={(x) => setLocal(i, { nom: x })} /></Champ>
                        <Champ label="Hauteur (m)" className="md:col-span-2"><Texte value={l.hauteur ?? ""} inputMode="decimal" onChange={(x) => setLocal(i, { hauteur: x })} /></Champ>
                        <Champ label="Surface (m²)" className="md:col-span-2"><Texte value={l.surface ?? ""} inputMode="decimal" onChange={(x) => setLocal(i, { surface: x })} /></Champ>
                        <Champ label="Consigne (°C)" className="md:col-span-2"><Texte value={l.consigne ?? ""} inputMode="decimal" onChange={(x) => setLocal(i, { consigne: x })} /></Champ>
                        <Champ label="P. allouée (kW)" className="md:col-span-2"><Texte value={l.p_allouee ?? ""} inputMode="decimal" onChange={(x) => setLocal(i, { p_allouee: x })} /></Champ>
                        <Champ label="Clos" className="md:col-span-2"><Liste value={l.clos ? "Oui" : "Non"} vide="Oui" options={["Oui", "Non"]} onChange={(x) => setLocal(i, { clos: x !== "Non" })} /></Champ>
                        <Champ label="Entrepôt" className="md:col-span-2"><Liste value={l.entrepot ? "Oui" : "Non"} vide="Non" options={["Non", "Oui"]} onChange={(x) => setLocal(i, { entrepot: x === "Oui" })} /></Champ>
                        <Champ label="Modèle de déstratificateur" className="col-span-2 md:col-span-6">
                          <Liste value={l.reference} options={refs.map((r) => r.reference)} onChange={(x) => setLocal(i, { reference: x })} />
                        </Champ>
                        <Champ label="Nombre" className="md:col-span-2"><Texte value={l.nb ?? ""} inputMode="numeric" onChange={(x) => setLocal(i, { nb: x })} /></Champ>
                        <div className="col-span-2 flex items-end md:col-span-12">
                          <div className={`flex w-full flex-wrap items-center gap-x-4 gap-y-1 rounded-lg px-3 py-2 text-xs tabular-nums ${!v || !deb ? "bg-slate-50 text-slate-500" : ok ? "bg-vert-50 text-vert-700" : "bg-rouge-50 text-rouge-600"}`}>
                            <span>Volume <b>{fr(v, 1)} m³</b></span>
                            <span>Requis <b>{fr(Math.round(req), 0)} m³/h</b></span>
                            <span>Installé <b>{fr(inst, 0)} m³/h</b></span>
                            <span>Taux <b>{fr(t, 2)} vol/h</b> {v && deb ? (ok ? "✓" : `✕ il faut ${Math.ceil(req / deb - 1e-9)} appareil(s)`) : ""}</span>
                          </div>
                        </div>
                      </div>
                      {n.locaux.length > 1 && <button type="button" className="mt-2 text-xs text-slate-400 hover:text-rouge-500" onClick={() => maj({ locaux: n.locaux.filter((_, j) => j !== i) })}>Retirer ce local</button>}
                    </div>
                  );
                })}
              </div>
            </Bloc>

            {/* 5. chauffage */}
            <Bloc titre="Moyens de chauffage existants" action={<button type="button" className="btn-ghost !py-1 text-xs" onClick={() => setS({ chauffages: [...chauffages, { dispositif: "", mode: "Convectif", p_unit: null, nombre: 1 }] })}>+ Appareil</button>}>
              {!chauffages.length && <p className="mb-2 text-xs text-slate-500">Aucun appareil détaillé : la note reprendra une ligne « Chauffage existant » de {fr(pLocaux, 0)} kW (P. allouée des locaux).</p>}
              <div className="space-y-2">
                {chauffages.map((c, i) => (
                  <div key={i} className="grid grid-cols-2 gap-2 md:grid-cols-12">
                    <Champ label={i ? "" : "Dispositif (marque / référence)"} className="col-span-2 md:col-span-4"><Texte value={c.dispositif} placeholder="ex. Aérotherme gaz — canon" onChange={(v) => setCh(i, { dispositif: v })} /></Champ>
                    <Champ label={i ? "" : "Mode"} className="md:col-span-2"><Liste value={c.mode} vide="Convectif" options={["Convectif", "Radiatif"]} onChange={(v) => setCh(i, { mode: (v || "Convectif") as any })} /></Champ>
                    <Champ label={i ? "" : "P. unitaire (kW)"} className="md:col-span-2"><Texte value={c.p_unit ?? ""} inputMode="decimal" onChange={(v) => setCh(i, { p_unit: v as any })} /></Champ>
                    <Champ label={i ? "" : "Nombre"} className="md:col-span-2"><Texte value={c.nombre ?? ""} inputMode="numeric" onChange={(v) => setCh(i, { nombre: v as any })} /></Champ>
                    <Champ label={i ? "" : "P. totale (kW)"} className="md:col-span-2">
                      <div className="flex items-center gap-1">
                        <div className="champ-calc min-w-0 flex-1 text-right tabular-nums">{fr((num(c.p_unit as any) ?? 0) * (num(c.nombre as any) ?? 0), 1)}</div>
                        <button type="button" className="px-1 text-slate-400 hover:text-rouge-500" title="Retirer" onClick={() => setS({ chauffages: chauffages.filter((_, j) => j !== i) })}>✕</button>
                      </div>
                    </Champ>
                  </div>
                ))}
              </div>
              {!!chauffages.length && Math.abs(totCh - pLocaux) > 0.05 && (
                <p className="mt-1 text-xs text-or-600">Total des appareils {fr(totCh, 1)} kW ≠ P. allouée des locaux {fr(pLocaux, 1)} kW — normal si une partie du chauffage dessert d’autres zones.</p>
              )}
              <Champ label="Système de ventilation existant" className="mt-3">
                <Texte value={s.ventilation ?? ""} placeholder={VENTILATION_DEFAUT} onChange={(v) => setS({ ventilation: v })} />
              </Champ>
            </Bloc>
          </>
        )}

        {!destrat && !!modele?.champs.length && (
          <Bloc titre={`Données de l’opération ${n.fiche}`}>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {modele.champs.map((c) => (
                <Champ key={c.cle} label={`${c.libelle}${c.unite ? ` (${c.unite})` : ""}`}><Texte value={valeurs[c.cle] ?? ""} onChange={(v) => setVal(c.cle, v)} /></Champ>
              ))}
            </div>
          </Bloc>
        )}

        {/* plan */}
        <Bloc titre={`Plan de calepinage${destrat ? ` — ${nbTotal} déstratificateur${nbTotal > 1 ? "s" : ""}` : " (facultatif)"}`} action={
          <div className="flex items-center gap-2 text-xs">
            {s.plan_image
              ? <>
                  <a className="text-vert-700 underline" target="_blank" href={`/api/ndd/fichier?path=${encodeURIComponent(s.plan_image)}`}>Image importée</a>
                  <button type="button" className="btn-ghost !py-1 text-xs" onClick={() => setS({ plan_image: null })}>{destrat ? "Revenir à la vue IGN" : "Retirer l’image"}</button>
                </>
              : <label className="btn-ghost cursor-pointer !py-1 text-xs">Importer une image{destrat ? " à la place" : ""}<input type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => importerPlan(e.target.files?.[0] ?? null)} /></label>}
          </div>}>
          {!s.plan_image && destrat && (num(s.lon as any) && num(s.lat as any)
            ? <CartePlan lon={num(s.lon as any)!} lat={num(s.lat as any)!} parcelle={s.parcelle} nb={nbTotal} points={(s.points ?? []) as any} onPoints={(p) => setS({ points: p })} modeles={pointsParModele(P, n.locaux)} />
            : <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-slate-300 px-4 text-center text-sm text-slate-500">Saisissez l’adresse du site puis cliquez sur « Remplir depuis l’adresse » : la vue aérienne s’affiche ici.</div>)}
          {!destrat && !s.plan_image && <p className="text-xs text-slate-500">Aucun plan : la note se termine par les signatures.</p>}
        </Bloc>
      </div>

      {/* colonne de droite */}
      <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
        <div className="carte overflow-hidden">
          <div className="fond-menu px-5 py-4 text-white">
            <div className="text-[11px] uppercase tracking-widest text-hill-400">Note de dimensionnement</div>
            <div className="text-2xl font-bold">{n.numero ? `${n.numero}-V${n.version}` : "Nouvelle"}</div>
            <div className="text-sm text-vert-100/80">{n.fiche}{n.date_etude ? ` · étude du ${dateFr(n.date_etude)}` : ""}</div>
          </div>
          {destrat && <div className="px-5 py-3 text-sm text-slate-600">{n.locaux.length} local{n.locaux.length > 1 ? "aux" : ""} · {nbTotal} déstratificateur{nbTotal > 1 ? "s" : ""}{cp5(site.cp) ? ` · ${site.ville || site.cp}` : ""}</div>}
        </div>

        <div className="carte p-4">
          <h3 className="mb-2 text-sm font-semibold text-vert-900">Contrôles</h3>
          {!controle.erreurs.length && !controle.alertes.length && <p className="text-sm text-hill-700">✓ Conforme, prête à générer.</p>}
          <ul className="space-y-1.5 text-sm">
            {controle.erreurs.map((e) => <li key={e} className="flex gap-2 text-rouge-600"><span>✕</span><span>{e}</span></li>)}
            {controle.alertes.map((e) => <li key={e} className="flex gap-2 text-or-600"><span>!</span><span>{e}</span></li>)}
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
          {!n.version
            ? <button className="btn-vert w-full" onClick={() => generer(false)} disabled={!!busy || !!controle.erreurs.length}>{busy === "gen" ? "Génération…" : "Générer la note PDF (V1)"}</button>
            : <>
                <button className="btn-vert w-full" onClick={() => generer(false)} disabled={!!busy || !!controle.erreurs.length}>{busy === "gen" ? "Génération…" : `Régénérer la V${n.version}`}</button>
                <button className="btn-ghost w-full" onClick={() => generer(true)} disabled={!!busy || !!controle.erreurs.length}>Nouvelle version (V{n.version + 1})</button>
              </>}
          {!!controle.erreurs.length && <p className="text-center text-xs text-rouge-600">Complétez les points en rouge pour générer.</p>}
          {modifie && <p className="text-center text-xs text-or-600">Modifications non enregistrées</p>}
          {n.id && (n.dossier_id
            ? <a className="btn-ghost w-full" href={`/dossiers/${n.dossier_id}`}>Ouvrir le devis lié</a>
            : <a className={`btn-or w-full ${modifie ? "pointer-events-none opacity-50" : ""}`} href={`/dossiers/nouveau?ndd=${n.id}`}
                title="Prépare un devis avec le bénéficiaire, l’adresse des travaux et les locaux de cette note">Créer le devis depuis cette note →</a>)}
          {n.id && !n.dossier_id && modifie && <p className="text-center text-xs text-or-600">Enregistrez la note avant de créer le devis.</p>}
          {n.id && (!n.numero || role === "admin") && <button className="btn-rouge w-full !text-xs" onClick={supprimer} disabled={!!busy}>Supprimer la note</button>}
        </div>

        <ListeDocuments key={documents.map((x) => x.id + x.archive).join()} titre="PDF" documents={documents} role={role} badges={false} />
      </aside>
    </div>
  );
}
