"use client";
import Timeline, { versItemsEvenements } from "@/components/Timeline";

export default function HistoriqueDossier({ evenements }) {
  return <Timeline items={versItemsEvenements(evenements)} />;
}
