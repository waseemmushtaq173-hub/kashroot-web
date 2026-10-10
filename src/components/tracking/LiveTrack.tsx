'use client';

/**
 * Live position of a consignment from its driver's phone (kr_track),
 * refreshed every 30 seconds: status, last seen, a map of the trail, and a
 * button to call the driver.
 */
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { Clock, Loader2, MapPinned, Phone, Truck } from 'lucide-react';

import { Badge } from '@/components/portal/kit';
import { ago } from '@/lib/db/client';
import { STATUS_LABEL, track, type Tracked } from '@/lib/db/consignments';

const RouteMap = dynamic(() => import('@/components/tracking/RouteMap'), {
  ssr: false,
  loading: () => <div className="h-[24rem] animate-pulse rounded-2xl bg-slate-100" />,
});

const TONE = { booked: 'amber', in_transit: 'blue', delivered: 'green', cancelled: 'slate' } as const;

export function LiveTrack({ code }: { code: string }) {
  const [data, setData] = useState<Tracked | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  // When the data was last fetched — used to tell if the driver went quiet.
  const [checkedAt, setCheckedAt] = useState(0);

  useEffect(() => {
    let live = true;
    const load = async () => {
      try {
        const t = await track(code);
        if (!live) return;
        setData(t);
        setCheckedAt(Date.now());
        setError(null);
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
  const stale = data.last_seen && checkedAt - Date.parse(data.last_seen) > 30 * 60_000 && data.status === 'in_transit';
  const phone = (data.driver_phone ?? '').replace(/\D/g, '').slice(-10);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl bg-white/85 p-4 ring-1 ring-slate-900/5">
        <div>
          <p className="flex flex-wrap items-center gap-2 text-lg font-semibold text-slate-900">
            <Truck className="h-5 w-5 text-cyan-700" aria-hidden /> {data.origin} → {data.destination}
            <Badge tone={TONE[data.status]}>{STATUS_LABEL[data.status]}</Badge>
          </p>
          <p className="mt-1 text-sm text-slate-600">
            {data.code}{data.cargo ? ` · ${data.cargo}` : ''}{data.vehicle_no ? ` · ${data.vehicle_no}` : ''}
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-700">
            <Clock className="h-4 w-4" aria-hidden /> {data.last_seen ? `Last position ${ago(data.last_seen)}${data.last_accuracy ? ` (±${Math.round(data.last_accuracy)} m)` : ''}` : 'The driver has not started sharing location yet.'}
          </p>
          {stale && <p className="mt-1 text-sm text-amber-800">No update for over 30 minutes — the driver’s phone may be off or out of network.</p>}
        </div>
        {/^[6-9]\d{9}$/.test(phone) && (
          <a href={`tel:+91${phone}`} className="inline-flex items-center gap-2 rounded-xl bg-cyan-700 px-4 py-2.5 text-sm font-semibold text-white no-underline hover:bg-cyan-800 hover:no-underline">
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
          <MapPinned className="mb-2 h-8 w-8 text-cyan-700" aria-hidden />
          The map appears as soon as the driver taps “Start sharing location”.
        </div>
      )}
    </div>
  );
}
