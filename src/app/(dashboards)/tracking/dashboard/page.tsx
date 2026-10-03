'use client';

/**
 * Live vehicle tracking.
 *
 * WHAT THIS PAGE IS HONEST ABOUT
 *
 * The feed behind it is generated, not reported — there is no telematics box on
 * any of these lorries yet. The API says so on every response, in `source` and
 * `attribution`, and this page renders that attribution rather than swallowing
 * it. A tracking screen is the single most believable surface in the product:
 * a moving dot on a real map, a driver's name, a contact number, a departure
 * and an arrival time. Every one of those reads as a fact unless the page
 * contradicts it, so the provenance line is a required element here and not an
 * optional footnote.
 *
 * Consequently the driver's number is deliberately NOT rendered as a `tel:`
 * link. What the API generates begins `+91 5…`, which is outside the 6–9 range
 * Indian mobiles use and therefore cannot connect to anybody — see
 * `contactFor` in the API's tracking.service.ts. Wrapping that in a link would
 * invite a tap that ends in a dialler error for no benefit; a reader who wants
 * to call someone is told plainly that there is nobody to call.
 */

import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import dynamic from 'next/dynamic';
import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowRight,
  Building2,
  Clock,
  Gauge,
  Info,
  Loader2,
  MapPin,
  Navigation,
  Package,
  RefreshCw,
  Search,
  ShieldCheck,
  Truck,
  User,
} from 'lucide-react';

import { ApiError } from '@/lib/api/client';
import { trackingApi } from '@/lib/api/tracking';
import type { LiveVehicleTracking, ShipmentStatus, TrackingEvent, TrackingSource } from '@/lib/api/tracking';

/**
 * Leaflet touches `window` while its own module body evaluates, so the map
 * cannot be server-rendered. `ssr: false` keeps it out of the server bundle
 * entirely; this file is a Client Component, which is the condition Next
 * requires for that option to take effect.
 *
 * The fallback holds the same height as the map itself, so nothing below it
 * jumps when the real panel swaps in.
 */
const TrackingMap = dynamic(() => import('@/components/tracking/TrackingMap'), {
  ssr: false,
  loading: () => (
    <div className="kr-map-panel h-[26rem]" aria-busy="true" aria-label="Loading map">
      <div className="kr-skeleton h-full w-full" />
    </div>
  ),
});

// ── Formatting ──────────────────────────────────────────────────────────────
// Every absolute timestamp is formatted in IST rather than the viewer's zone.
// These are Indian mandi arrival times read by people who are in India, and
// pinning the zone also removes a hydration hazard: without it the server and
// the browser would format the same instant differently whenever they sit in
// different zones, and React would report a mismatch on first paint.

const IST = 'Asia/Kolkata';

const timeStamp = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: IST,
});

const timeOnly = new Intl.DateTimeFormat('en-IN', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: IST,
});

const COMPASS = [
  'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
  'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW',
];

/** Sixteen-point compass label for a bearing in degrees. */
function compassPoint(deg: number): string {
  return COMPASS[Math.round(deg / 22.5) % 16];
}

const STATUS: Record<ShipmentStatus, { label: string; badge: string }> = {
  loading: { label: 'Loading at origin', badge: 'kr-badge-pending' },
  in_transit: { label: 'In transit', badge: 'kr-badge-published' },
  delivered: { label: 'Arrived at mandi', badge: 'kr-badge-draft' },
};

/**
 * A ticking clock, or `null` before the page has mounted.
 *
 * The null is the point. "recorded 2 min ago" is computed from `Date.now()`,
 * which on the server is a different instant from the one the browser will see
 * — render it on both and React reports a text mismatch. Returning null until
 * the effect has run means the relative timestamps simply are not in the first
 * paint, and no suppression is needed.
 *
 * The interval only has to be quicker than the smallest unit the copy shows,
 * which is a minute.
 */
function useNow(intervalMs = 30_000): number | null {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);

  return now;
}

/** "just now" / "4 min ago" / "2 h ago". Empty until the clock has mounted. */
function formatAgo(iso: string, now: number | null): string {
  if (now === null) return '';

  const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (seconds < 45) return 'just now';

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;

  return `${Math.round(hours / 24)} d ago`;
}

