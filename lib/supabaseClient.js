import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    // Évite de faire planter tout le build/rendu si les variables d'environnement
    // ne sont pas encore configurées sur Vercel (Settings → Environment Variables).
    throw new Error(
      "Configuration Supabase manquante : ajoute NEXT_PUBLIC_SUPABASE_URL et " +
        "NEXT_PUBLIC_SUPABASE_ANON_KEY dans les variables d'environnement du projet " +
        "(Vercel → Settings → Environment Variables), puis redéploie."
    );
  }

  return createBrowserClient(url, anonKey);
}
