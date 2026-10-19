"use client";
// Paramètres › Cadre de contribution : logos des délégataires et cachet « Signature Partenaire ».
import { useState } from "react";
import { useRouter } from "next/navigation";
import { slug } from "@/lib/format";

export function ParamsCadre({ delegataires, fichiers }: { delegataires: string[]; fichiers: string[] }) {
  const router = useRouter();
  const [etat, setEtat] = useState<{ ok: boolean; t: string } | null>(null);
  const fichier = (base: string) => fichiers.find((f) => f === `${base}.png` || f === `${base}.jpg`);

  async function envoyer(type: string, f: File | null, delegataire?: string) {
    let j;
    if (f) {
      const fd = new FormData();
      fd.append("type", type); fd.append("fichier", f);
      if (delegataire) fd.append("delegataire", delegataire);
      j = await fetch("/api/ndd/fichier", { method: "POST", body: fd }).then((r) => r.json());
    } else j = await fetch(`/api/ndd/fichier?type=${type}${delegataire ? `&delegataire=${encodeURIComponent(delegataire)}` : ""}`, { method: "DELETE" }).then((r) => r.json());
    setEtat(j.ok ? { ok: true, t: f ? "Image enregistrée." : "Image retirée (retour à celle du modèle)." } : { ok: false, t: j.message });
    router.refresh();
  }

  const ligne = (titre: string, aide: string, nomFichier: string | undefined, defaut: string, type: string, delegataire?: string) => (
    <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 py-3">
      <div className="min-w-[220px] flex-1">
        <div className="font-medium">{titre}</div>
        <div className="text-xs text-slate-500">{aide}</div>
      </div>
      <div className="text-sm">
        {nomFichier
          ? <a className="text-vert-700 underline" target="_blank" href={`/api/ndd/fichier?path=${encodeURIComponent("ressources/" + nomFichier)}`}>Image importée</a>
          : <span className="text-slate-500">{defaut}</span>}
      </div>
      <input type="file" accept="image/png,image/jpeg" className="text-xs" onChange={(e) => e.target.files?.[0] && envoyer(type, e.target.files[0], delegataire)} />
      {nomFichier && <button className="btn-ghost !py-1 text-xs" onClick={() => envoyer(type, null, delegataire)}>Retirer</button>}
    </div>
  );

  return (
    <div className="space-y-2">
      {etat && <div className={`rounded-lg px-3 py-2 text-sm ${etat.ok ? "bg-vert-50 text-vert-700" : "bg-rouge-50 text-rouge-600"}`}>{etat.t}</div>}
      <h3 className="text-sm font-semibold text-vert-900">Images du cadre de contribution</h3>
      <p className="text-xs text-slate-500">
        Le logo « Les certificats d’économies d’énergie », le logo ISO BAT et la pastille 0 808 800 700 viennent du modèle.
        Le logo du délégataire est celui du dossier ; site, téléphone et médiateur se règlent dans l’onglet Délégataires.
      </p>
      {ligne("Cachet et signature ISO BAT", "Case « Signature Partenaire » (page 2)", fichier("cadre-cachet"), "Cachet du modèle", "cadre-cachet")}
      {delegataires.map((n) => ligne(`Logo ${n}`, "En haut de la page 1, à côté du logo CEE",
        fichier(`deleg-${slug(n.toUpperCase())}`), n.toUpperCase() === "PREMIUM ENERGY" ? "Logo du modèle" : "Aucun : le nom sera écrit", "deleg-logo", n))}
    </div>
  );
}
