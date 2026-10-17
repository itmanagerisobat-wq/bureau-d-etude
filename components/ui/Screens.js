import Icon from "@/components/ui/Icon";
import SelectionPersonne from "@/components/SelectionPersonne";

export function EcranChargement() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-ink/40">
      <img src="/logo-hillsolution-h.png" alt="Hill Solution" className="h-12 w-auto opacity-80" />
      <div className="w-6 h-6 rounded-full border-2 border-brand-200 border-t-brand-500 animate-spin" />
    </div>
  );
}

export function EcranErreurProfil({ message }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="card p-8 max-w-lg text-center">
        <div className="w-12 h-12 rounded-full bg-isoRed-light text-isoRed flex items-center justify-center mx-auto mb-4">
          <Icon name="alert" size={22} />
        </div>
        <p className="font-display font-bold text-lg mb-2">Profil introuvable</p>
        <p className="text-sm text-ink/60 break-words">{message}</p>
      </div>
    </div>
  );
}

/**
 * Garde commune des pages Admin/Qualité : erreur de profil → chargement →
 * « Qui es-tu ? » (compte partagé). Renvoie l'écran à afficher, ou null si la page
 * peut s'afficher.
 */
export function gardePage({ erreurProfil, loading, profile, estAdmin, pretPersonne, nomActif, validateurs, selectionner }) {
  if (erreurProfil) return <EcranErreurProfil message={erreurProfil} />;
  if (loading || !profile) return <EcranChargement />;
  if (!estAdmin && !pretPersonne) return <EcranChargement />;
  if (!estAdmin && !nomActif) return <SelectionPersonne personnes={validateurs} onSelection={selectionner} />;
  return null;
}
