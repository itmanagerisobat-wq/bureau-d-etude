"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Icon from "@/components/ui/Icon";
import Avatar from "@/components/ui/Avatar";

const DOMAINE = "@hillsolution.local";

async function appelApi(supabase, methode, corps) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const res = await fetch("/api/admin/comptes", {
    method: methode,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session?.access_token}`,
    },
    body: corps ? JSON.stringify(corps) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Erreur inconnue");
  return data;
}

/** Mot de passe lisible (sans 0/O, 1/l/I) : ex. « Hs-kare-4827 ». */
export function genererMotDePasse() {
  const lettres = "abcdefghjkmnpqrstuvwxyz";
  const chiffres = "23456789";
  const alea = (n) => {
    const t = new Uint32Array(n);
    crypto.getRandomValues(t);
    return [...t];
  };
  const l = alea(4).map((x) => lettres[x % lettres.length]).join("");
  const c = alea(4).map((x) => chiffres[x % chiffres.length]).join("");
  return `Hs-${l}-${c}`;
}

/** « Meriem Nechi » → « meriem.nechi » */
export function identifiantDepuisNom(nom) {
  return String(nom || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "");
}

const ROLES = [
  ["ingenieur", "Ingénieur"],
  ["qualite", "Qualité"],
  ["responsable", "Responsable"],
  ["admin", "Admin"],
];
const roleAffiche = (c) => (c.role === "admin" && c.fonction === "Responsable" ? "responsable" : c.role || "");
const libelleRole = (r) => ROLES.find(([v]) => v === r)?.[1] || r;
const identifiant = (c) => c.email?.replace(DOMAINE, "") || "";

function roleDepuisTexte(t) {
  const r = String(t || "").trim().toLowerCase();
  if (r.startsWith("resp")) return "responsable";
  if (r.startsWith("qual")) return "qualite";
  if (r.startsWith("ing")) return "ingenieur";
  if (r.startsWith("adm")) return "admin";
  return "";
}

async function exporterExcel(lignes, nomFichier) {
  const XLSX = await import("xlsx");
  const feuille = XLSX.utils.json_to_sheet(
    lignes.map((c) => ({
      "Nom d'utilisateur": c.nomUtilisateur,
      "Mot de passe": c.motDePasse || "",
      "Nom complet": c.nomComplet || "",
      Rôle: libelleRole(c.role),
      "Ingénieur lié": c.ingenieurRef || "",
    }))
  );
  feuille["!cols"] = [{ wch: 24 }, { wch: 18 }, { wch: 26 }, { wch: 14 }, { wch: 24 }];
  const classeur = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(classeur, feuille, "Comptes");
  XLSX.writeFile(classeur, `${nomFichier}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export default function GestionComptes({ supabase }) {
  const [comptes, setComptes] = useState([]);
  const [v18, setV18] = useState(true);
  const [moi, setMoi] = useState(null);
  const [monMdp, setMonMdp] = useState({ nouveau: "", confirmation: "", message: "", ok: false });
  const [ingenieurs, setIngenieurs] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState("");
  const [nouveauCompte, setNouveauCompte] = useState({ nomUtilisateur: "", motDePasse: "", nomComplet: "", role: "ingenieur" });
  const [visibles, setVisibles] = useState({}); // id → mot de passe affiché
  const [edition, setEdition] = useState(null); // { id, nomUtilisateur, nomComplet, ingenieurRef }
  const [lot, setLot] = useState(null); // { titre, lignes: [...] } — aperçu avant création / import
  const [envoi, setEnvoi] = useState(false);
  const [bilan, setBilan] = useState(null);
  const [nbQualite, setNbQualite] = useState(4);
  const [nbResp, setNbResp] = useState(2);
  const fichierRef = useRef(null);

  async function charger() {
    setChargement(true);
    setErreur("");
    try {
      const [res, { data: ings }] = await Promise.all([
        appelApi(supabase, "GET"),
        supabase.from("parametres_ingenieurs").select("nom").eq("actif", true).order("nom"),
      ]);
      setComptes(res.comptes);
      setV18(res.v18 !== false);
      setMoi(res.moi || null);
      setIngenieurs((ings || []).map((r) => r.nom).filter((n) => n && n.toLowerCase() !== "autre"));
    } catch (e) {
      setErreur(e.message);
    }
    setChargement(false);
  }

  useEffect(() => {
    charger();
  }, []);

  const identifiantsPris = useMemo(() => new Set(comptes.map((c) => identifiant(c).toLowerCase())), [comptes]);
  const ingenieursSansCompte = ingenieurs.filter(
    (n) => !comptes.some((c) => c.role === "ingenieur" && String(c.ingenieur_ref || "").toLowerCase() === n.toLowerCase())
  );

  async function creerCompte(e) {
    e.preventDefault();
    setErreur("");
    try {
      await appelApi(supabase, "POST", {
        ...nouveauCompte,
        ingenieurRef: nouveauCompte.role === "ingenieur" ? nouveauCompte.nomComplet || nouveauCompte.nomUtilisateur : null,
      });
      setNouveauCompte({ nomUtilisateur: "", motDePasse: "", nomComplet: "", role: "ingenieur" });
      charger();
    } catch (e) {
      setErreur(e.message);
    }
  }

  // ---------- Génération automatique ----------
  function preparerGeneration(type) {
    const pris = new Set(identifiantsPris);
    const unique = (base) => {
      let id = base || "compte";
      let i = 2;
      while (pris.has(id)) id = `${base}${i++}`;
      pris.add(id);
      return id;
    };
    const avecIng = type === "ingenieurs";
    const avecAutres = type === "autres";
    const lignes = [
      ...(avecIng ? ingenieursSansCompte : []).map((n) => ({
        nomUtilisateur: unique(identifiantDepuisNom(n)),
        motDePasse: genererMotDePasse(),
        nomComplet: n,
        role: "ingenieur",
        ingenieurRef: n,
      })),
      ...Array.from({ length: avecAutres ? Math.max(0, Number(nbQualite) || 0) : 0 }, (_, i) => ({
        nomUtilisateur: unique(`qualite${i + 1}`),
        motDePasse: genererMotDePasse(),
        nomComplet: `Qualité ${i + 1}`,
        role: "qualite",
        ingenieurRef: "",
      })),
      ...Array.from({ length: avecAutres ? Math.max(0, Number(nbResp) || 0) : 0 }, (_, i) => ({
        nomUtilisateur: unique(`responsable${i + 1}`),
        motDePasse: genererMotDePasse(),
        nomComplet: `Responsable ${i + 1}`,
        role: "responsable",
        ingenieurRef: "",
      })),
    ];
    setBilan(null);
    if (!lignes.length) {
      setErreur(avecIng ? "Tous les ingénieurs actifs ont déjà un compte." : "Indiquez au moins un compte Qualité ou Responsable.");
      return;
    }
    setErreur("");
    setLot({ titre: avecIng ? "Comptes ingénieurs à créer" : "Comptes Qualité / Responsable à créer", lignes });
  }

  // ---------- Import Excel ----------
  async function importer(fichier) {
    if (!fichier) return;
    setErreur("");
    const XLSX = await import("xlsx");
    const classeur = XLSX.read(await fichier.arrayBuffer());
    const brut = XLSX.utils.sheet_to_json(classeur.Sheets[classeur.SheetNames[0]], { defval: "" });
    const norm = (s) =>
      String(s)
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z]/g, "");
    const champ = (ligne, ...noms) => {
      const k = Object.keys(ligne).find((x) => noms.includes(norm(x)));
      return k ? String(ligne[k]).trim() : "";
    };
    const lignes = brut
      .map((l) => {
        const role = roleDepuisTexte(champ(l, "role", "profil", "fonction"));
        const nomComplet = champ(l, "nomcomplet", "nom", "personne");
        return {
          nomUtilisateur: champ(l, "nomdutilisateur", "nomutilisateur", "identifiant", "utilisateur", "login").toLowerCase(),
          motDePasse: champ(l, "motdepasse", "password", "mdp"),
          nomComplet,
          role,
          ingenieurRef: role === "ingenieur" ? champ(l, "ingenieurlie", "ingenieur") || nomComplet : "",
        };
      })
      .filter((l) => l.nomUtilisateur);
    if (!lignes.length) {
      setErreur("Aucune ligne lue : le fichier doit contenir au moins la colonne « Nom d'utilisateur » (et Mot de passe, Nom complet, Rôle).");
      return;
    }
    setBilan(null);
    setLot({ titre: `Import « ${fichier.name} »`, lignes });
  }

  function majLigne(i, cle, valeur) {
    setLot((l) => ({ ...l, lignes: l.lignes.map((x, k) => (k === i ? { ...x, [cle]: valeur } : x)) }));
  }

  const problemeLigne = (l) => {
    if (!l.nomUtilisateur) return "identifiant vide";
    if (!/^[a-z0-9._-]+$/.test(l.nomUtilisateur) && !l.nomUtilisateur.includes("@")) return "identifiant : lettres, chiffres, . _ - uniquement";
    if (!l.role) return "rôle inconnu";
    const existe = identifiantsPris.has(l.nomUtilisateur.toLowerCase());
    if (!existe && (l.motDePasse || "").length < 6) return "mot de passe (6 car. min.)";
    if (existe && l.motDePasse && l.motDePasse.length < 6) return "mot de passe (6 car. min.)";
    return null;
  };

  async function envoyerLot() {
    const valides = lot.lignes.filter((l) => !problemeLigne(l));
    if (!valides.length) return;
    setEnvoi(true);
    setErreur("");
    try {
      const resultats = [];
      for (let i = 0; i < valides.length; i += 10) {
        const { resultats: r } = await appelApi(supabase, "POST", { comptes: valides.slice(i, i + 10) });
        resultats.push(...r);
      }
      const ok = resultats.filter((r) => r.ok);
      setBilan({
        crees: ok.filter((r) => r.action === "créé").length,
        maj: ok.filter((r) => r.action !== "créé").length,
        erreurs: resultats.filter((r) => !r.ok),
      });
      // Fiche Excel des identifiants créés (à distribuer)
      const okNoms = new Set(ok.map((r) => r.nomUtilisateur));
      const aExporter = valides.filter((l) => okNoms.has(l.nomUtilisateur));
      if (aExporter.length) await exporterExcel(aExporter, "HILLSOLUTION_comptes_crees");
      setLot(null);
      charger();
    } catch (e) {
      setErreur(e.message);
    }
    setEnvoi(false);
  }

  // ---------- Actions par compte ----------
  async function changerMotDePasse(compte) {
    const propose = genererMotDePasse();
    const nouveau = prompt(`Nouveau mot de passe pour ${identifiant(compte)} (6 caractères min.) :`, propose);
    if (!nouveau) return;
    try {
      await appelApi(supabase, "PATCH", { id: compte.id, nouveauMotDePasse: nouveau });
      setVisibles((v) => ({ ...v, [compte.id]: true }));
      charger();
    } catch (e) {
      alert("Erreur : " + e.message);
    }
  }

  async function changerRole(compte, nouveauRole) {
    try {
      await appelApi(supabase, "PATCH", {
        id: compte.id,
        role: nouveauRole,
        ...(nouveauRole === "ingenieur" && !compte.ingenieur_ref ? { ingenieurRef: compte.nom_complet } : {}),
      });
      charger();
    } catch (e) {
      alert("Erreur : " + e.message);
    }
  }

  async function enregistrerEdition() {
    const c = comptes.find((x) => x.id === edition.id);
    const corps = { id: edition.id };
    if (edition.nomUtilisateur.trim().toLowerCase() !== identifiant(c).toLowerCase()) corps.nomUtilisateur = edition.nomUtilisateur.trim().toLowerCase();
    if (edition.nomComplet.trim() !== (c.nom_complet || "")) corps.nomComplet = edition.nomComplet.trim();
    if (c.role === "ingenieur" && edition.ingenieurRef !== (c.ingenieur_ref || "")) corps.ingenieurRef = edition.ingenieurRef || null;
    try {
      if (Object.keys(corps).length > 1) await appelApi(supabase, "PATCH", corps);
      setEdition(null);
      charger();
    } catch (e) {
      alert("Erreur : " + e.message);
    }
  }

  async function basculerActif(compte) {
    const desactiver = compte.actif !== false;
    if (desactiver && !confirm(`Désactiver le compte ${identifiant(compte)} ? La personne ne pourra plus se connecter (vous pourrez le réactiver à tout moment).`)) return;
    try {
      await appelApi(supabase, "PATCH", { id: compte.id, actif: !desactiver });
      charger();
    } catch (e) {
      alert("Erreur : " + e.message);
    }
  }

  async function changerMonMotDePasse(e) {
    e.preventDefault();
    if (monMdp.nouveau.length < 6) return setMonMdp((m) => ({ ...m, message: "6 caractères minimum.", ok: false }));
    if (monMdp.nouveau !== monMdp.confirmation) return setMonMdp((m) => ({ ...m, message: "Les deux mots de passe ne sont pas identiques.", ok: false }));
    try {
      await appelApi(supabase, "PATCH", { id: moi, nouveauMotDePasse: monMdp.nouveau });
      setMonMdp({ nouveau: "", confirmation: "", message: "Mot de passe modifié ✓ — utilisez-le à la prochaine connexion.", ok: true });
      charger();
    } catch (err) {
      setMonMdp((m) => ({ ...m, message: err.message, ok: false }));
    }
  }

  async function supprimerCompte(compte) {
    if (!confirm(`Supprimer définitivement le compte ${identifiant(compte)} ? Cette action est irréversible.`)) return;
    try {
      await appelApi(supabase, "DELETE", { id: compte.id });
      charger();
    } catch (e) {
      alert("Erreur : " + e.message);
    }
  }

  function exporterTous() {
    exporterExcel(
      comptes.map((c) => ({
        nomUtilisateur: identifiant(c),
        motDePasse: c.mot_de_passe,
        nomComplet: c.nom_complet,
        role: roleAffiche(c),
        ingenieurRef: c.ingenieur_ref,
      })),
      "HILLSOLUTION_comptes"
    );
  }

  const ordreRole = { responsable: 0, admin: 1, qualite: 2, ingenieur: 3 };
  const tries = [...comptes].sort(
    (a, b) => (ordreRole[roleAffiche(a)] ?? 9) - (ordreRole[roleAffiche(b)] ?? 9) || identifiant(a).localeCompare(identifiant(b))
  );

  return (
    <div className="flex flex-col gap-6">
      {erreur && (
        <div className="alert alert-red">
          <Icon name="alert" size={16} className="mt-0.5" />
          <span>{erreur}</span>
        </div>
      )}
      {!v18 && (
        <div className="alert alert-gold text-sm">
          <Icon name="alert" size={16} className="mt-0.5" />
          <span>
            Exécutez la migration <strong>V18</strong> dans Supabase pour retrouver les mots de passe ici et pour que chaque ingénieur voie ses dossiers avec son
            compte personnel.
          </span>
        </div>
      )}

      {/* Génération automatique + import / export */}
      <div className="card p-5">
        <p className="card-title mb-1">
          <Icon name="users" size={15} className="text-ink/40" />
          Créer les comptes de l'équipe
        </p>
        <p className="text-xs text-ink/55 mb-4">
          « Comptes ingénieurs » crée un compte pour chaque ingénieur actif qui n'en a pas encore (à refaire quand un nouvel ingénieur arrive) ; il arrive directement sur ses dossiers, sans code PIN. Les comptes Qualité et Responsable se génèrent à part.
          Identifiants et mots de passe sont générés, modifiables avant la création, puis téléchargés en Excel. Vous pourrez renommer chaque compte ensuite.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <button className="btn-primary btn-sm" onClick={() => preparerGeneration("ingenieurs")} disabled={chargement}>
            <Icon name="plus" size={14} />
            Générer les comptes ingénieurs
            <span className="badge bg-white/20 text-white ml-1">{ingenieursSansCompte.length}</span>
          </button>
          <span className="w-px h-8 bg-line mx-1" />
          <label className="text-xs font-semibold text-ink/60 flex flex-col gap-1">
            Comptes Qualité
            <input type="number" min="0" max="20" className="input input-sm w-24" value={nbQualite} onChange={(e) => setNbQualite(e.target.value)} />
          </label>
          <label className="text-xs font-semibold text-ink/60 flex flex-col gap-1">
            Comptes Responsable
            <input type="number" min="0" max="20" className="input input-sm w-24" value={nbResp} onChange={(e) => setNbResp(e.target.value)} />
          </label>
          <button className="btn-secondary btn-sm" onClick={() => preparerGeneration("autres")} disabled={chargement}>
            <Icon name="plus" size={14} />
            Générer Qualité / Responsable
          </button>
          <span className="ml-auto flex gap-2">
            <button className="btn-secondary btn-sm" onClick={() => fichierRef.current?.click()}>
              <Icon name="upload" size={14} />
              Importer Excel
            </button>
            <input
              ref={fichierRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                importer(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <button className="btn-secondary btn-sm" onClick={exporterTous} disabled={!comptes.length}>
              <Icon name="download" size={14} />
              Exporter Excel
            </button>
          </span>
        </div>
        <p className="text-[11px] text-ink/45 mt-2">
          Import : colonnes « Nom d'utilisateur », « Mot de passe », « Nom complet », « Rôle » (Ingénieur, Qualité, Responsable, Admin), « Ingénieur lié » (facultatif).
          Un identifiant existant est mis à jour (mot de passe vide = inchangé).
        </p>

        {bilan && (
          <div className={`alert ${bilan.erreurs.length ? "alert-gold" : "alert-green"} mt-4 text-sm`}>
            <Icon name="checkCircle" size={16} className="mt-0.5" />
            <span>
              {bilan.crees} compte(s) créé(s), {bilan.maj} mis à jour — fichier Excel des identifiants téléchargé.
              {bilan.erreurs.map((r) => (
                <span key={r.nomUtilisateur} className="block text-isoRed-dark">
                  {r.nomUtilisateur} : {r.error}
                </span>
              ))}
            </span>
          </div>
        )}

        {lot && (
          <div className="mt-5 border-t border-line pt-4">
            <div className="flex items-center gap-3 mb-3">
              <p className="font-semibold text-sm">
                {lot.titre} — {lot.lignes.length} ligne(s)
              </p>
              <span className="ml-auto flex gap-2">
                <button className="btn-secondary btn-sm" onClick={() => setLot(null)} disabled={envoi}>
                  Annuler
                </button>
                <button className="btn-primary btn-sm" onClick={envoyerLot} disabled={envoi || !lot.lignes.some((l) => !problemeLigne(l))}>
                  <Icon name="check" size={14} />
                  {envoi ? "Création…" : `Valider ${lot.lignes.filter((l) => !problemeLigne(l)).length} compte(s)`}
                </button>
              </span>
            </div>
            <div className="overflow-x-auto max-h-[460px] overflow-y-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Nom d'utilisateur</th>
                    <th>Mot de passe</th>
                    <th>Nom complet</th>
                    <th>Rôle</th>
                    <th>Ingénieur lié</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {lot.lignes.map((l, i) => {
                    const pb = problemeLigne(l);
                    const existe = identifiantsPris.has(l.nomUtilisateur.toLowerCase());
                    return (
                      <tr key={i}>
                        <td>
                          <input className="input input-sm w-44" value={l.nomUtilisateur} onChange={(e) => majLigne(i, "nomUtilisateur", e.target.value.toLowerCase())} />
                        </td>
                        <td>
                          <input className="input input-sm w-36 font-mono" value={l.motDePasse} onChange={(e) => majLigne(i, "motDePasse", e.target.value)} />
                        </td>
                        <td>
                          <input className="input input-sm w-44" value={l.nomComplet} onChange={(e) => majLigne(i, "nomComplet", e.target.value)} />
                        </td>
                        <td>
                          <select className="input input-sm w-36" value={l.role} onChange={(e) => majLigne(i, "role", e.target.value)}>
                            <option value="">—</option>
                            {ROLES.map(([v, lib]) => (
                              <option key={v} value={v}>
                                {lib}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          {l.role === "ingenieur" ? (
                            <select className="input input-sm w-44" value={l.ingenieurRef} onChange={(e) => majLigne(i, "ingenieurRef", e.target.value)}>
                              <option value="">—</option>
                              {[...new Set([...ingenieurs, l.ingenieurRef].filter(Boolean))].map((n) => (
                                <option key={n} value={n}>
                                  {n}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-ink/35">—</span>
                          )}
                        </td>
                        <td className="text-xs whitespace-nowrap">
                          {pb ? <span className="text-isoRed-dark">{pb}</span> : existe ? <span className="badge badge-gold">mise à jour</span> : <span className="badge badge-green">nouveau</span>}
                          <button className="ml-2 text-ink/40 hover:text-isoRed" title="Retirer" onClick={() => setLot((x) => ({ ...x, lignes: x.lignes.filter((_, k) => k !== i) }))}>
                            ✕
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Mot de passe de l'admin connecté */}
      {moi && (
        <div className="card p-5">
          <p className="card-title mb-3">
            <Icon name="lock" size={15} className="text-ink/40" />
            Mon mot de passe
            <span className="text-xs font-normal text-ink/50 ml-1">({identifiant(comptes.find((c) => c.id === moi) || {})})</span>
          </p>
          <form onSubmit={changerMonMotDePasse} className="flex flex-wrap items-end gap-3">
            <label className="text-xs font-semibold text-ink/60 flex flex-col gap-1">
              Nouveau mot de passe
              <input type="password" autoComplete="new-password" className="input w-60" value={monMdp.nouveau} onChange={(e) => setMonMdp((m) => ({ ...m, nouveau: e.target.value, message: "" }))} />
            </label>
            <label className="text-xs font-semibold text-ink/60 flex flex-col gap-1">
              Confirmer
              <input type="password" autoComplete="new-password" className="input w-60" value={monMdp.confirmation} onChange={(e) => setMonMdp((m) => ({ ...m, confirmation: e.target.value, message: "" }))} />
            </label>
            <button type="submit" className="btn-primary" disabled={!monMdp.nouveau}>
              <Icon name="check" size={15} />
              Changer mon mot de passe
            </button>
            {monMdp.message && <span className={`text-sm ${monMdp.ok ? "text-isoGreen-dark" : "text-isoRed-dark"}`}>{monMdp.message}</span>}
          </form>
        </div>
      )}

      {/* Création manuelle */}
      <div className="card p-5">
        <p className="card-title mb-4">
          <Icon name="plus" size={15} className="text-ink/40" />
          Créer un compte
        </p>
        <form onSubmit={creerCompte} className="grid sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_160px_auto] gap-3 items-end">
          <div className="field">
            <label className="label">Nom d'utilisateur</label>
            <input
              required
              className="input"
              placeholder="ex. salma"
              value={nouveauCompte.nomUtilisateur}
              onChange={(e) => setNouveauCompte((c) => ({ ...c, nomUtilisateur: e.target.value.toLowerCase() }))}
            />
          </div>
          <div className="field">
            <label className="label flex justify-between">
              Mot de passe
              <button type="button" className="text-brand-600 text-xs font-semibold" onClick={() => setNouveauCompte((c) => ({ ...c, motDePasse: genererMotDePasse() }))}>
                Générer
              </button>
            </label>
            <input
              required
              minLength={6}
              className="input font-mono"
              value={nouveauCompte.motDePasse}
              onChange={(e) => setNouveauCompte((c) => ({ ...c, motDePasse: e.target.value }))}
            />
          </div>
          <div className="field">
            <label className="label">{nouveauCompte.role === "ingenieur" ? "Ingénieur (nom dans la liste)" : "Nom complet"}</label>
            {nouveauCompte.role === "ingenieur" ? (
              <select className="input" required value={nouveauCompte.nomComplet} onChange={(e) => setNouveauCompte((c) => ({ ...c, nomComplet: e.target.value }))}>
                <option value="">— Choisir —</option>
                {ingenieurs.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            ) : (
              <input className="input" value={nouveauCompte.nomComplet} onChange={(e) => setNouveauCompte((c) => ({ ...c, nomComplet: e.target.value }))} />
            )}
          </div>
          <div className="field">
            <label className="label">Rôle</label>
            <select className="input" value={nouveauCompte.role} onChange={(e) => setNouveauCompte((c) => ({ ...c, role: e.target.value }))}>
              {ROLES.map(([v, lib]) => (
                <option key={v} value={v}>
                  {lib}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn-primary">
            <Icon name="plus" size={15} />
            Créer
          </button>
        </form>
        <p className="text-xs text-ink/50 mt-3">
          <strong>Qualité</strong> : le nom complet est enregistré dans « Audité par » et ajouté à la liste Service qualité. <strong>Responsable</strong> : mêmes droits
          que l'admin. <strong>Ingénieur</strong> : compte lié à son nom, il voit uniquement ses dossiers.
        </p>
      </div>

      {/* Liste des comptes */}
      <div className="card overflow-x-auto">
        <table className="table table-hover">
          <thead>
            <tr>
              <th>Nom d'utilisateur</th>
              <th>Mot de passe</th>
              <th>Nom complet</th>
              <th>Rôle</th>
              <th>Ingénieur lié</th>
              <th>Statut</th>
              <th>Créé le</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {tries.map((c) => {
              const enEdition = edition?.id === c.id;
              return (
                <tr key={c.id} className={c.actif === false ? "opacity-55" : ""}>
                  <td className="font-semibold">
                    {enEdition ? (
                      <input className="input input-sm w-40" value={edition.nomUtilisateur} onChange={(e) => setEdition((x) => ({ ...x, nomUtilisateur: e.target.value }))} />
                    ) : (
                      <span className="flex items-center gap-2">
                        <Avatar nom={c.nom_complet || c.email} taille={26} />
                        {identifiant(c)}
                      </span>
                    )}
                  </td>
                  <td className="font-mono text-xs">
                    {c.mot_de_passe ? (
                      <span className="flex items-center gap-1.5">
                        {visibles[c.id] ? c.mot_de_passe : "••••••••"}
                        <button className="text-ink/40 hover:text-ink" title={visibles[c.id] ? "Masquer" : "Afficher"} onClick={() => setVisibles((v) => ({ ...v, [c.id]: !v[c.id] }))}>
                          <Icon name="eye" size={13} />
                        </button>
                        <button className="text-ink/40 hover:text-ink" title="Copier" onClick={() => navigator.clipboard?.writeText(c.mot_de_passe)}>
                          <Icon name="copy" size={13} />
                        </button>
                      </span>
                    ) : (
                      <span className="text-ink/35 font-sans">non enregistré</span>
                    )}
                  </td>
                  <td>
                    {enEdition ? (
                      <input className="input input-sm w-44" value={edition.nomComplet} onChange={(e) => setEdition((x) => ({ ...x, nomComplet: e.target.value }))} />
                    ) : (
                      c.nom_complet || "—"
                    )}
                  </td>
                  <td>
                    <select className="input input-sm w-36" value={roleAffiche(c)} onChange={(e) => changerRole(c, e.target.value)}>
                      {ROLES.map(([v, lib]) => (
                        <option key={v} value={v}>
                          {lib}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    {c.role !== "ingenieur" ? (
                      <span className="text-ink/35">—</span>
                    ) : enEdition ? (
                      <select className="input input-sm w-44" value={edition.ingenieurRef} onChange={(e) => setEdition((x) => ({ ...x, ingenieurRef: e.target.value }))}>
                        <option value="">— Non lié —</option>
                        {[...new Set([...ingenieurs, edition.ingenieurRef].filter(Boolean))].map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    ) : (
                      c.ingenieur_ref || <span className="text-isoRed-dark text-xs">non lié — à corriger</span>
                    )}
                  </td>
                  <td>
                    {c.actif === false ? <span className="badge badge-red">Désactivé</span> : <span className="badge badge-green">Actif</span>}
                    {c.id === moi && <span className="badge badge-brand ml-1">vous</span>}
                  </td>
                  <td className="text-ink/55 tabular">{new Date(c.created_at).toLocaleDateString("fr-FR")}</td>
                  <td>
                    <div className="flex gap-1.5 justify-end whitespace-nowrap">
                      {enEdition ? (
                        <>
                          <button onClick={enregistrerEdition} className="btn-primary btn-xs">
                            Enregistrer
                          </button>
                          <button onClick={() => setEdition(null)} className="btn-secondary btn-xs">
                            Annuler
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => setEdition({ id: c.id, nomUtilisateur: identifiant(c), nomComplet: c.nom_complet || "", ingenieurRef: c.ingenieur_ref || "" })}
                          className="btn-secondary btn-xs"
                          title="Renommer"
                        >
                          <Icon name="pencil" size={13} />
                        </button>
                      )}
                      <button onClick={() => changerMotDePasse(c)} className="btn-secondary btn-xs" title="Changer le mot de passe">
                        <Icon name="lock" size={13} />
                      </button>
                      {c.id !== moi && (
                        <>
                          <button onClick={() => basculerActif(c)} className="btn-secondary btn-xs">
                            {c.actif === false ? "Réactiver" : "Désactiver"}
                          </button>
                          <button onClick={() => supprimerCompte(c)} className="btn-danger btn-xs">
                            Supprimer
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {!chargement && comptes.length === 0 && (
              <tr>
                <td colSpan={8} className="table-empty">
                  Aucun compte.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
