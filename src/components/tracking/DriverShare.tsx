'use client';

/**
 * The driver's page (/drive/<token>). The driver reads what sharing means and
 * taps "Start trip" (their agreement is recorded); from then on the phone's GPS
 * position is sent about once a minute while the page is open (the screen is
 * kept awake). There is NO stop button: the trip ends only when the receiver's
 * 6-digit delivery code is typed (or the sender ends it). A website cannot
 * force a phone to share its location — GPS can always be turned off — so
 * when that happens the page says so, the sender's page shows "Location lost"
 * and the sender gets an email (20261120000000_trip_lock.sql).
 * Instructions in English, Hindi and Urdu.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, KeyRound, Loader2, MapPin, Navigation, PackageCheck, ShieldCheck, TriangleAlert } from 'lucide-react';

import { driverDelivered, driverPing, driverSignal, driverStart, driverView, STATUS_LABEL, type ConsignmentStatus, type DriverView } from '@/lib/db/consignments';
import { googleNavigate } from '@/lib/maps';

type WakeLock = { release: () => Promise<void> };
type Problem = { text: string; blocked?: boolean } | null;

export function DriverShare({ token }: { token: string }) {
  const [view, setView] = useState<DriverView | null | undefined>(undefined);
  const [sharing, setSharing] = useState(false);
  const [lastSent, setLastSent] = useState<number | null>(null);
  const [status, setStatus] = useState<ConsignmentStatus | null>(null);
  const [problem, setProblem] = useState<Problem>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [starting, setStarting] = useState(false);
  const [code, setCode] = useState('');
  const [codeNote, setCodeNote] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [ending, setEnding] = useState(false);
  const watch = useRef<number | null>(null);
  const lastPing = useRef(0);
  // When the first GPS reading came in, to stop waiting for a precise fix forever.
  const firstFix = useRef(0);
  // The newest position not yet sent (no network): sent when the phone is back online.
  const pending = useRef<{ lat: number; lng: number; acc: number } | null>(null);
  const wake = useRef<WakeLock | null>(null);
  // A GPS error is reported only if it lasts a few seconds (see share()).
  const gpsOff = useRef<number | null>(null);
  const quiet = useCallback(() => {
    if (gpsOff.current != null) window.clearTimeout(gpsOff.current);
    gpsOff.current = null;
  }, []);

  useEffect(() => {
    driverView(token)
      .then((v) => {
        setView(v);
        setStatus(v?.status ?? null);
        setLocked(Boolean(v?.code_locked));
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : 'Could not open this link.'));
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

  const halt = useCallback(() => {
    quiet();
    if (watch.current != null) navigator.geolocation.clearWatch(watch.current);
    watch.current = null;
    firstFix.current = 0;
    void wake.current?.release().catch(() => undefined);
    wake.current = null;
    setSharing(false);
  }, [quiet]);

  const send = useCallback(
    async (lat: number, lng: number, acc: number) => {
      try {
        const s = await driverPing(token, lat, lng, acc);
        pending.current = null;
        setLastSent(Date.now());
        setNow(Date.now());
        setProblem(null);
        if (s === 'delivered' || s === 'cancelled') {
          setStatus(s);
          halt();
        } else setStatus('in_transit');
      } catch {
        // No network: keep the newest position and send it when the phone is back online.
        pending.current = { lat, lng, acc };
        lastPing.current = 0;
        setProblem({ text: 'No internet — your position will be sent as soon as mobile data is back. · इंटरनेट नहीं है · انٹرنیٹ نہیں ہے' });
      }
    },
    [token, halt],
  );

  const share = useCallback(() => {
    if (!navigator.geolocation) return setProblem({ text: 'This phone cannot share its location. Call the sender.' });
    if (watch.current != null) return;
    setSharing(true);
    void keepAwake();
    watch.current = navigator.geolocation.watchPosition(
      (pos) => {
        quiet();
        setAccuracy(Math.round(pos.coords.accuracy));
        if (!firstFix.current) firstFix.current = Date.now();
        // A rough fix (mobile towers, ±1 km) would put the truck in the wrong village.
        // Send only GPS-precise readings (±100 m); after 2 minutes without one, send the
        // best available (±1 km) so the buyer still sees roughly where it is.
        const waitedLong = Date.now() - Math.max(firstFix.current, lastPing.current) > 120_000;
        if (pos.coords.accuracy > 100 && !(waitedLong && pos.coords.accuracy <= 1000)) return;
        if (Date.now() - lastPing.current < 45_000) return;
        lastPing.current = Date.now();
        void send(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          driverSignal(token, 'location_blocked');
          setProblem({ blocked: true, text: 'Location is blocked for KashRoot. The sender has been told. Turn it back on: Chrome ⋮ → Settings → Site settings → Location → Allow, then tap the button below.' });
          halt();
        } else {
          // Not every error means GPS is off: a phone standing still can time out, and the
          // browser raises an error as the page closes (the sender hears "page closed" then).
          // So wait a few seconds; a new position or the page closing cancels the report.
          if (err.code === err.TIMEOUT && lastPing.current && Date.now() - lastPing.current < 120_000) return;
          if (gpsOff.current != null) return;
          gpsOff.current = window.setTimeout(() => {
            gpsOff.current = null;
            if (watch.current == null) return;
            driverSignal(token, 'gps_off');
            setProblem({ text: 'No GPS signal — turn on Location (GPS) in your phone’s quick settings, and keep this page open. · लोकेशन चालू करें · لوکیشن آن کریں' });
          }, 5000);
        }
      },
      { enableHighAccuracy: true, maximumAge: 20_000, timeout: 60_000 },
    );
  }, [keepAwake, send, halt, quiet, token]);

  // Once the trip has started (also after a reload): share again straight away if location is allowed.
  const started = Boolean(view?.started) || sharing;
  const done = status === 'delivered' || status === 'cancelled';
  useEffect(() => {
    if (!view?.started || done || watch.current != null) return;
    let live = true;
    const perms = (navigator as Navigator & { permissions?: { query: (d: { name: 'geolocation' }) => Promise<{ state: string }> } }).permissions;
    void perms?.query({ name: 'geolocation' }).then((p) => {
      if (live && p.state === 'granted') share();
    }).catch(() => undefined);
    return () => {
      live = false;
    };
  }, [view?.started, done, share]);

  // While on the trip: keep the screen awake, send the waiting position when back online,
  // tell the sender if the page is closed, and warn before leaving.
  useEffect(() => {
    if (!sharing) return;
    const visible = () => {
      if (document.visibilityState === 'visible') void keepAwake();
    };
    const online = () => {
      const p = pending.current;
      if (p) void send(p.lat, p.lng, p.acc);
    };
    const leaving = () => {
      quiet();
      driverSignal(token, 'page_closed');
    };
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('online', online);
    window.addEventListener('pagehide', leaving);
    window.addEventListener('beforeunload', warn);
    return () => {
      document.removeEventListener('visibilitychange', visible);
      window.removeEventListener('online', online);
      window.removeEventListener('pagehide', leaving);
      window.removeEventListener('beforeunload', warn);
    };
  }, [sharing, keepAwake, send, quiet, token]);

  useEffect(() => () => halt(), [halt]);

  const start = async () => {
    setStarting(true);
    try {
      const s = await driverStart(token);
      if (s === 'delivered' || s === 'cancelled') {
        setStatus(s);
        return;
      }
      setView((v) => (v ? { ...v, started: true } : v));
      setStatus('in_transit');
      share();
    } catch (err) {
      setProblem({ text: err instanceof Error ? err.message : 'Could not start the trip.' });
    } finally {
      setStarting(false);
    }
  };

  const deliver = async () => {
    const digits = code.replace(/\D/g, '');
    if (digits.length !== 6) return setCodeNote('Type the 6-digit code the receiver gives you.');
    setEnding(true);
    setCodeNote(null);
    try {
      const r = await driverDelivered(token, digits);
      if (r.ok) {
        setStatus('delivered');
        halt();
      } else if (r.locked) {
        setLocked(true);
        setCodeNote('Too many wrong codes. The sender will mark the load delivered — keep this page open until then.');
      } else setCodeNote(`That code is not right. ${r.left} ${r.left === 1 ? 'try' : 'tries'} left — ask the receiver to read it again.`);
    } catch (err) {
      setCodeNote(err instanceof Error ? err.message : 'Could not check the code.');
    } finally {
      setEnding(false);
    }
  };

  if (view === undefined && !loadError) return <main className="grid min-h-screen place-items-center"><Loader2 className="h-8 w-8 animate-spin text-emerald-700" aria-label="Loading" /></main>;
  if (!view) return <main className="grid min-h-screen place-items-center p-6 text-center text-lg text-slate-800">{loadError ?? 'This driver link is not valid. Ask the transporter for a new one.'}</main>;

  const secs = lastSent ? Math.max(0, Math.round((now - lastSent) / 1000)) : null;
  // Before the trips SQL is run (no "started" from the database), the load ends with one tap as before.
  const legacy = !('started' in view);
  const navigate = googleNavigate({ name: view.destination, lat: view.dest_lat, lng: view.dest_lng });

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-5 bg-gradient-to-b from-ivory to-white p-5 text-slate-900">
      <header>
        <p className="text-sm font-semibold uppercase tracking-wider text-chinar">KashRoot · Driver</p>
        <h1 className="mt-1 text-2xl font-bold">{view.origin} → {view.destination}</h1>
        <p className="mt-1 text-slate-700">{view.code}{view.vehicle_no ? ` · ${view.vehicle_no}` : ''}{view.cargo ? ` · ${view.cargo}` : ''}</p>
        <p className="mt-2 inline-block rounded-full bg-white px-3 py-1 text-sm font-semibold ring-1 ring-slate-200">{STATUS_LABEL[(status ?? view.status) as ConsignmentStatus]}</p>
      </header>

      {done ? (
        <p className="flex items-center gap-2 rounded-2xl bg-emerald-50 p-5 text-lg font-semibold text-emerald-900 ring-1 ring-emerald-200">
          <CheckCircle2 className="h-6 w-6" aria-hidden /> {status === 'cancelled' ? 'The sender cancelled this trip. You can close this page.' : 'Delivered. Thank you! You can close this page.'}
        </p>
      ) : !started ? (
        <section aria-label="Start the trip" className="space-y-4">
          <div className="rounded-2xl bg-white p-4 text-[15px] leading-relaxed ring-1 ring-slate-200">
            <p className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-5 w-5 text-emerald-700" aria-hidden /> Before you start</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-700">
              <li>Your live location is shared with the sender and the receiver for this load only, from now until delivery.</li>
              <li>You cannot stop sharing in KashRoot. The trip ends when the receiver gives you their 6-digit delivery code.</li>
              <li>If GPS is turned off or this page is closed, the sender is told at once.</li>
            </ul>
            <p className="mt-2 text-slate-700">यह ट्रिप डिलीवरी तक आपकी लोकेशन भेजती है। · یہ ٹرپ ڈیلیوری تک آپ کی لوکیشن بھیجتا ہے۔</p>
          </div>
          <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
            <input type="checkbox" className="mt-1 h-5 w-5 accent-emerald-700" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
            <span>I agree to share my live location for this trip until delivery. · मैं सहमत हूँ · میں متفق ہوں</span>
          </label>
          <button type="button" disabled={!agreed || starting} onClick={() => void start()} className="inline-flex w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-3xl bg-chinar px-6 py-7 text-2xl font-bold text-white shadow-xl hover:bg-chinar-hover disabled:cursor-not-allowed disabled:opacity-50">
            {starting ? <Loader2 className="h-10 w-10 animate-spin" aria-hidden /> : <MapPin className="h-10 w-10" aria-hidden />}
            Start trip
            <span className="text-base font-normal text-emerald-50">ट्रिप शुरू करें · ٹرپ شروع کریں</span>
          </button>
        </section>
      ) : (
        <>
          {sharing ? (
            <div className="rounded-2xl bg-chinar p-6 text-center text-white shadow-lg">
              <MapPin className="mx-auto h-10 w-10 animate-pulse" aria-hidden />
              <p className="mt-2 text-xl font-bold">Sharing your location</p>
              <p className="mt-1 text-emerald-50">{secs === null ? 'Getting GPS…' : `Last sent ${secs < 60 ? `${secs} s` : `${Math.round(secs / 60)} min`} ago`}</p>
              {accuracy !== null && (
                <p className="mt-1 text-sm text-emerald-50">GPS accuracy ±{accuracy} m{accuracy > 100 ? ' — waiting for a better signal (stand in the open)' : ''}</p>
              )}
            </div>
          ) : (
            <button type="button" onClick={share} className="inline-flex cursor-pointer flex-col items-center justify-center gap-1 rounded-3xl bg-rose-700 px-6 py-7 text-xl font-bold text-white shadow-xl hover:bg-rose-800">
              <TriangleAlert className="h-9 w-9" aria-hidden />
              Location is OFF — turn it on to continue the trip
              <span className="text-base font-normal text-rose-50">लोकेशन चालू करें · لوکیشن آن کریں</span>
            </button>
          )}
          <p className="rounded-2xl bg-amber-50 p-4 text-amber-950 ring-1 ring-amber-200">
            Keep this page open until delivery. · यह पेज डिलीवरी तक खुला रखें। · یہ صفحہ ڈیلیوری تک کھلا رکھیں۔
          </p>
          <a href={navigate} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-white px-5 py-3 text-lg font-semibold text-emerald-800 no-underline ring-1 ring-emerald-300 hover:bg-emerald-50 hover:no-underline">
            <Navigation className="h-5 w-5" aria-hidden /> Navigate in Google Maps
          </a>
          <p className="-mt-3 text-center text-xs text-slate-500">On some phones sharing pauses while Google Maps is in front — come back to this page now and then. The sender is told if it stops.</p>
        </>
      )}

      {problem && (
        <p role="alert" className="flex items-start gap-2 rounded-2xl bg-rose-50 p-4 text-rose-900 ring-1 ring-rose-200">
          <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden /> {problem.text}
        </p>
      )}

      {!done && started && (
        <section aria-label="Load delivered" className="mt-auto space-y-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
          <p className="flex items-center gap-2 font-semibold"><PackageCheck className="h-5 w-5 text-emerald-700" aria-hidden /> Load delivered? · माल पहुँच गया? · مال پہنچ گیا؟</p>
          {legacy ? (
            <button type="button" disabled={ending} onClick={() => { setEnding(true); void driverDelivered(token, '').then(() => { setStatus('delivered'); halt(); }, (err: Error) => setCodeNote(err.message)).finally(() => setEnding(false)); }} className="inline-flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-chinar px-4 font-semibold text-white hover:bg-chinar-hover">
              <PackageCheck className="h-5 w-5" aria-hidden /> Load delivered
            </button>
          ) : locked ? (
            <p className="text-sm text-rose-800">Too many wrong codes. The sender will mark the load delivered — keep this page open until then.</p>
          ) : (
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void deliver(); }}>
              <label className="min-w-0 flex-1">
                <span className="sr-only">Delivery code from the receiver</span>
                <input inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={code} onChange={(e) => setCode(e.target.value.replace(/[^\d ]/g, ''))} placeholder="Receiver’s 6-digit code" className="min-h-12 w-full rounded-xl border-0 bg-slate-50 px-4 text-center font-mono text-xl tracking-[0.3em] ring-1 ring-slate-300 focus:ring-2 focus:ring-emerald-600" />
              </label>
              <button type="submit" disabled={ending} className="inline-flex min-h-12 cursor-pointer items-center gap-2 rounded-xl bg-chinar px-4 font-semibold text-white hover:bg-chinar-hover disabled:opacity-60">
                {ending ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <KeyRound className="h-5 w-5" aria-hidden />} Done
              </button>
            </form>
          )}
          {codeNote && <p role="alert" className="text-sm text-rose-800">{codeNote}</p>}
          <p className="text-xs text-slate-500">The receiver has the code. Only they can end the trip with you. · कोड रिसीवर के पास है · کوڈ وصول کنندہ کے پاس ہے</p>
        </section>
      )}
      <p className="text-center text-xs text-slate-500">Your location is shared only for this load, from the start of the trip until delivery.</p>
    </main>
  );
}
