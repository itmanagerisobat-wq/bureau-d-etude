"use client";
import { useEffect, useState } from "react";
import Modal from "@/components/ui/Modal";
import Timeline, { versItemsEvenements } from "@/components/Timeline";

export default function HistoriqueComplet({ supabase, dossier, onFermer }) {
  const [flux, setFlux] = useState([]);
  const [chargement, setChargement] = useState(true);

  useEffect(() => {
    (async () => {
      const [{ data: evts }, { data: coms }] = await Promise.all([
        supabase.from("dossier_evenements").select("*").eq("dossier_id", dossier.id),
        supabase.from("dossier_commentaires").select("*").eq("dossier_id", dossier.id),
      ]);

      const items = [
        ...versItemsEvenements(evts || []),
        ...(coms || []).map((c) => ({
          key: "c-" + c.id,
          type: "commentaire",
          detail: c.contenu,
          auteur: c.auteur_nom,
          date: c.created_at,
        })),
      ].sort((a, b) => new Date(a.date) - new Date(b.date));

      setFlux(items);
      setChargement(false);
    })();
  }, [dossier.id]);

  return (
    <Modal titre={dossier.nom_dossier} sousTitre="Parcours complet du dossier" onFermer={onFermer}>
      {chargement ? (
        <div className="flex justify-center py-8">
          <div className="w-6 h-6 rounded-full border-2 border-brand-200 border-t-brand-500 animate-spin" />
        </div>
      ) : (
        <Timeline items={flux} />
      )}
    </Modal>
  );
}
