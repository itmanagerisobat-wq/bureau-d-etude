"use client";
import { useEffect, useState } from "react";
import Icon from "@/components/ui/Icon";

/** Admin : suppression des dossiers (tous, ou avant une date), avec sauvegarde automatique juste avant. */
export default function SuppressionDonnees({ supabase }) {
  const [mode, setMode] = useState("avant");
  const [date, setDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 12);
    return d.toISOString().slice(0, 10);
  });
  const [nombre, setNombre] = useState(null);
  const [confirmation, setConfirmation] = useState("");
  const [etat, setEtat] = useState(null); // null | "envoi" | { ok, texte }

  useEffect(() => {
    (async () => {
      setNombre(null);
      let q = supabase.from("dossiers").select("*", { count: "exact", head: true });
      if (mode === "avant") q = q.lt("date", date);
      const { count } = await q;
      setNombre(count ?? 0);
    })();
  }, [mode, date, etat]);

  async function supprimer() {
    setEtat("envoi");
    try {
      // 1. Pièces jointes des dossiers concernés (stockage), par lots
      const ids = [];
      for (let page = 0; ; page++) {
        let q = supabase.from("dossiers").select("id").order("id").range(page * 1000, page * 1000 + 999);
        if (mode === "avant") q = q.lt("date", date);
        const { data, error } = await q;
        if (error) throw new Error(error.message);
        ids.push(...(data || []).map((d) => d.id));
        if (!data || data.length < 1000) break;
      }
      let fichiers = 0;
      for (let i = 0; i < ids.length; i += 200) {
        const { data: fs } = await supabase.from("dossier_fichiers").select("chemin").in("dossier_id", ids.slice(i, i + 200));
        if (fs?.length) {
          const { error } = await supabase.storage.from("dossiers-fichiers").remove(fs.map((f) => f.chemin));
          if (!error) fichiers += fs.length;
        }
      }
      // 2. Sauvegarde + suppression des dossiers, côté base (fonction réservée à l'admin)
      const { data, error } = await supabase.rpc("fn_supprimer_dossiers", { p_avant: mode === "avant" ? date : null });
      if (error) {
        throw new Error(
          /fn_supprimer_dossiers|function/i.test(error.message)
            ? "Fonction de suppression introuvable : exécute supabase/migration_workflow_v13.sql dans Supabase."
            : error.message
        );
      }
      setConfirmation("");
      setEtat({
        ok: true,
        texte: `${data?.supprimes ?? 0} dossier(s) supprimé(s), ${fichiers} pièce(s) jointe(s) effacée(s). Une sauvegarde a été faite avant (onglet Sauvegardes).`,
      });
    } catch (e) {
      setEtat({ ok: false, texte: e.message });
    }
  }

  return (
    <div className="flex flex-col gap-4 max-w-2xl">
      <div className="alert alert-red">
        <Icon name="alert" size={16} className="mt-0.5" />
        <span>
          <strong>Action irréversible.</strong> Les dossiers choisis sont effacés avec leur historique, leurs retours, leurs
          commentaires et leurs pièces jointes. Les paramètres (ingénieurs, fiches, clients, comptes…) sont conservés. Une sauvegarde
          des dossiers supprimés est faite automatiquement juste avant.
        </span>
      </div>

      <div className="card p-5 flex flex-col gap-4">
        <div className="segmented w-fit">
          <button data-active={mode === "avant"} onClick={() => setMode("avant")}>
            Dossiers avant une date
          </button>
          <button data-active={mode === "tout"} onClick={() => setMode("tout")}>
            Tous les dossiers
          </button>
        </div>

        {mode === "avant" && (
          <div className="field max-w-xs">
            <label className="label">Supprimer les dossiers datés avant le</label>
            <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        )}

        <p className="text-sm">
          Dossiers concernés : <strong className="tabular">{nombre === null ? "…" : nombre}</strong>
        </p>

        <div className="field max-w-xs">
          <label className="label">Pour confirmer, tape SUPPRIMER</label>
          <input className="input" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} placeholder="SUPPRIMER" />
        </div>

        <div>
          <button
            className="btn-danger"
            onClick={supprimer}
            disabled={confirmation !== "SUPPRIMER" || !nombre || etat === "envoi"}
          >
            <Icon name="x" size={15} />
            {etat === "envoi" ? "Suppression…" : `Supprimer ${nombre || 0} dossier(s)`}
          </button>
        </div>

        {etat && etat !== "envoi" && (
          <div className={`alert ${etat.ok ? "alert-green" : "alert-red"}`}>
            <Icon name={etat.ok ? "checkCircle" : "alert"} size={16} className="mt-0.5" />
            <span>{etat.texte}</span>
          </div>
        )}
      </div>
    </div>
  );
}
