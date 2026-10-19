// Liaison e-mail de la Messagerie avec les Ressources humaines (serveur uniquement).
//
// Boîte de l'application (ex. messagerie.qualite@hill-solution.fr) sur le serveur de messagerie de l'entreprise :
//   · envoi  : SMTP  (SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS)
//   · lecture: IMAP  (IMAP_HOST / IMAP_PORT, mêmes identifiants)
// Le RH écrit depuis son Gmail :
//   · « Répondre » à un e-mail reçu → la réponse retourne dans le bon fil (référence [Réf. XXXXXX] / en-têtes)
//   · nouveau message → l'objet commence par le nom de la personne (« Sami — … ») ou « Tous — … » (canal Général)
import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

export const BUCKET = "dossiers-fichiers";
const TAILLE_MAX_PJ = 15 * 1024 * 1024;

export function configEmail() {
  const user = process.env.SMTP_USER;
  return {
    smtpHost: process.env.SMTP_HOST,
    smtpPort: Number(process.env.SMTP_PORT || 465),
    imapHost: process.env.IMAP_HOST || process.env.SMTP_HOST,
    imapPort: Number(process.env.IMAP_PORT || 993),
    user,
    pass: process.env.SMTP_PASS,
    adresse: process.env.MESSAGERIE_EMAIL || user,
    cle: process.env.MESSAGERIE_SYNC_CLE,
  };
}

export function problemeConfigEmail() {
  const c = configEmail();
  const manquants = [["SMTP_HOST", c.smtpHost], ["SMTP_USER", c.user], ["SMTP_PASS", c.pass]].filter(([, v]) => !v).map(([k]) => k);
  return manquants.length ? `Variables manquantes dans Vercel : ${manquants.join(", ")}` : null;
}

/** Message d'erreur lisible pour une erreur SMTP / IMAP. */
export function expliquerErreur(e) {
  const brut = [e?.message, e?.responseText, e?.response].filter(Boolean).join(" — ");
  if (e?.authenticationFailed || /auth|login|credentials|535|password/i.test(brut))
    return `Identifiant ou mot de passe refusé par le serveur (${brut}). Vérifiez SMTP_USER / SMTP_PASS dans Vercel, et que l'accès IMAP/SMTP est autorisé pour cette boîte.`;
  if (/ENOTFOUND|EAI_AGAIN/i.test(brut)) return `Serveur introuvable (${brut}). Vérifiez SMTP_HOST / IMAP_HOST dans Vercel.`;
  if (/ECONNREFUSED|ETIMEDOUT|ECONNRESET/i.test(brut)) return `Connexion impossible (${brut}). Vérifiez le port (SMTP_PORT 465 ou 587, IMAP_PORT 993) et que le serveur accepte les connexions extérieures.`;
  if (/certificate|self.signed|TLS|SSL/i.test(brut)) return `Problème de certificat ou de chiffrement (${brut}).`;
  return brut || "Erreur inconnue";
}

export function clientService() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Utilisateur connecté (jeton envoyé par le navigateur) + son profil. */
export async function utilisateurDepuisRequete(request) {
  const token = (request.headers.get("authorization") || "").replace("Bearer ", "");
  if (!token) return null;
  const client = clientService();
  const {
    data: { user },
  } = await client.auth.getUser(token);
  if (!user) return null;
  const { data: profil } = await client.from("profiles").select("*").eq("id", user.id).maybeSingle();
  return profil ? { user, profil } : null;
}

export const listeEmailsRh = (cfg) =>
  String(cfg?.rh_emails || "")
    .split(/[,;\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.includes("@"));

const normaliser = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

function transport() {
  const c = configEmail();
  return nodemailer.createTransport({
    host: c.smtpHost,
    port: c.smtpPort,
    secure: c.smtpPort === 465,
    auth: { user: c.user, pass: c.pass },
  });
}

const echapper = (s) => String(s || "").replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);

