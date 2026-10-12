"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";
import { MOIS } from "@/lib/constants";
import { definirCouleurs, definirLibelles, definirStatutsPerso } from "@/lib/couleurs";

/** Statuts (couleur + nom affiché). Sans la V12 la colonne libelle_affiche n'existe pas : on se replie. */
async function chargerEtats(supabase) {
  for (const cols of ["libelle, couleur, libelle_affiche, personnalise, actif", "libelle, couleur, libelle_affiche"]) {
    const r = await supabase.from("parametres_etats").select(cols).order("ordre");
    if (!r.error) return r;
  }
  return supabase.from("parametres_etats").select("libelle, couleur").order("ordre");
}

/**
 * Charge le profil connecté + toutes les listes de référence (Paramètres).
 * Redirige vers /login si non authentifié.
 *
 */
export function useAppData() {
  const supabase = createClient();
  const router = useRouter();
  const [profile, setProfile] = useState(null);
  const [erreurProfil, setErreurProfil] = useState(null);
  const [options, setOptions] = useState({
    ingenieurs: [],
    operations: [],
    clients: [],
    etats: [],
    naturesProd: [],
    causesInterne: [],
    causesClient: [],
    validateurs: [],
    habilitations: {}, // { ingenieur: [operation, …] }
    equipes: {}, // { client: [ingenieur, …] }
  });
  const [loading, setLoading] = useState(true);

  const charger = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.push("/login");
      return;
    }

    const { data: prof, error: profError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (profError || !prof) {
      setErreurProfil(
        "Ton compte est connecté mais n'a pas encore de profil configuré. " +
          "Demande à un administrateur d'ajouter une ligne dans la table « profiles » " +
          "avec ton identifiant : " + user.id
      );
      setLoading(false);
      return;
    }
    setProfile(prof);

    const [ing, ope, cli, eta, nat, causes, val, hab, eqp] = await Promise.all([
      supabase.from("parametres_ingenieurs").select("nom").eq("actif", true).order("nom"),
      supabase.from("parametres_operations").select("libelle").eq("actif", true).order("libelle"),
      supabase.from("parametres_clients").select("nom").eq("actif", true).order("nom"),
      chargerEtats(supabase),
      supabase.from("parametres_nature_production").select("libelle").eq("actif", true),
      supabase.from("parametres_causes_retour").select("libelle,type").eq("actif", true),
      supabase.from("parametres_validateurs").select("nom").eq("actif", true).order("nom"),
      supabase.from("ingenieur_habilitations").select("ingenieur, operation"),
      supabase.from("equipes_clients").select("client, ingenieur"),
    ]);

    definirCouleurs(Object.fromEntries((eta.data || []).map((r) => [r.libelle, r.couleur])));
    const statutsPerso = (eta.data || []).filter((r) => r.personnalise && r.actif !== false).map((r) => r.libelle);
    definirStatutsPerso(statutsPerso);
    definirLibelles(Object.fromEntries((eta.data || []).map((r) => [r.libelle, r.libelle_affiche])));

    // Équipes par client : { client: [ingénieurs] } (table absente avant la V12 → aucune équipe)
    const equipes = {};
    for (const e of eqp.error ? [] : eqp.data || []) (equipes[e.client] = equipes[e.client] || []).push(e.ingenieur);

    const habilitations = {};
    for (const h of hab.data || []) {
      if (!habilitations[h.ingenieur]) habilitations[h.ingenieur] = [];
      habilitations[h.ingenieur].push(h.operation);
    }

    setOptions({
      ingenieurs: (ing.data || []).map((r) => r.nom),
      operations: (ope.data || []).map((r) => r.libelle),
      clients: (cli.data || []).map((r) => r.nom),
      etats: (eta.data || []).map((r) => r.libelle),
      couleursEtats: Object.fromEntries((eta.data || []).map((r) => [r.libelle, r.couleur])),
      naturesProd: (nat.data || []).map((r) => r.libelle),
      causesInterne: (causes.data || [])
        .filter((c) => c.type === "interne" || c.type === "generique")
        .map((c) => c.libelle),
      causesClient: (causes.data || [])
        .filter((c) => c.type === "client" || c.type === "generique")
        .map((c) => c.libelle),
      validateurs: (val.data || []).map((r) => r.nom),
      habilitations,
      equipes,
      statutsPerso,
    });

    setLoading(false);
  }, []);

  useEffect(() => {
    charger();
  }, [charger]);

  return { profile, erreurProfil, options, loading, refresh: charger, supabase };
}

/** Applique les filtres communs (mois/année/opération/client/ingénieur/dates) à une liste de dossiers */
export function appliquerFiltres(dossiers, filtres) {
  return dossiers.filter((d) => {
    if (filtres.operation !== "Tous" && d.nom_operation !== filtres.operation) return false;
    if (filtres.client !== "Tous" && d.client !== filtres.client) return false;
    if (filtres.ingenieur !== "Tous" && d.ingenieur !== filtres.ingenieur) return false;
    if (filtres.du && d.date < filtres.du) return false;
    if (filtres.au && d.date > filtres.au) return false;
    if (filtres.annee !== "Tous" && new Date(d.date).getFullYear() !== Number(filtres.annee))
      return false;
    if (filtres.mois !== "Tous") {
      if (MOIS[new Date(d.date).getMonth()] !== filtres.mois) return false;
    }
    return true;
  });
}

export const FILTRES_INITIAUX = {
  mois: "Tous",
  annee: "Tous",
  operation: "Tous",
  client: "Tous",
  ingenieur: "Tous",
  du: "",
  au: "",
};
