import { redirect } from "next/navigation";

// Page Bénéficiaires supprimée : les coordonnées se gèrent sur chaque dossier (Saisie / Qualité).
export default function BeneficiairesPage() {
  redirect("/saisie");
}
