"use client";
import { useEffect, useRef, useState } from "react";
import Icon from "@/components/ui/Icon";

/**
 * En-tête de colonne avec filtre « façon Excel » : un entonnoir ouvre une liste de valeurs à cocher.
 * `selection` = null (aucun filtre) ou un Set des valeurs gardées.
 */
export default function FiltreColonne({ libelle, valeurs, selection, onChange, alignDroite = false }) {
  const [ouvert, setOuvert] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const refBouton = useRef(null);
  const [recherche, setRecherche] = useState("");
  const ref = useRef(null);
  const actif = selection !== null && selection !== undefined;

  useEffect(() => {
    if (!ouvert) return;
    const fermer = (e) => ref.current && !ref.current.contains(e.target) && setOuvert(false);
    // La liste suit le bouton quand la page ou le tableau défile
    const suivre = () => placer();
    document.addEventListener("mousedown", fermer);
    window.addEventListener("scroll", suivre, true);
    window.addEventListener("resize", suivre);
    return () => {
      document.removeEventListener("mousedown", fermer);
      window.removeEventListener("scroll", suivre, true);
      window.removeEventListener("resize", suivre);
    };
  }, [ouvert]);

  function placer() {
    if (!refBouton.current) return;
    const r = refBouton.current.getBoundingClientRect();
    const left = alignDroite ? Math.max(8, r.right - 240) : Math.min(r.left, window.innerWidth - 248);
    // Pas assez de place en dessous : la liste s'ouvre au-dessus du bouton
    if (window.innerHeight - r.bottom < 360 && r.top > 360) setPos({ bottom: window.innerHeight - r.top + 6, left });
    else setPos({ top: r.bottom + 6, left });
  }

  // valeurs : [{ valeur, total }]
  const visibles = valeurs.filter((v) => !recherche || String(v.valeur).toLowerCase().includes(recherche.toLowerCase()));
  const coche = (v) => !actif || selection.has(v);

  function basculer(v) {
    const base = actif ? new Set(selection) : new Set(valeurs.map((x) => x.valeur));
    base.has(v) ? base.delete(v) : base.add(v);
    onChange(base.size === valeurs.length ? null : base);
  }

  return (
    <div className="relative inline-flex items-center gap-1" ref={ref}>
      <span>{libelle}</span>
      <button
        type="button"
        ref={refBouton}
        onClick={(e) => {
          e.stopPropagation();
          // Position fixe : la liste n'est pas coupée par le défilement du tableau
          placer();
          setOuvert((o) => !o);
        }}
        className={`w-6 h-6 rounded-md inline-flex items-center justify-center transition-colors ${
          actif ? "bg-brand-600 text-white" : "text-ink/35 hover:bg-ink/5 hover:text-ink/70"
        }`}
        aria-label={`Filtrer la colonne ${libelle}`}
        aria-expanded={ouvert}
      >
        <Icon name="filter" size={12} />
      </button>
      {ouvert && (
        <div
          className="fixed z-50 w-60 bg-white rounded-xl border border-line shadow-pop p-2 normal-case tracking-normal font-normal text-ink text-left animate-slide-up"
          style={pos}
          onClick={(e) => e.stopPropagation()}
        >
          <input
            autoFocus
            className="input input-sm mb-2"
            placeholder="Rechercher…"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
          />
          <div className="flex items-center justify-between px-1 mb-1 text-xs">
            <button className="text-brand-600 hover:underline" onClick={() => onChange(null)}>
              Tout sélectionner
            </button>
            <button className="text-ink/50 hover:underline" onClick={() => onChange(new Set())}>
              Tout désélectionner
            </button>
          </div>
          <ul className="max-h-60 overflow-y-auto">
            {visibles.map(({ valeur, total }) => (
              <li key={valeur}>
                <label className="flex items-center gap-2 px-1.5 py-1.5 rounded-md hover:bg-paper cursor-pointer text-sm">
                  <input type="checkbox" className="w-4 h-4 accent-[#1F6FA8]" checked={coche(valeur)} onChange={() => basculer(valeur)} />
                  <span className="flex-1 truncate">{valeur}</span>
                  <span className="text-xs text-ink/40 tabular">{total}</span>
                </label>
              </li>
            ))}
            {visibles.length === 0 && <li className="px-2 py-2 text-xs text-ink/45">Aucune valeur.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Valeurs distinctes d'une colonne, avec leur nombre, triées. */
export function valeursColonne(lignes, cle) {
  const m = new Map();
  for (const l of lignes) {
    const v = cle(l) || "—";
    m.set(v, (m.get(v) || 0) + 1);
  }
  return [...m.entries()].map(([valeur, total]) => ({ valeur, total })).sort((a, b) => String(a.valeur).localeCompare(String(b.valeur)));
}
