import { redirect } from "next/navigation";

// Les statistiques sont désormais un onglet du Dashboard.
export default function StatistiquesPage() {
  redirect("/dashboard?onglet=stats");
}
