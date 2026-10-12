"use client";
import { useEffect, useState } from "react";
import { useValidateurSelectionne } from "@/lib/useNomSelectionne";

/**
 * Pour Admin/Qualité : gère la sélection "Qui es-tu ?" (nom + PIN, liste des
 * validateurs) sur les pages partagées (Dashboard, Saisie, Qualité,
 * Statistiques, Export, Rapport). Paramètres n'utilise pas ce hook — l'accès
 * y est déjà filtré par rôle, pas besoin d'identifier la personne précise.
 */
export function useValidateurActif(profile, supabase) {
  const { nom, pret, selectionner, changerDePersonne } = useValidateurSelectionne();
  const [validateurs, setValidateurs] = useState([]);

  useEffect(() => {
    if (!profile) return;
    (async () => {
      const { data } = await supabase.from("parametres_validateurs").select("nom").eq("actif", true).order("nom");
      setValidateurs(data || []);
    })();
  }, [profile]);

  return { nom, pret, selectionner, changerDePersonne, validateurs };
}
