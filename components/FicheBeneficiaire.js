"use client";
import { useState } from "react";
import Icon from "@/components/ui/Icon";
import { emailValide, formatTelephone, siretValide, telephoneValide } from "@/lib/constants";

const CHAMPS = [
  "beneficiaire_nom",
  "beneficiaire_siret",
  "beneficiaire_responsable",
  "beneficiaire_adresse",
  "beneficiaire_email",
  "beneficiaire_telephone",
];

/** Coordonnées du bénéficiaire d'un dossier, avec modification en place (pour compléter les anciens dossiers). */
export default function FicheBeneficiaire({ dossier, onSave, compact = false }) {
  const [edition, setEdition] = useState(false);
  const [f, setF] = useState(() => Object.fromEntries(CHAMPS.map((c) => [c, dossier[c] || ""])));
  const [erreur, setErreur] = useState("");
  const vide = CHAMPS.every((c) => !dossier[c]);

  async function enregistrer() {
    if (!siretValide(f.beneficiaire_siret)) return setErreur("SIRET invalide.");
    if (!emailValide(f.beneficiaire_email)) return setErreur("E-mail invalide.");
    if (!telephoneValide(f.beneficiaire_telephone)) return setErreur("Téléphone invalide.");
    const payload = Object.fromEntries(
      CHAMPS.map((c) => [c, (c === "beneficiaire_siret" ? f[c].replace(/\s/g, "") : f[c].trim()) || null])
    );
    const err = await onSave?.(payload);
    if (err) return setErreur(err);
    setErreur("");
    setEdition(false);
  }

  if (edition) {
    return (
      <div className="rounded-xl border border-brand-200 bg-brand-50/40 p-4 flex flex-col gap-3">
        <div className="grid sm:grid-cols-2 gap-3">
          {[
            ["beneficiaire_nom", "Nom ou raison sociale"],
            ["beneficiaire_siret", "SIRET"],
            ["beneficiaire_responsable", "Responsable (personne à contacter)"],
            ["beneficiaire_adresse", "Adresse"],
            ["beneficiaire_email", "E-mail"],
            ["beneficiaire_telephone", "Téléphone"],
          ].map(([c, l]) => (
            <div key={c} className={`field ${c === "beneficiaire_adresse" ? "sm:col-span-2" : ""}`}>
              <label className="label">{l}</label>
              <input className="input" value={f[c]} onChange={(e) => setF((x) => ({ ...x, [c]: e.target.value }))} />
            </div>
          ))}
        </div>
        {erreur && <p className="text-xs text-isoRed">{erreur}</p>}
        <div className="flex gap-2 justify-end">
          <button className="btn-secondary btn-sm" onClick={() => setEdition(false)}>
            Annuler
          </button>
          <button className="btn-primary btn-sm" onClick={enregistrer}>
            Enregistrer
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-xl border border-line ${compact ? "p-3" : "p-4"} bg-white`}>
      <div className="flex items-start justify-between gap-3">
        {vide ? (
          <p className="text-sm text-ink/45 flex items-center gap-2">
            <Icon name="user" size={15} />
            Bénéficiaire non renseigné.
          </p>
        ) : (
          <div className="min-w-0 text-sm flex flex-col gap-1">
            <p className="font-semibold flex items-center gap-2">
              <Icon name="user" size={15} className="text-ink/40" />
              {dossier.beneficiaire_nom || "—"}
              {dossier.beneficiaire_siret && (
                <span className="font-mono text-xs text-ink/50 font-normal">SIRET {dossier.beneficiaire_siret}</span>
              )}
            </p>
            {dossier.beneficiaire_responsable && (
              <p className="text-ink/70 pl-6">
                <span className="text-ink/45">Responsable :</span> {dossier.beneficiaire_responsable}
              </p>
            )}
            {dossier.beneficiaire_adresse && <p className="text-ink/70 pl-6">{dossier.beneficiaire_adresse}</p>}
            <p className="pl-6 flex flex-wrap gap-x-4 gap-y-1">
              {dossier.beneficiaire_telephone && (
                <a href={`tel:${dossier.beneficiaire_telephone}`} className="text-brand-600 hover:underline tabular">
                  {formatTelephone(dossier.beneficiaire_telephone)}
                </a>
              )}
              {dossier.beneficiaire_email && (
                <a href={`mailto:${dossier.beneficiaire_email}`} className="text-brand-600 hover:underline break-all">
                  {dossier.beneficiaire_email}
                </a>
              )}
            </p>
          </div>
        )}
        {onSave && (
          <button className="btn-ghost btn-xs shrink-0" onClick={() => setEdition(true)}>
            <Icon name="pencil" size={13} />
            {vide ? "Compléter" : "Modifier"}
          </button>
        )}
      </div>
    </div>
  );
}
