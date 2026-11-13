'use client';

/**
 * LiveLogisticsMap — the live shipment map for the Tracking portal (Phase 5.2):
 * a draggable slippy map with street / satellite / hybrid basemaps (OSM raster
 * tiles + Esri World Imagery — plain <img> elements, zero iframes, no map
 * library), the truck marker with its accuracy circle, the driven route
 * polyline (route_history), the dashed origin→destination line, geofence
 * circles at both ends, and a route-deviation alert strip.
 *
 * When NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is set on the deployment, a fourth
 * "Google" basemap appears, drawing a sanctioned Maps Static API hybrid image
 * (no Google JS SDK is ever loaded). Without the key the Google button is
 * hidden and the Esri satellite/hybrid layers serve the imagery instead.
 *
 * Web-mercator maths (the same maths every slippy map uses):
 *   worldX = (lng + 180) / 360 · 256 · 2^z
 *   worldY = (1 − ln(tan φ + sec φ) / π) / 2 · 256 · 2^z
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Crosshair, Minus, Plus, Truck } from 'lucide-react';

const TILE = 256;
const MIN_Z = 4;
const MAX_Z = 18;

const lngToWorldX = (lng: number, z: number) => ((lng + 180) / 360) * TILE * 2 ** z;
const latToWorldY = (lat: number, z: number) => {
  const s = Math.sin((lat * Math.PI) / 180);
  return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * TILE * 2 ** z;
};
const worldXToLng = (x: number, z: number) => (x / (TILE * 2 ** z)) * 360 - 180;
const worldYToLat = (y: number, z: number) => {
  const n = Math.PI - 2 * Math.PI * (y / (TILE * 2 ** z));
  return (180 / Math.PI) * Math.atan(Math.sinh(n));
};
const metersPerPixel = (lat: number, z: number) => (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** z;

export interface RoutePoint {
  lat: number;
  lng: number;
  t?: string;
  km?: number;
}

/** The fields of a shipment_tracking_trips row the map needs (loose, optional). */
export interface TripLike {
  origin_name?: string | null;
  origin_lat?: number | null;
  origin_lng?: number | null;
  destination_name?: string | null;
  destination_lat?: number | null;
  destination_lng?: number | null;
  current_lat?: number | null;
  current_lng?: number | null;
  /** PG numerics arrive as strings too, so this stays loose. */
  current_accuracy_m?: string | number | null;
  geofence_status?: string | null;
  route_deviation_alert?: boolean | null;
  route_history?: RoutePoint[] | null;
}

type Base = 'street' | 'satellite' | 'hybrid' | 'google';

const GEOFENCE_KM = 0.5;

