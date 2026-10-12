import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { problemeCleService } from "@/lib/cleService";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DOMAINE = "@hillsolution.local";

// Vérifie que la requête vient bien d'un utilisateur connecté avec le rôle admin.
// Le token d'accès est envoyé par le client dans l'en-tête Authorization.
async function verifierAdmin(request) {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.replace("Bearer ", "");
  if (!token) return null;

  const supabaseAuth = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const {
    data: { user },
  } = await supabaseAuth.auth.getUser(token);
  if (!user) return null;

  const { data: profile } = await supabaseAuth.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return null;

  return user;
}

// Client avec la clé service_role — accès admin complet, jamais exposé au navigateur.
function clientAdmin() {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function controles(request) {
  const admin = await verifierAdmin(request);
  if (!admin) return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  const pbCle = problemeCleService();
  if (pbCle) return NextResponse.json({ error: pbCle }, { status: 500 });
  return null;
}

// Durée de blocage d'un compte désactivé (≈ 100 ans) ; « none » le réactive.
const BLOCAGE = "876000h";
const estActif = (u) => !(u.banned_until && new Date(u.banned_until) > new Date());

const versEmail = (u) => {
  const s = String(u || "").trim().toLowerCase();
  return s.includes("@") ? s : `${s}${DOMAINE}`;
};

/** « responsable » = rôle admin avec le libellé Responsable. */
function roleEtFonction(role) {
  const r = String(role || "").trim().toLowerCase();
  if (r.startsWith("resp")) return { role: "admin", fonction: "Responsable" };
  if (r.startsWith("qual")) return { role: "qualite", fonction: null };
  if (r.startsWith("ing")) return { role: "ingenieur", fonction: null };
  if (r.startsWith("adm")) return { role: "admin", fonction: null };
  return null;
}

// Mot de passe consultable par l'admin (migration V18). Silencieux si la table n'existe pas encore.
async function memoriserMotDePasse(client, id, motDePasse) {
  await client.from("comptes_mots_de_passe").upsert({ id, mot_de_passe: motDePasse, updated_at: new Date().toISOString() });
}

// Profil : la colonne « fonction » n'existe qu'après la V18 → on réessaie sans elle.
async function ecrireProfil(client, ligne, existe) {
  const tenter = (l) => (existe ? client.from("profiles").update(l).eq("id", l.id) : client.from("profiles").insert(l));
  let { error } = await tenter(ligne);
  if (error && /fonction/.test(error.message)) {
    const { fonction, ...sans } = ligne;
    ({ error } = await tenter(sans));
  }
  return error;
}

/** Un compte Qualité doit figurer dans la liste « Service qualité » (pour « Audité par »). */
async function ajouterValidateur(client, nom, ancienNom) {
  if (!nom) return;
  const { data: existe } = await client.from("parametres_validateurs").select("id, actif").ilike("nom", nom).maybeSingle();
  if (existe) {
    if (existe.actif === false) await client.from("parametres_validateurs").update({ actif: true }).eq("id", existe.id);
    return;
  }
  // Renommage : on renomme l'ancien nom s'il n'est utilisé par aucun dossier, sinon on ajoute le nouveau
  if (ancienNom) {
    const { error } = await client.from("parametres_validateurs").update({ nom }).eq("nom", ancienNom);
    if (!error) {
      const { data: ok } = await client.from("parametres_validateurs").select("id").eq("nom", nom).maybeSingle();
      if (ok) return;
    }
  }
  await client.from("parametres_validateurs").insert({ nom, actif: true });
}

export async function GET(request) {
  const refus = await controles(request);
  if (refus) return refus;

  const client = clientAdmin();
  const { data: authData, error } = await client.auth.admin.listUsers({ perPage: 1000 });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const [{ data: profiles }, mdp] = await Promise.all([
    client.from("profiles").select("*"),
    client.from("comptes_mots_de_passe").select("id, mot_de_passe"),
  ]);
  const motsDePasse = new Map((mdp.data || []).map((m) => [m.id, m.mot_de_passe]));

  const comptes = authData.users.map((u) => {
    const p = (profiles || []).find((p) => p.id === u.id);
    return {
      id: u.id,
      email: u.email,
      nom_complet: p?.nom_complet || null,
      role: p?.role || null,
      fonction: p?.fonction || null,
      ingenieur_ref: p?.ingenieur_ref || null,
      mot_de_passe: motsDePasse.get(u.id) || null,
      actif: estActif(u),
      created_at: u.created_at,
    };
  });

  return NextResponse.json({ comptes, v18: !mdp.error, moi: (await verifierAdmin(request))?.id || null });
}

/**
 * Création d'un compte, ou d'un lot : { comptes: [{ nomUtilisateur, motDePasse, nomComplet, role, ingenieurRef }] }.
 * Dans un lot, un identifiant qui existe déjà est mis à jour (mot de passe, nom, rôle) — utile pour l'import Excel.
 */
export async function POST(request) {
  const refus = await controles(request);
  if (refus) return refus;

  const corps = await request.json();
  const lot = Array.isArray(corps.comptes);
  const demandes = lot ? corps.comptes : [corps];
  const client = clientAdmin();

  let existants = [];
  if (lot) {
    const { data } = await client.auth.admin.listUsers({ perPage: 1000 });
    existants = data?.users || [];
  }

  const resultats = [];
  for (const c of demandes) {
    const nomUtilisateur = String(c.nomUtilisateur || "").trim();
    const motDePasse = String(c.motDePasse || "");
    const rf = roleEtFonction(c.role);
    const res = { nomUtilisateur };
    try {
      if (!nomUtilisateur || !rf) throw new Error("Nom d'utilisateur ou rôle manquant");
      const email = versEmail(nomUtilisateur);
      const nomComplet = String(c.nomComplet || "").trim() || nomUtilisateur;
      const ingenieurRef = rf.role === "ingenieur" ? String(c.ingenieurRef || nomComplet).trim() : null;
      const deja = existants.find((u) => u.email?.toLowerCase() === email);

      let id;
      if (deja) {
        if (motDePasse) {
          if (motDePasse.length < 6) throw new Error("Mot de passe trop court (6 caractères minimum)");
          const { error } = await client.auth.admin.updateUserById(deja.id, { password: motDePasse });
          if (error) throw error;
        }
        id = deja.id;
        res.action = "mis à jour";
      } else {
        if (motDePasse.length < 6) throw new Error("Mot de passe trop court (6 caractères minimum)");
        const { data, error } = await client.auth.admin.createUser({ email, password: motDePasse, email_confirm: true });
        if (error) throw error;
        id = data.user.id;
        res.action = "créé";
      }

      const { data: profilExistant } = await client.from("profiles").select("id, nom_complet").eq("id", id).maybeSingle();
      const err = await ecrireProfil(
        client,
        { id, nom_complet: nomComplet, role: rf.role, fonction: rf.fonction, ingenieur_ref: ingenieurRef },
        !!profilExistant
      );
      if (err) throw err;
      if (motDePasse) await memoriserMotDePasse(client, id, motDePasse);
      if (rf.role === "qualite") await ajouterValidateur(client, nomComplet, profilExistant?.nom_complet);
      res.ok = true;
      res.id = id;
    } catch (e) {
      res.ok = false;
      res.error = e.message;
    }
    resultats.push(res);
  }

  if (!lot) {
    const r = resultats[0];
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 500 });
    return NextResponse.json({ ok: true, id: r.id });
  }
  return NextResponse.json({ resultats });
}

