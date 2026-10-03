'use client';

/**
 * TrackingMap — the route view for one consignment.
 *
 * CLIENT-ONLY, AND ON PURPOSE
 *
 * Leaflet reaches for `window` and `document` while its own module body is
 * still being evaluated, so importing it during a server render throws before
 * any of this file's code runs. The page pulls this component in through
 * `next/dynamic` with `ssr: false`, which keeps it out of the server bundle
 * entirely; `next.config` does not need a transpile entry for it.
 *
 * NO MARKER IMAGE ASSETS
 *
 * Leaflet's default marker is a PNG whose URL it resolves relative to
 * `L.Icon.Default`'s image path — a path that bundlers rewrite and that then
 * 404s at runtime, which is the single commonest way a Leaflet map ships with
 * broken pins. Nothing here uses `L.Icon.Default`. The truck is a `divIcon`
 * carrying inline SVG, and the endpoints are vector `circleMarker`s, so the
 * component is a self-contained bundle with no image request to get wrong.
 */

import { useEffect, useMemo } from 'react';
import L from 'leaflet';
import {
  CircleMarker,
  MapContainer,
  Marker,
  Polyline,
  TileLayer,
  Tooltip,
  useMap,
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

import type { LiveVehicleTracking, RoutePathPoint } from '@/lib/api/tracking';

// ── Brand palette ───────────────────────────────────────────────────────────
// Literal hex rather than the `kr-*` tokens, and that is a Leaflet constraint
// rather than a preference: path options are written to the SVG as presentation
// attributes, where `var(--kr-…)` does not resolve. These are copied from
// src/styles/design-tokens.ts — keep them in step with it.
const COLOUR = {
  /** Saffron, primary-600. The distance still to run. */
  remaining: '#D4831A',
  /** Orchard green, success-600. The ground already covered. */
  covered: '#2E7041',
  /** Walnut, secondary-500. */
  destination: '#8B5E3C',
  /** Saffron, primary-500. */
  truck: '#F5A623',
} as const;

/**
 * OpenStreetMap's standard tile service. Keyless, which is the only reason it
 * is usable here at all.
 *
 * It is not unconditionally free: the tile usage policy expects attribution
 * (supplied below, and required by the licence rather than optional), forbids
 * bulk downloading, and asks that heavy or commercial traffic move to a paid
 * tile host. A demo is well inside that; a launch is not, so this URL is the
 * first thing to replace when the page gets real traffic.
 */
const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors';

const TRUCK_ICON_HTML = `
  <span class="kr-truck-marker__pulse" aria-hidden="true"></span>
  <span class="kr-truck-marker__body">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
         stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M3 6h11v10H3z" />
      <path d="M14 9h4l3 3v4h-7z" />
      <circle cx="7" cy="18" r="2" />
      <circle cx="17" cy="18" r="2" />
    </svg>
  </span>
`;

/**
 * Built once at module scope rather than per render.
 *
 * `L.divIcon` only assembles an options object — it does not touch the DOM, so
 * this is safe even if the module is ever evaluated somewhere unexpected.
 */
const TRUCK_ICON = L.divIcon({
  className: 'kr-truck-marker',
  html: TRUCK_ICON_HTML,
  iconSize: [34, 34],
  iconAnchor: [17, 17],
});

/**
 * Frames the whole route once the map exists.
 *
 * A fixed centre and zoom cannot work here: the routes run from 36 km to well
 * over 2,000 km, and any single zoom that shows Sopore to Parimpora also puts
 * all of Karnataka in the same frame for a run to Yeshwanthpur.
 */
function FitRoute({ points }: { points: L.LatLngExpression[] }) {
  const map = useMap();

  useEffect(() => {
    if (points.length < 2) return;
    map.fitBounds(L.latLngBounds(points), { padding: [36, 36] });
  }, [map, points]);

  return null;
}

/**
 * Leaflet measures its container once, on mount.
 *
 * If the map is laid out inside anything that animates, or is mounted while the
 * container is briefly narrower than it ends up, the tiles are drawn for the
 * wrong size and stay wrong until something forces a re-measure. An explicit
 * invalidate on mount is cheap insurance and costs one frame.
 */
function InvalidateOnMount() {
  const map = useMap();
  useEffect(() => {
    const id = window.setTimeout(() => map.invalidateSize(), 0);
    return () => window.clearTimeout(id);
  }, [map]);
  return null;
}

export interface TrackingMapProps {
  data: LiveVehicleTracking;
  /** Height of the map panel. Callers pass a Tailwind class from a fixed set. */
  className?: string;
}

export default function TrackingMap({ data, className }: TrackingMapProps) {
  const { origin, destination, path } = data.route;

  // Memoised on the vehicle: `fitBounds` re-runs on every change of this array,
  // so a fresh literal each render would re-frame the map on every poll.
  const routePoints = useMemo<L.LatLngExpression[]>(
    () => path.map((point: RoutePathPoint) => [point.lat, point.lng] as [number, number]),
    [path],
  );

  const endpoints = useMemo<L.LatLngExpression[]>(
    () => [
      [origin.lat, origin.lng],
      [destination.lat, destination.lng],
    ],
    [origin.lat, origin.lng, destination.lat, destination.lng],
  );

  /**
   * The ground already covered, as a slice of the drawn route rather than a
   * straight line to the lorry.
   *
   * The obvious implementation — draw from the origin to the current position —
   * cuts the corner on every bend and leaves a chord visibly diverging from the
   * route underneath it. Walking the path and keeping the waypoints the vehicle
   * has actually passed keeps the two lines coincident.
   */
  const coveredPoints = useMemo<L.LatLngExpression[]>(
    () => [
      ...path
        .filter((point) => point.distanceFromOriginKm <= data.progress.coveredKm)
        .map((point) => [point.lat, point.lng] as [number, number]),
      [data.position.lat, data.position.lng],
    ],
    [path, data.progress.coveredKm, data.position.lat, data.position.lng],
  );

  const truckPosition: L.LatLngExpression = [data.position.lat, data.position.lng];

  return (
    <div className={`kr-map-panel ${className ?? 'h-[26rem]'}`}>
      <MapContainer
        center={[origin.lat, origin.lng]}
        zoom={7}
        scrollWheelZoom={false}
        className="h-full w-full"
      >
        <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />

        <InvalidateOnMount />
        <FitRoute points={[...endpoints, ...routePoints]} />

        {/* The whole run, dashed, so the covered line reads as progress over it. */}
        <Polyline
          positions={routePoints}
          pathOptions={{
            color: COLOUR.remaining,
            weight: 3,
            opacity: 0.55,
            dashArray: '6 8',
          }}
        />

        {/* The ground already covered, drawn over it and following the same bends. */}
        {coveredPoints.length >= 2 ? (
          <Polyline
            positions={coveredPoints}
            pathOptions={{ color: COLOUR.covered, weight: 4, opacity: 0.95 }}
          />
        ) : null}

        <CircleMarker
          center={[origin.lat, origin.lng]}
          radius={7}
          pathOptions={{
            color: '#ffffff',
            weight: 2,
            fillColor: COLOUR.covered,
            fillOpacity: 1,
          }}
        >
          <Tooltip direction="top" offset={[0, -8]}>
            <strong>Origin</strong>
            <br />
            {origin.name}
          </Tooltip>
        </CircleMarker>

        <CircleMarker
          center={[destination.lat, destination.lng]}
          radius={7}
          pathOptions={{
            color: '#ffffff',
            weight: 2,
            fillColor: COLOUR.destination,
            fillOpacity: 1,
          }}
        >
          <Tooltip direction="top" offset={[0, -8]}>
            <strong>Destination</strong>
            <br />
            {destination.name}
          </Tooltip>
        </CircleMarker>

        <Marker position={truckPosition} icon={TRUCK_ICON} zIndexOffset={1000}>
          <Tooltip direction="top" offset={[0, -18]}>
            <strong>{data.vehicle.displayNumber}</strong>
            <br />
            {data.status === 'in_transit'
              ? `${data.position.speedKmph} km/h · ${data.progress.coveredKm} km covered`
              : data.status === 'loading'
                ? 'Loading at origin'
                : 'Arrived at mandi'}
          </Tooltip>
        </Marker>
      </MapContainer>
    </div>
  );
}
