'use client';

/**
 * OrderLiveMap — the mutual live order map: the seller's dispatch-origin
 * pin, the moving shipment pin and the buyer's live destination pin, with
 * the route lines between them. Leaflet + OpenStreetMap tiles (CSP-safe:
 * tiles are images); load with next/dynamic and ssr:false (Leaflet needs
 * window). Distance, ETA and the Google Maps route link live in the card
 * next to this map (lib/maps, pure client maths — no API keys).
 */
import { useEffect } from 'react';
import L from 'leaflet';
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

export interface OrderPin {
  lat: number;
  lng: number;
  /** Tooltip title, e.g. "🟢 Origin · waseem mushtaq mir". */
  label: string;
  /** Second tooltip line, e.g. the address or "Live now (±8 m)". */
  sub?: string | null;
  live?: boolean;
}

const pinsOf = (p?: OrderPin | null) => (p && Number.isFinite(p.lat) && Number.isFinite(p.lng) ? [p.lat, p.lng] as [number, number] : null);

/** Snap the view to all the pins once the container has its real size. */
function Fit({ pts }: { pts: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    const id = window.setTimeout(() => {
      map.invalidateSize();
      if (pts.length === 1) map.setView(pts[0], 14);
      else if (pts.length > 1) map.fitBounds(L.latLngBounds(pts), { padding: [30, 30] });
    }, 0);
    return () => window.clearTimeout(id);
  }, [map, pts]);
  return null;
}

function Pin({ p, colour }: { p: OrderPin; colour: string }) {
  const at = [p.lat, p.lng] as [number, number];
  return (
    <CircleMarker center={at} radius={p.live ? 9 : 7} pathOptions={{ color: colour, fillColor: colour, fillOpacity: p.live ? 0.9 : 0.75, weight: 3 }}>
      <Tooltip permanent direction="top" offset={[0, -12]}>
        <span className="block font-bold">{p.label}</span>
        {p.sub && <span className="block">{p.sub}</span>}
        {p.live && <span className="block font-bold text-emerald-700">Live Now</span>}
      </Tooltip>
    </CircleMarker>
  );
}

export default function OrderLiveMap({ seller, transit, buyer, className = 'h-64 w-full' }: { seller?: OrderPin | null; transit?: OrderPin | null; buyer?: OrderPin | null; className?: string }) {
  const got = [seller, transit, buyer].map((p) => pinsOf(p));
  const pts = got.filter((g): g is [number, number] => g !== null);
  const at = pts.length ? pts[0] : ([33.72, 74.83] as [number, number]);
  // The route lines: origin → shipment → destination, or origin → destination straight.
  const segs: [number, number][][] = [];
  if (got[0] && got[1]) segs.push([got[0], got[1]]);
  if (got[1] && got[2]) segs.push([got[1], got[2]]);
  if (!got[1] && got[0] && got[2]) segs.push([got[0], got[2]]);
  return (
    <MapContainer center={at} zoom={12} scrollWheelZoom={false} className={`${className} rounded-xl ring-1 ring-slate-900/10`}>
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' />
      {segs.map((s, i) => (
        <Polyline key={i} positions={s} pathOptions={{ color: '#1d4ed8', weight: 3, dashArray: '6 8', opacity: 0.75 }} />
      ))}
      <Fit pts={pts} />
      {seller && <Pin p={seller} colour="#15803d" />}
      {transit && <Pin p={transit} colour="#1d4ed8" />}
      {buyer && <Pin p={buyer} colour="#0e7490" />}
    </MapContainer>
  );
}
