import { NextResponse } from "next/server";
import { clientService, configEmail, expliquerErreur, problemeConfigEmail, synchroniser, utilisateurDepuisRequete } from "@/lib/messagerieEmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 45;

/**
 * Relève la boîte e-mail de la Messagerie (réponses du RH).
 * Appelé : par la page Messagerie ouverte (toutes les minutes), et/ou par une tâche planifiée
 * Supabase (pg_cron) avec ?cle=MESSAGERIE_SYNC_CLE.
 */
async function traiter(request) {
  const url = new URL(request.url);
  const cle = configEmail().cle;
  const parCle = cle && url.searchParams.get("cle") === cle;
  const u = parCle ? null : await utilisateurDepuisRequete(request);
  if (!parCle && !u) return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  const pb = problemeConfigEmail();
  if (pb) return NextResponse.json({ error: pb }, { status: 500 });

  const client = clientService();
  const { data: cfg } = await client.from("parametres_config").select("id, rh_actif, rh_derniere_synchro").order("id").limit(1).maybeSingle();
  if (!cfg?.rh_actif) return NextResponse.json({ ignore: "liaison RH désactivée" });
  // Une relève toutes les 30 s au plus (sauf demande explicite de l'admin)
  const force = url.searchParams.get("force") === "1" && u?.profil?.role === "admin";
  if (!force && cfg.rh_derniere_synchro && Date.now() - new Date(cfg.rh_derniere_synchro).getTime() < 30000) {
    return NextResponse.json({ ignore: "relève récente" });
  }
  await client.from("parametres_config").update({ rh_derniere_synchro: new Date().toISOString() }).eq("id", cfg.id);
  try {
    const bilan = await synchroniser(client);
    const statut = `OK — ${bilan.deposes || 0} message(s) reçu(s)${bilan.inconnus ? `, ${bilan.inconnus} destinataire(s) non reconnu(s)` : ""}`;
    await client.from("parametres_config").update({ rh_synchro_statut: statut }).eq("id", cfg.id);
    return NextResponse.json({ ok: true, ...bilan });
  } catch (e) {
    const msg = expliquerErreur(e);
    await client.from("parametres_config").update({ rh_synchro_statut: `Erreur (lecture IMAP) : ${msg}`.slice(0, 400) }).eq("id", cfg.id);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export const GET = traiter;
export const POST = traiter;
