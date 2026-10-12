import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { problemeCleService } from "@/lib/cleService";

export const dynamic = "force-dynamic";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = "dossiers-fichiers";

// Autorisé : le cron Vercel (en-tête « Authorization: Bearer CRON_SECRET ») ou un admin connecté.
async function autorise(request) {
  const token = (request.headers.get("authorization") || "").replace("Bearer ", "");
  if (!token) return false;
  if (process.env.CRON_SECRET && token === process.env.CRON_SECRET) return true;
  const client = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const {
    data: { user },
  } = await client.auth.getUser(token);
  if (!user) return false;
  const { data: profile } = await client.from("profiles").select("role").eq("id", user.id).single();
  return profile?.role === "admin";
}

async function purger() {
  const pbCle = problemeCleService();
  if (pbCle) throw new Error(pbCle);
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  let supprimes = 0;
  // Par lots de 500 pour rester sous les limites de l'API Storage
  for (let tour = 0; tour < 40; tour++) {
    const { data, error } = await admin.from("v_fichiers_a_purger").select("id, chemin").limit(500);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    const { error: e1 } = await admin.storage.from(BUCKET).remove(data.map((f) => f.chemin));
    if (e1) throw new Error(e1.message);
    const { error: e2 } = await admin.from("dossier_fichiers").delete().in("id", data.map((f) => f.id));
    if (e2) throw new Error(e2.message);
    supprimes += data.length;
    if (data.length < 500) break;
  }
  return supprimes;
}

async function traiter(request) {
  if (!(await autorise(request))) return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  try {
    const supprimes = await purger();
    return NextResponse.json({ supprimes });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export const GET = traiter; // appelé par le cron Vercel
export const POST = traiter; // bouton « Purger maintenant »
