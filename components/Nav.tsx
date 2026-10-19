"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Logo } from "./Logo";

const LIENS = [
  { href: "/ndd/nouvelle", label: "Nouvelle NDD", icone: "M12 5v14M5 12h14M4 20h4" },
  { href: "/dossiers/nouveau", label: "Nouveau devis", icone: "M12 5v14M5 12h14" },
  { href: "/factures/nouvelle", label: "Nouvelle facture", icone: "M7 3h10v18l-3-2-2 2-2-2-3 2zM10 8h4M10 12h4" },
  { href: "/", label: "Devis & factures", icone: "M4 6h16M4 12h16M4 18h10" },
  { href: "/ndd", label: "Notes de dimensionnement", icone: "M4 20h16M6 16l4-8 4 5 3-3 3 6M6 4h6" },
  { href: "/clients", label: "Clients", icone: "M16 19v-1a4 4 0 00-4-4H6a4 4 0 00-4 4v1M9 10a3 3 0 100-6 3 3 0 000 6zM22 19v-1a4 4 0 00-3-3.87M16 4.13a3 3 0 010 5.75" },
  { href: "/recherche", label: "Recherche", icone: "M11 18a7 7 0 100-14 7 7 0 000 14zM20 20l-4-4" },
  { href: "/fiches", label: "Fiches CEE", icone: "M7 3h7l5 5v13H7zM14 3v5h5" },
];
const ADMIN = [
  { href: "/parametres", label: "Paramètres", icone: "M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" },
  { href: "/import", label: "Import Excel", icone: "M12 3v12m0 0l-4-4m4 4l4-4M4 17v3h16v-3" },
  { href: "/utilisateurs", label: "Utilisateurs", icone: "M16 19v-1a4 4 0 00-4-4H6a4 4 0 00-4 4v1M9 10a3 3 0 100-6 3 3 0 000 6zM22 19v-1a4 4 0 00-3-3.87M16 4.13a3 3 0 010 5.75" },
];

function Icone({ d }: { d: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
  );
}

export function Nav({ nom, role }: { nom: string; role: string }) {
  const path = usePathname();
  const router = useRouter();
  const actif = (h: string) => (h === "/" ? path === "/" || (path.startsWith("/dossiers/") && path !== "/dossiers/nouveau")
    : h === "/dossiers/nouveau" || h === "/ndd/nouvelle" ? path === h
    : h === "/ndd" ? path === "/ndd" || (path.startsWith("/ndd/") && path !== "/ndd/nouvelle")
    : path.startsWith(h));
  const lien = (l: (typeof LIENS)[0]) => (
    <Link key={l.href} href={l.href}
      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${actif(l.href) ? "bg-white/15 text-white font-semibold menu-actif" : "text-vert-100/80 hover:bg-white/5 hover:text-white"}`}>
      <Icone d={l.icone} />{l.label}
    </Link>
  );
  return (
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-60 flex-col fond-menu md:flex">
      <div className="flex items-center gap-3 px-5 py-5 border-b border-white/10">
        <Logo size={40} />
        <div className="leading-tight">
          <div className="text-white font-bold tracking-wide">ISO BAT</div>
          <div className="text-[11px] text-hill-400 font-medium">Gestion commerciale</div>
        </div>
      </div>
      <nav className="flex-1 space-y-1 px-3 py-4">
        {LIENS.map(lien)}
        {role === "admin" && (
          <>
            <div className="px-3 pt-5 pb-1 text-[10px] font-semibold uppercase tracking-widest text-vert-100/40">Administration</div>
            {ADMIN.map(lien)}
          </>
        )}
      </nav>
      <div className="border-t border-white/10 px-5 py-4">
        <Link href="/compte" className="block text-sm text-white truncate hover:underline">{nom}</Link>
        <div className="text-[11px] text-vert-100/50 mb-2">{role === "admin" ? "Administrateur" : "Gestionnaire"}</div>
        <button className="text-xs text-hill-400 hover:text-white"
          onClick={async () => { await createClient().auth.signOut(); router.push("/login"); router.refresh(); }}>
          Se déconnecter
        </button>
      </div>
    </aside>
  );
}

export function NavMobile({ role }: { role: string }) {
  const l = [...LIENS, ...(role === "admin" ? ADMIN : [])];
  return (
    <div className="md:hidden sticky top-0 z-20 flex items-center gap-2 overflow-x-auto fond-menu px-3 py-2">
      <Logo size={30} />
      {l.map((x) => <Link key={x.href} href={x.href} className="whitespace-nowrap rounded-md px-2 py-1 text-xs text-white/90 hover:bg-white/10">{x.label}</Link>)}
    </div>
  );
}
