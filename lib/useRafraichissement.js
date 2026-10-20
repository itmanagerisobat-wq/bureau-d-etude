"use client";
import { useEffect, useRef } from "react";

/**
 * Filet de sécurité : relance `charger` toutes les 30 s (onglet visible seulement)
 * et dès qu'on revient sur l'onglet, pour que les compteurs se mettent à jour sans actualiser la page.
 */
export function useRafraichissement(charger, actif = true, intervalle = 30000) {
  const ref = useRef(charger);
  ref.current = charger;
  useEffect(() => {
    if (!actif) return;
    const relancer = () => {
      if (document.visibilityState === "visible") ref.current?.();
    };
    const id = setInterval(relancer, intervalle);
    document.addEventListener("visibilitychange", relancer);
    window.addEventListener("focus", relancer);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", relancer);
      window.removeEventListener("focus", relancer);
    };
  }, [actif, intervalle]);
}
