"use client";
// Carte du plan de calepinage : orthophoto IGN, parcelle (jaune), bâtiments (bleu clair), déstratificateurs déplaçables
// colorés selon leur modèle (DS3 bleu, DS7 rouge… réglable dans Paramètres › Références).
import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { placerPoints, type Anneau, type Batiment, type LonLat, type Parcelle } from "@/lib/ndd/geo";
import { legendeModeles, nomCourt } from "@/lib/ndd/couleurs";

const TUILES = "https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&TILEMATRIXSET=PM&FORMAT=image/jpeg&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}";

export function CartePlan({ lon, lat, parcelle, nb, points, onPoints, modeles = [] }: {
  lon: number; lat: number; nb: number;
  modeles?: { reference: string; couleur: string }[];   // un élément par déstratificateur (ordre des locaux)
  parcelle?: { insee?: string; prefixe?: string; section?: string; numero?: string } | null;
  points: LonLat[]; onPoints: (p: LonLat[]) => void;
}) {
  const div = useRef<HTMLDivElement>(null);
  const carte = useRef<any>(null);
  const L = useRef<any>(null);
  const calques = useRef<{ marqueurs: any[]; contours: any | null }>({ marqueurs: [], contours: null });
  const [bats, setBats] = useState<Batiment[]>([]);
  const [etat, setEtat] = useState<string>("Chargement des contours…");
  const pointsRef = useRef(points);
  pointsRef.current = points;
  const modelesRef = useRef(modeles);
  modelesRef.current = modeles;

  // création de la carte
  useEffect(() => {
    let annule = false;
    import("leaflet").then((mod) => {
      if (annule || !div.current || carte.current) return;
      const Lf = (mod as any).default ?? mod;
      L.current = Lf;
      const m = Lf.map(div.current, { zoomControl: true, attributionControl: true }).setView([lat, lon], 19);
      m.attributionControl.setPrefix(false);
      Lf.tileLayer(TUILES, { maxZoom: 21, maxNativeZoom: 19, attribution: "© IGN Géoplateforme" }).addTo(m);
      carte.current = m;
      dessinerMarqueurs();
    });
    return () => { annule = true; carte.current?.remove(); carte.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { carte.current?.setView([lat, lon], carte.current.getZoom()); }, [lat, lon]);

  // contours (parcelle + bâtiments)
  useEffect(() => {
    const q = new URLSearchParams({ lon: String(lon), lat: String(lat) });
    if (parcelle?.insee && parcelle.section && parcelle.numero) {
      q.set("insee", parcelle.insee); q.set("section", parcelle.section); q.set("numero", parcelle.numero); q.set("prefixe", parcelle.prefixe || "000");
    }
    setEtat("Chargement des contours…");
    fetch(`/api/ndd/carte?${q}`).then((r) => r.json()).then((j) => {
      setBats(j.batiments ?? []);
      dessinerContours(j.parcelle ?? null, j.batiments ?? []);
      setEtat(j.batiments?.length ? "Cliquez sur un bâtiment pour y répartir les déstratificateurs, ou déplacez-les un par un." : "Aucun bâtiment trouvé autour du site : déplacez les déstratificateurs à la main.");
      if (pointsRef.current.length !== nb) repartir(j.batiments ?? []);
    }).catch(() => setEtat("Contours indisponibles (services IGN injoignables)."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lon, lat, parcelle?.insee, parcelle?.section, parcelle?.numero]);

  useEffect(() => { dessinerMarqueurs(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [points, modeles.map((m) => m.couleur).join()]);
  useEffect(() => { if (points.length !== nb && bats.length) repartir(bats); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [nb]);

  const ll = (a: Anneau) => a.map(([x, y]) => [y, x]);

  function batimentDuSite(liste: Batiment[]): Batiment | null {
    if (!liste.length) return null;
    const d = (b: Batiment) => { const a = b.contour[0]; const cx = a.reduce((s, p) => s + p[0], 0) / a.length, cy = a.reduce((s, p) => s + p[1], 0) / a.length; return (cx - lon) ** 2 + (cy - lat) ** 2; };
    return liste.reduce((a, b) => (d(b) < d(a) ? b : a));
  }
  function repartir(liste: Batiment[], b?: Batiment | null) {
    const cible = b ?? batimentDuSite(liste);
    onPoints(cible ? placerPoints(cible.contour[0], nb) : Array.from({ length: nb }, () => [lon, lat] as LonLat));
  }

  function dessinerContours(p: Parcelle | null, liste: Batiment[]) {
    const Lf = L.current, m = carte.current;
    if (!Lf || !m) return;
    calques.current.contours?.remove();
    const g = Lf.layerGroup();
    for (const b of liste) {
      const poly = Lf.polygon(b.contour.map(ll), { color: "#3caad2", weight: 1.5, fillOpacity: 0.08 });
      poly.on("click", () => repartir(liste, b));
      poly.bindTooltip("Répartir les déstratificateurs ici", { sticky: true });
      g.addLayer(poly);
    }
    if (p) g.addLayer(Lf.polygon(p.contour.map(ll), { color: "#f5c800", weight: 3, fill: false, interactive: false }));
    g.addTo(m);
    calques.current.contours = g;
  }

  function dessinerMarqueurs() {
    const Lf = L.current, m = carte.current;
    if (!Lf || !m) return;
    calques.current.marqueurs.forEach((x) => x.remove());
    const icone = (c: string, n: number) => Lf.divIcon({ className: "", iconSize: [20, 20], iconAnchor: [10, 10],
      html: `<div style="width:20px;height:20px;border-radius:50%;background:${c};border:3px solid #fff;box-shadow:0 0 3px rgba(0,0,0,.7);color:#fff;font:700 9px/14px sans-serif;text-align:center">${n}</div>` });
    calques.current.marqueurs = pointsRef.current.map((p, i) => {
      const md = modelesRef.current[i];
      const mk = Lf.marker([p[1], p[0]], { draggable: true, icon: icone(md?.couleur ?? "#dc0000", i + 1), title: `${md ? nomCourt(md.reference) : "Déstratificateur"} n°${i + 1} — glissez pour déplacer` }).addTo(m);
      mk.on("dragend", () => {
        const pos = mk.getLatLng();
        onPoints(pointsRef.current.map((q, j) => (j === i ? [pos.lng, pos.lat] : q)));
      });
      return mk;
    });
  }

  return (
    <div>
      <div ref={div} className="h-[360px] w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-100" />
      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        {legendeModeles(modeles).map((m) => (
          <span key={m.libelle} className="flex items-center gap-1 font-medium text-slate-700">
            <span className="inline-block h-3 w-3 rounded-full border-2 border-white shadow" style={{ background: m.couleur }} />{m.libelle} × {m.nombre}
          </span>
        ))}
        <span className="text-slate-500">Glissez chaque point pour modifier le calepinage ; il est enregistré avec la note.</span>
      </div>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <span>{etat}</span>
        <button type="button" className="text-vert-700 underline" onClick={() => repartir(bats)}>Replacer automatiquement</button>
      </div>
    </div>
  );
}
