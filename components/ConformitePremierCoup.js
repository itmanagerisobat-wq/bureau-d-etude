"use client";
import KPICard from "@/components/KPICard";

export default function ConformitePremierCoup({ taux }) {
  return (
    <KPICard
      label="Conformité 1er coup"
      value={taux === null ? "—" : `${taux.toFixed(0)}%`}
      accent="green"
      icone="checkCircle"
      aide="Dossiers audités sans aucun retour"
    />
  );
}
