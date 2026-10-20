"use client";
import { useEffect, useRef, useState } from "react";
import { aujourdhuiISO, jourCourt } from "@/lib/periode";

const JOURS = ["lun", "mar", "mer", "jeu", "ven", "sam", "dim"];
const MOIS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

/** Petit calendrier : choisir un jour puis « Afficher ce jour ». */
function Calendrier({ jour, onChoisir, onFermer }) {
  const initial = jour || aujourdhuiISO();
  const [vue, setVue] = useState(() => ({ a: Number(initial.slice(0, 4)), m: Number(initial.slice(5, 7)) - 1 }));
  const [sel, setSel] = useState(initial);
  const ref = useRef(null);
  const auj = aujourdhuiISO();

  useEffect(() => {
    const clic = (e) => ref.current && !ref.current.contains(e.target) && onFermer();
    const touche = (e) => e.key === "Escape" && onFermer();
    document.addEventListener("mousedown", clic);
    document.addEventListener("keydown", touche);
    ref.current?.querySelector("[data-sel='true']")?.focus();
    return () => {
      document.removeEventListener("mousedown", clic);
      document.removeEventListener("keydown", touche);
    };
  }, []);

  const decalage = (new Date(vue.a, vue.m, 1).getDay() + 6) % 7; // lundi en premier
  const nb = new Date(vue.a, vue.m + 1, 0).getDate();
  const iso = (j) => `${vue.a}-${String(vue.m + 1).padStart(2, "0")}-${String(j).padStart(2, "0")}`;
  const changerMois = (d) => setVue(({ a, m }) => ({ a: m + d < 0 ? a - 1 : m + d > 11 ? a + 1 : a, m: (m + d + 12) % 12 }));
  const libelleSel = new Date(`${sel}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div ref={ref} role="dialog" aria-label="Choisir un jour" className="calendrier-pop">
      <div className="flex items-center justify-between">
        <button type="button" className="cal-nav" onClick={() => changerMois(-1)} aria-label="Mois précédent">
          ‹
        </button>
        <b className="font-semibold text-ink">
          {MOIS[vue.m]} {vue.a}
        </b>
        <button type="button" className="cal-nav" onClick={() => changerMois(1)} aria-label="Mois suivant">
          ›
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center mt-3">
        {JOURS.map((j) => (
          <span key={j} className="text-xs text-ink/45 font-medium py-1">
            {j}
          </span>
        ))}
        {Array.from({ length: decalage }, (_, i) => (
          <span key={`v${i}`} />
        ))}
        {Array.from({ length: nb }, (_, i) => {
          const j = iso(i + 1);
          const we = (decalage + i) % 7 >= 5;
          const choisi = j === sel;
          return (
            <button
              type="button"
              key={j}
              data-sel={choisi}
              onClick={() => setSel(j)}
              onDoubleClick={() => onChoisir(j)}
              disabled={j > auj}
              aria-pressed={choisi}
              className={`h-9 rounded-lg text-sm tabular transition-colors ${
                choisi ? "bg-brand-500 text-white font-semibold" : j === auj ? "ring-1 ring-inset ring-brand-500 text-brand-600" : we ? "text-ink/40 hover:bg-paper" : "text-ink hover:bg-paper"
              } disabled:opacity-30 disabled:hover:bg-transparent`}
            >
              {i + 1}
            </button>
          );
        })}
      </div>
      <span className="block text-xs text-ink/55 mt-3">Jour choisi : {libelleSel}</span>
      <div className="flex justify-end gap-2 mt-2">
        <span className="flex gap-2">
          <button type="button" className="btn-secondary btn-sm" onClick={onFermer}>
            Annuler
          </button>
          <button type="button" className="btn-primary btn-sm" onClick={() => onChoisir(sel)}>
            Afficher ce jour
          </button>
        </span>
      </div>
    </div>
  );
}

/**
 * Filtre de période : Aujourd'hui / Jour / Mois / Année.
 * « Jour » ouvre un calendrier pour choisir la date souhaitée.
 * valeur = { type: "aujourdhui" | "jour" | "mois" | "annee", jour: "AAAA-MM-JJ" }
 */
export default function FiltrePeriode({ valeur, onChange, grand = false, className = "" }) {
  const [ouvert, setOuvert] = useState(false);
  const types = [
    ["aujourdhui", "Aujourd'hui"],
    ["jour", valeur.type === "jour" && valeur.jour ? `Jour : ${jourCourt(valeur.jour)}` : "Jour"],
    ["mois", "Mois"],
    ["annee", "Année"],
  ];
  return (
    <div className={`relative ${className}`}>
      <div className={`segmented ${grand ? "segmented-lg" : ""}`} role="group" aria-label="Période">
        {types.map(([t, l]) => (
          <button
            type="button"
            key={t}
            data-active={valeur.type === t || (t === "jour" && ouvert)}
            aria-haspopup={t === "jour" ? "dialog" : undefined}
            aria-expanded={t === "jour" ? ouvert : undefined}
            onClick={() => (t === "jour" ? setOuvert((o) => !o) : (setOuvert(false), onChange({ type: t, jour: valeur.jour })))}
          >
            {l}
            {t === "jour" && <span aria-hidden="true">▾</span>}
          </button>
        ))}
      </div>
      {ouvert && (
        <Calendrier
          jour={valeur.jour}
          onFermer={() => setOuvert(false)}
          onChoisir={(j) => {
            setOuvert(false);
            onChange({ type: j === aujourdhuiISO() ? "aujourdhui" : "jour", jour: j });
          }}
        />
      )}
    </div>
  );
}

/** Choix d'une fiche CEE en boutons (Toutes les fiches + chaque opération). */
export function FiltreFiche({ operations, valeur, onChange, grand = false }) {
  return (
    <div className={`segmented flex-wrap ${grand ? "segmented-lg" : ""}`} role="group" aria-label="Fiche CEE">
      {["Tous", ...operations].map((o) => (
        <button type="button" key={o} data-active={valeur === o} onClick={() => onChange(o)}>
          {o === "Tous" ? "Toutes les fiches" : o}
        </button>
      ))}
    </div>
  );
}
