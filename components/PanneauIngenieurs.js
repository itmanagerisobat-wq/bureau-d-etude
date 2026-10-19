"use client";
import { useEffect, useState } from "react";
import Icon from "@/components/ui/Icon";
import { presence } from "@/lib/presence";
import { S } from "@/lib/constants";

const lc = (v) => String(v || "").trim().toLowerCase();

/**
 * Ingénieurs à côté de la file d'attente (page Saisie) : connecté ou non, libre ou occupé,
 * fiches habituelles et charge (une barre par dossier en cours / à faire, orange pour un retour).
 */
export default function PanneauIngenieurs({ supabase, options, dossiers, onToutVoir }) {
  const [pres, setPres] = useState({});

  useEffect(() => {
    let actif = true;
    async function charger() {
      const { data } = await supabase.rpc("fn_presence_ingenieurs");
      if (actif) setPres(Object.fromEntries((data || []).map((p) => [lc(p.ingenieur), p])));
    }
    charger();
    const id = setInterval(charger, 60000);
    return () => {
      actif = false;
      clearInterval(id);
    };
  }, [supabase]);

  const noms = options.ingenieursAssignables || options.ingenieurs || [];
  const lignes = noms.map((nom) => {
    const siens = dossiers.filter((d) => lc(d.ingenieur_modif || d.ingenieur) === lc(nom));
    const enCours = siens.find((d) => d.etat === S.EN_COURS) || null;
    const aFaire = siens.filter((d) => d.etat === S.ASSIGNE);
    const p = presence(pres[lc(nom)]);
    return {
      nom,
      enCours,
      barres: [...(enCours ? ["x"] : []), ...aFaire.map((d) => (d.a_corriger ? "r" : "x"))],
      connecte: p.cle !== "off",
      p,
      libre: !enCours && p.cle !== "off",
    };
  });
  const rang = (l) => (l.libre ? 0 : l.connecte ? 1 : 2);
  lignes.sort((a, b) => rang(a) - rang(b) || a.barres.length - b.barres.length || a.nom.localeCompare(b.nom));
  const connectes = lignes.filter((l) => l.connecte).length;

  return (
    <aside className="card overflow-hidden">
      <div className="px-4 pt-4 pb-2.5">
        <h3 className="text-[15px] font-bold flex items-center justify-between">
          Ingénieurs <span className="text-[13px] font-medium text-ink/45">{connectes} connecté(s)</span>
        </h3>
        <p className="text-xs text-ink/45 mt-1">Barres : dossiers en cours et à faire (orange : retours).</p>
      </div>
      <div className="max-h-[440px] overflow-y-auto">
        {lignes.map((l) => (
          <div key={l.nom} className="grid grid-cols-[auto_1fr_auto] gap-3 items-center px-4 py-2.5 border-t border-line">
            <span
              className="w-[9px] h-[9px] rounded-full"
              style={{ background: l.p.couleur, boxShadow: l.p.cle === "on" ? `0 0 0 3px ${l.p.couleur}22` : undefined }}
              title={l.p.libelle}
            />
            <div className="min-w-0">
              <p className={`font-semibold capitalize flex items-center gap-1.5 ${l.connecte ? "" : "text-ink/45"}`}>
                {l.nom}
                {l.libre && <span className="badge badge-green !text-[11px] !py-0">libre</span>}
              </p>
              <p className="text-xs text-ink/45 truncate">
                {l.enCours
                  ? `En cours : ${l.enCours.nom_dossier}`
                  : !l.connecte
                    ? l.p.libelle
                    : (options.habilitations?.[l.nom] || []).join(", ") || "Aucune fiche habituelle"}
              </p>
            </div>
            <div className="flex gap-[3px]" title={`${l.barres.length} dossier(s)`}>
              {l.barres.slice(0, 8).map((b, i) => (
                <i key={i} className={`block w-[7px] h-4 rounded-sm ${b === "r" ? "bg-isoGold" : "bg-brand-500"}`} />
              ))}
            </div>
          </div>
        ))}
        {lignes.length === 0 && <p className="px-4 py-6 text-sm text-ink/45 border-t border-line">Aucun ingénieur dans la liste.</p>}
      </div>
      {onToutVoir && (
        <button className="w-full px-4 py-2.5 border-t border-line text-[13px] font-semibold text-brand-600 hover:bg-paper flex items-center justify-center gap-1.5" onClick={onToutVoir}>
          <Icon name="users" size={14} />
          Détail et connexions
        </button>
      )}
    </aside>
  );
}
