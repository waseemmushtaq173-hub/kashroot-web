'use client';

/**
 * LiveInteractiveMap — a native interactive OpenStreetMap map with no iframe
 * and no map library: real OSM raster tiles loaded as plain <img> elements
 * (never blocked by CSP frame-src), a draggable view, +/− zoom buttons, the
 * GPS accuracy circle, a live coordinates badge and an "Open in Google Maps"
 * link. Pure React + SVG: loads with next/dynamic and ssr:false so the tile
 * maths always has the container's real size.
 *
 * Web-mercator maths (the same maths every slippy map uses):
 *   worldX = (lng + 180) / 360 · 256 · 2^z
 *   worldY = (1 − ln(tan φ + sec φ) / π) / 2 · 256 · 2^z
 *   metres per pixel = 156543.03392 · cos φ / 2^z
 */
import { useEffect, useRef, useState } from 'react';
import { Crosshair, ExternalLink, Minus, Plus } from 'lucide-react';

const TILE = 256;
const MIN_Z = 3;
const MAX_Z = 19;

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

export interface LiveInteractiveMapProps {
  lat: number;
  lng: number;
  /** GPS accuracy in metres (the blue circle); null/undefined hides it. */
  accuracy?: number | null;
  /** Words over the pin, e.g. "Your delivery pin". */
  label?: string;
  /** Tailwind classes for the whole box (default height 56). */
  className?: string;
}

export default function LiveInteractiveMap({ lat, lng, accuracy = null, label, className = '' }: LiveInteractiveMapProps) {
  const box = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(16);
  const [center, setCenter] = useState({ lat, lng });
  const [size, setSize] = useState({ w: 0, h: 0 });
  /** The view while a drag is in progress: where it started (px and geo). */
  const drag = useRef<{ px: number; py: number; lat: number; lng: number } | null>(null);

  // A new fix re-centres the view on it.
  useEffect(() => { setCenter({ lat, lng }); }, [lat, lng]);

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

  // The marker keeps its geo place even after the view is panned away.
  const mx = lngToWorldX(lat, zoom) - left;
  const my = latToWorldY(clampLat(lat), zoom) - top;
  const mpp = metersPerPixel(clampLat(lat), zoom);
  const circleR = accuracy && accuracy > 0 ? Math.min(accuracy / mpp, 3000) : 0;

  return (
    <figure className={`grid gap-1 ${className}`}>
      <div
        ref={box}
        role="application"
        aria-label={label ? `${label} on an interactive OpenStreetMap map` : 'Interactive OpenStreetMap map'}
        className="relative touch-none select-none overflow-hidden rounded-xl bg-slate-200 ring-1 ring-slate-900/10"
        style={{ height: '14rem', cursor: drag.current ? 'grabbing' : 'grab' }}
        onPointerDown={(e) => {
          drag.current = { px: e.clientX, py: e.clientY, lat: center.lat, lng: center.lng };
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
        onPointerCancel={() => { drag.current = null; }}
      >
        {/* The OSM tiles themselves: plain <img> elements, so nothing can block them. */}
        {size.w > 0 && (
          <>
            {Array.from({ length: x1 - x0 + 1 }, (_, ix) => {
              const tx = x0 + ix;
              const wrapped = ((tx % n) + n) % n;
              return Array.from({ length: y1 - y0 + 1 }, (_, iy) => (
                <img
                  key={`${tx}-${y0 + iy}`}
                  src={`https://tile.openstreetmap.org/${zoom}/${wrapped}/${y0 + iy}.png`}
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
            {/* The GPS accuracy circle around the pin. */}
            {circleR > 2 && (
              <div
                aria-hidden
                className="pointer-events-none absolute rounded-full bg-sky-500/20"
                style={{ left: mx - circleR, top: my - circleR, width: circleR * 2, height: circleR * 2, border: '1.5px solid rgba(2,132,199,0.55)' }}
              />
            )}
            {/* The pin itself. */}
            <svg aria-hidden className="pointer-events-none absolute" style={{ left: mx, top: my, transform: 'translate(-50%, -100%)' }} width={28} height={36} viewBox="0 0 28 36">
              <path d="M14 1C7.4 1 2 6.4 2 13c0 9 12 22 12 22s12-13 12-22C26 6.4 20.6 1 14 1z" fill="#0284c7" stroke="#ffffff" strokeWidth="2" />
              <circle cx="14" cy="13" r="4.5" fill="#ffffff" />
            </svg>
          </>
        )}

        {/* Zoom and re-centre, top right. */}
        <div className="absolute right-2 top-2 z-10 flex flex-col gap-1">
          <button type="button" aria-label="Zoom in" disabled={zoom >= MAX_Z} onClick={() => setZoom((z) => Math.min(MAX_Z, z + 1))} className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg bg-white text-slate-800 shadow ring-1 ring-slate-300 hover:bg-slate-50 disabled:opacity-40">
            <Plus className="h-4 w-4" aria-hidden />
          </button>
          <button type="button" aria-label="Zoom out" disabled={zoom <= MIN_Z} onClick={() => setZoom((z) => Math.max(MIN_Z, z - 1))} className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg bg-white text-slate-800 shadow ring-1 ring-slate-300 hover:bg-slate-50 disabled:opacity-40">
            <Minus className="h-4 w-4" aria-hidden />
          </button>
          <button type="button" aria-label="Centre back on the pin" onClick={() => setCenter({ lat, lng })} className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg bg-white text-sky-700 shadow ring-1 ring-slate-300 hover:bg-sky-50">
            <Crosshair className="h-4 w-4" aria-hidden />
          </button>
        </div>

        {/* Live coordinates badge, bottom left. */}
        <p className="pointer-events-none absolute bottom-1.5 left-1.5 z-10 rounded-lg bg-white/90 px-2 py-1 font-mono text-[10px] font-semibold text-slate-800 shadow-sm ring-1 ring-slate-300">
          {lat.toFixed(5)}° N, {Math.abs(lng).toFixed(5)}° {(lng >= 0 ? 'E' : 'W')}{accuracy && accuracy > 0 ? ` · ±${Math.round(accuracy)} m` : ''}
        </p>
        <p className="pointer-events-none absolute bottom-1.5 right-1.5 z-10 rounded bg-white/80 px-1 text-[9px] text-slate-600">© OpenStreetMap contributors</p>
      </div>

      <figcaption className="flex flex-wrap items-center justify-between gap-1 text-[11px] text-slate-500">
        <span>📍 {label ?? 'Live pin'} — drag to pan, ± to zoom.</span>
        <a
          href={`https://www.google.com/maps?q=${lat},${lng}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-bold text-emerald-700 underline underline-offset-2"
        >
          Open in Google Maps <ExternalLink className="h-3 w-3" aria-hidden /> ↗
        </a>
      </figcaption>
    </figure>
  );
}
