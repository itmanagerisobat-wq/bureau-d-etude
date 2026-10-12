"use client";

const JOURS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

function debutSemaine() {
  const auj = new Date();
  const jour = auj.getDay(); // 0=Dim
  const decalage = jour === 0 ? -6 : 1 - jour; // ramène au lundi
  const lundi = new Date(auj);
  lundi.setDate(auj.getDate() + decalage);
  lundi.setHours(0, 0, 0, 0);
  return lundi;
}

export default function VueCalendrier({ dossiers }) {
  const lundi = debutSemaine();
  const aujIso = new Date().toISOString().slice(0, 10);
  const jours = JOURS.map((label, i) => {
    const date = new Date(lundi);
    date.setDate(lundi.getDate() + i);
    const dateIso = date.toISOString().slice(0, 10);
    const dossiersDuJour = dossiers.filter((d) => d.date === dateIso);
    return { label, dateIso, jourNum: date.getDate(), dossiers: dossiersDuJour };
  });

  return (
    <div className="overflow-x-auto mb-8 -mx-1 px-1">
      <div className="grid grid-cols-7 gap-2 min-w-[720px]">
        {jours.map((j) => {
          const auj = j.dateIso === aujIso;
          return (
            <div key={j.dateIso} className={`card p-2.5 min-h-[160px] ${auj ? "ring-2 ring-brand-500/30 border-brand-300" : ""}`}>
              <div className="flex items-baseline justify-between mb-2 px-0.5">
                <span className="eyebrow">{j.label}</span>
                <span
                  className={`text-sm font-bold tabular ${
                    auj ? "bg-brand-500 text-white rounded-full w-6 h-6 inline-flex items-center justify-center" : "text-ink/70"
                  }`}
                >
                  {j.jourNum}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                {j.dossiers.map((d) => (
                  <div
                    key={d.id}
                    className={`text-[11px] font-medium rounded-md px-2 py-1 truncate border-l-2 ${
                      d.retour_interne || d.retour_client
                        ? "bg-isoRed-light text-isoRed-dark border-isoRed"
                        : "bg-brand-50 text-brand-700 border-brand-500"
                    }`}
                    title={d.nom_dossier}
                  >
                    {d.nom_dossier}
                  </div>
                ))}
                {j.dossiers.length === 0 && <p className="text-[11px] text-ink/25 text-center mt-6">—</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
