'use client';

/**
 * Map for a Kissan Tools order: the delivery point (a pin) and, once the
 * order is on the way, the vehicle with a dashed line between them. With
 * `onPick`, tapping the map moves the delivery pin (choosing where to
 * deliver). Load with next/dynamic and ssr:false (Leaflet needs window).
 */
import { useEffect, useMemo } from 'react';
import L from 'leaflet';
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

import type { Point } from '@/lib/db/shop';

const TRUCK = L.divIcon({
  className: 'kr-truck-marker',
  html: '<span class="kr-truck-marker__pulse" aria-hidden="true"></span><span class="kr-truck-marker__body"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h11v10H3z"/><path d="M14 9h4l3 3v4h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/></svg></span>',
  iconSize: [34, 34],
  iconAnchor: [17, 17],
});

// A pin drawn in the page (Leaflet's own pin images do not survive bundling).
const PIN = L.divIcon({
  className: 'kr-shop-pin',
  html: '<svg viewBox="0 0 24 32" width="30" height="40" aria-hidden="true"><path d="M12 31s10-11.2 10-18.5A10 10 0 0 0 2 12.5C2 19.8 12 31 12 31z" fill="#c2410c" stroke="#fff" stroke-width="2"/><circle cx="12" cy="12.5" r="4" fill="#fff"/></svg>',
  iconSize: [30, 40],
  iconAnchor: [15, 39],
});

// Kashmir valley, when nothing is chosen yet.
const VALLEY: L.LatLngTuple = [34.08, 74.8];

const FIT: L.FitBoundsOptions = { padding: [40, 40], maxZoom: 15, animate: false };

/** Keeps every point in view: when the points change, and when the map's box changes size (a tab or card opening, the phone turning). */
function Fit({ points, zoom }: { points: L.LatLngTuple[]; zoom: number }) {
  const map = useMap();
  const key = points.map((p) => p.join(',')).join(';');
  useEffect(() => {
    const fit = () => {
      map.invalidateSize({ animate: false });
      if (points.length === 1) map.setView(points[0], Math.max(map.getZoom(), zoom), { animate: false });
      else if (points.length > 1) map.fitBounds(L.latLngBounds(points), FIT);
    };
    const id = window.setTimeout(fit, 0);
    const box = map.getContainer();
    let size = `${box.clientWidth}x${box.clientHeight}`;
    const watch = new ResizeObserver(() => {
      const now = `${box.clientWidth}x${box.clientHeight}`;
      if (now !== size && box.clientWidth > 0) {
        size = now;
        fit();
      }
    });
    watch.observe(box);
    return () => {
      window.clearTimeout(id);
      watch.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refit only when the points change
  }, [map, key, zoom]);
  return null;
}

function Picker({ onPick }: { onPick: (p: Point) => void }) {
  useMapEvents({ click: (e) => onPick({ lat: Math.round(e.latlng.lat * 1e5) / 1e5, lng: Math.round(e.latlng.lng * 1e5) / 1e5 }) });
  return null;
}

export default function ShopMap({
  target,
  vehicle,
  onPick,
  targetLabel = 'Deliver here',
  vehicleLabel = 'Vehicle',
  className = 'h-72',
}: {
  target?: Point | null;
  vehicle?: Point | null;
  onPick?: (p: Point) => void;
  targetLabel?: string;
  vehicleLabel?: string;
  className?: string;
}) {
  const points = useMemo(() => [vehicle, target].filter((p): p is Point => Boolean(p)).map((p) => [p.lat, p.lng] as L.LatLngTuple), [vehicle, target]);
  return (
    <MapContainer
      // Both points in view from the first paint; one point (or none) is centred.
      {...(points.length > 1 ? { bounds: L.latLngBounds(points), boundsOptions: FIT } : { center: points[0] ?? VALLEY, zoom: points.length ? 13 : 8 })}
      scrollWheelZoom={false}
      className={`${className} w-full rounded-2xl ring-1 ring-slate-900/10`}
    >
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' />
      {vehicle && target && <Polyline positions={[[vehicle.lat, vehicle.lng], [target.lat, target.lng]]} pathOptions={{ color: '#c2410c', weight: 4, dashArray: '6 8' }} />}
      {target && (
        <Marker position={[target.lat, target.lng]} icon={PIN} alt={targetLabel}>
          <Tooltip direction="top" offset={[0, -36]}>{targetLabel}</Tooltip>
        </Marker>
      )}
      {vehicle && (
        <Marker position={[vehicle.lat, vehicle.lng]} icon={TRUCK} alt={vehicleLabel}>
          <Tooltip permanent direction="top" offset={[0, -16]}>{vehicleLabel}</Tooltip>
        </Marker>
      )}
      {onPick && <Picker onPick={onPick} />}
      <Fit points={points} zoom={13} />
    </MapContainer>
  );
}