/** Modification : mot de passe, rôle, nom complet, identifiant, ingénieur lié. */
export async function PATCH(request) {
  const refus = await controles(request);
  if (refus) return refus;
  try {
    return await modifier(request, await verifierAdmin(request));
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

async function modifier(request, admin) {
  const { id, nouveauMotDePasse, role, nomComplet, nomUtilisateur, ingenieurRef, actif } = await request.json();
  if (!id) return NextResponse.json({ error: "id manquant" }, { status: 400 });
  const soiMeme = admin?.id === id;
  if (soiMeme && actif === false) return NextResponse.json({ error: "Vous ne pouvez pas désactiver votre propre compte." }, { status: 400 });
  if (soiMeme && role && !["admin", "responsable"].includes(String(role).toLowerCase()))
    return NextResponse.json({ error: "Vous ne pouvez pas retirer vos propres droits admin." }, { status: 400 });

  const client = clientAdmin();
  const majAuth = {};
  if (actif === true || actif === false) majAuth.ban_duration = actif ? "none" : BLOCAGE;
  if (nouveauMotDePasse) {
    if (nouveauMotDePasse.length < 6) return NextResponse.json({ error: "Mot de passe trop court (6 caractères minimum)" }, { status: 400 });
    majAuth.password = nouveauMotDePasse;
  }
  if (nomUtilisateur) majAuth.email = versEmail(nomUtilisateur);
  if (Object.keys(majAuth).length) {
    const { error } = await client.auth.admin.updateUserById(id, { ...majAuth, ...(majAuth.email ? { email_confirm: true } : {}) });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (nouveauMotDePasse) await memoriserMotDePasse(client, id, nouveauMotDePasse);

  const { data: avant } = await client.from("profiles").select("*").eq("id", id).maybeSingle();
  const maj = {};
  if (role) {
    const rf = roleEtFonction(role);
    if (!rf) return NextResponse.json({ error: "Rôle inconnu" }, { status: 400 });
    maj.role = rf.role;
    maj.fonction = rf.fonction;
    if (rf.role !== "ingenieur") maj.ingenieur_ref = null;
  }
  if (nomComplet !== undefined && nomComplet !== null) maj.nom_complet = String(nomComplet).trim() || avant?.nom_complet;
  if (ingenieurRef !== undefined) maj.ingenieur_ref = ingenieurRef ? String(ingenieurRef).trim() : null;
  if (Object.keys(maj).length) {
    const error = await ecrireProfil(client, { id, ...maj }, true);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const roleFinal = maj.role || avant?.role;
  if (roleFinal === "qualite" && (maj.nom_complet || maj.role)) {
    await ajouterValidateur(client, maj.nom_complet || avant?.nom_complet, maj.nom_complet ? avant?.nom_complet : null);
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request) {
  const refus = await controles(request);
  if (refus) return refus;

  const { id } = await request.json();
  if (!id) return NextResponse.json({ error: "id manquant" }, { status: 400 });
  if ((await verifierAdmin(request))?.id === id) return NextResponse.json({ error: "Vous ne pouvez pas supprimer votre propre compte." }, { status: 400 });

  const client = clientAdmin();
  const { error } = await client.auth.admin.deleteUser(id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await client.from("profiles").delete().eq("id", id);

  return NextResponse.json({ ok: true });
}
