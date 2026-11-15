'use client';

/**
 * Map of real FASTag toll-plaza crossings: each plaza is a dot, the latest one
 * is the truck. Basemaps switchable — Road (OpenStreetMap), Satellite (Esri
 * World Imagery) and Hybrid (imagery + Esri place labels), the same three the
 * Tracking portal's live map offers; the CSP img-src already allows both tile
 * hosts. Load with next/dynamic and ssr:false (Leaflet needs window).
 */
import { useEffect, useMemo, useState } from 'react';
import L from 'leaflet';
import { CircleMarker, MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

export interface MapCrossing {
  time: string;
  plaza: string;
  lat: number;
  lng: number;
}

type BaseLayer = 'road' | 'satellite' | 'hybrid';

const BASE_LAYERS: { id: BaseLayer; label: string }[] = [
  { id: 'road', label: 'Road' },
  { id: 'satellite', label: 'Satellite' },
  { id: 'hybrid', label: 'Hybrid' },
];

const TRUCK = L.divIcon({
  className: 'kr-truck-marker',
  html: '<span class="kr-truck-marker__pulse" aria-hidden="true"></span><span class="kr-truck-marker__body"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h11v10H3z"/><path d="M14 9h4l3 3v4h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/></svg></span>',
  iconSize: [34, 34],
  iconAnchor: [17, 17],
});

function Fit({ points }: { points: L.LatLngExpression[] }) {
  const map = useMap();
  useEffect(() => {
    const id = window.setTimeout(() => {
      map.invalidateSize();
      if (points.length === 1) map.setView(points[0], 9);
      else if (points.length > 1) map.fitBounds(L.latLngBounds(points), { padding: [36, 36] });
    }, 0);
    return () => window.clearTimeout(id);
  }, [map, points]);
  return null;
}

export default function RouteMap({ crossings }: { crossings: MapCrossing[] }) {
  const [layer, setLayer] = useState<BaseLayer>('road');
  const points = useMemo(() => crossings.map((c) => [c.lat, c.lng] as L.LatLngTuple), [crossings]);
  const last = crossings[crossings.length - 1];
  const imagery = layer !== 'road';
  return (
    <div className="space-y-1.5">
      {/* Basemap pills: OSM streets, Esri satellite imagery, hybrid (imagery + labels). */}
      <div role="group" aria-label="Map type" className="inline-flex overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-slate-300">
        {BASE_LAYERS.map((l) => (
          <button
            key={l.id}
            type="button"
            aria-pressed={layer === l.id}
            onClick={() => setLayer(l.id)}
            className={`min-h-9 cursor-pointer px-3 text-xs font-bold ${layer === l.id ? 'bg-slate-800 text-white' : 'bg-white text-slate-700 hover:bg-slate-50'}`}
          >
            {l.label}
          </button>
        ))}
      </div>
      <MapContainer center={points[0] ?? [22.5, 79]} zoom={5} scrollWheelZoom={false} className="h-[24rem] w-full rounded-2xl ring-1 ring-slate-900/10">
        {/* key={layer}: a fresh tile layer per basemap, so switching is instant and no
            pending requests of the previous basemap linger underneath. */}
        <TileLayer
          key={layer}
          url={imagery ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}' : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'}
          attribution={imagery ? 'Imagery &copy; Esri' : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}
        />
        {layer === 'hybrid' && (
          <TileLayer
            url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
            attribution=""
          />
        )}
        {points.length > 1 && <Polyline positions={points} pathOptions={{ color: '#0e7490', weight: 4, dashArray: '6 8' }} />}
        {crossings.slice(0, -1).map((c) => (
          <CircleMarker key={c.time + c.plaza} center={[c.lat, c.lng]} radius={7} pathOptions={{ color: '#0e7490', fillColor: '#ffffff', fillOpacity: 1, weight: 3 }}>
            <Tooltip>{c.plaza} · {c.time}</Tooltip>
          </CircleMarker>
        ))}
        {last && (
          <Marker position={[last.lat, last.lng]} icon={TRUCK}>
            <Tooltip permanent direction="top" offset={[0, -16]}>Last seen: {last.plaza}</Tooltip>
          </Marker>
        )}
        <Fit points={points} />
      </MapContainer>
    </div>
  );
}
