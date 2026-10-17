import { normaliserAdresse } from "@/lib/constants";

/** Dossier existant avec une adresse très proche sur la même fiche CEE (hors dossier courant). */
export function doublonAdresse(dossiers, adresse, operation, idCourant) {
  const cible = normaliserAdresse(adresse);
  if (cible.length < 6 || !operation) return null;
  return (
    dossiers.find(
      (d) =>
        d.id !== idCourant &&
        d.nom_operation === operation &&
        d.beneficiaire_adresse &&
        normaliserAdresse(d.beneficiaire_adresse) === cible
    ) || null
  );
}
