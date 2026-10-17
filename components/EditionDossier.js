"use client";
import { useState } from "react";
import Icon from "@/components/ui/Icon";
import { emailValide, siretValide, telephoneValide } from "@/lib/constants";

const CHAMPS_DOSSIER = [
  ["nom_dossier", "Nom / n° du dossier", "text"],
  ["date", "Date", "date"],
  ["nom_operation", "Fiche CEE (opération)", "operations"],
  ["nature_prod", "Nature", "naturesProd"],
  ["client", "Client", "clients"],
  ["ingenieur_modif", "Ingénieur de modif", "ingenieurs"],
  ["date_modification", "Date de modification", "date"],
  ["date_retour_client", "Date retour client", "date"],
];
const CHAMPS_BENEF = [
  ["beneficiaire_nom", "Nom ou raison sociale"],
  ["beneficiaire_siret", "SIRET"],
  ["beneficiaire_responsable", "Responsable"],
  ["beneficiaire_adresse", "Adresse"],
  ["beneficiaire_email", "E-mail"],
  ["beneficiaire_telephone", "Téléphone"],
];

/** Modification des informations d'un dossier et de son bénéficiaire (Admin / Qualité). */
export default function EditionDossier({ dossier, options, onSave, onAnnuler }) {
  const [f, setF] = useState(() =>
    Object.fromEntries([...CHAMPS_DOSSIER, ...CHAMPS_BENEF].map(([c]) => [c, dossier[c] ?? ""]))
  );
  const [erreur, setErreur] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const maj = (c, v) => setF((x) => ({ ...x, [c]: v }));

  async function enregistrer() {
    if (!f.nom_dossier.trim()) return setErreur("Le nom du dossier est obligatoire.");
    if (!siretValide(f.beneficiaire_siret)) return setErreur("SIRET invalide (14 chiffres, clé de contrôle).");
    if (!emailValide(f.beneficiaire_email)) return setErreur("E-mail invalide.");
    if (!telephoneValide(f.beneficiaire_telephone)) return setErreur("Téléphone invalide (10 chiffres).");
    const payload = Object.fromEntries(
      Object.entries(f).map(([c, v]) => {
        const t = typeof v === "string" ? v.trim() : v;
        return [c, c === "beneficiaire_siret" ? (t || "").replace(/\s/g, "") || null : t || null];
      })
    );
    setEnvoi(true);
    const err = await onSave(payload);
    setEnvoi(false);
    if (err) setErreur(err);
  }

  return (
    <div className="flex flex-col gap-5">
      <fieldset>
        <legend className="eyebrow flex items-center gap-1.5 mb-3">
          <Icon name="folder" size={13} />
          Dossier
        </legend>
        <div className="grid sm:grid-cols-2 gap-3">
          {CHAMPS_DOSSIER.map(([c, l, type]) => (
            <div key={c} className="field">
              <label className="label">{l}</label>
              {type === "text" || type === "date" ? (
                <input type={type} className="input" value={f[c] || ""} onChange={(e) => maj(c, e.target.value)} />
              ) : (
                <select className="input" value={f[c] || ""} onChange={(e) => maj(c, e.target.value)}>
                  <option value="">—</option>
                  {(options[type] || []).map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              )}
            </div>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="eyebrow flex items-center gap-1.5 mb-3">
          <Icon name="user" size={13} />
          Bénéficiaire
        </legend>
        <div className="grid sm:grid-cols-2 gap-3">
          {CHAMPS_BENEF.map(([c, l]) => (
            <div key={c} className={`field ${c === "beneficiaire_adresse" ? "sm:col-span-2" : ""}`}>
              <label className="label">{l}</label>
              <input className="input" value={f[c] || ""} onChange={(e) => maj(c, e.target.value)} />
            </div>
          ))}
        </div>
      </fieldset>

      {erreur && (
        <div className="alert alert-red">
          <Icon name="alert" size={16} className="mt-0.5" />
          <span>{erreur}</span>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button className="btn-secondary" onClick={onAnnuler}>
          Annuler
        </button>
        <button className="btn-primary" onClick={enregistrer} disabled={envoi}>
          <Icon name="check" size={15} />
          {envoi ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
    </div>
  );
}
