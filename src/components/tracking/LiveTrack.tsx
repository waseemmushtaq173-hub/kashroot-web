'use client';

/**
 * Live position of a consignment from its driver's phone (kr_track),
 * refreshed every 30 seconds: status, last seen, the village or town it is
 * near (OpenStreetMap), roughly how far is left to the destination, a map of
 * the trail, and a button to call the driver.
 */
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { Clock, Loader2, MapPin, MapPinned, Navigation, Phone, TriangleAlert, Truck } from 'lucide-react';

import { Badge } from '@/components/portal/kit';
import { sendQueuedEmails } from '@/lib/client/mailQueue';
import { ago } from '@/lib/db/client';
import { STATUS_LABEL, track, type Tracked } from '@/lib/db/consignments';
import { googlePoint, googleRoute, roadEstimate } from '@/lib/maps';

const RouteMap = dynamic(() => import('@/components/tracking/RouteMap'), {
  ssr: false,
  loading: () => <div className="h-[24rem] animate-pulse rounded-2xl bg-slate-100" />,
});

const TONE = { booked: 'amber', in_transit: 'blue', delivered: 'green', cancelled: 'slate' } as const;

/** The village/town at the truck's last position, and the destination's coordinates (the sender's pick, else a search by name). */
function usePlaces(lat: number | null | undefined, lng: number | null | undefined, destination: string | undefined, pickedLat: number | null, pickedLng: number | null) {
  const picked = pickedLat != null && pickedLng != null;
  const [near, setNear] = useState<string | null>(null);
  const [dest, setDest] = useState<{ name: string; admin: string; lat: number; lng: number } | null>(null);
  const key = lat != null && lng != null ? `${lat.toFixed(3)},${lng.toFixed(3)}` : '';
  useEffect(() => {
    if (!key) return;
    let live = true;
    const [la, ln] = key.split(',');
    fetch(`/api/place?lat=${la}&lng=${ln}`)
      .then((r) => r.json())
      .then((j: { name?: string | null }) => live && setNear(j.name ?? null))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [key]);
  useEffect(() => {
    if (!destination || picked) return;
    let live = true;
    fetch(`/api/weather?search=${encodeURIComponent(destination)}&deep=1`)
      .then((r) => r.json())
      .then((j: { places?: { name: string; admin: string; lat: number; lng: number }[] }) => live && setDest(j.places?.[0] ?? null))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [destination, picked]);
  return { near, dest: picked ? { name: destination ?? '', admin: '', lat: pickedLat, lng: pickedLng } : dest };
}

export function LiveTrack({ code }: { code: string }) {
  const [data, setData] = useState<Tracked | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  // When the data was last fetched — used to tell if the driver went quiet.
  const [checkedAt, setCheckedAt] = useState(0);
  const pickedDest = data?.dest_lat != null && data?.dest_lng != null ? { lat: data.dest_lat, lng: data.dest_lng } : null;
  const { near, dest } = usePlaces(data?.last_lat, data?.last_lng, data?.destination, pickedDest?.lat ?? null, pickedDest?.lng ?? null);

  useEffect(() => {
    let live = true;
    const load = async () => {
      try {
        const t = await track(code);
        if (!live) return;
        setData(t);
        setCheckedAt(Date.now());
        setError(null);
        // On the way: let the server check for a lost trip (and email the sender).
        if (t?.status === 'in_transit') sendQueuedEmails();
      } catch (err) {
        if (live) setError(err instanceof Error ? err.message : 'Could not load.');
      }
    };
    void load();
    const id = window.setInterval(() => void load(), 30000);
    return () => {
      live = false;
      window.clearInterval(id);
    };
  }, [code]);

  if (error) return <p role="alert" className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-800 ring-1 ring-rose-200">{error}</p>;
  if (data === undefined) return <p className="flex items-center gap-2 text-slate-600"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Finding the consignment…</p>;
  if (data === null) return <p className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">No consignment with the code <strong>{code.toUpperCase()}</strong>. Check the code your transporter sent.</p>;

  const points = data.trail.map((p) => ({ lat: p.lat, lng: p.lng, time: new Date(p.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }), plaza: '' }));
  if (!points.length && data.last_lat != null && data.last_lng != null && data.last_seen) points.push({ lat: data.last_lat, lng: data.last_lng, time: ago(data.last_seen), plaza: '' });
  // "lost" from the database (no position for 5 minutes on a trip); older setups: no update for 30 minutes.
  const lost = data.status === 'in_transit' && (data.lost ?? Boolean(data.last_seen && checkedAt - Date.parse(data.last_seen) > 30 * 60_000));
  const route = googleRoute({ name: data.origin, lat: data.origin_lat, lng: data.origin_lng }, { name: data.destination, lat: data.dest_lat, lng: data.dest_lng });
  const phone = (data.driver_phone ?? '').replace(/\D/g, '').slice(-10);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl bg-white/85 p-4 ring-1 ring-slate-900/5">
        <div>
          <p className="flex flex-wrap items-center gap-2 text-lg font-semibold text-slate-900">
            <Truck className="h-5 w-5 text-emerald-700" aria-hidden /> {data.origin} → {data.destination}
            <Badge tone={TONE[data.status]}>{STATUS_LABEL[data.status]}</Badge>
          </p>
          <p className="mt-1 text-sm text-slate-600">
            {data.code}{data.cargo ? ` · ${data.cargo}` : ''}{data.vehicle_no ? ` · ${data.vehicle_no}` : ''}
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-700">
            <Clock className="h-4 w-4" aria-hidden /> {data.last_seen ? `Last position ${ago(data.last_seen)}${data.last_accuracy ? ` (±${Math.round(data.last_accuracy)} m)` : ''}` : 'The driver has not started sharing location yet.'}
          </p>
          {data.last_seen && near && data.status !== 'delivered' && (
            <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-slate-900">
              <MapPinned className="h-4 w-4 text-emerald-700" aria-hidden /> Near {near}
            </p>
          )}
          {data.last_lat != null && data.last_lng != null && dest && data.status === 'in_transit' && (() => {
            const left = roadEstimate({ lat: data.last_lat, lng: data.last_lng }, dest);
            return (
              <p className="mt-1 text-sm text-slate-700">
                About {left.km} km by road to {dest.name}{dest.admin ? ` (${dest.admin.split(',').slice(-2).join(',').trim()})` : ''} — roughly {left.hours} h of driving (an estimate).
              </p>
            );
          })()}
          {lost && (
            <p role="alert" className="mt-2 flex items-start gap-1.5 rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-900 ring-1 ring-rose-200">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> Location lost — no position from the driver’s phone for over 5 minutes. GPS may be off or the page closed; the sender has been told.
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            <a href={route} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-white px-3 text-sm font-semibold text-emerald-800 no-underline ring-1 ring-emerald-200 hover:bg-emerald-50 hover:no-underline">
              <Navigation className="h-4 w-4" aria-hidden /> Route in Google Maps
            </a>
            {data.last_lat != null && data.last_lng != null && (
              <a href={googlePoint(data.last_lat, data.last_lng)} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-white px-3 text-sm font-semibold text-emerald-800 no-underline ring-1 ring-emerald-200 hover:bg-emerald-50 hover:no-underline">
                <MapPin className="h-4 w-4" aria-hidden /> Truck in Google Maps
              </a>
            )}
          </div>
        </div>
        {/^[6-9]\d{9}$/.test(phone) && (
          <a href={`tel:+91${phone}`} className="inline-flex items-center gap-2 rounded-xl bg-chinar px-4 py-2.5 text-sm font-semibold text-white no-underline hover:bg-chinar-hover hover:no-underline">
            <Phone className="h-4 w-4" aria-hidden /> Call {data.driver_name ?? 'driver'}
          </a>
        )}
      </div>
      {points.length > 0 ? (
        <>
          <RouteMap crossings={points.map((p) => ({ ...p, plaza: p.time }))} />
          <p className="text-xs text-slate-500">Positions from the driver’s phone GPS, updated about every minute while the driver’s KashRoot page is open. Map © OpenStreetMap contributors.</p>
        </>
      ) : (
        <div className="grid place-items-center rounded-2xl bg-white/70 p-10 text-center text-sm text-slate-600 ring-1 ring-slate-900/5">
          <MapPinned className="mb-2 h-8 w-8 text-emerald-700" aria-hidden />
          The map appears as soon as the driver taps “Start sharing location”.
        </div>
      )}
    </div>
  );
}
