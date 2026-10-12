"use client";
import { useEffect, useState } from "react";
import Icon from "@/components/ui/Icon";

export default function HorlogeDigitale({ compact, sansLabel }) {
  const [maintenant, setMaintenant] = useState(null);

  useEffect(() => {
    setMaintenant(new Date());
    const id = setInterval(() => setMaintenant(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!maintenant) return null;

  const heures = maintenant.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const secondes = maintenant.getSeconds().toString().padStart(2, "0");

  if (compact) {
    const dateCourte = maintenant.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
    return (
      <div className="inline-flex items-center gap-2 h-9 px-3 rounded-lg bg-paper text-ink/70 text-xs whitespace-nowrap">
        <Icon name="clock" size={14} className="text-ink/40" />
        <span className="font-semibold tabular text-ink">{heures}</span>
        <span className="capitalize text-ink/45">{dateCourte}</span>
      </div>
    );
  }

  const date = maintenant.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="text-right">
      {!sansLabel && <p className="eyebrow mb-1">Hill Solution — Tunis</p>}
      <p className="font-display font-extrabold text-3xl leading-none tabular">
        {heures}
        <span className="text-ink/25 text-xl">:{secondes}</span>
      </p>
      <p className="text-xs text-ink/50 mt-1 capitalize">{date}</p>
    </div>
  );
}
