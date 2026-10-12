"use client";
import { SEUIL_ALERTE_JOURS_ENCOURS_VERIF } from "@/lib/constants";
import Icon from "@/components/ui/Icon";

export default function AlertesQualite({ dossiers }) {
  const aRisque = dossiers.filter((d) => d.dossier_a_risque);

  const aujourdHui = new Date();
  const bloques = dossiers.filter((d) => {
    if (!["En attente de vérification", "En cours de vérification"].includes(d.etat)) return false;
    const date = new Date(d.date_soumission || d.date);
    const joursEcoules = (aujourdHui - date) / (1000 * 60 * 60 * 24);
    return joursEcoules > SEUIL_ALERTE_JOURS_ENCOURS_VERIF;
  });

  if (aRisque.length === 0 && bloques.length === 0) return null;

  return (
    <div className="grid sm:grid-cols-2 gap-3">
      {bloques.length > 0 && (
        <div className="alert alert-gold items-center">
          <span className="w-9 h-9 rounded-lg bg-white/70 flex items-center justify-center shrink-0">
            <Icon name="clock" size={18} />
          </span>
          <p>
            <strong className="font-display text-lg mr-1">{bloques.length}</strong>
            dossier(s) en attente ou en cours de vérification depuis plus de {SEUIL_ALERTE_JOURS_ENCOURS_VERIF} jours.
          </p>
        </div>
      )}
      {aRisque.length > 0 && (
        <div className="alert alert-red items-center">
          <span className="w-9 h-9 rounded-lg bg-white/70 flex items-center justify-center shrink-0">
            <Icon name="alert" size={18} />
          </span>
          <p>
            <strong className="font-display text-lg mr-1">{aRisque.length}</strong>
            dossier(s) à risque (retour interne ET client sur le même dossier).
          </p>
        </div>
      )}
    </div>
  );
}
