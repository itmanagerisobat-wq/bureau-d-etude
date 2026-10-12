"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import Navbar from "@/components/Navbar";
import FilterBar from "@/components/FilterBar";
import DossierTable from "@/components/DossierTable";
import PageHeader from "@/components/ui/PageHeader";
import Icon from "@/components/ui/Icon";
import { gardePage } from "@/components/ui/Screens";
import { useAppData, appliquerFiltres, FILTRES_INITIAUX } from "@/lib/useAppData";
import { useValidateurActif } from "@/lib/useValidateurActif";

export default function ExportPage() {
  const { profile, erreurProfil, options, loading, supabase } = useAppData();
  const { nom: nomSelectionne, pret: pretPersonne, selectionner, changerDePersonne, validateurs } =
    useValidateurActif(profile, supabase);
  const estAdmin = profile?.role === "admin";
  // Admin et Qualité ont chacun leur propre compte : pas de code PIN
  const nominatif = ["admin", "qualite"].includes(profile?.role);
  const nomActif = nominatif ? profile?.nom_complet : nomSelectionne;
  const [dossiers, setDossiers] = useState([]);
  const [filtres, setFiltres] = useState(FILTRES_INITIAUX);
  const [avecCoordonnees, setAvecCoordonnees] = useState(false);

  useEffect(() => {
    if (!profile) return;
    (async () => {
      const { data } = await supabase.from("dossiers").select("*").limit(5000);
      setDossiers(data || []);
    })();
  }, [profile]);

  const filtres_ = appliquerFiltres(dossiers, filtres);

  function exporterExcel() {
    const feuille = XLSX.utils.json_to_sheet(
      filtres_.map((d) => ({
        Date: d.date,
        "Nom dossier": d.nom_dossier,
        Ingénieur: d.ingenieur,
        "Ingénieur de modif": d.ingenieur_modif,
        "Date de modification": d.date_modification,
        "Date retour client": d.date_retour_client,
        Opération: d.nom_operation,
        Client: d.client,
        État: d.etat,
        "Nature production": d.nature_prod,
        "Retour interne": d.retour_interne ? "Oui" : "Non",
        "Cause retour interne": d.cause_retour_interne,
        "Retour client": d.retour_client ? "Oui" : "Non",
        "Cause retour client": d.cause_retour_client,
        "Audité par": d.valide_par,
        Commentaire: d.commentaire,
        Bénéficiaire: d.beneficiaire_nom,
        ...(avecCoordonnees
          ? {
              SIRET: d.beneficiaire_siret,
              Responsable: d.beneficiaire_responsable,
              Adresse: d.beneficiaire_adresse,
              "E-mail": d.beneficiaire_email,
              Téléphone: d.beneficiaire_telephone,
            }
          : {}),
      }))
    );
    const classeur = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(classeur, feuille, "Export");
    XLSX.writeFile(classeur, `HILLSOLUTION_export_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  const ecran = gardePage({ erreurProfil, loading, profile, estAdmin: nominatif, pretPersonne, nomActif, validateurs, selectionner });
  if (ecran) return ecran;

  return (
    <div className="min-h-screen">
      <Navbar role={profile.role} nom={nomActif} onChangerPersonne={nominatif ? undefined : changerDePersonne} />
      <main className="max-w-[1800px] mx-auto px-3 sm:px-4 lg:px-5 py-6">
        <PageHeader
          icone="download"
          titre="Export"
          sousTitre="Extraction Excel filtrée. (L'import de dossiers se fait depuis la page Saisie.)"
          actions={
            <>
              <label className="flex items-center gap-2 text-sm cursor-pointer mr-2">
                <input
                  type="checkbox"
                  className="w-4 h-4 accent-[#1F6FA8]"
                  checked={avecCoordonnees}
                  onChange={(e) => setAvecCoordonnees(e.target.checked)}
                />
                Inclure les coordonnées
              </label>
              <button onClick={exporterExcel} className="btn-primary" disabled={filtres_.length === 0}>
                <Icon name="download" size={16} />
                Exporter {filtres_.length} dossier{filtres_.length > 1 ? "s" : ""}
              </button>
            </>
          }
        />

        <FilterBar filtres={filtres} setFiltres={setFiltres} options={options} />
        <DossierTable dossiers={filtres_} />
      </main>
    </div>
  );
}
