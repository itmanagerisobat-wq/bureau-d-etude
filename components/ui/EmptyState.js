import Icon from "@/components/ui/Icon";

export default function EmptyState({ icone = "inbox", texte, sousTexte, compact = false }) {
  return (
    <div className={`flex flex-col items-center justify-center text-center ${compact ? "py-6" : "py-12"} px-4`}>
      <div className="w-10 h-10 rounded-full bg-ink/[0.05] text-ink/35 flex items-center justify-center mb-3">
        <Icon name={icone} size={18} />
      </div>
      <p className="text-sm font-medium text-ink/60">{texte}</p>
      {sousTexte && <p className="text-xs text-ink/40 mt-1">{sousTexte}</p>}
    </div>
  );
}
