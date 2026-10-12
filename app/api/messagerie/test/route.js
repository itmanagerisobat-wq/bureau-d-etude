import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { ImapFlow } from "imapflow";
import { clientService, configEmail, expliquerErreur, listeEmailsRh, problemeConfigEmail, utilisateurDepuisRequete } from "@/lib/messagerieEmail";

export const runtime = "nodejs";
export const maxDuration = 45;

/**
 * Admin : teste la boîte de la messagerie (envoi SMTP + lecture IMAP) et envoie un e-mail d'essai au RH.
 * Les adresses RH viennent du formulaire (si fournies) sinon de Paramètres.
 */
export async function POST(request) {
  const u = await utilisateurDepuisRequete(request);
  if (u?.profil?.role !== "admin") return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  const pb = problemeConfigEmail();
  if (pb) return NextResponse.json({ error: pb }, { status: 500 });
  const c = configEmail();
  const corps = await request.json().catch(() => ({}));
  let to = listeEmailsRh({ rh_emails: corps.rhEmails || "" });
  if (!to.length) {
    const { data: cfg } = await clientService().from("parametres_config").select("rh_emails").order("id").limit(1).maybeSingle();
    to = listeEmailsRh(cfg);
  }
  if (!to.length) return NextResponse.json({ error: "Aucune adresse RH : saisissez-la puis cliquez sur Enregistrer." }, { status: 400 });

  const bilan = { smtp: null, imap: null, envoyeA: null };
  // 1. Envoi (SMTP)
  try {
    const t = nodemailer.createTransport({ host: c.smtpHost, port: c.smtpPort, secure: c.smtpPort === 465, auth: { user: c.user, pass: c.pass } });
    await t.verify();
    await t.sendMail({
      from: { name: "Messagerie Hill Solution", address: c.adresse },
      to,
      subject: "Test — Messagerie Hill Solution",
      text:
        "Ceci est un e-mail de test de la Messagerie Hill Solution.\n\n" +
        "Répondez à cet e-mail avec l'objet « Tous — test » pour vérifier que vos messages arrivent bien dans l'application.\n\n" +
        "Pour écrire à quelqu'un : envoyez un e-mail à cette adresse avec pour objet « Nom — sujet » (ex. « Sami — visite médicale »).\n" +
        "Pour écrire à tout le monde : « Tous — sujet ».\nPour répondre à un message reçu : cliquez simplement sur « Répondre ».",
    });
    bilan.smtp = "OK";
    bilan.envoyeA = to;
  } catch (e) {
    bilan.smtp = `Erreur : ${expliquerErreur(e)}`;
  }
  // 2. Lecture (IMAP)
  const imap = new ImapFlow({ host: c.imapHost, port: c.imapPort, secure: c.imapPort === 993, auth: { user: c.user, pass: c.pass }, logger: false });
  try {
    await imap.connect();
    const st = await imap.status("INBOX", { messages: true, unseen: true });
    bilan.imap = `OK (${st.messages} e-mail(s) dans la boîte, ${st.unseen} non lu(s))`;
    await imap.logout();
  } catch (e) {
    bilan.imap = `Erreur : ${expliquerErreur(e)}`;
    await imap.logout().catch(() => {});
  }
  return NextResponse.json(bilan, { status: bilan.smtp === "OK" && bilan.imap?.startsWith("OK") ? 200 : 207 });
}
