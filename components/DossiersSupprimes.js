"use client";
import { useEffect, useState } from "react";
import Icon from "@/components/ui/Icon";
import Modal from "@/components/ui/Modal";

const dateHeure = (iso) => (iso ? new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "—");

/** Journal des dossiers supprimés (admin uniquement) : qui, quand, pourquoi, contenu, restauration. */
export default function DossiersSupprimes({ supabase }) {
  const [lignes, setLignes] = useState(null);
  const [erreur, setErreur] = useState("");
  const [detail, setDetail] = useState(null);
  const [q, setQ] = useState("");

  async function charger() {
    const { data, error } = await supabase.from("dossiers_supprimes").select("*").order("supprime_le", { ascending: false }).limit(1000);
    if (error) setErreur(/does not exist|not find/i.test(error.message) ? "Exécutez la migration V22 dans Supabase pour activer le journal des suppressions." : error.message);
    setLignes(data || []);
  }
  useEffect(() => {
    charger();
  }, []);

  async function restaurer(t) {
    if (!confirm(`Restaurer le dossier « ${t.nom_dossier} » avec son historique, ses retours et ses commentaires ?`)) return;
    const { error } = await supabase.rpc("fn_restaurer_dossier", { p_trace: t.id });
    if (error)
      return alert(
        error.message.includes("deja_present")
          ? "Un dossier avec le même identifiant existe déjà."
          : "Restauration impossible : " + error.message + "\n(Vérifiez que l'ingénieur, la fiche et le client existent toujours dans les listes.)"
      );
    setDetail(null);
    charger();
  }

  async function exporter() {
    const XLSX = await import("xlsx");
    const feuille = XLSX.utils.json_to_sheet(
      (lignes || []).map((t) => ({
        "Supprimé le": dateHeure(t.supprime_le),
        "Supprimé par": t.supprime_par_nom,
        Fonction: t.supprime_par_fonction,
        Motif: t.motif,
        Dossier: t.nom_dossier,
        Fiche: t.nom_operation,
        "Statut au moment de la suppression": t.etat,
        Ingénieur: t.ingenieur,
        "Restauré le": t.restaure_le ? dateHeure(t.restaure_le) : "",
        "Restauré par": t.restaure_par_nom || "",
      }))
    );
    const classeur = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(classeur, feuille, "Suppressions");
    XLSX.writeFile(classeur, `HILLSOLUTION_dossiers_supprimes_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  const visibles = (lignes || []).filter(
    (t) => !q || [t.nom_dossier, t.supprime_par_nom, t.motif, t.nom_operation, t.ingenieur].some((v) => String(v || "").toLowerCase().includes(q.toLowerCase()))
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="card p-4 flex flex-wrap items-center gap-3">
        <p className="text-sm text-ink/60 flex-1 min-w-[260px]">
          Chaque dossier supprimé par l'admin ou un Responsable est conservé ici avec son historique complet. Ce journal n'est visible que par
          l'admin et ne peut être ni modifié ni effacé.
        </p>
        <input className="input input-sm w-60" placeholder="Rechercher…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn-secondary btn-sm" onClick={exporter} disabled={!lignes?.length}>
          <Icon name="download" size={14} />
          Exporter
        </button>
      </div>
      {erreur && <div className="alert alert-gold text-sm">{erreur}</div>}
      <div className="card overflow-x-auto">
        <table className="table table-hover">
          <thead>
            <tr>
              <th>Supprimé le</th>
              <th>Par</th>
              <th>Dossier</th>
              <th>Fiche</th>
              <th>Statut</th>
              <th>Motif</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((t) => (
              <tr key={t.id} className="cursor-pointer" onClick={() => setDetail(t)}>
                <td className="whitespace-nowrap tabular">{dateHeure(t.supprime_le)}</td>
                <td>
                  <span className="font-medium capitalize">{t.supprime_par_nom || "—"}</span>
                  <span className="block text-[11px] text-ink/45">{t.supprime_par_fonction}</span>
                </td>
                <td className="font-semibold">{t.nom_dossier}</td>
                <td>{t.nom_operation || "—"}</td>
                <td>{t.etat}</td>
                <td className="max-w-[320px] truncate" title={t.motif}>
                  {t.motif}
                </td>
                <td className="text-right">
                  {t.restaure_le ? (
                    <span className="badge badge-green" title={`par ${t.restaure_par_nom || "—"}`}>
                      Restauré le {dateHeure(t.restaure_le)}
                    </span>
                  ) : (
                    <span className="badge badge-red">Supprimé</span>
                  )}
                </td>
              </tr>
            ))}
            {lignes && !visibles.length && (
              <tr>
                <td colSpan={7} className="table-empty">
                  Aucun dossier supprimé.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {detail && (
        <Modal titre={`Dossier supprimé — ${detail.nom_dossier}`} sousTitre={`le ${dateHeure(detail.supprime_le)} par ${detail.supprime_par_nom || "—"}`} onFermer={() => setDetail(null)} taille="lg">
          <div className="flex flex-col gap-3 text-sm">
            <p>
              <strong>Motif :</strong> {detail.motif}
            </p>
            <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1">
              {[
                ["Fiche", detail.donnees?.dossier?.nom_operation],
                ["Client", detail.donnees?.dossier?.client],
                ["Statut", detail.etat],
                ["Ingénieur", detail.ingenieur],
                ["Ingénieur de modif", detail.donnees?.dossier?.ingenieur_modif],
                ["Date", detail.donnees?.dossier?.date],
                ["Bénéficiaire", detail.donnees?.dossier?.beneficiaire_nom],
                ["Audité par", detail.donnees?.dossier?.valide_par],
              ].map(([k, v]) => (
                <p key={k}>
                  <span className="text-ink/50">{k} :</span> {v || "—"}
                </p>
              ))}
            </div>
            <p className="text-ink/60">
              Conservés avec le dossier : {detail.donnees?.evenements?.length || 0} étape(s) d'historique, {detail.donnees?.retours?.length || 0} retour(s),{" "}
              {detail.donnees?.commentaires?.length || 0} commentaire(s), {detail.donnees?.fichiers?.length || 0} fichier(s).
            </p>
            {!!detail.donnees?.evenements?.length && (
              <div className="border border-line rounded-lg max-h-56 overflow-y-auto divide-y divide-line">
                {[...detail.donnees.evenements]
                  .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
                  .map((e) => (
                    <p key={e.id} className="px-3 py-1.5 text-xs">
                      <span className="text-ink/45 tabular">{dateHeure(e.created_at)}</span> — {e.type}
                      {e.cause ? ` (${e.cause})` : ""} {e.effectue_par_nom ? `· ${e.effectue_par_nom}` : ""}
                    </p>
                  ))}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              {!detail.restaure_le && (
                <button className="btn-primary" onClick={() => restaurer(detail)}>
                  <Icon name="undo" size={14} />
                  Restaurer le dossier
                </button>
              )}
              <button className="btn-secondary" onClick={() => setDetail(null)}>
                Fermer
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
