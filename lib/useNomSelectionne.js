"use client";
import { useEffect, useState, useCallback } from "react";

/**
 * Gère la sélection "Qui es-tu ?" pour un compte partagé (ingénieur, ou admin/qualité).
 * Le nom choisi (vérifié par PIN) est mémorisé sur cet appareil (localStorage),
 * pas lié au compte Supabase Auth qui reste unique/partagé.
 */
export function useNomSelectionne(storageKey) {
  const [nom, setNom] = useState(null);
  const [pret, setPret] = useState(false);

  useEffect(() => {
    const stocke = typeof window !== "undefined" ? window.localStorage.getItem(storageKey) : null;
    setNom(stocke || null);
    setPret(true);
  }, [storageKey]);

  const selectionner = useCallback(
    (nomChoisi) => {
      window.localStorage.setItem(storageKey, nomChoisi);
      setNom(nomChoisi);
    },
    [storageKey]
  );

  const changerDePersonne = useCallback(() => {
    window.localStorage.removeItem(storageKey);
    setNom(null);
  }, [storageKey]);

  return { nom, pret, selectionner, changerDePersonne };
}

export function useIngenieurSelectionne() {
  return useNomSelectionne("hillsolution_ingenieur_selectionne");
}

export function useValidateurSelectionne() {
  return useNomSelectionne("hillsolution_validateur_selectionne");
}
