'use client';

/**
 * Live vehicle map for the unified GPS tracking portal.
 *
 * When NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is set, the official Google Maps
 * JavaScript API renders ROAD / SATELLITE / HYBRID views with the origin and
 * destination markers, the GPS breadcrumb polyline and the moving vehicle
 * marker. Without a key it falls back to a fully self-contained tile map
 * (OpenStreetMap road tiles, Esri World Imagery satellite tiles and Esri
 * World_Boundaries_and_Places labels for hybrid - all hosts already allowed
 * by the CSP) drawn with the vehicle's real recorded coordinates.
 *
 * Geometry: every tile and every overlay point is projected from the same
 * center coordinate into one fixed 1280x480 viewBox (tiles are SVG <image>
 * elements), so the imagery and the route overlay can never drift apart.
 * No simulated movement: the marker only ever moves to a real recorded ping.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';

export interface RoutePoint {
  latitude: number;
  longitude: number;
  recorded_at?: string;
}

export interface GoogleOrTileLiveMapProps {
  originLat: number;
  originLng: number;
  originName: string;
  destLat: number;
  destLng: number;
  destName: string;
  vehicleLat?: number | null;
  vehicleLng?: number | null;
  vehicleRegNo?: string;
  vehicleCategory?: string;
  headingDeg?: number | null;
  accuracyM?: number | null;
  trackingStatus: string;
  routeHistory: RoutePoint[];
}

type MapLayerMode = 'ROAD' | 'SATELLITE' | 'HYBRID';

/** Web-mercator projection into float tile coordinates at a zoom level. */
function latLngToTileXY(lat: number, lng: number, zoom: number) {
  const n = Math.pow(2, zoom);
  const xFloat = ((lng + 180) / 360) * n;
  const latRad = (lat * Math.PI) / 180;
  const yFloat = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  return { xFloat, yFloat, tileX: Math.floor(xFloat), tileY: Math.floor(yFloat) };
}

const MAP_TYPE_IDS: Record<MapLayerMode, string> = { ROAD: 'roadmap', SATELLITE: 'satellite', HYBRID: 'hybrid' };

/** Minimal structural types for the Google Maps JS SDK objects we use. */
interface GMapInstance {
  setCenter: (position: unknown) => void;
  setOptions: (options: Record<string, unknown>) => void;
}
interface GOverlay {
  setMap: (map: GMapInstance | null) => void;
}
interface GMapsCtors {
  Map?: new (el: HTMLElement, opts: Record<string, unknown>) => GMapInstance;
  Marker?: new (opts: Record<string, unknown>) => GOverlay;
  Polyline?: new (opts: Record<string, unknown>) => GOverlay;
  LatLng?: new (lat: number, lng: number) => unknown;
}

