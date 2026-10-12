"use client";
import { useState } from "react";
import AuthLayout from "@/components/AuthLayout";
import Avatar from "@/components/ui/Avatar";
import Icon from "@/components/ui/Icon";

export default function SelectionPersonne({
  personnes,
  onSelection,
  sousTitre = "Choisis ton nom puis saisis ton code personnel.",
  sansCode = false, // aperçu admin : pas de code demandé
  titre = "Qui es-tu ?",
}) {
  const [nomChoisi, setNomChoisi] = useState("");
  const [pin, setPin] = useState("");
  const [erreur, setErreur] = useState("");

  function valider(e) {
    e.preventDefault();
    const p = personnes.find((x) => x.nom === nomChoisi);
    if (!p) return setErreur("Choisis ton nom.");
    if (!sansCode && (p.pin || "") !== pin) {
      setErreur("Code incorrect.");
      return;
    }
    onSelection(nomChoisi);
  }

  return (
    <AuthLayout>
      <form onSubmit={valider} className="flex flex-col gap-5">
        <div className="mb-1">
          <h1 className="font-display font-extrabold text-3xl">{titre}</h1>
          <p className="text-sm text-ink/55 mt-1.5">{sousTitre}</p>
        </div>

        <div className="field">
          <span className="label">Ton nom</span>
          <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto p-0.5 -m-0.5">
            {personnes.map((p) => {
              const actif = nomChoisi === p.nom;
              return (
                <button
                  type="button"
                  key={p.nom}
                  onClick={() => {
                    setNomChoisi(p.nom);
                    setErreur("");
                  }}
                  className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                    actif
                      ? "border-brand-500 bg-brand-50 text-brand-700 ring-2 ring-brand-500/15"
                      : "border-line bg-white hover:border-ink/25"
                  }`}
                >
                  <Avatar nom={p.nom} taille={28} />
                  <span className="truncate capitalize">{p.nom}</span>
                </button>
              );
            })}
            {personnes.length === 0 && (
              <p className="col-span-2 text-sm text-ink/45 py-4 text-center">Aucune personne configurée.</p>
            )}
          </div>
        </div>

        {!sansCode && (
        <div className="field">
          <label htmlFor="pin" className="label">Ton code (6 chiffres)</label>
          <input
            id="pin"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={6}
            required
            className="input h-12 text-center text-xl tracking-[0.5em] font-semibold"
            value={pin}
            onChange={(e) => {
              setPin(e.target.value);
              setErreur("");
            }}
          />
        </div>
        )}

        {erreur && (
          <div className="alert alert-red" role="alert">
            <Icon name="alert" size={16} className="mt-0.5" />
            <span>{erreur}</span>
          </div>
        )}

        <button type="submit" className="btn-primary h-11 w-full text-[15px]" disabled={!nomChoisi}>
          Entrer
        </button>

        {!sansCode && (
        <p className="text-xs text-ink/45 text-center">
          Code oublié ? Demande à un administrateur de le réinitialiser dans Paramètres.
        </p>
        )}
      </form>
    </AuthLayout>
  );
}