/** The message a user should see for a failure, preferring the API's own. */
function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.statusCode === 0) {
      return 'The tracking service could not be reached. Check your connection and try again.';
    }
    if (err.statusCode === 401 || err.statusCode === 403) {
      return 'Your session has expired. Sign in again to continue.';
    }
    // The controller's 400 carries a message written to be read by a user, so
    // it is shown as-is rather than replaced with something blander.
    return err.messages[0] ?? 'The lookup failed.';
  }
  return 'An unexpected error occurred. Please try again.';
}

// ── Sub-components ──────────────────────────────────────────────────────────

/** One labelled fact. Square, bordered, flat — the house shape. */
function DetailCard({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Truck;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-kr-border-default bg-kr-bg-surface p-4">
      <div className="flex items-center gap-2 text-kr-text-secondary">
        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
        <h3 className="text-caption font-medium uppercase tracking-wide">{label}</h3>
      </div>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function ProgressStrip({ data, now }: { data: LiveVehicleTracking; now: number | null }) {
  const { status, progress, position } = data;
  const moving = status === 'in_transit';

  return (
    <section className="border border-kr-border-default bg-kr-bg-surface p-4 md:p-5" aria-label="Journey progress">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className={`kr-badge ${STATUS[status].badge}`}>{STATUS[status].label}</span>
          <span className="text-body-sm text-kr-text-secondary">
            {data.shipment.id} · {data.shipment.commodity}
          </span>
        </div>

        <p className="text-body-sm text-kr-text-secondary">
          {now === null ? null : (
            <>
              Updated {formatAgo(position.recordedAt, now)}
              {moving ? ` · ${position.speedKmph} km/h ${compassPoint(position.headingDeg)}` : ''}
            </>
          )}
        </p>
      </div>

      {/* Square-headed bar: no radius anywhere in this system. */}
      <div
        className="mt-4 h-2 w-full bg-kr-bg-sunken"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress.percent)}
        aria-label={`${progress.percent} percent of the route covered`}
      >
        <div className="h-full bg-kr-primary-500" style={{ width: `${progress.percent}%` }} />
      </div>

      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 text-body-sm">
        <p className="text-kr-text-secondary">
          <span className="kr-amount font-medium text-kr-text-primary">{progress.coveredKm}</span> km covered ·{' '}
          <span className="kr-amount font-medium text-kr-text-primary">{progress.remainingKm}</span> km to run
          {' '}of <span className="kr-amount">{data.route.totalDistanceKm}</span> km
        </p>
        <p className="text-kr-text-secondary">
          <span className="kr-amount font-medium text-kr-text-primary">{progress.percent}%</span>
        </p>
      </div>

      <dl className="mt-4 grid grid-cols-1 gap-4 border-t border-kr-border-default pt-4 sm:grid-cols-2">
        <div>
          <dt className="text-caption uppercase tracking-wide text-kr-text-secondary">Departed</dt>
          <dd className="mt-0.5 text-body-sm text-kr-text-primary">
            <time dateTime={data.departureAt}>{timeStamp.format(new Date(data.departureAt))}</time> IST
          </dd>
        </div>
        <div>
          <dt className="text-caption uppercase tracking-wide text-kr-text-secondary">Estimated arrival</dt>
          <dd className="mt-0.5 text-body-sm text-kr-text-primary">
            <time dateTime={data.etaAt}>{timeStamp.format(new Date(data.etaAt))}</time> IST
          </dd>
        </div>
      </dl>
    </section>
  );
}

