'use client';

/**
 * Orchard pickup jobs for a driver or vehicle owner: real marketplace orders whose grower has marked the
 * boxes packed (/api/tracking/portal, lib/server/pickupJobs). The driver writes their own vehicle number,
 * name and phone and accepts a job; at the orchard gate they enter the grower's 6-digit handover code;
 * then the hub, then the trip to the buyer, with the phone's real GPS (watchPosition, high accuracy)
 * sent as it moves. Nothing is listed that is not in the database, and no position is ever made up.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

interface Job {
  id: string;
  product: string;
  quantity: number;
  unit: string;
  seller_district: string | null;
  seller_live_lat: number | null;
  seller_live_lng: number | null;
  seller_live_address: string | null;
  assigned_hub_name: string | null;
  boxes_packed_at: string | null;
  pickup_stage: string;
  seller_name?: string | null;
  seller_phone?: string | null;
  buyer_name?: string | null;
  buyer_phone?: string | null;
  delivery_address?: string | null;
  buyer_live_address?: string | null;
  delivery_lat?: number | null;
  delivery_lon?: number | null;
  pickup_vehicle_number?: string | null;
}

const API = '/api/tracking/portal';
const INPUT = 'mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm';
const STAGE_WORDS: Record<string, string> = {
  PICKUP_VEHICLE_ASSIGNED: 'Go to the orchard gate',
  PICKED_UP_FROM_ORCHARD_GATE: 'Picked up — take the boxes to the hub',
  CONSOLIDATED_AT_KASHROOT_HUB: 'At the hub — ready for the highway',
  IN_TRANSIT_TO_BUYER: 'On the way to the buyer',
};
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '');
const mapLink = (lat?: number | null, lng?: number | null) => (typeof lat === 'number' && typeof lng === 'number' ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}` : null);

export function OrchardPickupJobs() {
  const [vehicle, setVehicle] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [open, setOpen] = useState<Job[] | null>(null);
  const [mine, setMine] = useState<Job[]>([]);
  const [notSetUp, setNotSetUp] = useState(false);
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  /** The job whose trip is streaming this phone's GPS, and what the phone last reported. */
  const [streaming, setStreaming] = useState<string | null>(null);
  const [lastFix, setLastFix] = useState<{ lat: number; lng: number; accuracy: number; at: string } | null>(null);
  const watchId = useRef<number | null>(null);
  const lastSent = useRef(0);

  const phoneOk = /^[6-9]\d{9}$/.test(phone.replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, ''));

  const load = useCallback(async () => {
    try {
      const q = new URLSearchParams({ mode: 'PICKUP_JOBS' });
      if (phoneOk) q.set('driverPhone', phone);
      const res = await fetch(`${API}?${q}`, { cache: 'no-store' });
      const data = (await res.json()) as { ok?: boolean; open?: Job[]; mine?: Job[]; notSetUp?: boolean };
      if (!res.ok || !data.ok) return;
      setOpen(data.open ?? []);
      setMine(data.mine ?? []);
      setNotSetUp(Boolean(data.notSetUp));
    } catch {
      // The next refresh tries again.
    }
  }, [phone, phoneOk]);

  useEffect(() => {
    const first = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => void load(), 20_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [load]);

  const stopGps = useCallback(() => {
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
    setStreaming(null);
  }, []);
  useEffect(() => stopGps, [stopGps]);

  const post = async (key: string, payload: Record<string, unknown>, ok: string): Promise<boolean> => {
    setBusy(key);
    setMessage(null);
    try {
      const res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ driverPhone: phone, ...payload }) });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setMessage(data.error ?? 'That did not go through. Try again.');
        return false;
      }
      setMessage(ok);
      await load();
      return true;
    } catch {
      setMessage('Could not reach KashRoot. Check your internet and try again.');
      return false;
    } finally {
      setBusy(null);
    }
  };

  /** The trip to the buyer: this phone's own GPS, at most one position every 5 seconds. */
  const startGps = (orderId: string) => {
    if (!('geolocation' in navigator)) return setMessage('This phone or browser has no location service.');
    stopGps();
    setStreaming(orderId);
    lastSent.current = 0;
    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        const now = Date.now();
        setLastFix({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy, at: new Date().toLocaleTimeString() });
        if (now - lastSent.current < 5000) return;
        lastSent.current = now;
        void fetch(API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'PICKUP_GPS_PING', orderId, driverPhone: phone, latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracyM: pos.coords.accuracy }),
        }).catch(() => undefined);
      },
      (err) => {
        setMessage(err.code === err.PERMISSION_DENIED ? 'Location permission was refused. Allow location for this site in the browser settings, then start again.' : `GPS: ${err.message}`);
        stopGps();
      },
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 },
    );
  };

  const details = vehicle.trim().length >= 4 && name.trim().length >= 2 && phoneOk;

  return (
    <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" data-testid="orchard-pickup-jobs">
      <div>
        <h2 className="text-base font-extrabold text-slate-900">Orchard Pickup Jobs (KashRoot Hub)</h2>
        <p className="mt-1 text-xs text-slate-600">
          Real orders whose grower has marked the boxes packed and ready at the orchard gate. Accept a job with your own vehicle, collect the boxes, take them to the
          assigned KashRoot Hub, then drive them to the buyer with this phone’s GPS on.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="block text-xs font-semibold text-slate-700">
          Vehicle registration number
          <input className={`${INPUT} font-mono uppercase`} value={vehicle} onChange={(e) => setVehicle(e.target.value.toUpperCase())} placeholder="As on the number plate" autoComplete="off" />
        </label>
        <label className="block text-xs font-semibold text-slate-700">
          Driver name
          <input className={INPUT} value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" autoComplete="name" />
        </label>
        <label className="block text-xs font-semibold text-slate-700">
          Driver mobile (10 digits)
          <input className={INPUT} type="tel" inputMode="numeric" value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^\d+ ]/g, '').slice(0, 14))} placeholder="Your mobile number" autoComplete="tel" />
        </label>
      </div>

      {message && <p role="status" className="rounded-xl bg-[#EAF3EE] px-4 py-2.5 text-sm font-semibold text-[#174C3C] ring-1 ring-[#C6DBD0]">{message}</p>}
      {notSetUp && <p className="rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-950 ring-1 ring-amber-300">The hub pickup update has not been run on the database yet (supabase/RUN_THIS_ONCE.sql), so no pickup jobs can be listed.</p>}

      {mine.length > 0 && (
        <section aria-label="My pickup jobs" className="space-y-3">
          <h3 className="text-sm font-bold text-slate-900">My jobs</h3>
          {mine.map((j) => {
            const gate = mapLink(j.seller_live_lat, j.seller_live_lng);
            const dest = mapLink(j.delivery_lat, j.delivery_lon);
            return (
              <div key={j.id} className="space-y-2 rounded-xl border border-[#C6DBD0] bg-[#F3F8F5] p-3 text-sm text-slate-800" data-kr-plain>
                <p className="font-bold text-[#174C3C]">{j.quantity} {j.unit} · {j.product} · {STAGE_WORDS[j.pickup_stage] ?? j.pickup_stage}</p>
                <p className="text-xs text-slate-600">
                  Grower: {j.seller_name ?? '—'}{j.seller_phone ? <> · <a className="font-semibold underline" href={`tel:${j.seller_phone}`}>📞 {j.seller_phone}</a></> : ''} · {j.seller_live_address ?? j.seller_district ?? 'orchard GPS not recorded on this order'}
                  {gate && <> · <a className="font-semibold underline" href={gate} target="_blank" rel="noopener noreferrer">Route to the orchard gate ↗</a></>}
                </p>
                <p className="text-xs text-slate-600">Hub: {j.assigned_hub_name ?? 'not recorded on this order'} · Vehicle {j.pickup_vehicle_number}</p>

                {j.pickup_stage === 'PICKUP_VEHICLE_ASSIGNED' && (
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="block text-xs font-semibold text-slate-700">
                      Grower’s 6-digit handover code
                      <input className={`${INPUT} w-36 font-mono tracking-widest`} inputMode="numeric" maxLength={6} value={codes[j.id] ?? ''} onChange={(e) => setCodes((c) => ({ ...c, [j.id]: e.target.value.replace(/\D/g, '').slice(0, 6) }))} placeholder="6 digits" />
                    </label>
                    <button type="button" disabled={busy !== null || (codes[j.id] ?? '').length !== 6} onClick={() => void post(`v-${j.id}`, { action: 'VERIFY_HANDOVER', orderId: j.id, code: codes[j.id] }, 'Pickup confirmed at the orchard gate. Take the boxes to the hub.')} className="kr-btn-primary kr-btn-sm min-h-11">
                      Confirm Pickup at Orchard Gate
                    </button>
                  </div>
                )}
                {j.pickup_stage === 'PICKED_UP_FROM_ORCHARD_GATE' && (
                  <button type="button" disabled={busy !== null} onClick={() => void post(`h-${j.id}`, { action: 'MARK_AT_HUB', orderId: j.id }, 'Arrival at the KashRoot Hub recorded.')} className="kr-btn-primary kr-btn-sm min-h-11">
                    Mark Arrived at KashRoot Hub
                  </button>
                )}
                {j.pickup_stage === 'CONSOLIDATED_AT_KASHROOT_HUB' && (
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void post(`t-${j.id}`, { action: 'MARK_IN_TRANSIT', orderId: j.id }, 'Trip to the buyer started. Keep this page open so your GPS is shared.').then((ok) => ok && startGps(j.id))}
                    className="kr-btn-primary kr-btn-sm min-h-11"
                  >
                    Start Trip to Buyer &amp; Share Live GPS
                  </button>
                )}
                {j.pickup_stage === 'IN_TRANSIT_TO_BUYER' && (
                  <div className="space-y-1.5">
                    <p className="text-xs text-slate-700">
                      Deliver to: <strong>{j.buyer_name}</strong>{j.buyer_phone ? <> · <a className="font-semibold underline" href={`tel:${j.buyer_phone}`}>📞 {j.buyer_phone}</a></> : ''} · {j.buyer_live_address ?? j.delivery_address}
                      {dest && <> · <a className="font-semibold underline" href={dest} target="_blank" rel="noopener noreferrer">Route to the buyer ↗</a></>}
                    </p>
                    {streaming === j.id ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-bold text-emerald-800">
                          ● Sharing this phone’s GPS{lastFix ? `: ${lastFix.lat.toFixed(5)}, ${lastFix.lng.toFixed(5)} (±${Math.round(lastFix.accuracy)} m) at ${lastFix.at}` : ' — waiting for the first position'}
                        </span>
                        <button type="button" onClick={stopGps} className="kr-btn-secondary kr-btn-sm min-h-11">Stop sharing GPS</button>
                      </div>
                    ) : (
                      <button type="button" onClick={() => startGps(j.id)} className="kr-btn-primary kr-btn-sm min-h-11">Share Live GPS</button>
                    )}
                    <p className="text-xs text-slate-500">The buyer confirms the delivery on their side; the escrow then releases to the grower.</p>
                  </div>
                )}
              </div>
            );
          })}
        </section>
      )}

      <section aria-label="Jobs waiting for a vehicle" className="space-y-3">
        <h3 className="text-sm font-bold text-slate-900">Waiting for a pickup vehicle</h3>
        {open === null ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : open.length === 0 ? (
          <p data-testid="no-pickup-jobs" className="rounded-xl bg-[#EAF3EE] px-4 py-3 text-sm text-[#174C3C] ring-1 ring-[#C6DBD0]">
            No orchard pickup is waiting right now. A job appears here when a grower marks an order’s boxes packed and ready in the Farmer portal.
          </p>
        ) : (
          open.map((j) => (
            <div key={j.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-3 text-sm" data-kr-plain>
              <div className="min-w-0">
                <p className="font-bold text-slate-900">{j.quantity} {j.unit} · {j.product}</p>
                <p className="text-xs text-slate-600">
                  Orchard: {j.seller_live_address ?? j.seller_district ?? 'GPS not recorded on this order'} · Hub: {j.assigned_hub_name ?? 'not recorded'} · packed {when(j.boxes_packed_at)}
                </p>
              </div>
              <button
                type="button"
                disabled={!details || busy !== null}
                title={details ? undefined : 'Write your vehicle number, name and mobile above first'}
                onClick={() => void post(`c-${j.id}`, { action: 'CLAIM_PICKUP', orderId: j.id, vehicleNumber: vehicle, driverName: name }, 'Job accepted. The grower and the buyer now see your vehicle and number.')}
                className="kr-btn-primary kr-btn-sm min-h-11"
              >
                Accept Orchard Pickup Job
              </button>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
