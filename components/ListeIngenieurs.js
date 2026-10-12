"use client";
import { useEffect, useState } from "react";
import Modal from "@/components/ui/Modal";
import Avatar from "@/components/ui/Avatar";
import Icon from "@/components/ui/Icon";
import { S, formatDuree } from "@/lib/constants";
import { presence } from "@/lib/presence";

/** Liste des ingénieurs : libre / occupé, dossier en cours, nombre à faire, équipes. */
export default function ListeIngenieurs({ supabase, options, onFermer }) {
  const [ouverts, setOuverts] = useState(null);
  const [filtre, setFiltre] = useState("tous");
  const [connexions, setConnexions] = useState(null); // null = migration V21 absente

  useEffect(() => {
    (async () => {
      const pres = await supabase.rpc("fn_presence_ingenieurs");
      if (!pres.error) setConnexions(Object.fromEntries((pres.data || []).map((r) => [String(r.ingenieur || "").toLowerCase(), r])));
      const { data } = await supabase
        .from("dossiers")
        .select("id, nom_dossier, ingenieur, etat, a_corriger, date_acceptation, nom_operation, client")
        .in("etat", [S.ASSIGNE, S.EN_COURS, S.ATTENTE_INFO]);
      setOuverts(data || []);
    })();
  }, []);

  const equipesDe = (ing) => Object.entries(options.equipes || {}).filter(([, l]) => l.includes(ing)).map(([c]) => c);

  const lignes = (options.ingenieurs || []).map((ing) => {
    const siens = (ouverts || []).filter((d) => d.ingenieur === ing);
    const enCours = siens.find((d) => d.etat === S.EN_COURS);
    return {
      ing,
      enCours,
      aFaire: siens.filter((d) => d.etat === S.ASSIGNE && !d.a_corriger).length,
      retours: siens.filter((d) => d.etat === S.ASSIGNE && d.a_corriger).length,
      attente: siens.filter((d) => d.etat === S.ATTENTE_INFO).length,
      equipes: equipesDe(ing),
      presence: connexions ? presence(connexions[ing.toLowerCase()]) : null,
    };
  });
  lignes.sort((a, b) => Number(!!a.enCours) - Number(!!b.enCours) || a.aFaire + a.retours - (b.aFaire + b.retours) || a.ing.localeCompare(b.ing));
  const nbLibres = lignes.filter((l) => !l.enCours).length;
  const connecte = (l) => l.presence && l.presence.cle !== "off";
  const nbConnectes = lignes.filter(connecte).length;
  const visibles = lignes.filter(
    (l) =>
      filtre === "tous" ||
      (filtre === "libres" && !l.enCours) ||
      (filtre === "occupes" && !!l.enCours) ||
      (filtre === "connectes" && connecte(l)) ||
      (filtre === "libresConnectes" && !l.enCours && connecte(l))
  );

  return (
    <Modal titre="Ingénieurs" sousTitre={ouverts ? `${nbLibres} libre(s) · ${lignes.length - nbLibres} occupé(s)${connexions ? ` · ${nbConnectes} connecté(s)` : ""}` : "Chargement…"} onFermer={onFermer} taille="xl">
      <div className="segmented w-fit mb-4">
        {[
          ["tous", "Tous"],
          ["libres", "Libres"],
          ["occupes", "Occupés"],
          ...(connexions ? [["connectes", "Connectés"], ["libresConnectes", "Libres et connectés"]] : []),
        ].map(([k, l]) => (
          <button key={k} data-active={filtre === k} onClick={() => setFiltre(k)}>
            {l}
          </button>
        ))}
      </div>
      <div className="card divide-y divide-line">
        {ouverts === null && <p className="px-4 py-6 text-sm text-ink/45">Chargement…</p>}
        {ouverts !== null &&
          visibles.map((l) => (
            <div key={l.ing} className="px-4 py-3 flex flex-wrap items-center gap-3">
              <span className="relative" title={l.presence?.libelle}>
                <Avatar nom={l.ing} taille={30} />
                {l.presence && <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full ring-2 ring-white" style={{ background: l.presence.couleur }} />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold capitalize flex items-center gap-2 flex-wrap">
                  {l.ing}
                  {l.equipes.map((c) => (
                    <span key={c} className="badge badge-brand" title="Équipe dédiée à ce client">
                      <Icon name="users" size={11} />
                      {c}
                    </span>
                  ))}
                </p>
                <p className="text-xs text-ink/55">
                  {l.enCours
                    ? `En cours : ${l.enCours.nom_dossier} (${l.enCours.nom_operation})${
                        l.enCours.date_acceptation ? ` depuis ${formatDuree((Date.now() - new Date(l.enCours.date_acceptation).getTime()) / 3600000)}` : ""
                      }`
                    : "Aucun dossier en cours"}
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs">
                {l.presence && <span className="text-ink/50">{l.presence.libelle}</span>}
                {l.retours > 0 && <span className="badge badge-red">{l.retours} retour(s)</span>}
                <span className="badge badge-neutral">{l.aFaire} à faire</span>
                {l.attente > 0 && <span className="badge badge-gold">{l.attente} en attente d'info</span>}
                <span className={`badge ${l.enCours ? "badge-gold" : "badge-green"} badge-dot`}>{l.enCours ? "Occupé" : "Libre"}</span>
              </div>
            </div>
          ))}
        {ouverts !== null && visibles.length === 0 && <p className="px-4 py-6 text-sm text-ink/45">Aucun ingénieur.</p>}
      </div>
    </Modal>
  );
}