export default function GoogleOrTileLiveMap({
  originLat,
  originLng,
  originName,
  destLat,
  destLng,
  destName,
  vehicleLat,
  vehicleLng,
  vehicleRegNo = 'UNASSIGNED',
  headingDeg,
  accuracyM,
  trackingStatus,
  routeHistory,
}: GoogleOrTileLiveMapProps) {
  const [layer, setLayer] = useState<MapLayerMode>('HYBRID');
  const [zoom, setZoom] = useState<number>(Number.isFinite(vehicleLat) && Number.isFinite(vehicleLng) ? 13 : 5);
  const [centerOnVehicle, setCenterOnVehicle] = useState<boolean>(true);
  const [googleMapReady, setGoogleMapReady] = useState(false);

  const googleMapsKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';
  const gmapDivRef = useRef<HTMLDivElement | null>(null);
  const gmapRef = useRef<GMapInstance | null>(null);
  const gOverlaysRef = useRef<Array<GOverlay>>([]);

  const hasVehicle = Number.isFinite(vehicleLat) && Number.isFinite(vehicleLng);
  const activeLat = centerOnVehicle && hasVehicle ? Number(vehicleLat) : (originLat + destLat) / 2;
  const activeLng = centerOnVehicle && hasVehicle ? Number(vehicleLng) : (originLng + destLng) / 2;

  // Load the official Google Maps JS SDK only when a key is configured.
  useEffect(() => {
    if (!googleMapsKey || typeof window === 'undefined') return;
    const win = window as unknown as { google?: { maps?: unknown } };
    if (win.google?.maps) {
      setGoogleMapReady(true);
      return;
    }
    if (document.getElementById('kashroot-google-maps-sdk')) return;
    const script = document.createElement('script');
    script.id = 'kashroot-google-maps-sdk';
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(googleMapsKey)}&libraries=geometry`;
    script.async = true;
    script.onload = () => setGoogleMapReady(true);
    document.head.appendChild(script);
  }, [googleMapsKey]);

  // ---- Fallback tile geometry: one shared projection ------------------------
  const center = latLngToTileXY(activeLat, activeLng, zoom);
  const fracX = center.xFloat - center.tileX;
  const fracY = center.yFloat - center.tileY;

  const project = useCallback(
    (lat: number, lng: number) => {
      const p = latLngToTileXY(lat, lng, zoom);
      return { x: 640 + (p.xFloat - center.xFloat) * 256, y: 240 + (p.yFloat - center.yFloat) * 256 };
    },
    [zoom, center.xFloat, center.yFloat],
  );

  const originPt = project(originLat, originLng);
  const destPt = project(destLat, destLng);
  const vehiclePt = hasVehicle ? project(Number(vehicleLat), Number(vehicleLng)) : null;

  const gridOffsets = [-3, -2, -1, 0, 1, 2, 3];
  const maxTile = Math.pow(2, zoom);

  const roadTrail = [originPt, ...routeHistory.map((p) => project(p.latitude, p.longitude)), ...(vehiclePt ? [vehiclePt] : [])]
    .map((p) => `${Math.round(p.x)},${Math.round(p.y)}`)
    .join(' ');

  // ---- Official Google map path (only with a configured key) ---------------
  useEffect(() => {
    if (!googleMapReady || typeof window === 'undefined') return;
    const maps = ((window as unknown as { google?: { maps?: GMapsCtors } }).google?.maps ?? null) as GMapsCtors | null;
    const div = gmapDivRef.current;
    const MapCtor = maps?.Map;
    const LatLngCtor = maps?.LatLng;
    const MarkerCtor = maps?.Marker;
    const PolylineCtor = maps?.Polyline;
    if (!maps || !div || !MapCtor || !LatLngCtor) return;

    if (!gmapRef.current) {
      gmapRef.current = new MapCtor(div, {
        center: new LatLngCtor(activeLat, activeLng),
        zoom: 5,
        mapTypeId: MAP_TYPE_IDS[layer],
        streetViewControl: false,
        fullscreenControl: false,
      });
    }
    const map = gmapRef.current;
    if (!map) return;
    if (centerOnVehicle && hasVehicle) {
      map.setCenter(new LatLngCtor(Number(vehicleLat), Number(vehicleLng)));
    }
    map.setOptions({ mapTypeId: MAP_TYPE_IDS[layer] });

    for (const o of gOverlaysRef.current) {
      o.setMap(null);
    }
    gOverlaysRef.current = [];

    const putMarker = (lat: number, lng: number, label: string) => {
      if (!MarkerCtor) return;
      const m = new MarkerCtor({
        position: new LatLngCtor(lat, lng),
        map,
        title: label,
        label: { text: label.slice(0, 1), color: '#ffffff', fontSize: '11px' },
      });
      gOverlaysRef.current.push(m);
    };
    putMarker(originLat, originLng, `O ${originName}`);
    putMarker(destLat, destLng, `D ${destName}`);
    if (PolylineCtor) {
      const trail = new PolylineCtor({
        path: routeHistory.map((p) => new LatLngCtor(p.latitude, p.longitude)),
        map,
        strokeColor: '#10b981',
        strokeWeight: 4,
        strokeOpacity: 0.9,
      });
      gOverlaysRef.current.push(trail);
    }
    if (hasVehicle && MarkerCtor) {
      const vm = new MarkerCtor({
        position: new LatLngCtor(Number(vehicleLat), Number(vehicleLng)),
        map,
        title: `${vehicleRegNo} - ${trackingStatus}`,
        label: { text: 'T', color: '#ffffff', fontSize: '11px' },
      });
      gOverlaysRef.current.push(vm);
    }
  }, [
    googleMapReady, layer, centerOnVehicle, hasVehicle,
    activeLat, activeLng, vehicleLat, vehicleLng,
    originLat, originLng, originName, destLat, destLng, destName,
    routeHistory, vehicleRegNo, trackingStatus,
  ]);

  const liveLabel =
    hasVehicle
      ? `Live Vehicle GPS: ${Number(vehicleLat).toFixed(5)}° N, ${Number(vehicleLng).toFixed(5)}° E${accuracyM ? ` (±${Math.round(Number(accuracyM))} m)` : ''}${headingDeg !== null && headingDeg !== undefined ? ` · Heading ${Math.round(Number(headingDeg))}°` : ''}`
      : 'Waiting for Driver or AIS-140 device to press START TRACKING...';

  return (
    <div className="relative h-[460px] w-full select-none overflow-hidden rounded-2xl border border-slate-300 bg-slate-950 shadow-inner">
      {/* Layer and camera controls */}
      <div className="pointer-events-auto absolute left-3 right-3 top-3 z-20 flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-xl border border-slate-700 bg-slate-900/90 p-1 shadow-lg backdrop-blur">
          {(['ROAD', 'SATELLITE', 'HYBRID'] as MapLayerMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setLayer(mode)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                layer === mode ? 'bg-emerald-500 text-slate-950 shadow' : 'text-slate-200 hover:bg-slate-800'
              }`}
            >
              {mode === 'ROAD' ? '🗺️ Road Map' : mode === 'SATELLITE' ? '🛰️ Satellite' : '🌐 Hybrid'}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              setCenterOnVehicle(true);
              if (hasVehicle) setZoom(14);
            }}
            className="rounded-xl border border-emerald-500/40 bg-slate-900/90 px-3 py-1.5 text-xs font-semibold text-emerald-300 shadow hover:bg-slate-800"
          >
            🎯 Focus Vehicle
          </button>
          <button
            type="button"
            onClick={() => {
              setCenterOnVehicle(false);
              setZoom(5);
            }}
            className="rounded-xl border border-sky-500/40 bg-slate-900/90 px-3 py-1.5 text-xs font-semibold text-sky-300 shadow hover:bg-slate-800"
          >
            🇮🇳 Full India Route
          </button>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(18, z + 1))}
            className="h-8 w-8 rounded-xl border border-slate-700 bg-slate-900/90 font-bold text-white hover:bg-slate-800"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(3, z - 1))}
            className="h-8 w-8 rounded-xl border border-slate-700 bg-slate-900/90 font-bold text-white hover:bg-slate-800"
          >
            −
          </button>
        </div>
      </div>

      {/* Official Google map (key configured) */}
      <div
        ref={gmapDivRef}
        className={`absolute inset-0 z-0 ${googleMapReady ? '' : 'invisible'}`}
      />

      {/* Tile + SVG fallback (no key): tiles, polylines and markers share the
          one 1280x480 viewBox so imagery and overlay can never drift. */}
      {!googleMapReady && (
        <svg
          viewBox="0 0 1280 480"
          preserveAspectRatio="xMidYMid slice"
          className="absolute inset-0 z-10 h-full w-full"
        >
          {gridOffsets.map((dy) =>
            gridOffsets.map((dx) => {
              const ty = center.tileY + dy;
              const tx = center.tileX + dx;
              if (ty < 0 || ty >= maxTile) return null;
              const wrappedX = ((tx % maxTile) + maxTile) % maxTile;
              const left = 640 + (dx - fracX) * 256;
              const top = 240 + (dy - fracY) * 256;

              const base =
                layer === 'ROAD'
                  ? `https://tile.openstreetmap.org/${zoom}/${wrappedX}/${ty}.png`
                  : `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${ty}/${wrappedX}`;
              const labels =
                layer === 'HYBRID'
                  ? `https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/${zoom}/${ty}/${wrappedX}`
                  : null;

              return (
                <g key={`${zoom}-${wrappedX}-${ty}`}>
                  <image href={base} x={left} y={top} width={256} height={256} preserveAspectRatio="none" />
                  {labels && <image href={labels} x={left} y={top} width={256} height={256} preserveAspectRatio="none" />}
                </g>
              );
            }),
          )}

          {/* Remaining planned route (dashed sky blue) */}
          <polyline
            fill="none"
            stroke="#38bdf8"
            strokeWidth="3.5"
            strokeDasharray="8 6"
            points={`${Math.round(vehiclePt ? vehiclePt.x : originPt.x)},${Math.round(vehiclePt ? vehiclePt.y : originPt.y)} ${Math.round(destPt.x)},${Math.round(destPt.y)}`}
          />
          {/* Actual travelled GPS breadcrumb trail (solid emerald) */}
          <polyline
            fill="none"
            stroke="#10b981"
            strokeWidth="4.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={roadTrail}
          />

          {/* Origin marker */}
          <g transform={`translate(${originPt.x}, ${originPt.y})`}>
            <circle r="8" fill="#16a34a" stroke="#ffffff" strokeWidth="2.5" />
            <text y="-12" textAnchor="middle" fill="#ffffff" fontSize="11" fontWeight="bold" style={{ textShadow: '0 1px 4px #000' }}>
              🍏 Origin: {originName.split(',')[0]}
            </text>
          </g>

          {/* Destination marker */}
          <g transform={`translate(${destPt.x}, ${destPt.y})`}>
            <circle r="8" fill="#ef4444" stroke="#ffffff" strokeWidth="2.5" />
            <text y="22" textAnchor="middle" fill="#ffffff" fontSize="11" fontWeight="bold" style={{ textShadow: '0 1px 4px #000' }}>
              🏁 Destination: {destName.split(',')[0]}
            </text>
          </g>

          {/* Live vehicle marker - only ever at a real recorded position */}
          {vehiclePt && (
            <g transform={`translate(${vehiclePt.x}, ${vehiclePt.y})`}>
              <circle
                r="22"
                fill={trackingStatus === 'LIVE' ? 'rgba(16, 185, 129, 0.28)' : 'rgba(245, 158, 11, 0.28)'}
                stroke={trackingStatus === 'LIVE' ? '#10b981' : '#f59e0b'}
                strokeWidth="1.5"
              />
              <circle
                r="11"
                fill={trackingStatus === 'LIVE' ? '#059669' : '#d97706'}
                stroke="#ffffff"
                strokeWidth="2.5"
              />
              <text y="4" textAnchor="middle" fontSize="11">
                🚛
              </text>
              <rect x="-85" y="-42" width="170" height="24" rx="6" fill="rgba(15, 23, 42, 0.92)" stroke="#10b981" strokeWidth="1" />
              <text x="0" y="-26" textAnchor="middle" fill="#ecfdf5" fontSize="10.5" fontWeight="bold">
                {vehicleRegNo} · {trackingStatus}
              </text>
            </g>
          )}
        </svg>
      )}

      {/* Live coordinate and accuracy telemetry strip */}
      <div className="absolute bottom-3 left-3 right-3 z-20 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-700/80 bg-slate-900/90 px-3.5 py-2 text-xs text-slate-200 backdrop-blur">
        <div>
          {hasVehicle ? (
            <span>
              <strong className="text-emerald-400">Live Vehicle GPS:</strong> {liveLabel.replace('Live Vehicle GPS: ', '')}
            </span>
          ) : (
            <span className="text-amber-300">{liveLabel}</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-slate-400">
            {googleMapReady ? 'Google Maps Platform Active' : 'Live Satellite/Road Geodesic Map'} ·{' '}
            {routeHistory.length} GPS breadcrumbs recorded
          </span>
          {hasVehicle && (
            <a
              href={`https://www.google.com/maps/dir/?api=1&origin=${originLat},${originLng}&destination=${destLat},${destLng}&waypoints=${vehicleLat},${vehicleLng}&travelmode=driving`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-500"
            >
              Open Full Navigation ↗
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
