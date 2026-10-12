import Icon from "@/components/ui/Icon";
import HorlogeDigitale from "@/components/HorlogeDigitale";

/** En-tête de page homogène : icône + titre + sous-titre + actions à droite. */
export default function PageHeader({ icone, titre, sousTitre, actions, children, horloge = true }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
      <div className="flex items-center gap-3 min-w-0">
        {icone && (
          <div className="w-10 h-10 rounded-xl bg-brand-50 text-brand-500 flex items-center justify-center shrink-0">
            <Icon name={icone} size={20} />
          </div>
        )}
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-extrabold leading-tight">{titre}</h1>
          {sousTitre && <p className="text-sm text-ink/55 mt-0.5">{sousTitre}</p>}
          {children}
        </div>
      </div>
      {(actions || horloge) && (
        <div className="flex flex-wrap items-center gap-2">
          {horloge && (
            <div className={`hidden md:block ${actions ? "mr-3 pr-4 border-r border-line" : ""}`}>
              <HorlogeDigitale sansLabel />
            </div>
          )}
          {actions}
        </div>
      )}
    </div>
  );
}

/** Titre de section à l'intérieur d'une page. */
export function SectionTitle({ icone, titre, compteur, ton = "neutral", actions, onClick, replie }) {
  const Tag = onClick ? "button" : "div";
  const ton_ = { neutral: "badge-neutral", gold: "badge-gold", red: "badge-red", brand: "badge-brand", green: "badge-green" }[ton];
  return (
    <div className="flex items-center justify-between gap-3 mb-3">
      <Tag onClick={onClick} className={`flex items-center gap-2 font-display text-base font-bold ${onClick ? "hover:text-brand-600" : ""}`}>
        {onClick && (
          <Icon name="chevronRight" size={16} className={`text-ink/40 transition-transform ${replie ? "" : "rotate-90"}`} />
        )}
        {icone && <Icon name={icone} size={17} className="text-ink/45" />}
        {titre}
        {compteur !== undefined && <span className={`badge ${ton_}`}>{compteur}</span>}
      </Tag>
      {actions}
    </div>
  );
}