/** Envoie au RH un message écrit dans l'application (fil RH). */
export async function envoyerVersRh(client, messageId) {
  const c = configEmail();
  const { data: m } = await client.from("chat_messages").select("*").eq("id", messageId).maybeSingle();
  if (!m) throw new Error("Message introuvable");
  const [{ data: conv }, { data: cfg }] = await Promise.all([
    client.from("chat_conversations").select("*").eq("id", m.conversation_id).maybeSingle(),
    client.from("parametres_config").select("*").order("id").limit(1).maybeSingle(),
  ]);
  if (conv?.type !== "rh") throw new Error("Ce message n'est pas adressé aux RH");
  if (!cfg?.rh_actif) throw new Error("Liaison RH désactivée");
  const destinataires = listeEmailsRh(cfg);
  if (!destinataires.length) throw new Error("Aucune adresse RH configurée");

  // Fil Gmail : on se raccroche aux e-mails précédents de la conversation
  const { data: precedents } = await client
    .from("chat_messages")
    .select("email_message_id")
    .eq("conversation_id", conv.id)
    .not("email_message_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(10);
  const refs = (precedents || []).map((p) => p.email_message_id).filter((x) => x && x !== m.email_message_id);

  const pieces = [];
  let notePiece = "";
  if (m.fichier_chemin) {
    const { data: blob } = await client.storage.from(BUCKET).download(m.fichier_chemin);
    if (blob && blob.size <= TAILLE_MAX_PJ) {
      pieces.push({ filename: m.fichier_nom || "fichier", content: Buffer.from(await blob.arrayBuffer()) });
    } else if (blob) {
      notePiece = `\n\n(Pièce jointe « ${m.fichier_nom} » trop volumineuse pour l'e-mail : elle reste dans la messagerie.)`;
    }
  }

  const sujet = `${m.auteur_nom} — Messagerie Hill Solution [Réf. ${conv.ref}]`;
  const texte = `${m.contenu || ""}${notePiece}\n\n— ${m.auteur_nom}, via la Messagerie Hill Solution.\nRépondez simplement à cet e-mail : votre réponse arrivera dans sa messagerie.`;
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1f2937">
    <p style="white-space:pre-wrap;margin:0 0 16px">${echapper(m.contenu || "")}${echapper(notePiece)}</p>
    <p style="color:#6b7280;font-size:12px;border-top:1px solid #e5e7eb;padding-top:8px;margin:0">
      <strong>${echapper(m.auteur_nom)}</strong>, via la Messagerie Hill Solution.<br>
      Répondez simplement à cet e-mail : votre réponse arrivera dans sa messagerie. Ne modifiez pas la référence de l'objet.
    </p></div>`;

  const info = await transport().sendMail({
    from: { name: `${m.auteur_nom} (Messagerie)`, address: c.adresse },
    to: destinataires,
    replyTo: c.adresse,
    subject: sujet,
    text: texte,
    html,
    attachments: pieces,
    inReplyTo: refs[0],
    references: refs.length ? refs.reverse().join(" ") : undefined,
  });
  await client.from("chat_messages").update({ email_message_id: info.messageId, email_statut: "envoyé" }).eq("id", m.id);
  return info.messageId;
}

/** Retire l'historique cité et la signature d'une réponse e-mail. */
export function nettoyerReponse(texte) {
  let t = String(texte || "").replace(/\r\n/g, "\n");
  const coupures = [
    /\n[^\n]*\b(Le|On)\b[^\n]*\n?[^\n]*\b(a\s+écrit|wrote)\s*:/i,
    /\n-{2,}\s*(Original Message|Message d'origine|Message transféré|Forwarded message)/i,
    /\n_{5,}/,
    /\nDe\s*:\s[^\n]+\n(Envoyé|Date)\s*:/i,
    /\nFrom\s*:\s[^\n]+\n(Sent|Date)\s*:/i,
    /\n--\s*\n/,
  ];
  for (const r of coupures) {
    const i = t.search(r);
    if (i >= 0) t = t.slice(0, i);
  }
  t = t
    .split("\n")
    .filter((l) => !/^\s*>/.test(l))
    .join("\n");
  return t.replace(/\n{3,}/g, "\n\n").trim();
}

const nettoyerNomFichier = (n) =>
  String(n || "fichier")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_");

async function filRhDe(client, userId, cfg) {
  const { data: membres } = await client.from("chat_membres").select("conversation_id, chat_conversations!inner(type)").eq("user_id", userId).eq("chat_conversations.type", "rh");
  if (membres?.length) return membres[0].conversation_id;
  const ref = Math.random().toString(36).slice(2, 8).toUpperCase();
  const { data: conv, error } = await client.from("chat_conversations").insert({ type: "rh", nom: cfg.rh_libelle || "Ressources humaines", ref }).select("id").single();
  if (error) throw error;
  await client.from("chat_membres").insert({ conversation_id: conv.id, user_id: userId });
  return conv.id;
}

/** Trouve la conversation d'un e-mail reçu du RH. */
async function aiguiller(client, mail, cfg) {
  const sujet = String(mail.subject || "");
  const ref = sujet.match(/R[ée]f\.?\s*([A-Z0-9]{6})/i)?.[1]?.toUpperCase();
  if (ref) {
    const { data } = await client.from("chat_conversations").select("id").eq("ref", ref).maybeSingle();
    if (data) return { conv: data.id };
  }
  const ids = [mail.inReplyTo, ...(Array.isArray(mail.references) ? mail.references : [mail.references])].filter(Boolean);
  if (ids.length) {
    const { data } = await client.from("chat_messages").select("conversation_id").in("email_message_id", ids).limit(1);
    if (data?.length) return { conv: data[0].conversation_id };
  }
  // Nouveau message : « Nom — objet »
  const debut = normaliser(sujet.replace(/^\s*((re|tr|fwd?|réf)\s*:\s*)+/i, "").split(/\s+[—–-]\s+|\s*:\s*/)[0]);
  if (!debut) return { inconnu: true };
  if (["tous", "tout le monde", "general", "général"].includes(debut)) {
    const { data } = await client.from("chat_conversations").select("id").eq("type", "public").order("created_at").limit(1);
    if (data?.length) return { conv: data[0].id, general: true };
  }
  const { data: profils } = await client.from("profiles").select("id, nom_complet, ingenieur_ref, role, fonction, chat_actif");
  const candidats = (profils || []).filter(
    (p) => p.chat_actif !== false && !(p.role === "admin" && p.fonction !== "Responsable") && [p.nom_complet, p.ingenieur_ref].some((n) => n && normaliser(n) === debut)
  );
  if (candidats.length === 1) return { conv: await filRhDe(client, candidats[0].id, cfg) };
  return { inconnu: true, ambigu: candidats.length > 1 };
}

async function repondreInconnu(client, mail, cfg, ambigu) {
  const c = configEmail();
  const { data: profils } = await client.from("profiles").select("nom_complet, role, fonction, chat_actif");
  const noms = (profils || [])
    .filter((p) => p.chat_actif !== false && !(p.role === "admin" && p.fonction !== "Responsable") && p.nom_complet)
    .map((p) => p.nom_complet)
    .sort((a, b) => a.localeCompare(b));
  const texte =
    `${ambigu ? "Plusieurs personnes portent ce nom." : "Le destinataire de votre message n'a pas été reconnu."}\n\n` +
    `Pour écrire à quelqu'un, commencez l'objet par son nom exact suivi d'un tiret, par exemple :\n« ${noms[0] || "Sami"} — visite médicale »\n` +
    `Pour écrire à tout le monde : « Tous — … »\n\nNoms reconnus :\n${noms.map((n) => `• ${n}`).join("\n")}\n\nVotre message n'a pas été transmis.`;
  await transport().sendMail({
    from: { name: "Messagerie Hill Solution", address: c.adresse },
    to: mail.from?.value?.[0]?.address,
    subject: `Message non transmis : ${mail.subject || "(sans objet)"}`,
    text: texte,
    inReplyTo: mail.messageId,
  });
}

/** Lit les nouveaux e-mails du RH dans la boîte de l'application et les dépose dans la messagerie. */
export async function synchroniser(client) {
  const c = configEmail();
  const { data: cfg } = await client.from("parametres_config").select("*").order("id").limit(1).maybeSingle();
  if (!cfg?.rh_actif) return { ignore: "liaison RH désactivée" };
  const autorises = listeEmailsRh(cfg);
  const imap = new ImapFlow({ host: c.imapHost, port: c.imapPort, secure: c.imapPort === 993, auth: { user: c.user, pass: c.pass }, logger: false });
  const bilan = { lus: 0, deposes: 0, ignores: 0, inconnus: 0 };
  await imap.connect();
  const verrou = await imap.getMailboxLock("INBOX");
  try {
    const uids = (await imap.search({ seen: false }, { uid: true })) || [];
    for (const uid of uids.slice(0, 40)) {
      const msg = await imap.fetchOne(String(uid), { source: true }, { uid: true });
      const mail = await simpleParser(msg.source);
      bilan.lus++;
      const expediteur = String(mail.from?.value?.[0]?.address || "").toLowerCase();
      const marquer = () => imap.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });
      if (!autorises.includes(expediteur) || /auto-submitted:\s*auto/i.test(String(mail.headers?.get("auto-submitted") || ""))) {
        bilan.ignores++;
        await marquer();
        continue;
      }
      const cible = await aiguiller(client, mail, cfg);
      if (!cible.conv) {
        bilan.inconnus++;
        await repondreInconnu(client, mail, cfg, cible.ambigu).catch(() => {});
        await marquer();
        continue;
      }
      // Pas de doublon si l'e-mail a déjà été déposé
      const { data: deja } = await client.from("chat_messages").select("id").eq("email_message_id", mail.messageId).limit(1);
      if (deja?.length) {
        await marquer();
        continue;
      }
      const texte = nettoyerReponse(mail.text || "");
      const sujetSeul = String(mail.subject || "").split(/\s+[—–-]\s+/).slice(1).join(" — ").replace(/\[R[ée]f\.[^\]]*\]/i, "").trim();
      const contenu = cible.general && sujetSeul ? `${sujetSeul}\n\n${texte}`.trim() : texte;
      const base = { conversation_id: cible.conv, auteur_id: null, auteur_nom: cfg.rh_libelle || "Ressources humaines", source: "email" };
      const pjs = (mail.attachments || []).filter((a) => a.contentDisposition !== "inline" && a.size <= 20 * 1024 * 1024);
      if (contenu || !pjs.length) {
        await client.from("chat_messages").insert({ ...base, contenu: contenu || "(message vide)", email_message_id: mail.messageId });
      }
      for (const [i, a] of pjs.entries()) {
        const chemin = `chat/${cible.conv}/${Date.now()}_${i}_${nettoyerNomFichier(a.filename)}`;
        const up = await client.storage.from(BUCKET).upload(chemin, a.content, { contentType: a.contentType || undefined });
        if (!up.error)
          await client.from("chat_messages").insert({ ...base, fichier_chemin: chemin, fichier_nom: a.filename || "fichier", email_message_id: contenu || i ? null : mail.messageId });
      }
      bilan.deposes++;
      await marquer();
    }
  } finally {
    verrou.release();
    await imap.logout().catch(() => {});
  }
  return bilan;
}
