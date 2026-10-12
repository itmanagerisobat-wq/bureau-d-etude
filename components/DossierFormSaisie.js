"use client";
import { useMemo, useState } from "react";
import Icon from "@/components/ui/Icon";
import { doublonAdresse } from "@/lib/beneficiaires";
import { emailValide, siretValide, telephoneValide, formatDate } from "@/lib/constants";

const initial = {
  date: new Date().toISOString().slice(0, 10),
  nom_dossier: "",
  nom_operation: "",
  client: "",
  nature_prod: "",
  commentaire: "",
  beneficiaire_nom: "",
  beneficiaire_siret: "",
  beneficiaire_responsable: "",
  beneficiaire_adresse: "",
  beneficiaire_email: "",
  beneficiaire_telephone: "",
  mode: "file", // file | assigner
  ingenieur: "",
  prioritaire: false,
};

/**
 * Formulaire de création d'un dossier : dossier + bénéficiaire + dispatch
 * (dans la file commune, ou assigné directement à un ingénieur).
 */
export default function DossierFormSaisie({ options, dossiersExistants, chargeParIngenieur, onSubmit, onAnnuler }) {
  const [form, setForm] = useState(initial);
  const [envoi, setEnvoi] = useState(false);
  const [tente, setTente] = useState(false);

  const champ = (name, value) => setForm((f) => ({ ...f, [name]: value }));

  const doublonNom = useMemo(() => {
    if (!form.nom_dossier.trim()) return null;
    return dossiersExistants?.find(
      (d) => d.nom_dossier?.trim().toUpperCase() === form.nom_dossier.trim().toUpperCase()
    );
  }, [form.nom_dossier, dossiersExistants]);

  const doublonAdr = useMemo(
    () => doublonAdresse(dossiersExistants || [], form.beneficiaire_adresse, form.nom_operation),
    [form.beneficiaire_adresse, form.nom_operation, dossiersExistants]
  );

  const requis = (v) => !String(v || "").trim() && "Champ obligatoire.";
  const erreurs = {
    nom_dossier: requis(form.nom_dossier),
    date: requis(form.date),
    nom_operation: requis(form.nom_operation),
    nature_prod: requis(form.nature_prod),
    beneficiaire_nom: requis(form.beneficiaire_nom),
    beneficiaire_adresse: requis(form.beneficiaire_adresse),
    beneficiaire_siret: !siretValide(form.beneficiaire_siret) && "SIRET invalide (14 chiffres, clé de contrôle).",
    beneficiaire_email: !emailValide(form.beneficiaire_email) && "Adresse e-mail invalide.",
    beneficiaire_telephone: !telephoneValide(form.beneficiaire_telephone) && "Numéro invalide (10 chiffres).",
    ingenieur: form.mode === "assigner" && !form.ingenieur && "Choisis un ingénieur.",
  };
  const valide = !Object.values(erreurs).some(Boolean);

  const habilite = (ing) => !form.nom_operation || (options.habilitations?.[ing] || []).includes(form.nom_operation);
  const horsHabilitation = form.mode === "assigner" && form.ingenieur && !habilite(form.ingenieur);
  const habilites = (options.ingenieurs || []).filter(habilite);

  async function envoyer(e) {
    e.preventDefault();
    setTente(true);
    if (!valide) return;
    setEnvoi(true);
    try {
      await onSubmit({ ...form, hors_habilitation: !!horsHabilitation });
      setForm(initial);
      setTente(false);
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <form onSubmit={envoyer} className="flex flex-col gap-6" noValidate>
      {doublonNom && (
        <div className="alert alert-gold" role="alert">
          <Icon name="alert" size={16} className="mt-0.5" />
          <span>
            Un dossier nommé « <strong>{doublonNom.nom_dossier}</strong> » existe déjà (saisi le {formatDate(doublonNom.date)}
            {doublonNom.ingenieur ? `, ${doublonNom.ingenieur}` : ""}).
          </span>
        </div>
      )}
      {doublonAdr && (
        <div className="alert alert-red" role="alert">
          <Icon name="alert" size={16} className="mt-0.5" />
          <span>
            <strong>Doublon possible :</strong> un dossier {doublonAdr.nom_operation} existe déjà à une adresse très proche (
            {doublonAdr.nom_dossier} — {doublonAdr.beneficiaire_adresse}). Un même logement ne peut pas être financé deux fois
            sur la même fiche.
          </span>
        </div>
      )}

      <Bloc titre="Dossier" icone="folder">
        <Champ label="Nom / n° du dossier" value={form.nom_dossier} onChange={(v) => champ("nom_dossier", v)} required autoFocus erreur={tente ? erreurs.nom_dossier : null} />
        <Champ label="Date" type="date" value={form.date} onChange={(v) => champ("date", v)} required erreur={tente ? erreurs.date : null} />
        <ChampSelect label="Fiche CEE (opération)" value={form.nom_operation} onChange={(v) => champ("nom_operation", v)} options={options.operations} required erreur={tente ? erreurs.nom_operation : null} />
        <ChampSelect label="Nature" value={form.nature_prod} onChange={(v) => champ("nature_prod", v)} options={options.naturesProd} required erreur={tente ? erreurs.nature_prod : null} />
        <ChampSelect label="Client" value={form.client} onChange={(v) => champ("client", v)} options={options.clients} />
      </Bloc>

      <Bloc titre="Bénéficiaire" icone="user">
        <Champ
          label="Nom ou raison sociale"
          value={form.beneficiaire_nom}
          onChange={(v) => champ("beneficiaire_nom", v)}
          required
          erreur={tente ? erreurs.beneficiaire_nom : null}
          placeholder="Nom Prénom, ou société"
        />
        <Champ
          label="SIRET (si personne morale)"
          value={form.beneficiaire_siret}
          onChange={(v) => champ("beneficiaire_siret", v.replace(/[^\d ]/g, ""))}
          erreur={tente || form.beneficiaire_siret.replace(/\s/g, "").length >= 14 ? erreurs.beneficiaire_siret : null}
          inputMode="numeric"
          placeholder="14 chiffres"
        />
        <Champ
          label="Responsable (personne à contacter)"
          value={form.beneficiaire_responsable}
          onChange={(v) => champ("beneficiaire_responsable", v)}
        />
        <div className="sm:col-span-2">
          <Champ
            label="Adresse"
            value={form.beneficiaire_adresse}
            onChange={(v) => champ("beneficiaire_adresse", v)}
            required
            erreur={tente ? erreurs.beneficiaire_adresse : null}
            placeholder="N°, rue, code postal, ville"
          />
        </div>
        <Champ
          label="E-mail"
          type="email"
          value={form.beneficiaire_email}
          onChange={(v) => champ("beneficiaire_email", v)}
          erreur={tente ? erreurs.beneficiaire_email : null}
        />
        <Champ
          label="Téléphone"
          type="tel"
          value={form.beneficiaire_telephone}
          onChange={(v) => champ("beneficiaire_telephone", v)}
          erreur={tente ? erreurs.beneficiaire_telephone : null}
          placeholder="06 12 34 56 78"
        />
      </Bloc>

      <Bloc titre="Dispatch" icone="send">
        <div className="sm:col-span-2 segmented w-fit">
          <button type="button" data-active={form.mode === "file"} onClick={() => champ("mode", "file")}>
            <Icon name="inbox" size={13} />
            Mettre dans la file
          </button>
          <button type="button" data-active={form.mode === "assigner"} onClick={() => champ("mode", "assigner")}>
            <Icon name="user" size={13} />
            Assigner à un ingénieur
          </button>
        </div>

        {form.mode === "file" ? (
          <p className="sm:col-span-2 text-sm text-ink/60">
            Le premier ingénieur habilité et libre le prendra.{" "}
            {form.nom_operation && (
              <span className={habilites.length ? "text-ink/60" : "text-isoRed font-medium"}>
                {habilites.length
                  ? `${habilites.length} ingénieur(s) habilité(s) sur ${form.nom_operation}.`
                  : `Aucun ingénieur habilité sur ${form.nom_operation} : pense à l'assigner à la main.`}
              </span>
            )}
          </p>
        ) : (
          <div className="sm:col-span-2 field">
            <label className="label">
              Ingénieur <span className="text-isoRed">*</span>
            </label>
            <select className="input" value={form.ingenieur} onChange={(e) => champ("ingenieur", e.target.value)}>
              <option value="">Choisir…</option>
              {options.ingenieurs?.map((o) => (
                <option key={o} value={o}>
                  {o} — {chargeParIngenieur?.[o] ? `${chargeParIngenieur[o]} dossier(s) en cours/assignés` : "disponible"}
                  {form.nom_operation && !habilite(o) ? " · hors fiche habituelle" : ""}
                </option>
              ))}
            </select>
            {tente && erreurs.ingenieur && <p className="text-xs text-isoRed">{erreurs.ingenieur}</p>}
            {horsHabilitation && (
              <p className="text-xs text-isoGold-dark flex items-center gap-1">
                <Icon name="alert" size={12} />
                Cet ingénieur n'est pas habilité sur {form.nom_operation} : le dossier portera l'étiquette « hors fiche habituelle ».
              </p>
            )}
          </div>
        )}

        <label className="sm:col-span-2 flex items-center gap-2 text-sm cursor-pointer w-fit">
          <input
            type="checkbox"
            className="w-4 h-4 accent-[#D33A3A]"
            checked={form.prioritaire}
            onChange={(e) => champ("prioritaire", e.target.checked)}
          />
          <Icon name="flame" size={14} className="text-isoRed" />
          Prioritaire (passe avant les autres dossiers)
        </label>

        <div className="sm:col-span-2">
          <Champ label="Commentaire (optionnel)" value={form.commentaire} onChange={(v) => champ("commentaire", v)} textarea />
        </div>
      </Bloc>

      <div className="flex justify-end gap-2 border-t border-line -mx-6 px-6 pt-4">
        {onAnnuler && (
          <button type="button" onClick={onAnnuler} className="btn-secondary">
            Annuler
          </button>
        )}
        <button type="submit" disabled={envoi} className="btn-primary">
          <Icon name="plus" size={16} />
          {envoi ? "Enregistrement…" : form.mode === "file" ? "Créer et mettre dans la file" : "Créer et assigner"}
        </button>
      </div>
    </form>
  );
}

function Bloc({ titre, icone, children }) {
  return (
    <fieldset>
      <legend className="eyebrow flex items-center gap-1.5 mb-3">
        <Icon name={icone} size={13} />
        {titre}
      </legend>
      <div className="grid sm:grid-cols-2 gap-4">{children}</div>
    </fieldset>
  );
}

function Champ({ label, value, onChange, type = "text", required, textarea, autoFocus, placeholder, erreur, inputMode }) {
  return (
    <div className="field">
      <label className="label">
        {label} {required && <span className="text-isoRed">*</span>}
      </label>
      {textarea ? (
        <textarea className="input" rows={2} value={value} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input
          type={type}
          required={required}
          autoFocus={autoFocus}
          placeholder={placeholder}
          inputMode={inputMode}
          className={`input ${erreur ? "border-isoRed focus:border-isoRed focus:ring-isoRed/15" : ""}`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {erreur && <p className="text-xs text-isoRed">{erreur}</p>}
    </div>
  );
}

function ChampSelect({ label, value, onChange, options = [], required, erreur }) {
  return (
    <div className="field">
      <label className="label">
        {label} {required && <span className="text-isoRed">*</span>}
      </label>
      <select
        required={required}
        className={`input ${erreur ? "border-isoRed" : ""}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Choisir…</option>
        {options?.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
      {erreur && <p className="text-xs text-isoRed">{erreur}</p>}
    </div>
  );
}
