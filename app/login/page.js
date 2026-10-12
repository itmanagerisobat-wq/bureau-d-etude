"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";
import AuthLayout from "@/components/AuthLayout";
import Icon from "@/components/ui/Icon";

// Suffixe technique invisible : l'utilisateur tape juste un nom d'utilisateur,
// jamais un email — Supabase authentifie par email en interne uniquement.
const DOMAINE_TECHNIQUE = "@hillsolution.local";

export default function LoginPage() {
  const [nomUtilisateur, setNomUtilisateur] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [voirMotDePasse, setVoirMotDePasse] = useState(false);
  const [erreur, setErreur] = useState("");
  const [chargement, setChargement] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("desactive")) setErreur("Ce compte a été désactivé. Contacte l'administrateur.");
  }, []);

  async function seConnecter(e) {
    e.preventDefault();
    setErreur("");
    setChargement(true);
    const supabase = createClient();
    const saisie = nomUtilisateur.trim().toLowerCase();
    // Si la personne tape une adresse email complète (avec @), on l'utilise telle
    // quelle ; sinon on ajoute le suffixe technique interne pour les comptes partagés.
    const email = saisie.includes("@") ? saisie : saisie + DOMAINE_TECHNIQUE;
    const { error, data } = await supabase.auth.signInWithPassword({
      email,
      password: motDePasse,
    });
    if (error) {
      setChargement(false);
      setErreur(
        /banned/i.test(error.message)
          ? "Ce compte a été désactivé. Contacte l'administrateur."
          : "Identifiants incorrects. Vérifie ton nom d'utilisateur et ton mot de passe."
      );
      return;
    }
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", data.user.id)
      .single();
    setChargement(false);
    router.push(profile?.role === "ingenieur" ? "/mes-dossiers" : "/saisie");
  }

  return (
    <AuthLayout>
      <form onSubmit={seConnecter} className="flex flex-col gap-5">
        <div className="mb-2">
          <h1 className="font-display font-extrabold text-3xl">Connexion</h1>
          <p className="text-sm text-ink/55 mt-1.5">Connecte-toi à l'espace Hill Solution.</p>
        </div>

        <div className="field">
          <label htmlFor="utilisateur" className="label">Nom d'utilisateur</label>
          <div className="relative">
            <Icon name="user" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/35" />
            <input
              id="utilisateur"
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              required
              placeholder="ex. qualite"
              className="input h-11 pl-10"
              value={nomUtilisateur}
              onChange={(e) => setNomUtilisateur(e.target.value)}
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor="motdepasse" className="label">Mot de passe</label>
          <div className="relative">
            <Icon name="lock" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/35" />
            <input
              id="motdepasse"
              type={voirMotDePasse ? "text" : "password"}
              autoComplete="current-password"
              required
              className="input h-11 pl-10 pr-20"
              value={motDePasse}
              onChange={(e) => setMotDePasse(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setVoirMotDePasse((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-semibold text-brand-600 hover:bg-brand-50 rounded-md px-2 py-1"
            >
              {voirMotDePasse ? "Masquer" : "Afficher"}
            </button>
          </div>
        </div>

        {erreur && (
          <div className="alert alert-red" role="alert">
            <Icon name="alert" size={16} className="mt-0.5" />
            <span>{erreur}</span>
          </div>
        )}

        <button type="submit" disabled={chargement} className="btn-primary h-11 w-full text-[15px]">
          {chargement ? "Connexion…" : "Se connecter"}
        </button>

        <p className="text-xs text-ink/45 text-center">
          Mot de passe oublié ? Un administrateur peut le réinitialiser dans Paramètres → Comptes.
        </p>
      </form>
    </AuthLayout>
  );
}