export default function LiveLogisticsMap({ trip, className = '' }: { trip: TripLike; className?: string }) {
  const googleKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() || '';
  const [base, setBase] = useState<Base>('street');
  const [zoom, setZoom] = useState(13);
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [center, setCenter] = useState<{ lat: number; lng: number }>({
    lat: trip.current_lat ?? trip.origin_lat ?? 34.08,
    lng: trip.current_lng ?? trip.origin_lng ?? 74.8,
  });
  const [follow, setFollow] = useState(true);
  const drag = useRef<{ px: number; py: number; lat: number; lng: number } | null>(null);

  const truckLat = trip.current_lat ?? null;
  const truckLng = trip.current_lng ?? null;
  const originLat = trip.origin_lat ?? null;
  const originLng = trip.origin_lng ?? null;
  const destLat = trip.destination_lat ?? null;
  const destLng = trip.destination_lng ?? null;
  const history = useMemo(() => (Array.isArray(trip.route_history) ? trip.route_history : []), [trip.route_history]);

  // Follow mode: every new fix re-centres the view on the truck.
  useEffect(() => {
    if (follow && truckLat !== null && truckLng !== null) setCenter({ lat: truckLat, lng: truckLng });
  }, [follow, truckLat, truckLng]);

  // The container's real size drives which tiles are shown.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const clampLat = (v: number) => Math.max(-85, Math.min(85, v));
  const cpx = lngToWorldX(center.lng, zoom);
  const cpy = latToWorldY(clampLat(center.lat), zoom);
  const left = cpx - size.w / 2;
  const top = cpy - size.h / 2;
  const n = 2 ** zoom;
  const x0 = Math.floor(left / TILE);
  const x1 = Math.floor((left + size.w) / TILE);
  const y0 = Math.max(0, Math.floor(top / TILE));
  const y1 = Math.min(n - 1, Math.floor((top + size.h) / TILE));

  const px = (lat: number, lng: number) => ({ x: lngToWorldX(lng, zoom) - left, y: latToWorldY(clampLat(lat), zoom) - top });
  const mpp = metersPerPixel(clampLat(center.lat), zoom);
  const fencePx = Math.min((GEOFENCE_KM * 1000) / mpp, 4000);

  const useTiles = base !== 'google' || !googleKey;
  const showGoogleStatic = base === 'google' && Boolean(googleKey);

  const tileSrc = (tx: number, tz: number) =>
    base === 'satellite' || base === 'hybrid'
      ? `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${tz}/${tx}`
      : `https://tile.openstreetmap.org/${zoom}/${tx}/${tz}.png`;
  const overlaySrc = (tx: number, tz: number) =>
    `https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/${zoom}/${tz}/${tx}`;

  const attribution =
    base === 'satellite' || base === 'hybrid'
      ? 'Imagery © Esri'
      : showGoogleStatic
        ? 'Map data © Google'
        : '© OpenStreetMap contributors';

  const truck = truckLat !== null && truckLng !== null ? px(truckLat, truckLng) : null;
  const accM = (() => {
    const n = Number(trip.current_accuracy_m ?? 0);
    return Number.isFinite(n) && n > 0 ? n : 0;
  })();
  const accR = accM > 0 ? Math.min(accM / mpp, 3000) : 0;

  const routePts = history
    .filter((h) => Number.isFinite(h?.lat) && Number.isFinite(h?.lng))
    .map((h) => px(h.lat, h.lng));
  const routeD = routePts.length ? `M ${routePts.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' L ')}` : '';

  const origin = originLat !== null && originLng !== null ? px(originLat, originLng) : null;
  const dest = destLat !== null && destLng !== null ? px(destLat, destLng) : null;
  const lineD =
    origin && dest
      ? `M ${origin.x.toFixed(1)} ${origin.y.toFixed(1)} L ${dest.x.toFixed(1)} ${dest.y.toFixed(1)}`
      : '';

  return (
    <figure className={`grid gap-1 ${className}`}>
      {/* Route-deviation alert (the trip's own flag from the tracking API). */}
      {trip.route_deviation_alert && (
        <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-bold text-rose-900 ring-1 ring-rose-300">
          ⚠️ Route deviation alert — the truck is more than 15 km from the direct route. The driver and the seller have been flagged.
        </p>
      )}

      <div
        ref={box}
        role="application"
        aria-label="Live shipment map: the truck, its route and the destination geofence"
        className="relative touch-none select-none overflow-hidden rounded-xl bg-slate-200 ring-1 ring-slate-900/10"
        style={{ height: '22rem', cursor: drag.current ? 'grabbing' : 'grab' }}
        onPointerDown={(e) => {
          drag.current = { px: e.clientX, py: e.clientY, lat: center.lat, lng: center.lng };
          setFollow(false);
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d || size.w === 0) return;
          const dx = e.clientX - d.px;
          const dy = e.clientY - d.py;
          setCenter({
            lng: worldXToLng(lngToWorldX(d.lng, zoom) - dx, zoom),
            lat: clampLat(worldYToLat(latToWorldY(d.lat, zoom) - dy, zoom)),
          });
        }}
        onPointerUp={(e) => {
          drag.current = null;
          e.currentTarget.releasePointerCapture(e.pointerId);
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
        {/* Basemap: raster tiles (OSM / Esri), or the Google Static hybrid image. */}
        {size.w > 0 && useTiles && (
          <>
            {Array.from({ length: x1 - x0 + 1 }, (_, ix) => {
              const tx = x0 + ix;
              const wrapped = ((tx % n) + n) % n;
              return Array.from({ length: y1 - y0 + 1 }, (_, iy) => (
                <img
                  key={`${tx}-${y0 + iy}`}
                  src={tileSrc(wrapped, y0 + iy)}
                  alt=""
                  width={TILE}
                  height={TILE}
                  draggable={false}
                  loading="lazy"
                  decoding="async"
                  className="pointer-events-none absolute"
                  style={{ left: tx * TILE - left, top: (y0 + iy) * TILE - top }}
                />
              ));
            })}
            {/* Hybrid: Esri imagery above + the reference labels on top. */}
            {base === 'hybrid' &&
              Array.from({ length: x1 - x0 + 1 }, (_, ix) => {
                const tx = x0 + ix;
                const wrapped = ((tx % n) + n) % n;
                return Array.from({ length: y1 - y0 + 1 }, (_, iy) => (
                  <img
                    key={`ref-${tx}-${y0 + iy}`}
                    src={overlaySrc(wrapped, y0 + iy)}
                    alt=""
                    width={TILE}
                    height={TILE}
                    draggable={false}
                    loading="lazy"
                    decoding="async"
                    className="pointer-events-none absolute"
                    style={{ left: tx * TILE - left, top: (y0 + iy) * TILE - top }}
                  />
                ));
              })}
          </>
        )}
        {size.w > 0 && showGoogleStatic && (
          <img
            alt=""
            draggable={false}
            decoding="async"
            className="pointer-events-none absolute"
            style={{ left: -320 + size.w / 2, top: -320 + size.h / 2, width: 640, height: 640 }}
            src={`https://maps.googleapis.com/maps/api/staticmap?center=${center.lat.toFixed(6)},${center.lng.toFixed(6)}&zoom=${zoom}&size=640x640&scale=2&maptype=hybrid&key=${encodeURIComponent(googleKey)}`}
          />
        )}

        {/* The overlays: geofence circles, route line, straight line, markers. */}
        <svg aria-hidden className="pointer-events-none absolute inset-0 z-[5]" width={size.w} height={size.h}>
          {origin && <circle cx={origin.x} cy={origin.y} r={fencePx} fill="rgba(2,132,199,0.10)" stroke="rgba(2,132,199,0.45)" strokeWidth="1.5" />}
          {dest && <circle cx={dest.x} cy={dest.y} r={fencePx} fill="rgba(5,150,105,0.10)" stroke="rgba(5,150,105,0.5)" strokeWidth="1.5" />}
          {lineD && <path d={lineD} fill="none" stroke="rgba(30,41,59,0.55)" strokeWidth="2" strokeDasharray="7 6" />}
          {routeD && <path d={routeD} fill="none" stroke="#059669" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />}
          {routeD && <path d={routeD} fill="none" stroke="#ffffff" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />}
        </svg>

        {/* Origin and destination pins. */}
        {origin && (
          <svg aria-hidden className="pointer-events-none absolute z-[6]" style={{ left: origin.x, top: origin.y, transform: 'translate(-50%, -100%)' }} width={24} height={32} viewBox="0 0 28 36">
            <path d="M14 1C7.4 1 2 6.4 2 13c0 9 12 22 12 22s12-13 12-22C26 6.4 20.6 1 14 1z" fill="#0284c7" stroke="#ffffff" strokeWidth="2" />
            <circle cx="14" cy="13" r="4.5" fill="#ffffff" />
          </svg>
        )}
        {dest && (
          <svg aria-hidden className="pointer-events-none absolute z-[6]" style={{ left: dest.x, top: dest.y, transform: 'translate(-50%, -100%)' }} width={24} height={32} viewBox="0 0 28 36">
            <path d="M14 1C7.4 1 2 6.4 2 13c0 9 12 22 12 22s12-13 12-22C26 6.4 20.6 1 14 1z" fill="#047857" stroke="#ffffff" strokeWidth="2" />
            <circle cx="14" cy="13" r="4.5" fill="#ffffff" />
          </svg>
        )}

        {/* The truck: accuracy circle + marker. */}
        {truck && (
          <>
            {accR > 2 && (
              <div
                aria-hidden
                className="pointer-events-none absolute rounded-full bg-indigo-500/20"
                style={{ left: truck.x - accR, top: truck.y - accR, width: accR * 2, height: accR * 2, border: '1.5px solid rgba(79,70,229,0.55)' }}
              />
            )}
            <span
              className="pointer-events-none absolute z-[7] grid h-9 w-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white text-indigo-700 shadow-lg ring-2 ring-indigo-600"
              style={{ left: truck.x, top: truck.y }}
            >
              <Truck className="h-5 w-5" aria-hidden />
            </span>
          </>
        )}

        {/* Basemap switcher, zoom and follow controls. */}
        <div className="absolute right-2 top-2 z-10 flex flex-col items-end gap-1">
          <div role="group" aria-label="Map type" className="flex overflow-hidden rounded-lg bg-white shadow ring-1 ring-slate-300">
            {([
              ['street', 'Street'],
              ['satellite', 'Satellite'],
              ['hybrid', 'Hybrid'],
              ...(googleKey ? ([['google', 'Google']] as [Base, string][]) : []),
            ] as [Base, string][]).map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-pressed={base === id}
                onClick={() => setBase(id)}
                className={`min-h-8 cursor-pointer px-2 text-[11px] font-bold ${base === id ? 'bg-slate-800 text-white' : 'bg-white text-slate-700 hover:bg-slate-50'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <button type="button" aria-label="Zoom in" disabled={zoom >= MAX_Z} onClick={() => setZoom((z) => Math.min(MAX_Z, z + 1))} className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg bg-white text-slate-800 shadow ring-1 ring-slate-300 hover:bg-slate-50 disabled:opacity-40">
            <Plus className="h-4 w-4" aria-hidden />
          </button>
          <button type="button" aria-label="Zoom out" disabled={zoom <= MIN_Z} onClick={() => setZoom((z) => Math.max(MIN_Z, z - 1))} className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg bg-white text-slate-800 shadow ring-1 ring-slate-300 hover:bg-slate-50 disabled:opacity-40">
            <Minus className="h-4 w-4" aria-hidden />
          </button>
          <button type="button" aria-label={follow ? 'Following the truck' : 'Centre back on the truck'} onClick={() => { setFollow(true); if (truckLat !== null && truckLng !== null) setCenter({ lat: truckLat, lng: truckLng }); }} className={`grid h-8 w-8 cursor-pointer place-items-center rounded-lg shadow ring-1 ring-slate-300 ${follow ? 'bg-indigo-600 text-white' : 'bg-white text-slate-700 hover:bg-indigo-50'}`}>
            <Crosshair className="h-4 w-4" aria-hidden />
          </button>
        </div>

        {/* Live badges. */}
        <p className="pointer-events-none absolute bottom-1.5 left-1.5 z-10 rounded-lg bg-white/90 px-2 py-1 font-mono text-[10px] font-semibold text-slate-800 shadow-sm ring-1 ring-slate-300">
          {truckLat !== null && truckLng !== null
            ? `${truckLat.toFixed(5)}° N, ${Math.abs(truckLng).toFixed(5)}° ${truckLng >= 0 ? 'E' : 'W'}${accM > 0 ? ` · ±${Math.round(accM)} m` : ''}`
            : 'Waiting for the first driver ping…'}
        </p>
        {trip.geofence_status && (
          <p className={`pointer-events-none absolute left-1.5 top-1.5 z-10 rounded-lg px-2 py-1 text-[10px] font-bold shadow-sm ring-1 ${trip.geofence_status === 'ARRIVED' ? 'bg-emerald-600 text-white ring-emerald-700' : trip.geofence_status === 'INSIDE_GEOFENCE' ? 'bg-emerald-50 text-emerald-900 ring-emerald-300' : trip.geofence_status === 'APPROACHING_GEOFENCE' ? 'bg-amber-50 text-amber-900 ring-amber-300' : 'bg-white/90 text-slate-700 ring-slate-300'}`}>
            🧭 {trip.geofence_status.replaceAll('_', ' ')}
          </p>
        )}
        <p className="pointer-events-none absolute bottom-1.5 right-1.5 z-10 rounded bg-white/80 px-1 text-[9px] text-slate-600">{attribution}</p>
      </div>

      <figcaption className="flex flex-wrap items-center justify-between gap-1 text-[11px] text-slate-500">
        <span>
          🚚 {trip.origin_name ?? 'Origin'} → 🏁 {trip.destination_name ?? 'Destination'} — drag to pan, ± to zoom, switch street / satellite / hybrid.
        </span>
        {destLat !== null && destLng !== null && (
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${destLat},${destLng}&travelmode=driving`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-bold text-emerald-700 underline underline-offset-2"
          >
            Turn-by-turn in Google Maps ↗
          </a>
        )}
      </figcaption>
    </figure>
  );
}
