"use client";
import { eur, fr, num } from "@/lib/format";
import type { LigneLibre } from "@/lib/types";
import { Bloc } from "./ui";

export const TAUX_TVA = [0.2, 0.1, 0.055, 0];
export const LIGNE_PRODUIT_VIDE: LigneLibre = { ordre: 0, designation: "", detail: "", quantite: 1, unite: "U", pu_ht: null, tva: 0.2 };

/** Lignes produits / prestations (désignation, quantité, PU HT, TVA) */
export function LignesProduits({ lignes, setLignes, prime, tvaDefaut, btoc }: {
  lignes: LigneLibre[]; setLignes: (l: LigneLibre[]) => void; prime: number; tvaDefaut: number; btoc: boolean;
}) {
  const maj = (i: number, o: Partial<LigneLibre>) => setLignes(lignes.map((x, j) => (j === i ? { ...x, ...o } : x)));
  const ttcAutres = (i: number) => lignes.reduce((s, l, j) => (j === i ? s : s + (num(l.quantite) ?? 0) * (num(l.pu_ht) ?? 0) * (1 + (num(l.tva) ?? 0))), 0);

  return (
    <Bloc titre={btoc ? "Produits et prestations" : "Lignes produits / prestations"} sous="Prix unitaires hors taxes ; TVA par ligne"
      action={
        <div className="flex flex-wrap gap-2">
          {prime > 0 && lignes.length > 0 && (
            <button type="button" className="btn-or !py-1 text-xs" title="Calcule le prix HT de la 1re ligne pour que le reste à payer soit de 0 €"
              onClick={() => {
                const l = lignes[0], q = num(l.quantite) || 1, t = num(l.tva) ?? 0;
                const pu = Math.round(((prime - ttcAutres(0)) / (1 + t) / q) * 100) / 100;
                maj(0, { pu_ht: Math.max(0, pu) });
              }}>Ajuster pour reste à payer 0 €</button>
          )}
          <button type="button" className="btn-ghost !py-1 text-xs" onClick={() => setLignes([...lignes, { ...LIGNE_PRODUIT_VIDE, tva: tvaDefaut, ordre: lignes.length }])}>+ Ajouter une ligne</button>
        </div>
      }>
      {!lignes.length && <p className="rounded-lg bg-slate-50 p-4 text-center text-sm text-slate-500">Aucune ligne produit.</p>}
      <div className="space-y-3">
        {lignes.map((l, i) => {
          const ht = (num(l.quantite) ?? 0) * (num(l.pu_ht) ?? 0);
          return (
            <div key={i} className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 p-3 md:grid-cols-12">
              <div className="col-span-2 md:col-span-4">
                <label className="etiquette">Désignation</label>
                <textarea className="champ font-medium" rows={2} value={l.designation ?? ""} onChange={(e) => maj(i, { designation: e.target.value })} placeholder="ex. FORFAIT POSE ET MISE EN SERVICE D'UNE POMPE A CHALEUR AIR EAU" />
                {btoc && <input className="champ mt-1 text-xs font-semibold" value={l.nom ?? ""} onChange={(e) => maj(i, { nom: e.target.value })} placeholder="Nom du produit sur la ligne des prix (facultatif), ex. PAC Mont-blanc R290" />}
                <input className="champ mt-1 text-xs" value={l.detail ?? ""} onChange={(e) => maj(i, { detail: e.target.value })} placeholder="Détail (facultatif), ex. POMPE À CHALEUR AIR-EAU, TRIPHASE" />
              </div>
              <div><label className="etiquette">Qté</label><input className="champ text-right" inputMode="decimal" value={l.quantite ?? ""} onChange={(e) => maj(i, { quantite: e.target.value as any })} /></div>
              <div><label className="etiquette">Unité</label><input className="champ" value={l.unite ?? ""} onChange={(e) => maj(i, { unite: e.target.value })} /></div>
              <div className="md:col-span-2"><label className="etiquette">P.U HT (€)</label><input className="champ text-right" inputMode="decimal" value={l.pu_ht ?? ""} onChange={(e) => maj(i, { pu_ht: e.target.value as any })} /></div>
              <div className="md:col-span-2"><label className="etiquette">TVA</label>
                <select className="champ" value={String(num(l.tva) ?? 0.2)} onChange={(e) => maj(i, { tva: Number(e.target.value) })}>
                  {TAUX_TVA.map((t) => <option key={t} value={t}>{fr(t * 100, t === 0.055 ? 1 : 0)} %</option>)}
                </select>
              </div>
              <div className="md:col-span-2"><label className="etiquette">Total HT</label>
                <div className="flex items-center gap-2"><div className="champ-calc min-w-0 flex-1 text-right tabular-nums">{eur(ht)}</div>
                  <button type="button" className="text-slate-400 hover:text-rouge-500" title="Supprimer" onClick={() => setLignes(lignes.filter((_, j) => j !== i))}>✕</button></div>
              </div>
            </div>
          );
        })}
      </div>
    </Bloc>
  );
}