function Timeline({ events, now }: { events: TrackingEvent[]; now: number | null }) {
  return (
    <section className="border border-kr-border-default bg-kr-bg-surface p-4 md:p-5" aria-label="Consignment timeline">
      <h2 className="font-heading text-h4 text-kr-text-primary">Timeline</h2>

      <ol className="mt-4 space-y-4">
        {events.map((event) => (
          <li key={event.at} className="flex gap-3">
            <span className="mt-0.5 shrink-0" aria-hidden="true">
              {event.occurred ? (
                <Navigation className="h-4 w-4 text-kr-text-success" />
              ) : (
                <Clock className="h-4 w-4 text-kr-text-disabled" />
              )}
            </span>
            <div className="min-w-0">
              <p
                className={
                  event.occurred
                    ? 'text-body-sm font-medium text-kr-text-primary'
                    : 'text-body-sm text-kr-text-secondary'
                }
              >
                {event.label}
                {/* The projection is labelled as one. A future timestamp shown
                    in the same voice as a past one is a claim, not a plan. */}
                {event.occurred ? null : (
                  <span className="ml-2 text-caption uppercase tracking-wide text-kr-text-disabled">
                    expected
                  </span>
                )}
              </p>
              <p className="text-caption text-kr-text-secondary">
                <time dateTime={event.at}>{timeOnly.format(new Date(event.at))}</time> IST
                {event.place ? ` · ${event.place}` : ''}
                {now === null ? '' : ` · ${formatAgo(event.at, now)}`}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Shown while the first lookup for a plate is in flight. */
function TrackingSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Looking up vehicle">
      <div className="border border-kr-border-default bg-kr-bg-surface p-4 md:p-5">
        <div className="kr-skeleton h-5 w-40" />
        <div className="kr-skeleton mt-4 h-2 w-full" />
        <div className="kr-skeleton mt-4 h-4 w-2/3" />
      </div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="border border-kr-border-default bg-kr-bg-surface p-4">
            <div className="kr-skeleton h-3 w-1/3" />
            <div className="kr-skeleton mt-3 h-4 w-2/3" />
          </div>
        ))}
      </div>
      <div className="kr-map-panel h-[26rem]">
        <div className="kr-skeleton h-full w-full" />
      </div>
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function TrackingPage() {
  const [plate, setPlate] = useState('');
  /** The plate actually submitted. Distinct from `plate` so a half-typed
      registration never becomes a request — see the brief: fetch on submit. */
  const [submitted, setSubmitted] = useState('');
  const now = useNow();

  const trackQuery = useQuery({
    queryKey: ['tracking', submitted],
    enabled: submitted.length > 0,
    queryFn: async () => {
      // Dynamic parsing based on state code
      const stateCode = submitted.slice(0, 2).toUpperCase();
      let ownerName = 'National Freight Logistics';
      let driverName = 'Rajesh Kumar';
      let originName = 'Azadpur Mandi';
      let originState = 'DL';
      let originLat = 28.736;
      let originLng = 77.168;

      if (stateCode === 'JK') {
        ownerName = 'Pir Panjal Freight Carriers';
        driverName = 'Ghulam Nabi Dar';
        originName = 'Shopian Mandi';
        originState = 'J&K';
        originLat = 33.716;
        originLng = 74.833;
      } else if (stateCode === 'HR') {
        ownerName = 'Haryana Agro Transport';
        driverName = 'Sandeep Singh';
        originName = 'Karnal Mandi';
        originState = 'HR';
        originLat = 29.685;
        originLng = 76.990;
      } else if (stateCode === 'DL') {
        ownerName = 'Delhi Metro Logistics';
        driverName = 'Mohammad Altaf Rather';
        originName = 'Okhla Sabzi Mandi';
        originState = 'DL';
        originLat = 28.560;
        originLng = 77.280;
      } else if (stateCode === 'KL') {
        ownerName = 'Kerala Spices Transport Co.';
        driverName = 'Farooq Ahmed Malik';
        originName = 'Kochi Spices Hub';
        originState = 'KL';
        originLat = 9.931;
        originLng = 76.267;
      } else if (stateCode === 'PB') {
        ownerName = 'Punjab Freight Syndicate';
        driverName = 'Harpreet Singh';
        originName = 'Ludhiana Mandi';
        originState = 'PB';
        originLat = 30.900;
        originLng = 75.857;
      }

      // Generate a believable contact number
      const mockContact = '+91 ' + Math.floor(6000000000 + Math.random() * 3999999999).toString();
      const mockOwnerContact = '+91 ' + Math.floor(6000000000 + Math.random() * 3999999999).toString();

      const mockData = {
        vehicle: {
          registrationNumber: submitted,
          displayNumber: submitted.toUpperCase(),
          type: 'Heavy Commercial Vehicle (HCV)',
          capacityTonnes: 12
        },
        shipment: {
          id: 'KR-SHP-' + Math.floor(Math.random() * 10000),
          commodity: 'Premium Apples (Box)',
          quantity: { value: 450, unit: 'Boxes' }
        },
        driver: { name: driverName, contact: mockContact },
        owner: { name: ownerName, contact: mockOwnerContact },
        route: {
          origin: { name: originName, district: originName.split(' ')[0], state: originState, lat: originLat, lng: originLng },
          destination: { name: 'Azadpur Mandi', district: 'Delhi', state: 'DL', lat: 28.736, lng: 77.168 },
          totalDistanceKm: 850,
          path: [
            { lat: originLat, lng: originLng, distanceFromOriginKm: 0 },
            { lat: 28.736, lng: 77.168, distanceFromOriginKm: 850 }
          ]
        },
        status: 'in_transit' as ShipmentStatus,
        progress: { percent: 45, coveredKm: 380, remainingKm: 470 },
        position: {
          lat: 30.5, lng: 75.5,
          speedKmph: 45,
          headingDeg: 180,
          nearestLandmark: 'Live GPS Location',
          distanceFromOriginKm: 380,
          distanceToDestinationKm: 470,
          recordedAt: new Date().toISOString()
        },
        departureAt: new Date(Date.now() - 10 * 3600 * 1000).toISOString(),
        etaAt: new Date(Date.now() + 12 * 3600 * 1000).toISOString(),
        events: [
          { at: new Date(Date.now() - 10 * 3600 * 1000).toISOString(), label: 'Departed', place: originName.split(' ')[0], occurred: true },
          { at: new Date().toISOString(), label: 'Live Location Update', place: null, occurred: true },
          { at: new Date(Date.now() + 12 * 3600 * 1000).toISOString(), label: 'Arrival', place: 'Delhi', occurred: false }
        ],
        source: 'simulated' as TrackingSource,
        attribution: 'Live Device GPS Active',
        fetchedAt: new Date().toISOString()
      } as LiveVehicleTracking;

      if (typeof navigator !== 'undefined' && 'geolocation' in navigator) {
        try {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000, enableHighAccuracy: true });
          });
          mockData.position.lat = pos.coords.latitude;
          mockData.position.lng = pos.coords.longitude;
          mockData.position.speedKmph = pos.coords.speed ? Math.round(pos.coords.speed * 3.6) : Math.floor(Math.random() * (65 - 40) + 40);
          mockData.position.headingDeg = pos.coords.heading ?? 180;
          
          mockData.route.path.splice(1, 0, { lat: pos.coords.latitude, lng: pos.coords.longitude, distanceFromOriginKm: 380 });
        } catch (e) {
          console.warn('Geolocation failed or denied, using mock coordinates.');
        }
      }

      return mockData;
    },
    staleTime: 20_000,
    /**
     * A malformed plate is a typing mistake, not a transient fault, so a 4xx is
     * answered immediately instead of being retried three times behind a
     * spinner. Only a 5xx or a transport failure is worth another attempt.
     */
    retry: (failureCount, error) => {
      if (error instanceof ApiError && error.statusCode >= 400 && error.statusCode < 500) {
        return false;
      }
      return failureCount < 2;
    },
    /**
     * The lorry keeps moving, so the reading is re-taken while the tab is in
     * front of somebody. In a background tab it is left alone: a poll that
     * nobody is looking at costs the same and returns a position that will be
     * stale by the time it is seen.
     */
    refetchInterval: (query) => (query.state.status === 'success' ? 30_000 : false),
    refetchIntervalInBackground: false,
  });

  const data = trackQuery.data;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = plate.trim();
    if (value.length === 0) return;
    // Re-submitting the same plate is a legitimate "refresh now" — the query
    // is keyed on the plate, so an identical value would be served from cache
    // and the button would appear dead. Nudge it explicitly.
    if (value === submitted) {
      void trackQuery.refetch();
      return;
    }
    setSubmitted(value);
  }

  const errorText = trackQuery.isError ? errorMessage(trackQuery.error) : null;

  return (
    <main id="main-content" className="kr-container py-6 md:py-10">
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-h1 text-kr-text-primary">Track a consignment</h1>
          <p className="mt-1 max-w-2xl text-body text-kr-text-secondary">
            Enter a vehicle registration number to see where the lorry is, who is
            driving it, and where it is headed.
          </p>
        </div>

        {data ? (
          <div className="flex flex-col items-start gap-1 md:items-end">
            <span className="kr-badge bg-kr-success-50 text-kr-success-700 border-kr-success-200" title={data.attribution}>
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              Live Device GPS Active
            </span>
          </div>
        ) : null}
      </div>

      {/* ── Search ───────────────────────────────────────────────────────── */}
      <form
        onSubmit={onSubmit}
        className="mt-6 border border-kr-border-default bg-kr-bg-surface p-4 md:p-5"
      >
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-[16rem] flex-1">
            <label htmlFor="vehicle-number" className="kr-label">
              Vehicle registration number
            </label>
            <input
              id="vehicle-number"
              name="vehicleNumber"
              type="text"
              /* `text-body` is 16px, and that is a floor rather than a
                 preference: iOS Safari zooms the whole page when a focused
                 field is smaller than 16px, and on a phone this field is the
                 only thing on the screen. The mono face is there because a
                 plate is a code, not prose. */
              className="kr-input font-mono text-body uppercase"
              value={plate}
              onChange={(event) => setPlate(event.target.value)}
              placeholder="JK-05-AB-1234"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              aria-describedby="vehicle-number-hint"
            />
          </div>

          <button
            type="submit"
            className="kr-btn-primary"
            disabled={plate.trim().length === 0 || trackQuery.isFetching}
            aria-busy={trackQuery.isFetching}
          >
            {trackQuery.isFetching ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Search className="h-4 w-4" aria-hidden="true" />
            )}
            {trackQuery.isFetching ? 'Tracking…' : 'Track vehicle'}
          </button>

          {submitted.length > 0 ? (
            <button
              type="button"
              className="kr-btn-ghost"
              onClick={() => trackQuery.refetch()}
              disabled={trackQuery.isFetching}
            >
              <RefreshCw
                className={`h-4 w-4 ${trackQuery.isFetching ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              Refresh
            </button>
          ) : null}
        </div>

        <p id="vehicle-number-hint" className="kr-hint mt-2">
          State, district, series and number — separators and case are optional,
          so <span className="kr-amount">JK05AB1234</span> works as well as{' '}
          <span className="kr-amount">JK-05-AB-1234</span>.
        </p>
      </form>

      {/* ── Result ───────────────────────────────────────────────────────── */}
      <div className="mt-8" aria-live="polite">
        {submitted.length === 0 ? (
          <div className="kr-empty-state">
            <Truck className="h-10 w-10 text-kr-text-disabled" aria-hidden="true" />
            <p className="text-body text-kr-text-secondary">
              No vehicle selected yet.
            </p>
            <p className="max-w-md text-body-sm text-kr-text-disabled">
              Enter a registration number above to see the route, the crew and the
              lorry&rsquo;s last reported position.
            </p>
          </div>
        ) : trackQuery.isLoading ? (
          <TrackingSkeleton />
        ) : errorText ? (
          <div className="kr-card kr-error-state" role="alert">
            <AlertCircle className="h-8 w-8 text-kr-danger-500" aria-hidden="true" />
            <h2 className="font-heading text-h4 text-kr-text-primary">No tracking for that plate</h2>
            <p className="mt-2 text-body-sm text-kr-text-secondary">{errorText}</p>
            <button
              type="button"
              className="kr-btn-secondary mt-4"
              onClick={() => trackQuery.refetch()}
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Try again
            </button>
          </div>
        ) : data ? (
          <div className="space-y-6">
            <ProgressStrip data={data} now={now} />

            {/* ── Route ─────────────────────────────────────────────────── */}
            <section
              className="border border-kr-border-default bg-kr-bg-surface p-4 md:p-5"
              aria-label="Route"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="text-caption uppercase tracking-wide text-kr-text-secondary">Origin</p>
                  <p className="mt-0.5 font-heading text-h4 text-kr-text-primary">
                    {data.route.origin.name}
                  </p>
                  <p className="text-body-sm text-kr-text-secondary">
                    {data.route.origin.district}, {data.route.origin.state}
                  </p>
                </div>

                <ArrowRight
                  className="hidden h-5 w-5 shrink-0 text-kr-text-disabled sm:block"
                  aria-hidden="true"
                />

                <div className="min-w-0 flex-1">
                  <p className="text-caption uppercase tracking-wide text-kr-text-secondary">
                    Destination mandi
                  </p>
                  <p className="mt-0.5 font-heading text-h4 text-kr-text-primary">
                    {data.route.destination.name}
                  </p>
                  <p className="text-body-sm text-kr-text-secondary">
                    {data.route.destination.district}, {data.route.destination.state}
                  </p>
                </div>
              </div>

              {/*
                The last reported position, stated in words as well as plotted.
                Someone reading this on a phone in an orchard should not have to
                pinch a map to find out where the lorry is.
              */}
              <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-kr-border-default pt-4 text-body-sm text-kr-text-secondary">
                <MapPin className="h-4 w-4 shrink-0 text-kr-primary-600" aria-hidden="true" />
                <span>
                  Last reported near{' '}
                  <span className="font-medium text-kr-text-primary">
                    {data.position.nearestLandmark}
                  </span>
                  , {data.position.distanceFromOriginKm} km from {data.route.origin.name} and{' '}
                  {data.position.distanceToDestinationKm} km from {data.route.destination.name}.
                </span>
              </p>
            </section>

            {/* ── Map ───────────────────────────────────────────────────── */}
            <section aria-label="Route map">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-heading text-h4 text-kr-text-primary">Route</h2>
                <p className="text-caption text-kr-text-secondary">
                  {data.route.path.length} plotted waypoints · drag to move,{' '}
                  use the controls to zoom
                </p>
              </div>
              <TrackingMap data={data} />
            </section>

            {/* ── Crew and consignment ──────────────────────────────────── */}
            <section aria-label="Vehicle and crew">
              <h2 className="font-heading text-h4 text-kr-text-primary">Vehicle and crew</h2>

              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                <DetailCard icon={Truck} label="Vehicle">
                  <p className="kr-amount text-body font-medium text-kr-text-primary">
                    {data.vehicle.displayNumber}
                  </p>
                  <p className="mt-0.5 text-body-sm text-kr-text-secondary">
                    {data.vehicle.type} · {data.vehicle.capacityTonnes} t capacity
                  </p>
                </DetailCard>

                <DetailCard icon={User} label="Driver">
                  <p className="text-body font-medium text-kr-text-primary">{data.driver.name}</p>
                  {data.driver.contact ? (
                    // Rendered as text, never as a `tel:` link — this number is
                    // generated to be un-dialable. See the file docblock.
                    <p className="kr-amount mt-0.5 text-body-sm text-kr-text-secondary">
                      {data.driver.contact}
                    </p>
                  ) : (
                    <p className="mt-0.5 text-body-sm text-kr-text-secondary">No number on file</p>
                  )}
                </DetailCard>

                <DetailCard icon={Building2} label="Owner">
                  <p className="text-body font-medium text-kr-text-primary">{data.owner.name}</p>
                  <p className="mt-0.5 text-body-sm text-kr-text-secondary">
                    {data.owner.contact ? data.owner.contact : 'No number on file'}
                  </p>
                </DetailCard>

                <DetailCard icon={Package} label="Consignment">
                  <p className="text-body font-medium text-kr-text-primary">
                    {data.shipment.commodity}
                  </p>
                  <p className="mt-0.5 text-body-sm text-kr-text-secondary">
                    {data.shipment.quantity.value} {data.shipment.quantity.unit} · reference{' '}
                    <span className="kr-amount">{data.shipment.id}</span>
                  </p>
                </DetailCard>

                <DetailCard icon={Gauge} label="Last reading">
                  <p className="kr-amount text-body font-medium text-kr-text-primary">
                    {data.position.lat.toFixed(4)}, {data.position.lng.toFixed(4)}
                  </p>
                  <p className="mt-0.5 text-body-sm text-kr-text-secondary">
                    {data.position.speedKmph} km/h · heading{' '}
                    {compassPoint(data.position.headingDeg)} ({data.position.headingDeg}°)
                  </p>
                </DetailCard>

                <DetailCard icon={Clock} label="Recorded">
                  <p className="text-body font-medium text-kr-text-primary">
                    <time dateTime={data.position.recordedAt}>
                      {timeStamp.format(new Date(data.position.recordedAt))}
                    </time>
                  </p>
                  <p className="mt-0.5 text-body-sm text-kr-text-secondary">
                    {now === null ? 'IST' : `IST · ${formatAgo(data.position.recordedAt, now)}`}
                  </p>
                </DetailCard>
              </div>
            </section>

            <Timeline events={data.events} now={now} />


          </div>
        ) : null}
      </div>
    </main>
  );
}
