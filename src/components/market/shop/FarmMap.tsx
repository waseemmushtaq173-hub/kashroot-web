'use client';

/**
 * FarmMap — a small Leaflet map centred on one point: the exact orchard spot
 * where a listing's live camera photo/video was captured by GPS. The farmer
 * and the buyer see the very same map. Load with next/dynamic and ssr:false
 * (Leaflet needs window).
 */
import { useEffect } from 'react';
import L from 'leaflet';
import { CircleMarker, MapContainer, TileLayer, Tooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

/** Snap the view to the point once the container has its real size. */
function Focus({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    const id = window.setTimeout(() => {
      map.invalidateSize();
      map.setView([lat, lng], 15);
    }, 0);
    return () => window.clearTimeout(id);
  }, [map, lat, lng]);
  return null;
}

export default function FarmMap({ lat, lng, label }: { lat: number; lng: number; label: string }) {
  const where = [lat, lng] as L.LatLngTuple;
  return (
    <MapContainer center={where} zoom={15} scrollWheelZoom={false} className="h-56 w-full rounded-xl ring-1 ring-slate-900/10">
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' />
      <CircleMarker center={where} radius={9} pathOptions={{ color: '#15803d', fillColor: '#22c55e', fillOpacity: 1, weight: 3 }}>
        <Tooltip permanent direction="top" offset={[0, -12]}>{label}</Tooltip>
      </CircleMarker>
      <Focus lat={lat} lng={lng} />
    </MapContainer>
  );
}
