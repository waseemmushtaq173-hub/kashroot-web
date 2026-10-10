'use client';

/**
 * The driver's page: one big button shares the phone's GPS position about
 * once a minute while the page is open (the screen is kept awake), and one
 * marks the load delivered. Instructions in English, Hindi and Urdu.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Loader2, MapPin, PackageCheck, Square } from 'lucide-react';

import { driverDelivered, driverPing, driverView, STATUS_LABEL, type ConsignmentStatus } from '@/lib/db/consignments';

type View = Awaited<ReturnType<typeof driverView>>;
type WakeLock = { release: () => Promise<void> };

export function DriverShare({ token }: { token: string }) {
  const [view, setView] = useState<View | undefined>(undefined);
  const [sharing, setSharing] = useState(false);
  const [lastSent, setLastSent] = useState<number | null>(null);
  const [status, setStatus] = useState<ConsignmentStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const watch = useRef<number | null>(null);
  const lastPing = useRef(0);
  const wake = useRef<WakeLock | null>(null);

  useEffect(() => {
    driverView(token)
      .then((v) => {
        setView(v);
        setStatus(v?.status ?? null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not open this link.'));
  }, [token]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 5000);
    return () => window.clearInterval(id);
  }, []);

  const keepAwake = useCallback(async () => {
    try {
      const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<WakeLock> } };
      wake.current = (await nav.wakeLock?.request('screen')) ?? null;
    } catch {
      /* not supported or refused */
    }
  }, []);

  const stop = useCallback(() => {
    if (watch.current != null) navigator.geolocation.clearWatch(watch.current);
    watch.current = null;
    void wake.current?.release().catch(() => undefined);
    wake.current = null;
    setSharing(false);
  }, []);

  useEffect(() => {
    const again = () => {
      if (document.visibilityState === 'visible' && watch.current != null) void keepAwake();
    };
    document.addEventListener('visibilitychange', again);
    return () => {
      document.removeEventListener('visibilitychange', again);
      stop();
    };
  }, [keepAwake, stop]);

  const start = () => {
    if (!navigator.geolocation) return setError('This phone cannot share its location.');
    setError(null);
    setSharing(true);
    void keepAwake();
    watch.current = navigator.geolocation.watchPosition(
      async (pos) => {
        if (Date.now() - lastPing.current < 45_000) return;
        lastPing.current = Date.now();
        try {
          const s = await driverPing(token, pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
          setLastSent(Date.now());
          setNow(Date.now());
          if (s === 'delivered' || s === 'cancelled') {
            setStatus(s);
            stop();
          } else setStatus('in_transit');
        } catch (err) {
          lastPing.current = 0;
          setError(err instanceof Error ? err.message : 'Could not send the location — check mobile data.');
        }
      },
      (err) => {
        setError(err.code === err.PERMISSION_DENIED ? 'Location is blocked. Allow location for this site in Chrome settings, then press Start again.' : 'Waiting for GPS… go outside or turn on location.');
        if (err.code === err.PERMISSION_DENIED) stop();
      },
      { enableHighAccuracy: true, maximumAge: 20_000, timeout: 60_000 },
    );
  };

  const delivered = async () => {
    try {
      await driverDelivered(token);
      setStatus('delivered');
      stop();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not mark delivered.');
    }
  };

  if (view === undefined && !error) return <main className="grid min-h-screen place-items-center"><Loader2 className="h-8 w-8 animate-spin text-cyan-700" aria-label="Loading" /></main>;
  if (!view) return <main className="grid min-h-screen place-items-center p-6 text-center text-lg text-slate-800">{error ?? 'This driver link is not valid. Ask the transporter for a new one.'}</main>;

  const done = status === 'delivered' || status === 'cancelled';
  const secs = lastSent ? Math.max(0, Math.round((now - lastSent) / 1000)) : null;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-5 bg-gradient-to-b from-cyan-50 to-white p-5 text-slate-900">
      <header>
        <p className="text-sm font-semibold uppercase tracking-wider text-cyan-800">KashRoot · Driver</p>
        <h1 className="mt-1 text-2xl font-bold">{view.origin} → {view.destination}</h1>
        <p className="mt-1 text-slate-700">{view.code}{view.vehicle_no ? ` · ${view.vehicle_no}` : ''}{view.cargo ? ` · ${view.cargo}` : ''}</p>
        <p className="mt-2 inline-block rounded-full bg-white px-3 py-1 text-sm font-semibold ring-1 ring-slate-200">{STATUS_LABEL[(status ?? view.status) as ConsignmentStatus]}</p>
      </header>

      {done ? (
        <p className="flex items-center gap-2 rounded-2xl bg-emerald-50 p-5 text-lg font-semibold text-emerald-900 ring-1 ring-emerald-200">
          <CheckCircle2 className="h-6 w-6" aria-hidden /> Delivered. Thank you! You can close this page.
        </p>
      ) : sharing ? (
        <>
          <div className="rounded-2xl bg-emerald-600 p-6 text-center text-white shadow-lg">
            <MapPin className="mx-auto h-10 w-10 animate-pulse" aria-hidden />
            <p className="mt-2 text-xl font-bold">Sharing your location</p>
            <p className="mt-1 text-emerald-50">{secs === null ? 'Getting GPS…' : `Last sent ${secs < 60 ? `${secs} s` : `${Math.round(secs / 60)} min`} ago`}</p>
          </div>
          <p className="rounded-2xl bg-amber-50 p-4 text-amber-950 ring-1 ring-amber-200">
            Keep this page open. · यह पेज खुला रखें। · یہ صفحہ کھلا رکھیں۔
          </p>
          <button type="button" onClick={stop} className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-2xl bg-white px-5 py-4 text-lg font-semibold text-slate-800 ring-1 ring-slate-300">
            <Square className="h-5 w-5" aria-hidden /> Pause sharing
          </button>
        </>
      ) : (
        <button type="button" onClick={start} className="inline-flex cursor-pointer flex-col items-center justify-center gap-1 rounded-3xl bg-cyan-700 px-6 py-8 text-2xl font-bold text-white shadow-xl hover:bg-cyan-800">
          <MapPin className="h-10 w-10" aria-hidden />
          Start sharing location
          <span className="text-base font-normal text-cyan-50">लोकेशन शेयर करें · لوکیشن شیئر کریں</span>
        </button>
      )}

      {error && <p role="alert" className="rounded-2xl bg-rose-50 p-4 text-rose-900 ring-1 ring-rose-200">{error}</p>}

      {!done && (
        <button type="button" onClick={() => void delivered()} className="mt-auto inline-flex cursor-pointer items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-5 py-4 text-lg font-semibold text-white">
          <PackageCheck className="h-6 w-6" aria-hidden /> Load delivered · माल पहुँच गया · مال پہنچ گیا
        </button>
      )}
      <p className="text-center text-xs text-slate-500">Your location is shared only for this load, only while this page is open.</p>
    </main>
  );
}
