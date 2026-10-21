"use client";
import { useEffect, useRef } from "react";

/** Événement interne : une page a rechargé ou modifié des dossiers (la barre de menu se met à jour). */
export const EVT_DOSSIERS = "hs:dossiers-maj";
export function signalerMajDossiers() {
  try {
    window.dispatchEvent(new Event(EVT_DOSSIERS));
  } catch {}
}

/**
 * Mise à jour en direct : dès qu'un dossier change dans Supabase (Realtime), `charger` est relancé
 * (regroupé sur 1 s). Nécessite la migration V32 (tables publiées pour Realtime) ; sans elle,
 * le rafraîchissement toutes les 20-30 s reste le filet de sécurité.
 */
export function useTempsReel(supabase, tables, charger, actif = true) {
  const ref = useRef(charger);
  ref.current = charger;
  const cle = tables.join(",");
  useEffect(() => {
    if (!actif || !supabase?.channel) return;
    let minuterie;
    let canal;
    try {
      canal = supabase.channel(`direct-${cle}-${Math.random().toString(36).slice(2, 8)}`);
      for (const table of tables) {
        canal.on("postgres_changes", { event: "*", schema: "public", table }, () => {
          clearTimeout(minuterie);
          minuterie = setTimeout(() => ref.current?.(), 1000);
        });
      }
      canal.subscribe();
    } catch {
      canal = null;
    }
    return () => {
      clearTimeout(minuterie);
      try {
        if (canal) supabase.removeChannel(canal);
      } catch {}
    };
  }, [actif, cle]);
}
