'use client';

/**
 * LiveGpsTrips — the "Live GPS trips" tab of the Tracking portal.
 *
 * Consent-based live shipment trips (shipment_tracking_trips): create a trip
 * with the driver's consent, share the tracking link / code, and stream live
 * GPS pings from the driver's phone on THIS device. The trip card shows
 * distance covered, distance remaining, speed, ETA and the stale-signal alert
 * (no ping for 10 minutes), with the truck, its driven route, the geofence
 * and a route-deviation alert on the native LiveLogisticsMap.
 *
 * Master-upgrade v2 fields (20261112000002): the trip keeps a route_history
 * polyline, geofence_status, route_deviation_alert, distance_travelled_km
 * and the vehicle's RTO verification (rto_verified_status + rto_metadata
 * from the authorized_fleet registry).
 *
 * The older consignment system (Track by code / My consignments) is
 * untouched — this is the additional trip tracker.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import dynamic from 'next/dynamic';
import { CheckCircle2, Copy, Loader2, MapPin, MapPinned, Navigation, Radio, Share2, ShieldCheck, TriangleAlert, Truck } from 'lucide-react';
import { toast } from '@/lib/client/toast';
import { Badge, Btn, EmptyState, Field, INPUT, Panel } from '@/components/portal/kit';
import { PORTAL_THEMES } from '@/components/portal/kit';
import { PlaceInput } from '@/components/tracking/PlaceInput';
import type { PlacePoint } from '@/lib/db/consignments';

const LiveLogisticsMap = dynamic(() => import('@/components/tracking/LiveLogisticsMap'), {
  ssr: false,
  loading: () => <div className="h-56 animate-pulse rounded-xl bg-slate-100" />,
});

const theme = PORTAL_THEMES.tracking;

interface Trip {
  id: string;
  shipment_code: string;
  order_id: string | null;
  driver_name: string;
  driver_phone: string;
  vehicle_registration_no: string;
  consent_granted: boolean;
  origin_name: string;
  origin_lat: number;
  origin_lng: number;
  destination_name: string;
  destination_lat: number;
  destination_lng: number;
  current_lat: number | null;
  current_lng: number | null;
  current_speed_kmh: string | number | null;
  current_accuracy_m: string | number | null;
  last_ping_at: string | null;
  total_distance_km: string | number | null;
  covered_distance_km: string | number | null;
  remaining_distance_km: string | number | null;
  eta_minutes: number | null;
  trip_status: string;
  created_at: string;
  updated_at: string;
  effective_status?: string;
  minutes_since_last_ping?: number | null;
  // Master-upgrade v2 columns (20261112000002_kashroot_master_upgrade.sql).
  driver_consent_granted?: boolean | null;
  driver_consent_timestamp?: string | null;
  rto_verified_status?: string | null;
  rto_metadata?: {
    vehicle_type?: string | null;
    owner_name?: string | null;
    rto_office?: string | null;
    rto_code?: string | null;
    fitness_valid_upto?: string | null;
    permit_type?: string | null;
    permit_valid_upto?: string | null;
    insurance_valid_upto?: string | null;
    fuel_type?: string | null;
    source?: string | null;
    checked_at?: string;
  } | null;
  route_deviation_alert?: boolean | null;
  geofence_status?: string | null;
  route_history?: { lat: number; lng: number; t?: string; km?: number }[] | null;
  distance_travelled_km?: string | number | null;
}

const STATUS_LABEL: Record<string, string> = {
  ASSIGNED: 'Assigned — driver has not started',
  IN_TRANSIT_LIVE: 'On the way — live GPS',
  SIGNAL_STALE: 'Signal stale — no ping recently',
  ARRIVED_GEOFENCE: 'Arrived at the destination',
  ARRIVED: 'Arrived — at the destination',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
};

const STATUS_TONE: Record<string, 'green' | 'amber' | 'red' | 'blue' | 'slate'> = {
  IN_TRANSIT_LIVE: 'green',
  ASSIGNED: 'blue',
  SIGNAL_STALE: 'red',
  ARRIVED_GEOFENCE: 'amber',
  ARRIVED: 'green',
  DELIVERED: 'slate',
  CANCELLED: 'slate',
};

/** PG numerics arrive as strings; the UI wants clean numbers everywhere. */
const N = (v: string | number | null | undefined): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const km = (v: string | number | null | undefined): string => {
  const n = N(v);
  return n === null ? '—' : n < 1 ? `${Math.round(n * 1000)} m` : `${n.toFixed(1)} km`;
};

