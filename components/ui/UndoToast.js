"use client";
import Icon from "@/components/ui/Icon";

/** Bandeau « Action effectuée — Annuler » en bas d'écran. */
export default function UndoToast({ message, onAnnuler }) {
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-slide-up">
      <div className="bg-ink text-white rounded-xl pl-4 pr-2 py-2 shadow-pop flex items-center gap-4 text-sm max-w-[92vw]">
        <Icon name="checkCircle" size={16} className="text-[#8FD17E]" />
        <span className="truncate">{message}</span>
        {onAnnuler && (
          <button
            onClick={onAnnuler}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg font-semibold text-[#9CCBF0] hover:bg-white/10"
          >
            <Icon name="undo" size={14} />
            Annuler
          </button>
        )}
      </div>
    </div>
  );
}
