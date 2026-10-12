"use client";
import { useEffect, useState } from "react";
import Icon from "@/components/ui/Icon";

const AUJOURD_HUI_ISO = new Date().toISOString().slice(0, 10);

export default function ObjectifJour({ supabase, operations }) {
  const [ouvert, setOuvert] = useState(false);
  const [objectifs, setObjectifs] = useState({}); // { [operation]: { objectif_nv_dossier, objectif_modif } }
  const [charge, setCharge] = useState(false);

  useEffect(() => {
    if (!ouvert) return;
    (async () => {
      const { data } = await supabase
        .from("objectifs_journaliers")
        .select("*")
        .eq("date", AUJOURD_HUI_ISO);
      const map = {};
      (data || []).forEach((o) => (map[o.operation] = o));
      setObjectifs(map);
      setCharge(true);
    })();
  }, [ouvert]);

  async function majObjectif(operation, champ, valeur) {
    const n = Number(valeur) || 0;
    setObjectifs((o) => ({
      ...o,
      [operation]: { ...(o[operation] || {}), [champ]: n },
    }));
    const actuel = objectifs[operation] || {};
    await supabase.from("objectifs_journaliers").upsert(
      {
        operation,
        date: AUJOURD_HUI_ISO,
        objectif_nv_dossier: champ === "objectif_nv_dossier" ? n : actuel.objectif_nv_dossier || 0,
        objectif_modif: champ === "objectif_modif" ? n : actuel.objectif_modif || 0,
      },
      { onConflict: "operation,date" }
    );
  }

  return (
    <div className="card mb-6">
      <button
        onClick={() => setOuvert(!ouvert)}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left"
        aria-expanded={ouvert}
      >
        <span className="flex items-center gap-3">
          <span className="w-9 h-9 rounded-lg bg-isoGreen-light text-isoGreen-dark flex items-center justify-center">
            <Icon name="target" size={18} />
          </span>
          <span>
            <span className="block font-semibold text-sm">Objectif du jour par opération</span>
            <span className="block text-xs text-ink/50">
              Optionnel · partagé par toute l'équipe — à remplir seulement les jours où tu veux répartir un volume précis.
            </span>
          </span>
        </span>
        <Icon name="chevronDown" size={18} className={`text-ink/40 transition-transform ${ouvert ? "rotate-180" : ""}`} />
      </button>

      {ouvert && charge && (
        <div className="border-t border-line overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th></th>
                {operations.map((op) => (
                  <th key={op} className="!text-center">{op}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                ["objectif_nv_dossier", "Nouveaux dossiers"],
                ["objectif_modif", "Modifications"],
              ].map(([champ, libelle]) => (
                <tr key={champ}>
                  <td className="text-xs font-medium text-ink/60 whitespace-nowrap">{libelle}</td>
                  {operations.map((op) => {
                    const obj = objectifs[op] || {};
                    return (
                      <td key={op} className="text-center">
                        <input
                          type="number"
                          min="0"
                          placeholder="—"
                          defaultValue={obj[champ] || ""}
                          onBlur={(e) => majObjectif(op, champ, e.target.value)}
                          className="input input-sm w-16 text-center mx-auto tabular"
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
