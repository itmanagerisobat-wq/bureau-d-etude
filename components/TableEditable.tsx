"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { couleurModele } from "@/lib/ndd/couleurs";

export interface Colonne {
  cle: string;
  libelle: string;
  type?: "text" | "number" | "date" | "select" | "bool" | "textarea" | "couleur";
  options?: string[];
  largeur?: string;
}

/** Tableau de paramètres modifiable (enregistrement direct dans Supabase, droits « administrateur » requis). */
export function TableEditable({
  table, colonnes, lignes, cleConflit, vide, aide,
}: { table: string; colonnes: Colonne[]; lignes: any[]; cleConflit: string; vide: Record<string, any>; aide?: string }) {
  const sb = useMemo(() => createClient(), []);
  const router = useRouter();
  const [rows, setRows] = useState<any[]>(lignes);
  const [suppr, setSuppr] = useState<any[]>([]);
  const [etat, setEtat] = useState<{ ok: boolean; t: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [modif, setModif] = useState(false);

  const set = (i: number, k: string, v: any) => { setRows((r) => r.map((x, j) => (j === i ? { ...x, [k]: v } : x))); setModif(true); };

  async function save() {
    setBusy(true); setEtat(null);
    try {
      for (const s of suppr) {
        const q = s.id ? sb.from(table).delete().eq("id", s.id) : sb.from(table).delete().eq(cleConflit, s[cleConflit]);
        const { error } = await q; if (error) throw error;
      }
      const propres = rows.map((r) => {
        const o: any = { ...r };
        for (const c of colonnes) {
          if (c.type === "number") o[c.cle] = o[c.cle] === "" || o[c.cle] === null || o[c.cle] === undefined ? null : Number(String(o[c.cle]).replace(",", "."));
          if (c.type === "date" && !o[c.cle]) o[c.cle] = null;
        }
        if (!o.id) delete o.id;
        return o;
      });
      // lignes existantes : mise à jour par id (permet de renommer) ; nouvelles : insertion
      const avecId = propres.filter((r) => r.id), sansId = propres.filter((r) => !r.id);
      for (const r of avecId) {
        const { error } = await sb.from(table).update(r).eq("id", r.id);
        if (error) throw error;
      }
      if (sansId.length) {
        const { error } = await sb.from(table).upsert(sansId, { onConflict: cleConflit });
        if (error) throw error;
      }
      setSuppr([]); setModif(false);
      setEtat({ ok: true, t: "Enregistré." });
      router.refresh();
    } catch (e: any) {
      setEtat({ ok: false, t: e.message ?? String(e) });
    }
    setBusy(false);
  }

  return (
    <div>
      {aide && <p className="mb-3 text-xs text-slate-500">{aide}</p>}
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full">
          <thead><tr>{colonnes.map((c) => <th key={c.cle} className="th" style={{ width: c.largeur }}>{c.libelle}</th>)}<th className="th w-10" /></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id ?? `n${i}`}>
                {colonnes.map((c) => (
                  <td key={c.cle} className="border-b border-slate-100 p-1">
                    {c.type === "select" ? (
                      <select className="champ !py-1" value={r[c.cle] ?? ""} onChange={(e) => set(i, c.cle, e.target.value)}>
                        {c.options!.map((o) => <option key={o}>{o}</option>)}
                      </select>
                    ) : c.type === "bool" ? (
                      <input type="checkbox" className="h-4 w-4 accent-vert-500" checked={r[c.cle] !== false} onChange={(e) => set(i, c.cle, e.target.checked)} />
                    ) : c.type === "couleur" ? (
                      <div className="flex items-center gap-1">
                        <input type="color" className="h-7 w-9 cursor-pointer rounded border border-slate-200" value={/^#[0-9a-f]{6}$/i.test(r[c.cle] ?? "") ? r[c.cle] : couleurModele(null, r.reference ?? "").toLowerCase()} onChange={(e) => set(i, c.cle, e.target.value)} />
                        <input className="champ !py-1 font-mono text-xs" placeholder="auto" value={r[c.cle] ?? ""} onChange={(e) => set(i, c.cle, e.target.value)} />
                      </div>
                    ) : c.type === "textarea" ? (
                      <textarea className="champ !py-1 text-xs" rows={2} value={r[c.cle] ?? ""} onChange={(e) => set(i, c.cle, e.target.value)} />
                    ) : (
                      <input className={`champ !py-1 ${c.type === "number" ? "text-right" : ""}`} type={c.type === "date" ? "date" : "text"}
                        value={r[c.cle] ?? ""} onChange={(e) => set(i, c.cle, e.target.value)} />
                    )}
                  </td>
                ))}
                <td className="border-b border-slate-100 p-1 text-center">
                  <button title="Supprimer" className="text-slate-400 hover:text-rouge-500" onClick={() => { setSuppr((s) => [...s, r]); setRows((x) => x.filter((_, j) => j !== i)); setModif(true); }}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button className="btn-ghost" onClick={() => { setRows((r) => [...r, { ...vide }]); setModif(true); }}>+ Ajouter</button>
        <button className="btn-vert" onClick={save} disabled={busy || !modif}>{busy ? "Enregistrement…" : "Enregistrer"}</button>
        {etat && <span className={`text-sm ${etat.ok ? "text-vert-600" : "text-rouge-500"}`}>{etat.t}</span>}
      </div>
    </div>
  );
}
