import { redirect } from "next/navigation";

// Le rapport de contrôle qualité est dans le tableau de bord (onglet « Rapport qualité »).
export default function RapportPage() {
  redirect("/dashboard?onglet=rapport");
}
