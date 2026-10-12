import { NextResponse } from "next/server";
import { clientService, envoyerVersRh, problemeConfigEmail, utilisateurDepuisRequete } from "@/lib/messagerieEmail";

export const runtime = "nodejs";
export const maxDuration = 30;

/** Envoie au RH (e-mail) un message que la personne connectée vient d'écrire dans son fil RH. */
export async function POST(request) {
  const u = await utilisateurDepuisRequete(request);
  if (!u) return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  const pb = problemeConfigEmail();
  if (pb) return NextResponse.json({ error: pb }, { status: 500 });

  const { messageId } = await request.json();
  const client = clientService();
  const { data: m } = await client.from("chat_messages").select("id, auteur_id").eq("id", messageId).maybeSingle();
  if (!m || m.auteur_id !== u.user.id) return NextResponse.json({ error: "Message introuvable" }, { status: 404 });
  try {
    await envoyerVersRh(client, messageId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    await client.from("chat_messages").update({ email_statut: `erreur : ${e.message}`.slice(0, 300) }).eq("id", messageId);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
