import { S } from "@/lib/constants";

/**
 * Choisit « l'ingénieur le plus disponible » pour un dossier :
 *   1. habilité sur la fiche CEE du dossier
 *   2. libre (aucun dossier en cours) en priorité
 *   3. le moins de dossiers en attente dans sa liste
 *   4. le moins de dossiers pris / assignés aujourd'hui (équilibrage)
 *   5. ordre alphabétique pour départager
 * `ouverts` = dossiers aux statuts Assigné / En cours (champs ingenieur, etat, date_assignation, date_acceptation).
 * Renvoie { ingenieur, libre, raison } ou null si personne n'est habilité.
 */
export function choisirIngenieurDisponible(dossier, ingenieurs, habilitations, ouverts, equipes = {}) {
  // Client avec une équipe dédiée : uniquement les ingénieurs de l'équipe
  const equipe = equipeDuClient(dossier.client, equipes);
  const candidats = equipe
    ? (ingenieurs || []).filter((i) => equipe.includes(i))
    : (ingenieurs || []).filter((i) => (habilitations?.[i] || []).includes(dossier.nom_operation));
  if (!candidats.length) return null;

  const auj = new Date().toISOString().slice(0, 10);
  const stats = candidats.map((ing) => {
    const siens = ouverts.filter((d) => d.ingenieur === ing);
    const enCours = siens.some((d) => d.etat === S.EN_COURS);
    const enAttente = siens.filter((d) => d.etat === S.ASSIGNE).length;
    const aujourdhui = siens.filter(
      (d) => (d.date_acceptation || "").startsWith(auj) || (d.date_assignation || "").startsWith(auj)
    ).length;
    return { ing, enCours, enAttente, aujourdhui };
  });

  stats.sort(
    (a, b) =>
      Number(a.enCours) - Number(b.enCours) ||
      a.enAttente - b.enAttente ||
      a.aujourdhui - b.aujourdhui ||
      a.ing.localeCompare(b.ing)
  );
  const choix = stats[0];
  return {
    ingenieur: choix.ing,
    libre: !choix.enCours && choix.enAttente === 0,
    raison: choix.enCours
      ? `tous les ingénieurs habilités sont occupés — ${choix.ing} a la plus petite liste (${choix.enAttente} en attente)`
      : choix.enAttente
      ? `${choix.ing} n'a pas de dossier en cours (${choix.enAttente} déjà en attente)`
      : `${choix.ing} est libre`,
  };
}

/** Équipe dédiée d'un client (liste d'ingénieurs) ou null. */
export function equipeDuClient(client, equipes) {
  const e = client ? equipes?.[client] : null;
  return e && e.length ? e : null;
}

/** L'ingénieur peut-il recevoir ce dossier ? (équipe du client, sinon habilitation) */
export function peutRecevoir(ingenieur, dossier, options) {
  const equipe = equipeDuClient(dossier.client, options.equipes);
  if (equipe) return equipe.includes(ingenieur);
  return (options.habilitations?.[ingenieur] || []).includes(dossier.nom_operation);
}

/** Charge les dossiers ouverts (Assigné / En cours) nécessaires au choix. */
export async function chargerOuverts(supabase) {
  const { data } = await supabase
    .from("dossiers")
    .select("id, ingenieur, etat, date_assignation, date_acceptation")
    .in("etat", [S.ASSIGNE, S.EN_COURS]);
  return data || [];
}

/**
 * Attribue un dossier de la file à l'ingénieur le plus disponible.
 * Renvoie { ok, ingenieur, raison, erreur }.
 */
export async function attribuerAutomatiquement(supabase, dossier, options, nomTrace) {
  if (!dossier.nom_operation) return { ok: false, erreur: "Fiche CEE manquante : complète d'abord le dossier." };
  const ouverts = await chargerOuverts(supabase);
  const choix = choisirIngenieurDisponible(dossier, options.ingenieurs, options.habilitations, ouverts, options.equipes);
  if (!choix)
    return {
      ok: false,
      erreur: equipeDuClient(dossier.client, options.equipes)
        ? `Aucun ingénieur actif dans l'équipe ${dossier.client}.`
        : `Aucun ingénieur habilité sur ${dossier.nom_operation}.`,
    };
  const { error } = await supabase
    .from("dossiers")
    .update({
      etat: S.ASSIGNE,
      ingenieur: choix.ingenieur,
      date_assignation: new Date().toISOString(),
      hors_habilitation: false,
    })
    .eq("id", dossier.id)
    .eq("etat", S.FILE); // sécurité : seulement s'il est toujours dans la file
  if (error) return { ok: false, erreur: error.message };
  const { data: evt } = await supabase
    .from("dossier_evenements")
    .insert({
      dossier_id: dossier.id,
      type: "assignation",
      cause: `→ ${choix.ingenieur} (attribution automatique)`,
      effectue_par_nom: nomTrace,
    })
    .select("id")
    .single();
  return { ok: true, ingenieur: choix.ingenieur, raison: choix.raison, evenementId: evt?.id };
}