const agoMin = (iso: string | null): string => {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return '—';
  if (ms < 60_000) return 'just now';
  const m = Math.round(ms / 60_000);
  if (m < 90) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 36 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
};

async function postTrip(body: Record<string, unknown>): Promise<{ ok: boolean; trip?: Trip; error?: string }> {
  try {
    const res = await fetch('/api/logistics/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return (await res.json()) as { ok: boolean; trip?: Trip; error?: string };
  } catch {
    return { ok: false, error: 'Could not reach the tracking service. Check your connection.' };
  }
}

/** The whole tab: trips list, create form and the selected trip's live card. */
export function LiveGpsTrips() {
  const [trips, setTrips] = useState<Trip[] | null>(null);
  const [selected, setSelected] = useState<Trip | null>(null);
  const [creating, setCreating] = useState(false);

  const reload = useCallback(async () => {
    try {
      const res = await fetch('/api/logistics/track');
      const data = (await res.json()) as { ok: boolean; trips?: Trip[] };
      if (data.ok) {
        setTrips(data.trips ?? []);
        setSelected((s) => (s ? (data.trips ?? []).find((t) => t.id === s.id) ?? s : s));
      } else setTrips([]);
    } catch {
      setTrips([]);
    }
  }, []);

  useEffect(() => {
    let live = true;
    void reload();
    const timer = window.setInterval(() => {
      if (live && !creating) void reload();
    }, 30_000);
    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, [reload, creating]);

  if (trips === null) {
    return (
      <Panel theme={theme} title="Live GPS trips" icon={Radio}>
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading trips…
        </p>
      </Panel>
    );
  }

  return (
    <div className="space-y-6">
      {selected ? (
        <TripCard trip={selected} onBack={() => setSelected(null)} onChange={() => void reload()} />
      ) : (
        <>
          <Panel
            theme={theme}
            title="Live GPS shipment trips"
            icon={Radio}
            action={
              <Btn theme={theme} size="sm" icon={creating ? MapPin : Navigation} onClick={() => setCreating((v) => !v)}>
                {creating ? 'Close form' : 'New trip'}
              </Btn>
            }
          >
            <p className="text-sm text-slate-600">
              A shipment trip shares the driver&rsquo;s live GPS from pickup to delivery — with the driver&rsquo;s consent, distance
              covered and left, speed, ETA and a stale-signal alert if the pings stop. The consignments in the other tabs keep
              working as before.
            </p>
          </Panel>

          {creating && <TripCreate onDone={(t) => { setCreating(false); if (t) setSelected(t); void reload(); }} />}

          {trips.length === 0 && !creating ? (
            <EmptyState
              theme={theme}
              icon={Navigation}
              title="No live GPS trips yet"
              text="Create a trip, grant the driver's consent, and the live position streams here — covered distance, remaining distance, speed and ETA, with an alert when the signal goes quiet."
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {trips.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelected(t)}
                  className="cursor-pointer rounded-2xl bg-white p-4 text-left shadow-sm ring-1 ring-slate-900/10 transition hover:ring-emerald-400"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-mono text-xs font-bold text-slate-500">{t.shipment_code}</p>
                    <Badge tone={STATUS_TONE[t.effective_status ?? t.trip_status] ?? 'slate'}>
                      {STATUS_LABEL[t.effective_status ?? t.trip_status] ?? t.trip_status}
                    </Badge>
                  </div>
                  <p className="mt-1.5 flex items-center gap-1 text-sm font-semibold text-slate-900">
                    <MapPinned className="h-4 w-4 text-slate-400" aria-hidden /> {t.origin_name} → {t.destination_name}
                  </p>
                  <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                    <Truck className="h-3.5 w-3.5" aria-hidden /> {t.vehicle_registration_no} · {t.driver_name}
                  </p>
                  <p className="mt-2 text-xs text-slate-500">
                    {km(t.covered_distance_km)} covered · {km(t.remaining_distance_km)} left · last ping {agoMin(t.last_ping_at)}
                  </p>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Create a trip: driver, vehicle, origin, destination — and the consent box. */
function TripCreate({ onDone }: { onDone: (trip: Trip | null) => void }) {
  const [driverName, setDriverName] = useState('');
  const [driverPhone, setDriverPhone] = useState('');
  const [vehicle, setVehicle] = useState('');
  const [origin, setOrigin] = useState<{ text: string; point: PlacePoint | null }>({ text: '', point: null });
  const [dest, setDest] = useState<{ text: string; point: PlacePoint | null }>({ text: '', point: null });
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!origin.point || !dest.point) return setError('Pick the origin and destination from the place search (or use the driver\'s live location for the origin).');
    if (!consent) return setError('The driver must agree to share live location before the trip can start.');
    setBusy(true);
    setError(null);
    const res = await postTrip({
      action: 'CREATE_TRIP',
      driverName: driverName.trim(),
      driverPhone: driverPhone.trim(),
      vehicleRegistrationNo: vehicle.trim(),
      consentGranted: true,
      originName: origin.text,
      originLat: origin.point.lat,
      originLng: origin.point.lng,
      destinationName: dest.text,
      destinationLat: dest.point.lat,
      destinationLng: dest.point.lng,
    });
    setBusy(false);
    if (res.ok && res.trip) {
      toast.success(`Trip ${res.trip.shipment_code} created — live GPS starts on the driver's first ping`);
      onDone(res.trip);
    } else setError(res.error ?? 'Could not create the trip.');
  };

  return (
    <Panel theme={theme} title="Create a live GPS trip" icon={Navigation}>
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Driver name">
          <input value={driverName} onChange={(e) => setDriverName(e.target.value)} required className={INPUT} placeholder="e.g. Mudasir Ahmad" />
        </Field>
        <Field label="Driver phone">
          <input value={driverPhone} onChange={(e) => setDriverPhone(e.target.value)} required type="tel" className={INPUT} placeholder="e.g. +91 99069 00000" />
        </Field>
        <Field label="Vehicle registration">
          <input value={vehicle} onChange={(e) => setVehicle(e.target.value)} required className={`${INPUT} uppercase`} placeholder="e.g. JK01AB1234" autoCapitalize="characters" />
        </Field>
        <div />
        <PlaceInput label="Origin (pickup)" value={origin.text} point={origin.point} onChange={(text, point) => setOrigin({ text, point })} gps placeholder="e.g. Chitragam, Shopian" />
        <PlaceInput label="Destination (delivery)" value={dest.text} point={dest.point} onChange={(text, point) => setDest({ text, point })} placeholder="e.g. Azadpur Mandi, Delhi" />
        <label className="sm:col-span-2 flex cursor-pointer items-start gap-2.5 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900 ring-1 ring-emerald-200">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4 cursor-pointer accent-emerald-700" />
          <span>
            <strong>Driver consent:</strong> the driver agrees that this phone shares its live GPS location until the load is
            delivered (or the trip is cancelled). Consent can be withdrawn by stopping the trip.
          </span>
        </label>
        {error && (
          <p role="alert" className="sm:col-span-2 flex items-start gap-2 rounded-xl bg-rose-50 p-3 text-sm text-rose-800 ring-1 ring-rose-200">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {error}
          </p>
        )}
        <div className="sm:col-span-2">
          <Btn theme={theme} type="submit" icon={busy ? Loader2 : Navigation} disabled={busy}>
            {busy ? 'Creating…' : 'Create trip with consent'}
          </Btn>
        </div>
      </form>
    </Panel>
  );
}

/** One trip: telemetry, live map, and the driver's ping loop on this device. */
function TripCard({ trip, onBack, onChange }: { trip: Trip; onBack: () => void; onChange: () => void }) {
  const [t, setT] = useState<Trip>(trip);
  const [sharing, setSharing] = useState(false);
  const [consentNow, setConsentNow] = useState(trip.consent_granted);
  const [error, setError] = useState<string | null>(null);
  const lastSent = useRef(0);
  const watchId = useRef<number | null>(null);

  useEffect(() => setT(trip), [trip]);

  const stopSharing = useCallback(() => {
    if (watchId.current !== null && navigator.geolocation) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
    setSharing(false);
  }, []);

  const sendPing = useCallback(
    async (lat: number, lng: number, accuracy: number, speed: number | null) => {
      const res = await postTrip({ action: 'DRIVER_GPS_PING', tripId: t.id, lat, lng, accuracyM: accuracy, speedKmh: speed !== null && speed >= 0 ? speed * 3.6 : undefined });
      if (res.ok && res.trip) {
        setT({ ...res.trip, effective_status: res.trip.trip_status });
        setError(null);
        onChange();
      } else {
        setError(res.error ?? 'The ping was not accepted.');
        if (res.error?.toLowerCase().includes('consent')) stopSharing();
      }
    },
    [t.id, onChange, stopSharing]
  );

  const startSharing = () => {
    if (!navigator.geolocation) return setError('This device cannot share its location.');
    setError(null);
    setSharing(true);
    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        const now = Date.now();
        if (now - lastSent.current < 15_000) return; // one ping every 15 s
        lastSent.current = now;
        void sendPing(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy ?? 25, pos.coords.speed);
      },
      () => setError('Location is not available right now — check that GPS / location services are on.'),
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 }
    );
  };

  useEffect(() => stopSharing, [stopSharing]);

  const status = t.effective_status ?? t.trip_status;
  const stale = status === 'SIGNAL_STALE' || (t.trip_status === 'IN_TRANSIT_LIVE' && Boolean(t.minutes_since_last_ping && t.minutes_since_last_ping > 10));
  const speed = N(t.current_speed_kmh);
  const etaH = N(t.eta_minutes);

  const share = async () => {
    const url = `${window.location.origin}/tracking/dashboard?code=${encodeURIComponent(t.shipment_code)}&tab=track`;
    const text = `Live shipment ${t.shipment_code}: ${t.origin_name} → ${t.destination_name} — follow it here: ${url}`;
    try {
      if (navigator.share) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(text);
        toast.success('Tracking link copied');
      }
    } catch {
      /* user cancelled */
    }
  };

  return (
    <div className="space-y-6">
      <Panel
        theme={theme}
        title={`Trip ${t.shipment_code}`}
        icon={Radio}
        action={
          <Btn theme={theme} size="sm" variant="soft" icon={Share2} onClick={share}>
            Share tracking link
          </Btn>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={STATUS_TONE[status] ?? 'slate'}>{STATUS_LABEL[status] ?? status}</Badge>
          {stale && (
            <Badge tone="red">
              <TriangleAlert className="h-3 w-3" aria-hidden /> Signal stale — last ping {agoMin(t.last_ping_at)}
            </Badge>
          )}
          {t.consent_granted && (
            <Badge tone="blue">
              <CheckCircle2 className="h-3 w-3" aria-hidden /> Driver consent given
            </Badge>
          )}
          {t.rto_verified_status === 'VERIFIED_RTO_RECORD' && (
            <Badge tone="green">
              <ShieldCheck className="h-3 w-3" aria-hidden /> RTO-verified vehicle
            </Badge>
          )}
        </div>
        <p className="mt-3 flex items-center gap-1 text-sm font-semibold text-slate-900">
          <MapPinned className="h-4 w-4 text-slate-400" aria-hidden /> {t.origin_name} → {t.destination_name}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          <Truck className="mr-1 inline h-3.5 w-3.5" aria-hidden />
          {t.vehicle_registration_no} · {t.driver_name} · <a href={`tel:${t.driver_phone}`} className="font-semibold text-emerald-700 underline underline-offset-2">{t.driver_phone}</a>
        </p>
        {t.rto_verified_status === 'VERIFIED_RTO_RECORD' && t.rto_metadata && (t.rto_metadata.owner_name || t.rto_metadata.rto_office) && (
          <p className="mt-1 text-xs text-slate-500">
            RTO record: {t.rto_metadata.owner_name ?? 'owner on file'}
            {t.rto_metadata.rto_office ? ` · ${t.rto_metadata.rto_office}` : ''}
            {t.rto_metadata.fitness_valid_upto ? ` · fitness till ${t.rto_metadata.fitness_valid_upto}` : ''}
          </p>
        )}

        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
          {[
            { k: 'Distance covered', v: km(t.distance_travelled_km ?? t.covered_distance_km) },
            { k: 'Distance remaining', v: km(t.remaining_distance_km) },
            { k: 'Speed now', v: speed !== null ? `${speed.toFixed(0)} km/h` : '—' },
            { k: 'ETA', v: etaH !== null ? (etaH >= 60 ? `${Math.round(etaH / 60)} h ${etaH % 60} min` : `${etaH} min`) : '—' },
            { k: 'Last ping', v: agoMin(t.last_ping_at) },
          ].map((x) => (
            <div key={x.k} className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-900/5">
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{x.k}</dt>
              <dd className="mt-0.5 font-semibold text-slate-900">{x.v}</dd>
            </div>
          ))}
        </dl>
      </Panel>

      <Panel theme={theme} title="Live position" icon={MapPinned}>
        <LiveLogisticsMap trip={t} className="text-slate-900" />
        <p className="mt-2 text-xs text-slate-500">
          The truck&rsquo;s live pin, its driven route (green), the dashed line to the destination and the 0.5 km geofence —
          street, satellite or hybrid basemap. Pings stream while the driver shares GPS; a red strip warns when the truck
          leaves the direct route by more than 15 km.
        </p>
      </Panel>

      <Panel theme={theme} title="Driver's phone on this device" icon={Navigation}>
        {consentNow ? (
          sharing ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <p className="flex items-center gap-2 text-sm font-semibold text-emerald-800">
                <span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-600" /></span>
                Sharing live GPS — one ping every 15 s.
              </p>
              <Btn theme={theme} size="sm" variant="soft" onClick={() => { stopSharing(); toast.info('Live sharing stopped on this device'); }}>
                Stop sharing here
              </Btn>
            </div>
          ) : (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Btn theme={theme} icon={Navigation} onClick={startSharing}>
                Start live GPS sharing
              </Btn>
              <p className="text-xs text-slate-500">Keep this page open while driving. Position pings every 15 seconds until the trip is delivered.</p>
            </div>
          )
        ) : (
          <label className="flex cursor-pointer items-start gap-2.5 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900 ring-1 ring-emerald-200">
            <input type="checkbox" checked={consentNow} onChange={(e) => setConsentNow(e.target.checked)} className="mt-0.5 h-4 w-4 cursor-pointer accent-emerald-700" />
            <span>
              <strong>Driver consent:</strong> I agree that this phone shares its live GPS location until the load is delivered.
              (Required before any ping is accepted.)
            </span>
          </label>
        )}
        {error && (
          <p role="alert" className="mt-3 flex items-start gap-2 rounded-xl bg-rose-50 p-3 text-sm text-rose-800 ring-1 ring-rose-200">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {error}
          </p>
        )}
      </Panel>

      <div>
        <Btn theme={theme} size="sm" variant="soft" icon={Copy} onClick={onBack}>
          Back to all trips
        </Btn>
      </div>
    </div>
  );
}
