"use client";
// Liste des PDF générés (en cours + versions archivées) avec le détail de chaque version et la suppression.
import { useState } from "react";
import { useRouter } from "next/navigation";

export type DocListe = { id: string; type?: string; numero: string; fichier: string; archive: boolean; created_at: string; detail?: string | null };

const BADGES: Record<string, [string, string]> = {
  devis: ["devis", "bg-vert-50 text-vert-700"], facture: ["facture", "bg-or-100 text-or-600"],
  ndd: ["NDD", "bg-sky-50 text-sky-700"], cadre: ["cadre CEE", "bg-hill-50 text-hill-700"],
};
const quand = (s: string) => new Date(s).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });

export function ListeDocuments({ titre = "Documents", documents, role, badges = true }: { titre?: string; documents: DocListe[]; role: string; badges?: boolean }) {
  const router = useRouter();
  const [liste, setListe] = useState(documents);
  const [err, setErr] = useState<string | null>(null);
  const actifs = liste.filter((x) => !x.archive), archives = liste.filter((x) => x.archive);

  async function supprimer(x: DocListe) {
    if (!confirm(`Supprimer définitivement « ${x.fichier} » ?${x.archive ? "" : "\n\nC’est le PDF en cours : il faudra le régénérer."}`)) return;
    const j = await fetch(`/api/documents/${x.id}`, { method: "DELETE" }).then((r) => r.json()).catch(() => ({ ok: false, message: "Erreur réseau" }));
    if (!j.ok) { setErr(j.message); return; }
    setListe((l) => l.filter((y) => y.id !== x.id)); setErr(null);
    router.refresh();
  }
  async function viderArchives() {
    if (!confirm(`Supprimer définitivement les ${archives.length} version(s) archivée(s) ?`)) return;
    for (const x of archives) await fetch(`/api/documents/${x.id}`, { method: "DELETE" });
    setListe((l) => l.filter((y) => !y.archive));
    router.refresh();
  }
  if (!liste.length) return null;

  const ligne = (x: DocListe, archive: boolean) => (
    <li key={x.id} className="group flex items-start gap-2">
      <a className={`min-w-0 flex-1 ${archive ? "text-slate-500" : "text-vert-700"} hover:underline`} href={`/api/documents/${x.id}`} target="_blank">
        <span className="flex items-center gap-2">
          {badges && x.type && BADGES[x.type] && <span className={`badge ${BADGES[x.type][1]}`}>{BADGES[x.type][0]}</span>}
          <span className="truncate">{archive ? `${quand(x.created_at)} — ${x.fichier}` : x.fichier}</span>
        </span>
        {x.detail && <span className="block text-[11px] leading-snug text-slate-500">{x.detail}</span>}
      </a>
      {(archive || role === "admin") && (
        <button type="button" title={archive ? "Supprimer cette version archivée" : "Supprimer ce PDF (administrateur)"} onClick={() => supprimer(x)}
          className="px-1 text-slate-300 hover:text-rouge-600">✕</button>
      )}
    </li>
  );

  return (
    <div className="carte p-4">
      <h3 className="mb-2 text-sm font-semibold text-vert-900">{titre}</h3>
      {err && <p className="mb-2 rounded bg-rouge-50 px-2 py-1 text-xs text-rouge-600">{err}</p>}
      <ul className="space-y-1.5 text-sm">{actifs.map((x) => ligne(x, false))}</ul>
      {!!archives.length && (
        <details className="mt-2 text-xs">
          <summary className="cursor-pointer text-slate-500">Versions archivées ({archives.length})</summary>
          <ul className="mt-1 space-y-1">{archives.map((x) => ligne(x, true))}</ul>
          <button type="button" className="mt-2 text-rouge-600 underline" onClick={viderArchives}>Supprimer toutes les versions archivées</button>
        </details>
      )}
    </div>
  );
}
