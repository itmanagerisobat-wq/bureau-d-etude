import { EVENEMENTS, TON_HEX } from "@/lib/constants";
import Icon from "@/components/ui/Icon";
import EmptyState from "@/components/ui/EmptyState";

/**
 * Frise chronologique commune (historique d'un dossier).
 * items: [{ key, type: "evenement"|"commentaire", code?, detail?, auteur?, date }]
 */
export default function Timeline({ items }) {
  if (!items || items.length === 0) return <EmptyState icone="history" texte="Aucun événement enregistré." compact />;

  return (
    <ol className="relative flex flex-col gap-4 pl-6">
      <span className="absolute left-[7px] top-2 bottom-2 w-px bg-line" aria-hidden />
      {items.map((item) => {
        const estCom = item.type === "commentaire";
        const meta = estCom ? { texte: "Commentaire", ton: "neutral" } : EVENEMENTS[item.code] || { texte: item.code, ton: "neutral" };
        const couleur = TON_HEX[meta.ton];
        return (
          <li key={item.key} className="relative text-sm">
            <span
              className="absolute -left-6 top-0.5 w-[15px] h-[15px] rounded-full border-2 border-white flex items-center justify-center"
              style={{ background: couleur, boxShadow: `0 0 0 1px ${couleur}40` }}
            />
            <p className="font-semibold flex items-center gap-1.5">
              {estCom && <Icon name="message" size={13} className="text-ink/40" />}
              {meta.texte}
              {!estCom && item.detail && <span className="text-ink/50 font-normal">— {item.detail}</span>}
            </p>
            {estCom && <p className="text-ink/75 mt-1 bg-paper rounded-lg px-3 py-2">{item.detail}</p>}
            <p className="text-xs text-ink/45 mt-0.5">
              {new Date(item.date).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })}
              {item.auteur && <span className="capitalize"> · {item.auteur}</span>}
            </p>
          </li>
        );
      })}
    </ol>
  );
}

export function versItemsEvenements(evenements = []) {
  return evenements.map((e) => ({
    key: "e-" + e.id,
    type: "evenement",
    code: e.type,
    detail: e.cause,
    auteur: e.effectue_par_nom,
    date: e.created_at,
  }));
}
