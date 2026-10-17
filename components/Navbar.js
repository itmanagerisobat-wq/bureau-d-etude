"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";
import { ROLE_LABELS } from "@/lib/constants";
import RechercheGlobale from "@/components/RechercheGlobale";
import Icon from "@/components/ui/Icon";
import Avatar from "@/components/ui/Avatar";

const LINKS = [
  { href: "/saisie", label: "Saisie", icone: "pencil", roles: ["admin", "qualite"] },
  { href: "/mes-dossiers", label: "Mes dossiers", icone: "folder", roles: ["ingenieur"] },
  { href: "/qualite", label: "Qualité", icone: "shield", roles: ["admin", "qualite"] },
  { href: "/dashboard", label: "Dashboard", icone: "dashboard", roles: ["admin", "qualite"] },
  { href: "/export", label: "Export", icone: "download", roles: ["admin"] },
  { href: "/erreurs", label: "Erreurs", icone: "alert", roles: ["admin", "qualite", "ingenieur"] },
  { href: "/messagerie", label: "Messagerie", icone: "message", roles: ["admin", "qualite", "ingenieur"] },
  { href: "/parametres", label: "Paramètres", icone: "settings", roles: ["admin", "qualite"] },
];

// `masquerHorloge` est conservé pour compatibilité (l'horloge est désormais toujours compacte).
// eslint-disable-next-line no-unused-vars
export default function Navbar({ role, nom, onChangerPersonne, masquerHorloge }) {
  const pathname = usePathname();
  const router = useRouter();
  const [enAttente, setEnAttente] = useState(null);
  const [nonLus, setNonLus] = useState(0);
  const [menuMobile, setMenuMobile] = useState(false);
  const [menuUtilisateur, setMenuUtilisateur] = useState(false);
  const refMenu = useRef(null);
  const estStaff = ["admin", "qualite"].includes(role);

  useEffect(() => {
    if (!estStaff) return;
    (async () => {
      const supabase = createClient();
      const { count } = await supabase
        .from("dossiers")
        .select("*", { count: "exact", head: true })
        .eq("etat", "En attente de vérification");
      setEnAttente(count ?? null);
    })();
  }, [role]);

  // Messages non lus du tchat (rafraîchi toutes les 30 s)
  useEffect(() => {
    if (!role) return;
    const supabase = createClient();
    let fini = false;
    const maj = async () => {
      const { data, error } = await supabase.rpc("fn_chat_non_lus");
      if (!fini && !error) setNonLus((data || []).reduce((s, r) => s + Number(r.non_lus || 0), 0));
    };
    maj();
    const t = setInterval(maj, 30000);
    return () => {
      fini = true;
      clearInterval(t);
    };
  }, [role, pathname]);

  // Présence (panneau Équipe de la Messagerie) : signal toutes les minutes, « actif » si l'utilisateur
  // a bougé la souris ou tapé au clavier dans les 5 dernières minutes. L'admin superviseur n'émet rien (côté serveur).
  useEffect(() => {
    if (!role) return;
    const supabase = createClient();
    let derniereAction = Date.now();
    const bouge = () => (derniereAction = Date.now());
    const evts = ["mousemove", "keydown", "click", "touchstart"];
    evts.forEach((e) => window.addEventListener(e, bouge, { passive: true }));
    const ping = () => {
      const actif = document.visibilityState === "visible" && Date.now() - derniereAction < 5 * 60000;
      supabase.rpc("fn_presence_ping", { p_actif: actif }).then(() => {}, () => {});
    };
    ping();
    const t = setInterval(ping, 60000);
    return () => {
      clearInterval(t);
      evts.forEach((e) => window.removeEventListener(e, bouge));
    };
  }, [role]);

  useEffect(() => {
    if (!menuUtilisateur) return;
    const fermer = (e) => refMenu.current && !refMenu.current.contains(e.target) && setMenuUtilisateur(false);
    document.addEventListener("mousedown", fermer);
    return () => document.removeEventListener("mousedown", fermer);
  }, [menuUtilisateur]);

  useEffect(() => setMenuMobile(false), [pathname]);

  async function seDeconnecter() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  const liens = LINKS.filter((l) => l.roles.includes(role));

  function lien(l, mobile) {
    const actif = pathname?.startsWith(l.href);
    return (
      <Link
        key={l.href}
        href={l.href}
        aria-current={actif ? "page" : undefined}
        className={`relative flex items-center gap-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
          mobile ? "px-3 py-2.5" : "px-2.5 h-9"
        } ${actif ? "bg-night-light text-white font-semibold shadow-inner" : "text-white/90 hover:bg-white/15 hover:text-white"}`}
      >
        <Icon
          name={l.icone}
          size={16}
          className={`${actif ? "text-white" : "text-white/75"} ${mobile ? "" : "hidden xl:block"}`}
        />
        {l.label}
        {l.href === "/messagerie" && nonLus > 0 && (
          <span className="bg-isoRed text-white text-[10px] font-bold rounded-full px-1.5 min-w-[18px] h-[18px] inline-flex items-center justify-center" title={`${nonLus} message(s) non lu(s)`}>
            {nonLus}
          </span>
        )}
        {l.href === "/qualite" && !!enAttente && (
          <span
            className="bg-isoRed text-white text-[10px] font-bold rounded-full px-1.5 min-w-[18px] h-[18px] inline-flex items-center justify-center"
            title={`${enAttente} dossier(s) en attente de vérification`}
          >
            {enAttente}
          </span>
        )}
      </Link>
    );
  }

  return (
    <header className="sticky top-0 z-30 bg-night shadow-[0_1px_0_rgba(0,0,0,0.15)]">
      <div className="max-w-[1800px] mx-auto px-3 sm:px-4 lg:px-5 h-16 flex items-center gap-4">
        <button
          className="btn-icon lg:hidden -ml-2 text-white hover:bg-white/15"
          onClick={() => setMenuMobile((v) => !v)}
          aria-label="Menu"
          aria-expanded={menuMobile}
        >
          <Icon name={menuMobile ? "x" : "menu"} size={20} />
        </button>

        <Link href={role === "ingenieur" ? "/mes-dossiers" : "/saisie"} className="shrink-0 flex items-center">
          <span className="bg-white rounded-lg px-2 py-1 flex items-center">
            <img src="/logo-hillsolution-h.png" alt="Hill Solution" className="h-9 w-auto" />
          </span>
        </Link>

        <span className="hidden lg:block w-px h-7 bg-white/30" />

        <nav className="hidden lg:flex items-center gap-0.5 flex-1 min-w-0 overflow-x-auto scrollbar-none">
          {liens.map((l) => lien(l, false))}
        </nav>

        <div className="flex-1 lg:hidden" />

        <div className="flex items-center gap-2 shrink-0">
          {estStaff && (
            <div className="hidden md:block lg:hidden xl:block">
              <RechercheGlobale />
            </div>
          )}

          <div className="relative" ref={refMenu}>
            <button
              onClick={() => setMenuUtilisateur((v) => !v)}
              className="flex items-center gap-2 h-10 pl-1 pr-2 rounded-full hover:bg-white/15 transition-colors"
              aria-haspopup="menu"
              aria-expanded={menuUtilisateur}
            >
              <span className="rounded-full bg-white p-0.5 flex">
                <Avatar nom={nom} taille={30} />
              </span>
              <span className="hidden sm:flex flex-col items-start leading-tight text-left">
                <span className="text-sm font-semibold max-w-[140px] truncate capitalize text-white">{nom || "—"}</span>
                <span className="text-[11px] text-white/80">{ROLE_LABELS[role]}</span>
              </span>
              <Icon name="chevronDown" size={14} className="text-white/80 hidden sm:block" />
            </button>

            {menuUtilisateur && (
              <div
                role="menu"
                className="absolute right-0 top-full mt-2 w-60 bg-white rounded-xl border border-line shadow-pop p-1.5 animate-slide-up"
              >
                <div className="px-3 py-2.5 border-b border-line mb-1">
                  <p className="text-sm font-semibold capitalize truncate">{nom || "—"}</p>
                  <p className="text-xs text-ink/45">Profil {ROLE_LABELS[role]}</p>
                </div>
                {role === "admin" && (
                  <>
                    <Link
                      role="menuitem"
                      href="/parametres"
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-ink/75 hover:bg-ink/5"
                    >
                      <Icon name="settings" size={15} className="text-ink/45" />
                      Paramètres
                    </Link>
                    <Link
                      role="menuitem"
                      href="/mes-dossiers"
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-ink/75 hover:bg-ink/5"
                    >
                      <Icon name="folder" size={15} className="text-ink/45" />
                      Vue ingénieur
                    </Link>
                  </>
                )}
                {onChangerPersonne && (
                  <button
                    role="menuitem"
                    onClick={() => {
                      setMenuUtilisateur(false);
                      onChangerPersonne();
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-ink/75 hover:bg-ink/5"
                  >
                    <Icon name="swap" size={15} className="text-ink/45" />
                    Changer de personne
                  </button>
                )}
                <button
                  role="menuitem"
                  onClick={seDeconnecter}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-isoRed hover:bg-isoRed-light"
                >
                  <Icon name="logout" size={15} />
                  Déconnexion
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {menuMobile && (
        <div className="lg:hidden border-t border-white/10 bg-night px-4 py-3 flex flex-col gap-1 animate-fade-in">
          {estStaff && (
            <div className="md:hidden mb-2">
              <RechercheGlobale pleineLargeur />
            </div>
          )}
          {liens.map((l) => lien(l, true))}
        </div>
      )}
    </header>
  );
}
