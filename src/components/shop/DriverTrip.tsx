'use client';

/**
 * The driver's page for a Kissan Tools delivery (/deliver/<token>; no
 * sign-in, the link is the key): what to deliver, to whom and where, and one
 * big Start button that shares the phone's location about every 30 seconds
 * while the page is open, so the buyer sees the vehicle on their map.
 * Words in English, Hindi and Urdu.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Loader2, MapPin, Navigation, Phone, Square } from 'lucide-react';

import { amountOf } from '@/components/market/shop/useLiveListings';
import { ago } from '@/lib/db/client';
import { driverPing, driverTrip, type DriverTrip as Trip } from '@/lib/db/shop';

const EVERY_MS = 30_000;
type WakeLock = { release: () => Promise<void> };

export function DriverTrip({ token }: { token: string }) {
  const [trip, setTrip] = useState<Trip | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [sentAt, setSentAt] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const watch = useRef<number | null>(null);
  const timer = useRef<number | null>(null);
  const latest = useRef<GeolocationPosition | null>(null);
  const wake = useRef<WakeLock | null>(null);

  useEffect(() => {
    let live = true;
    driverTrip(token)
      .then((t) => {
        if (!live) return;
        setTrip(t);
        setStatus(t?.status ?? null);
      })
      .catch((err) => live && setError(err instanceof Error ? err.message : 'Could not open this link.'));
    return () => {
      live = false;
    };
  }, [token]);

  const stop = useCallback(() => {
    if (watch.current != null) navigator.geolocation.clearWatch(watch.current);
    if (timer.current != null) window.clearInterval(timer.current);
    watch.current = null;
    timer.current = null;
    void wake.current?.release().catch(() => undefined);
    wake.current = null;
    setSharing(false);
  }, []);
  useEffect(() => stop, [stop]);

  const send = useCallback(async () => {
    const p = latest.current;
    if (!p) return;
    try {
      const s = await driverPing(token, p.coords.latitude, p.coords.longitude, p.coords.accuracy);
      setStatus(s);
      setError(null);
      if (s === 'shipped') setSentAt(new Date().toISOString());
      else stop();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the location. Check the internet.');
    }
  }, [token, stop]);

  const start = () => {
    setError(null);
    if (!navigator.geolocation) return setError('This phone cannot share its location.');
    setSharing(true);
    void (async () => {
      try {
        const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<WakeLock> } };
        wake.current = (await nav.wakeLock?.request('screen')) ?? null;
      } catch {
        /* the screen may sleep; sharing continues while the page is open */
      }
    })();
    let first = true;
    watch.current = navigator.geolocation.watchPosition(
      (pos) => {
        latest.current = pos;
        if (first) {
          first = false;
          void send();
        }
      },
      (err) => {
        setError(err.code === err.PERMISSION_DENIED ? 'Location is blocked. Allow location for this site in the browser settings, then press Start again.' : 'Waiting for GPS… go outside or turn on location.');
        if (err.code === err.PERMISSION_DENIED) stop();
      },
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 60_000 },
    );
    timer.current = window.setInterval(() => void send(), EVERY_MS);
  };

  if (trip === undefined && !error) return <main className="grid min-h-screen place-items-center bg-orange-50"><Loader2 className="h-8 w-8 animate-spin text-orange-700" aria-label="Loading" /></main>;
  if (!trip) return <main className="grid min-h-screen place-items-center bg-orange-50 p-6 text-center text-lg text-slate-800">{error ?? 'This driver link is not valid. Ask the seller for a new one.'}</main>;

  const phone = trip.buyer_phone.replace(/\D/g, '').slice(-10);
  const done = status === 'completed';
  const notYet = status === 'accepted' || status === 'placed';
  const stopped = !done && !notYet && status !== 'shipped';
  const maps = trip.delivery_lat != null && trip.delivery_lon != null ? `https://www.google.com/maps/dir/?api=1&destination=${trip.delivery_lat},${trip.delivery_lon}` : null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-orange-50 to-white">
      <main className="mx-auto flex min-h-screen max-w-md flex-col gap-5 p-5 text-slate-900">
        <header>
          <p className="text-sm font-semibold uppercase tracking-wider text-orange-800">KashRoot · Delivery</p>
          <h1 className="mt-1 text-2xl font-bold">Deliver to {trip.buyer_name}</h1>
          <p className="mt-1 text-slate-700">{trip.delivery_address}</p>
          {trip.ship_vehicle && <p className="mt-1 text-sm text-slate-600">Vehicle {trip.ship_vehicle}</p>}
        </header>

        <ul className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
          {trip.items.map((it, i) => (
            <li key={i} className="py-1"><strong>{amountOf(Number(it.quantity), it.unit)}</strong> · {it.product}</li>
          ))}
        </ul>

        <div className="flex flex-wrap gap-2">
          {/^[6-9]\d{9}$/.test(phone) && (
            <a href={`tel:+91${phone}`} className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-white px-4 text-base font-semibold text-slate-900 no-underline ring-1 ring-slate-300">
              <Phone className="h-5 w-5" aria-hidden /> Call the buyer
            </a>
          )}
          {maps && (
            <a href={maps} target="_blank" rel="noreferrer" className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-white px-4 text-base font-semibold text-slate-900 no-underline ring-1 ring-slate-300">
              <Navigation className="h-5 w-5" aria-hidden /> Directions
            </a>
          )}
        </div>

        {done ? (
          <p className="flex items-center gap-2 rounded-2xl bg-emerald-50 p-5 text-lg font-semibold text-emerald-900 ring-1 ring-emerald-200">
            <CheckCircle2 className="h-6 w-6" aria-hidden /> The buyer received it. Thank you! You can close this page.
          </p>
        ) : notYet ? (
          <p className="rounded-2xl bg-amber-50 p-5 text-amber-950 ring-1 ring-amber-200">The seller has not marked this order shipped yet. Open this link again when you leave with the goods.</p>
        ) : stopped ? (
          <p className="rounded-2xl bg-slate-50 p-5 text-slate-800 ring-1 ring-slate-200">This order is closed. You do not need to share your location.</p>
        ) : sharing ? (
          <>
            <div className="rounded-2xl bg-emerald-600 p-6 text-center text-white shadow-lg" role="status">
              <MapPin className="mx-auto h-10 w-10 animate-pulse" aria-hidden />
              <p className="mt-2 text-xl font-bold">Sharing your location</p>
              <p className="mt-1 text-emerald-50">{sentAt ? `Last sent ${ago(sentAt)}` : 'Getting GPS…'}</p>
            </div>
            <p className="space-y-1 rounded-2xl bg-amber-50 p-4 text-amber-950 ring-1 ring-amber-200">
              <span className="block font-semibold">Keep this page open.</span>
              <span className="block" lang="hi">यह पेज खुला रखें।</span>
              <span className="block" lang="ur" dir="rtl">یہ صفحہ کھلا رکھیں۔</span>
            </p>
            <button type="button" onClick={stop} className="inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-2xl bg-white px-5 py-4 text-lg font-semibold text-slate-800 ring-1 ring-slate-300">
              <Square className="h-5 w-5" aria-hidden /> Pause sharing
            </button>
          </>
        ) : (
          <button type="button" onClick={start} className="inline-flex cursor-pointer flex-col items-center justify-center gap-1 rounded-3xl bg-orange-700 px-6 py-8 text-2xl font-bold text-white shadow-xl hover:bg-orange-800">
            <MapPin className="h-10 w-10" aria-hidden />
            Start
            <span className="text-base font-normal text-orange-50">Share location · लोकेशन शेयर करें · لوکیشن شیئر کریں</span>
          </button>
        )}

        {error && <p role="alert" className="rounded-2xl bg-rose-50 p-4 text-rose-900 ring-1 ring-rose-200">{error}</p>}
        <p className="mt-auto text-center text-xs text-slate-500">Your location is shared only for this delivery, only while this page is open. When you hand over the goods, the buyer presses “I received it” on their phone.</p>
      </main>
    </div>
  );
}
