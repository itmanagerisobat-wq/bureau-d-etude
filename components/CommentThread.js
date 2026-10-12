"use client";
import { useState } from "react";
import Avatar from "@/components/ui/Avatar";
import Icon from "@/components/ui/Icon";

export default function CommentThread({ commentaires, onAjouter, auteurNom }) {
  const [texte, setTexte] = useState("");
  const [envoi, setEnvoi] = useState(false);

  async function envoyer() {
    if (!texte.trim()) return;
    setEnvoi(true);
    try {
      await onAjouter(texte.trim());
      setTexte("");
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-3 max-h-64 overflow-y-auto">
        {commentaires.map((c) => (
          <li key={c.id} className="flex gap-2.5 text-sm">
            <Avatar nom={c.auteur_nom} taille={28} />
            <div className="flex-1 min-w-0 bg-paper rounded-xl rounded-tl-sm px-3 py-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-semibold capitalize">{c.auteur_nom || "—"}</span>
                <span className="text-[11px] text-ink/40 shrink-0">
                  {new Date(c.created_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
                </span>
              </div>
              <p className="text-ink/80 mt-0.5 break-words">{c.contenu}</p>
            </div>
          </li>
        ))}
        {commentaires.length === 0 && <li className="text-sm text-ink/40">Aucun commentaire pour le moment.</li>}
      </ul>
      <div className="flex gap-2">
        <input
          className="input flex-1"
          placeholder={`Écrire en tant que ${auteurNom || "…"}`}
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && envoyer()}
        />
        <button className="btn-primary px-3" onClick={envoyer} disabled={envoi || !texte.trim()} aria-label="Envoyer">
          <Icon name="send" size={15} />
        </button>
      </div>
    </div>
  );
}
