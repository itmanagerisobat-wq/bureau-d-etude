/**
 * Vérifie que SUPABASE_SERVICE_ROLE_KEY est bien la clé « service_role » (et pas la clé « anon »).
 * Renvoie un message d'erreur clair, ou null si la clé semble correcte.
 */
export function problemeCleService(cle = process.env.SUPABASE_SERVICE_ROLE_KEY) {
  if (!cle) return "La variable SUPABASE_SERVICE_ROLE_KEY est absente dans Vercel (Settings → Environment Variables), puis redéploie.";
  if (cle.startsWith("sb_publishable_"))
    return "SUPABASE_SERVICE_ROLE_KEY contient la clé publique (publishable). Mets la clé secrète « service_role » (Supabase → Project Settings → API), puis redéploie.";
  if (cle.startsWith("sb_secret_")) return null;
  try {
    const charge = JSON.parse(Buffer.from(cle.split(".")[1], "base64").toString("utf8"));
    if (charge.role && charge.role !== "service_role")
      return `SUPABASE_SERVICE_ROLE_KEY contient la clé « ${charge.role} » au lieu de « service_role » (Supabase → Project Settings → API → service_role secret), puis redéploie.`;
  } catch {
    // clé non JWT : on laisse Supabase répondre
  }
  return null;
}
