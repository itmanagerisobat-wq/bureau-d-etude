/** Mise en page commune des écrans Connexion et « Qui es-tu ? » : panneau bleu avec le logo seul, centré. */
export default function AuthLayout({ children }) {
  return (
    <div className="min-h-screen grid lg:grid-cols-[1.05fr_1fr] bg-white">
      {/* Panneau de marque : fond bleu + montagnes, logo seul au centre, sans texte */}
      <aside className="relative hidden lg:flex flex-col items-center justify-start overflow-hidden bg-brand-700 px-12 pt-[9vh]">
        <svg
          className="absolute inset-x-0 bottom-0 w-full h-[55%] text-white/[0.06]"
          viewBox="0 0 600 400"
          preserveAspectRatio="none"
          aria-hidden
        >
          <path d="M0 400 L150 170 L230 260 L340 90 L450 230 L520 160 L600 250 L600 400 Z" fill="currentColor" />
          <path d="M0 400 L110 260 L200 330 L320 200 L430 320 L600 220 L600 400 Z" fill="currentColor" />
        </svg>
        {/* Logo en haut, au-dessus des montagnes (qui occupent le bas du panneau) */}
        <div className="relative rounded-3xl bg-white px-10 py-8 shadow-pop w-full max-w-[400px]">
          <img src="/logo-hillsolution-h.png" alt="Hill Solution" className="w-full h-auto" />
        </div>
      </aside>

      {/* Formulaire */}
      <main className="flex items-center justify-center px-5 py-10 bg-paper lg:bg-white">
        <div className="w-full max-w-sm">
          <img src="/logo-hillsolution-h.png" alt="Hill Solution" className="h-20 w-auto mx-auto mb-8 lg:hidden" />
          {children}
        </div>
      </main>
    </div>
  );
}
