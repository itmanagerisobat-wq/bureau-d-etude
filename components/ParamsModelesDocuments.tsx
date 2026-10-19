"use client";
// Paramètres > Modèles de devis et factures : un modèle par opération × type de client (BtoB / BtoC) × document,
// avec date d'effet. Le modèle le plus récent (date d'effet ≤ date du document) est utilisé ; un dossier garde
// le modèle de sa 1re génération.
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { MISES_EN_PAGE, TEXTES_MODELE, miseEnPageDefaut, type ModeleDocument } from "@/lib/modelesDocuments";

const VIDE = (): ModeleDocument => ({
  id: "", document: "devis", type_client: "BtoC", fiche: "*", libelle: "", mise_en_page: "btoc-word",
  date_effet: new Date().toISOString().slice(0, 10), fichier_reference: null, textes: {}, actif: true,
});
const dateFr = (s: string) => (s ? s.split("-").reverse().join("/") : "");
const nomMep = (v: string) => MISES_EN_PAGE.find((m) => m.v === v)?.l.split(" (")[0] ?? v;

export function ParamsModelesDocuments({ modeles, fiches }: { modeles: ModeleDocument[]; fiches: string[] }) {
  const sb = useMemo(() => createClient(), []);
  const router = useRouter();
  const [liste, setListe] = useState(modeles);
  const [m, setM] = useState<ModeleDocument | null>(null);
  const [fichier, setFichier] = useState<File | null>(null);
  const [etat, setEtat] = useState<{ ok: boolean; t: string } | null>(null);
  const [filtre, setFiltre] = useState({ fiche: "", type: "", doc: "" });
  const maj = (p: Partial<ModeleDocument>) => setM((x) => (x ? { ...x, ...p } : x));

  const visibles = liste
    .filter((x) => (!filtre.fiche || x.fiche === filtre.fiche) && (!filtre.type || x.type_client === filtre.type) && (!filtre.doc || x.document === filtre.doc))
    .sort((a, b) => a.fiche.localeCompare(b.fiche) || a.type_client.localeCompare(b.type_client) || a.document.localeCompare(b.document) || b.date_effet.localeCompare(a.date_effet));
  // modèle en vigueur aujourd'hui pour chaque combinaison
  const auj = new Date().toISOString().slice(0, 10);
  const enVigueur = new Set(
    Object.values(
      liste.filter((x) => x.actif && x.date_effet <= auj).reduce<Record<string, ModeleDocument>>((acc, x) => {
        const k = `${x.fiche}|${x.type_client}|${x.document}`;
        if (!acc[k] || acc[k].date_effet < x.date_effet) acc[k] = x;
        return acc;
      }, {}),
    ).map((x) => x.id),
  );

  async function enregistrer() {
    if (!m) return;
    const fiche = m.fiche.trim().toUpperCase() || "*";
    if (!m.date_effet) return setEtat({ ok: false, t: "Indiquez la date d’effet." });
    let fichier_reference = m.fichier_reference;
    if (fichier) {
      const fd = new FormData();
      fd.append("type", "modele-doc"); fd.append("fiche", fiche); fd.append("fichier", fichier);
      const j = await fetch("/api/ndd/fichier", { method: "POST", body: fd }).then((r) => r.json());
      if (!j.ok) return setEtat({ ok: false, t: j.message });
      fichier_reference = j.path;
    }
    const textes = Object.fromEntries(Object.entries(m.textes ?? {}).filter(([, v]) => String(v ?? "").trim()));
    const row: any = {
      document: m.document, type_client: m.type_client, fiche, libelle: m.libelle.trim(), mise_en_page: m.mise_en_page,
      date_effet: m.date_effet, fichier_reference, textes, actif: m.actif,
    };
    if (m.id) row.id = m.id;
    const { data, error } = await sb.from("modeles_documents").upsert(row).select("*").maybeSingle();
    if (error || !data) return setEtat({ ok: false, t: error?.message ?? "Enregistrement impossible" });
    setListe((l) => [...l.filter((x) => x.id !== (data as any).id), data as ModeleDocument]);
    setM(null); setFichier(null);
    setEtat({ ok: true, t: "Modèle enregistré. Il s’applique aux nouveaux devis / factures datés à partir du " + dateFr(m.date_effet) + "." });
    router.refresh();
  }
  async function supprimer(x: ModeleDocument) {
    if (!confirm(`Supprimer le modèle « ${x.libelle || nomMep(x.mise_en_page)} » ? Les dossiers qui l’utilisaient reprendront le modèle en vigueur.`)) return;
    const { error } = await sb.from("modeles_documents").delete().eq("id", x.id);
    if (error) return setEtat({ ok: false, t: error.message });
    setListe((l) => l.filter((y) => y.id !== x.id)); if (m?.id === x.id) setM(null);
    setEtat({ ok: true, t: "Modèle supprimé." });
  }

  const textesDispo = m ? TEXTES_MODELE.filter((t) => t.pour.includes(m.type_client) && t.doc.includes(m.document)) : [];
  const mepDispo = m ? MISES_EN_PAGE.filter((x) => x.types.includes(m.type_client)) : [];

  return (
    <div className="space-y-5">
      {etat && <div className={`rounded-lg px-3 py-2 text-sm ${etat.ok ? "bg-vert-50 text-vert-700" : "bg-rouge-50 text-rouge-600"}`}>{etat.t}</div>}
      <div>
        <h3 className="mb-1 text-sm font-semibold text-vert-900">Modèles de devis et de factures</h3>
        <p className="text-xs text-slate-500">
          Un modèle par opération, par type de client (entreprise / particulier) et par document. Quand un modèle change, ajoutez-en un
          nouveau avec sa <b>date d’effet</b> : les documents datés à partir de ce jour le prennent, les anciens gardent le leur
          (un dossier déjà généré garde toujours le même modèle). « Toutes » = modèle utilisé quand l’opération n’a pas le sien.
          Sans aucun modèle, l’application utilise le modèle d’origine.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div><label className="etiquette">Opération</label>
          <select className="champ" value={filtre.fiche} onChange={(e) => setFiltre({ ...filtre, fiche: e.target.value })}>
            <option value="">Toutes</option>{[...new Set(["*", ...fiches, ...liste.map((x) => x.fiche)])].map((f) => <option key={f} value={f}>{f === "*" ? "Toutes opérations (*)" : f}</option>)}
          </select></div>
        <div><label className="etiquette">Client</label>
          <select className="champ" value={filtre.type} onChange={(e) => setFiltre({ ...filtre, type: e.target.value })}>
            <option value="">BtoB et BtoC</option><option value="BtoB">Entreprise (BtoB)</option><option value="BtoC">Particulier (BtoC)</option>
          </select></div>
        <div><label className="etiquette">Document</label>
          <select className="champ" value={filtre.doc} onChange={(e) => setFiltre({ ...filtre, doc: e.target.value })}>
            <option value="">Devis et factures</option><option value="devis">Devis</option><option value="facture">Facture</option>
          </select></div>
        <div className="flex-1" />
        <button className="btn-vert" onClick={() => { setM(VIDE()); setFichier(null); }}>+ Nouveau modèle</button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm [&_td]:pr-4 [&_th]:pr-4">
          <thead className="text-left text-xs uppercase text-slate-500">
            <tr><th className="py-2">Opération</th><th>Client</th><th>Document</th><th>Modèle</th><th>Date d’effet</th><th>Modèle fourni</th><th>État</th><th></th></tr>
          </thead>
          <tbody>
            {!visibles.length && <tr><td colSpan={8} className="py-6 text-center text-slate-500">Aucun modèle : les devis et factures utilisent le modèle d’origine.</td></tr>}
            {visibles.map((x) => (
              <tr key={x.id} className={`border-t border-slate-100 ${m?.id === x.id ? "bg-vert-50/60" : ""}`}>
                <td className="whitespace-nowrap py-2 font-mono text-xs font-semibold">{x.fiche === "*" ? "Toutes" : x.fiche}</td>
                <td>{x.type_client === "BtoC" ? "Particulier" : "Entreprise"}</td>
                <td className="capitalize">{x.document}</td>
                <td><div className="font-medium">{x.libelle || nomMep(x.mise_en_page)}</div><div className="text-xs text-slate-500">{nomMep(x.mise_en_page)}</div></td>
                <td className="whitespace-nowrap tabular-nums">{dateFr(x.date_effet)}</td>
                <td>{x.fichier_reference ? <a className="text-vert-700 underline" target="_blank" href={`/api/ndd/fichier?path=${encodeURIComponent(x.fichier_reference)}`}>Ouvrir</a> : <span className="text-slate-400">—</span>}</td>
                <td className="whitespace-nowrap">{!x.actif ? <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500">Désactivé</span>
                  : enVigueur.has(x.id) ? <span className="rounded bg-hill-100 px-2 py-0.5 text-xs font-semibold text-hill-700">En vigueur</span>
                  : x.date_effet > auj ? <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">À venir</span>
                  : <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500">Ancien</span>}</td>
                <td className="whitespace-nowrap text-right">
                  <button className="btn-ghost !py-1 text-xs" onClick={() => { setM({ ...x, textes: { ...(x.textes ?? {}) } }); setFichier(null); }}>Modifier</button>
                  <button className="btn-ghost !py-1 text-xs" title="Nouvelle version de ce modèle à partir d’une autre date" onClick={() => { setM({ ...x, id: "", textes: { ...(x.textes ?? {}) }, date_effet: auj, libelle: x.libelle ? `${x.libelle} (nouvelle version)` : "" }); setFichier(null); }}>Nouvelle version</button>
                  <button className="px-2 text-slate-400 hover:text-rouge-500" title="Supprimer" onClick={() => supprimer(x)}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {m && (
        <div className="space-y-4 rounded-xl border border-vert-500/30 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="font-semibold text-vert-900">{m.id ? "Modifier le modèle" : "Nouveau modèle"}</h4>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={m.actif} onChange={(e) => maj({ actif: e.target.checked })} /> Actif</label>
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            <div><label className="etiquette">Document</label>
              <select className="champ" value={m.document} onChange={(e) => maj({ document: e.target.value as any })}><option value="devis">Devis</option><option value="facture">Facture</option></select></div>
            <div><label className="etiquette">Type de client</label>
              <select className="champ" value={m.type_client} onChange={(e) => { const t = e.target.value as "BtoB" | "BtoC"; maj({ type_client: t, mise_en_page: miseEnPageDefaut(t) }); }}>
                <option value="BtoC">Particulier (BtoC)</option><option value="BtoB">Entreprise (BtoB)</option></select></div>
            <div><label className="etiquette">Opération</label>
              <input className="champ font-mono" list="fiches-modeles" value={m.fiche} onChange={(e) => maj({ fiche: e.target.value })} placeholder="BAR-TH-171 ou * (toutes)" />
              <datalist id="fiches-modeles"><option value="*">Toutes les opérations</option>{fiches.map((f) => <option key={f} value={f} />)}</datalist></div>
            <div><label className="etiquette">Date d’effet</label><input type="date" className="champ" value={m.date_effet} onChange={(e) => maj({ date_effet: e.target.value })} /></div>
            <div className="md:col-span-2"><label className="etiquette">Nom du modèle</label><input className="champ" value={m.libelle} onChange={(e) => maj({ libelle: e.target.value })} placeholder="ex. Devis PAC air/eau 2026" /></div>
            <div className="md:col-span-2"><label className="etiquette">Mise en page</label>
              <select className="champ" value={m.mise_en_page} onChange={(e) => maj({ mise_en_page: e.target.value })}>
                {mepDispo.map((x) => <option key={x.v} value={x.v}>{x.l}</option>)}
              </select></div>
            <div className="md:col-span-4"><label className="etiquette">Modèle fourni (PDF ou Word, pour mémoire)</label>
              <div className="flex flex-wrap items-center gap-3 text-sm">
                {m.fichier_reference && <a className="text-vert-700 underline" target="_blank" href={`/api/ndd/fichier?path=${encodeURIComponent(m.fichier_reference)}`}>Ouvrir le fichier actuel</a>}
                <input type="file" accept=".pdf,.doc,.docx,application/pdf" className="text-xs" onChange={(e) => setFichier(e.target.files?.[0] ?? null)} />
              </div>
              <p className="mt-1 text-xs text-slate-500">Une mise en page nouvelle (disposition différente) doit être ajoutée au programme : envoyez le modèle et choisissez ici la plus proche en attendant.</p>
            </div>
          </div>

          {textesDispo.length > 0 && (
            <div className="space-y-3">
              <div className="text-xs font-semibold uppercase text-slate-500">Textes propres à ce modèle (vide = texte habituel des Paramètres)</div>
              {textesDispo.map((t) => (
                <div key={t.cle}>
                  <label className="etiquette">{t.libelle}{t.aide && <span className="ml-1 font-normal normal-case text-slate-400">— {t.aide}</span>}</label>
                  {t.cle === "libelle_prime" || t.cle === "mode_paiement"
                    ? <input className="champ" value={m.textes?.[t.cle] ?? ""} onChange={(e) => maj({ textes: { ...m.textes, [t.cle]: e.target.value } })} />
                    : <textarea className="champ" rows={t.cle === "texte_cee" ? 5 : 3} value={m.textes?.[t.cle] ?? ""} onChange={(e) => maj({ textes: { ...m.textes, [t.cle]: e.target.value } })} />}
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button className="btn-vert" onClick={enregistrer}>Enregistrer le modèle</button>
            <button className="btn-ghost" onClick={() => setM(null)}>Annuler</button>
          </div>
        </div>
      )}
    </div>
  );
}
