"use client";
import { useEffect } from "react";
import Icon from "@/components/ui/Icon";

/** Fenêtre modale commune : fond flouté, fermeture Échap / clic extérieur. */
export default function Modal({ titre, sousTitre, onFermer, children, taille = "md", pied }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onFermer?.();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onFermer]);

  const largeur = { sm: "max-w-md", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-3xl" }[taille];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/40 backdrop-blur-[2px] p-0 sm:p-6 animate-fade-in"
      onClick={onFermer}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={`bg-white w-full ${largeur} rounded-t-2xl sm:rounded-2xl shadow-pop max-h-[92vh] flex flex-col animate-slide-up`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-4 border-b border-line">
          <div className="min-w-0">
            <h3 className="font-display font-bold text-lg leading-tight truncate">{titre}</h3>
            {sousTitre && <p className="text-sm text-ink/50 mt-0.5">{sousTitre}</p>}
          </div>
          <button onClick={onFermer} className="btn-icon -mr-2 -mt-1" aria-label="Fermer">
            <Icon name="x" size={18} />
          </button>
        </div>
        <div className="px-6 py-5 overflow-y-auto">{children}</div>
        {pied && <div className="px-6 py-4 border-t border-line bg-paper/60 rounded-b-2xl">{pied}</div>}
      </div>
    </div>
  );
}
