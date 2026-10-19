"use client";
import { MOIS } from "@/lib/constants";
import { FILTRES_INITIAUX } from "@/lib/useAppData";
import Icon from "@/components/ui/Icon";

export default function FilterBar({ filtres, setFiltres, options }) {
  const { ingenieurs = [], operations = [], clients = [] } = options || {};
  const annees = Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i);

  function update(champ, valeur) {
    setFiltres((f) => ({ ...f, [champ]: valeur }));
  }

  const nbActifs = Object.keys(FILTRES_INITIAUX).filter(
    (k) => String(filtres[k] ?? "") !== String(FILTRES_INITIAUX[k])
  ).length;

  return (
    <div className="card p-4 mb-6 w-full">
      <div className="flex items-center justify-between mb-3">
        <p className="card-title">
          <Icon name="filter" size={14} className="text-ink/40" />
          Filtres
          {nbActifs > 0 && <span className="badge badge-brand">{nbActifs} actif{nbActifs > 1 ? "s" : ""}</span>}
        </p>
        {nbActifs > 0 && (
          <button onClick={() => setFiltres(FILTRES_INITIAUX)} className="btn-ghost btn-xs">
            <Icon name="reset" size={13} />
            Réinitialiser
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        <Select label="Mois" value={filtres.mois} onChange={(v) => update("mois", v)}>
          <option value="Tous">Tous</option>
          {MOIS.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </Select>

        <Select label="Année" value={filtres.annee} onChange={(v) => update("annee", v)}>
          <option value="Tous">Toutes</option>
          {annees.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </Select>

        <Select label="Opération" value={filtres.operation} onChange={(v) => update("operation", v)}>
          <option value="Tous">Toutes</option>
          {operations.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </Select>

        <Select label="Client" value={filtres.client} onChange={(v) => update("client", v)}>
          <option value="Tous">Tous</option>
          {clients.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </Select>

        <Select label="Ingénieur" value={filtres.ingenieur} onChange={(v) => update("ingenieur", v)}>
          <option value="Tous">Tous</option>
          {ingenieurs.map((i) => (
            <option key={i} value={i}>{i}</option>
          ))}
        </Select>

        <div className="field">
          <label className="label">Du</label>
          <input
            type="date"
            className="input input-sm h-9"
            value={filtres.du || ""}
            onChange={(e) => update("du", e.target.value)}
          />
        </div>
        <div className="field">
          <label className="label">Au</label>
          <input
            type="date"
            className="input input-sm h-9"
            value={filtres.au || ""}
            onChange={(e) => update("au", e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}

function Select({ label, value, onChange, children }) {
  const actif = value !== "Tous";
  return (
    <div className="field min-w-0">
      <label className="label">{label}</label>
      <select
        className={`input ${actif ? "border-brand-300 bg-brand-50/50 text-brand-700 font-medium" : ""}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {children}
      </select>
    </div>
  );
}
