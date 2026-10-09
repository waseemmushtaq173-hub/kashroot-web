'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  CheckCircle2,
  CloudSun,
  FlaskConical,
  Info,
  Loader2,
  LocateFixed,
  MapPin,
  RefreshCw,
} from 'lucide-react';
import { WeatherWidget } from '@/components/ui/WeatherWidget';
import { SiteHeader, SiteFooter } from '@/components/layout/SiteHeader';
import { ToolShell } from '@/components/layout/ToolShell';

import { mandiApi } from '@/lib/api/mandi';
import type {
  LiveMandiFeed,
  MandiFeedQuery,
  MandiQuote,
  TrendPoint,
} from '@/lib/api/mandi';

/** Sentinel for the "near me" entry in the market select. */
const NEAR_ME = '__near_me__';

/** How the page is asking for prices right now. */
type Selection =
  | { kind: 'hub'; id: string }
  | { kind: 'coords'; lat: number; lng: number }
  | { kind: 'empty' };

// ── Formatting ──────────────────────────────────────────────────────────────
// Arrival dates are plain calendar dates with no time component, so everything
// here formats and compares them in UTC. Letting the browser's local zone near
// midnight would slide a date by a day and quietly misreport how fresh a board
// is.

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

const dayMonth = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});

function formatArrival(iso: string): string {
  return dayMonth.format(new Date(`${iso}T00:00:00Z`));
}

/** Whole days between an arrival date and today, both in UTC. */
function ageInDays(iso: string): number {
  const then = Date.parse(`${iso}T00:00:00Z`);
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((today - then) / 86_400_000);
}

function formatAge(iso: string | null): string {
  if (!iso) return '';
  const days = ageInDays(iso);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

// ── Sub-components ──────────────────────────────────────────────────────────

/**
 * A sparkline over the aggregated daily series.
 *
 * Renders whatever the feed returned and nothing when it returned less than two
 * points, rather than drawing a flat line that would read as "no movement"
 * when the truth is "no data".
 */
function PriceTrend({ points, caption, multiplier }: { points: TrendPoint[]; caption: string; multiplier: number }) {
  if (points.length < 2) return null;

  const values = points.map((point) => point.modalPrice * multiplier);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;

  const WIDTH = 100;
  const HEIGHT = 28;

  // preserveAspectRatio="none" lets this stretch to any container width; the
  // non-scaling stroke below keeps the line itself from stretching with it.
  const path = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * WIDTH;
      const y = HEIGHT - ((value - min) / span) * HEIGHT;
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');

  const first = values[0] ?? 0;
  const last = values[values.length - 1] ?? 0;
  const changePct = first === 0 ? 0 : ((last - first) / first) * 100;
  const rising = changePct >= 0;

  const from = points[0]?.arrivalDate ?? '';
  const to = points[points.length - 1]?.arrivalDate ?? '';
  const label = `${caption}: ${points.length} daily averages from ${formatArrival(from)} to ${formatArrival(to)}, ${rising ? 'up' : 'down'} ${Math.abs(changePct).toFixed(1)} percent.`;

  return (
    <section className="rounded-3xl bg-white/70 p-6 backdrop-blur-xl ring-1 ring-slate-900/5 shadow-[0_8px_30px_rgba(15,23,42,0.06)]" aria-label={caption}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-label font-medium text-slate-900">{caption}</h2>
        <p className="text-caption text-slate-600">
          {points.length} daily averages · {formatArrival(from)} – {formatArrival(to)}
        </p>
      </div>

      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={label}
        className="mt-3 h-14 w-full text-kr-primary-600"
      >
        <path
          d={path}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      <p className="mt-2 text-body-sm text-slate-600">
        <span className={rising ? 'text-emerald-700' : 'text-rose-700'}>
          {rising ? '▲' : '▼'} {Math.abs(changePct).toFixed(1)}%
        </span>{' '}
        across the period shown
      </p>
    </section>
  );
}

/** One market board's card. */
type DisplayUnit = 'quintal' | 'kg' | 'box';

/** Fruit is traded by the box, saffron and walnuts by the kilo, the rest by quintal. */
function defaultUnitFor(commodity: string): DisplayUnit {
  if (['Apple', 'Cherry', 'Pear', 'Tomato'].includes(commodity)) return 'box';
  if (['Saffron', 'Walnut'].includes(commodity)) return 'kg';
  return 'quintal';
}

function PriceCard({ quote, multiplier, displayUnit }: { quote: MandiQuote; multiplier: number; displayUnit: string }) {
  const modal = quote.modalPrice * multiplier;
  const min = quote.minPrice * multiplier;
  const max = quote.maxPrice * multiplier;
  const unitLabel = displayUnit === 'box' ? 'Box (20kg)' : displayUnit === 'kg' ? 'Kg' : 'Quintal (100kg)';

  return (
    <article className="rounded-3xl bg-white/70 p-6 backdrop-blur-xl ring-1 ring-slate-900/5 shadow-[0_8px_30px_rgba(15,23,42,0.06)] flex flex-col">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-heading text-h4 text-slate-900">
            {quote.market}
          </h3>
          <p className="mt-1 text-caption text-slate-600">
            {quote.district ? `${quote.district}, ` : ''}
            {quote.state}
          </p>
        </div>
        {quote.grade ? (
          <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-slate-100 text-slate-700 shrink-0">{quote.grade}</span>
        ) : null}
      </div>

      <p className="mt-4 text-lg font-semibold tabular-nums text-slate-900 text-slate-900">
        {inr.format(modal)}
      </p>
      <p className="text-caption text-slate-600">
        per {unitLabel} · {quote.commodity}
        {quote.variety ? ` (${quote.variety})` : ''}
      </p>

      <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-200 pt-3">
        <div>
          <dt className="text-caption text-slate-600">Low</dt>
          <dd className="font-semibold tabular-nums text-slate-900 text-slate-900">
            {inr.format(min)}
          </dd>
        </div>
        <div>
          <dt className="text-caption text-slate-600">High</dt>
          <dd className="font-semibold tabular-nums text-slate-900 text-slate-900">
            {inr.format(max)}
          </dd>
        </div>
      </dl>
    </article>
  );
}

/** Shown while the first board for a location is in flight. */
function BoardSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="rounded-3xl bg-white/70 p-6 backdrop-blur-xl ring-1 ring-slate-900/5 shadow-[0_8px_30px_rgba(15,23,42,0.06)]">
          <div className="animate-pulse rounded-lg bg-slate-200 h-4 w-2/3" />
          <div className="animate-pulse rounded-lg bg-slate-200 mt-3 h-3 w-1/3" />
          <div className="animate-pulse rounded-lg bg-slate-200 mt-5 h-8 w-1/2" />
          <div className="animate-pulse rounded-lg bg-slate-200 mt-5 h-10 w-full" />
        </div>
      ))}
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function MandiPage() {
  const [selection, setSelection] = useState<Selection | null>(null);
  const [commodity, setCommodity] = useState('Apple');
  // The unit follows the commodity, but the user can override it until they
  // pick a different commodity. Derived rather than synced in an effect, which
  // is what react-hooks/set-state-in-effect was flagging.
  const [unitOverride, setUnitOverride] = useState<{ commodity: string; unit: DisplayUnit } | null>(null);
  const displayUnit: DisplayUnit =
    unitOverride && unitOverride.commodity === commodity ? unitOverride.unit : defaultUnitFor(commodity);
  const setDisplayUnit = (unit: DisplayUnit) => setUnitOverride({ commodity, unit });
  const [geo, setGeo] = useState<{ status: 'idle' | 'locating' | 'error'; message?: string }>({
    status: 'idle',
  });
  const [selectedState, setSelectedState] = useState<string>('');
  const [detectedDistrict, setDetectedDistrict] = useState<string>('');

  const catalogueQuery = useQuery({
    queryKey: ['mandi', 'catalogue'],
    queryFn: mandiApi.locations,
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    if (selection || !catalogueQuery.data) return;
    const { locations, commodities } = catalogueQuery.data;
    const preferred = selectedState 
      ? locations.find((l) => l.state === selectedState) 
      : locations[0];
    
    if (preferred) {
      if (!selectedState) setSelectedState(preferred.state);
      setSelection({ kind: 'hub', id: preferred.id });
    }
    if (!commodities.includes(commodity) && commodities[0]) {
      setCommodity(commodities[0]);
    }
  }, [catalogueQuery.data, selection, selectedState]);


  const query = useMemo<MandiFeedQuery | null>(() => {
    if (!selection || selection.kind === 'empty') return null;
    return selection.kind === 'hub'
      ? { location: selection.id, commodity }
      : { lat: selection.lat, lng: selection.lng, commodity };
  }, [selection, commodity]);

  const feedQuery = useQuery({
    queryKey: ['mandi', 'feed', query],
    enabled: query !== null,
    queryFn: () => mandiApi.feed(query as MandiFeedQuery),
    retry: 1,
  });

  const feed: LiveMandiFeed | undefined = feedQuery.data;

  useEffect(() => {
    if (feed?.location?.resolvedBy === 'coordinates' && feed.location.state && feed.location.state !== selectedState) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedState(feed.location.state);
    }
  }, [feed, selectedState]);

  function useMyLocation() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      console.warn('Geolocation not supported by browser.');
      setGeo({
        status: 'error',
        message: 'This browser cannot share a location. Choose a market instead.',
      });
      return;
    }

    setGeo({ status: 'locating' });

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
          const data = await res.json();
          const state = data.address?.state;
          const district = data.address?.state_district || data.address?.county || data.address?.city;
          
          if (state) setSelectedState(state);
          if (district) setDetectedDistrict(district);

          const locations = catalogueQuery.data?.locations ?? [];
          const hasState = locations.some((l) => l.state === state);

          setGeo({ status: 'idle' });
          
          if (state && hasState) {
            // Try to find an exact district match, else pick the first hub in that state
            const hubForState = locations.find(l => l.state === state && (district && l.label.includes(district))) || locations.find(l => l.state === state);
            if (hubForState) {
              setSelection({ kind: 'hub', id: hubForState.id });
              return;
            }
          }

          if (state && !hasState) {
            setSelection({ kind: 'empty' });
            return;
          }
        } catch (err) {
          console.warn('Reverse geocoding failed:', err);
        }

        setGeo({ status: 'idle' });
        setSelection({
          kind: 'coords',
          lat,
          lng,
        });
      },
      (error) => {
        console.warn('Geolocation error:', error);
        setGeo({
          status: 'error',
          message:
            error.code === error.PERMISSION_DENIED
              ? 'Location access was declined. Choose a market from the list instead.'
              : 'Your location could not be determined. Choose a market from the list instead.',
        });
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 5 * 60_000 },
    );
  }

  function onStateChange(event: ChangeEvent<HTMLSelectElement>) {
    const value = event.target.value;
    setSelectedState(value);
    const firstForState = catalogueQuery.data?.locations.find((l) => l.state === value);
    if (firstForState) {
      setSelection({ kind: 'hub', id: firstForState.id });
    } else {
      setSelection({ kind: 'empty' });
    }
  }

  function onMarketChange(event: ChangeEvent<HTMLSelectElement>) {
    const value = event.target.value;
    if (value === NEAR_ME) return;
    setGeo({ status: 'idle' });
    setSelection({ kind: 'hub', id: value });
  }

  const locations = catalogueQuery.data?.locations ?? [];
  let uniqueStates = Array.from(new Set(locations.map(l => l.state)));
  if (selectedState && !uniqueStates.includes(selectedState)) {
    uniqueStates = [selectedState, ...uniqueStates];
  }
  const stateLocations = locations.filter(l => l.state === selectedState);

  const selectValue =
    selection?.kind === 'hub' ? selection.id : selection ? NEAR_ME : '';

  const baseUnit = feed?.unitOfSale || 'quintal';
  let multiplier = 1;
  if (baseUnit === 'quintal') {
    if (displayUnit === 'kg') multiplier = 0.01;
    else if (displayUnit === 'box') multiplier = 0.2; // 20kg box
  } else if (baseUnit === 'kg') {
    if (displayUnit === 'quintal') multiplier = 100;
    else if (displayUnit === 'box') multiplier = 20; // 20kg box
  }

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <ToolShell tool="mandi">
        {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-h1 text-slate-900">
            Live mandi prices
          </h1>
          <p className="mt-1 max-w-2xl text-body text-slate-600">
            Daily arrival rates from regulated market boards, resolved to the
            market you choose or the one nearest you.
          </p>
        </div>

        {feed ? (
          <div className="flex flex-col items-start gap-1 md:items-end">
            <span
              className={
                feed.source === 'agmarknet'
                  ? 'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-emerald-100 text-emerald-800'
                  : 'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold bg-slate-100 text-slate-700'
              }
              title={feed.attribution}
            >
              {feed.source === 'agmarknet' ? (
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <FlaskConical className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {feed.source === 'agmarknet' ? 'Agmarknet' : 'Modelled'}
            </span>
            <p className="text-caption text-slate-600">
              {feed.attribution}
            </p>
          </div>
        ) : null}
      </div>
      
      <div className="mt-6">
        <WeatherWidget />
      </div>

      {/* ── Controls ─────────────────────────────────────────────────────── */}
      <div className="mt-6 border border-slate-200 bg-white p-4 md:p-5">
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-[12rem] flex-1">
            <label htmlFor="mandi-state" className="mb-1 block text-sm font-medium text-slate-700">
              State
            </label>
            <select
              id="mandi-state"
              className="block w-full rounded-xl border-0 bg-white px-4 py-2.5 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
              value={selectedState}
              onChange={onStateChange}
              disabled={catalogueQuery.isLoading}
            >
              {uniqueStates.map(state => (
                <option key={state} value={state}>{state}</option>
              ))}
            </select>
          </div>
          
          <div className="min-w-[14rem] flex-1">
            <label htmlFor="mandi-market" className="mb-1 block text-sm font-medium text-slate-700">
              District / Hub
            </label>
            <select
              id="mandi-market"
              className="block w-full rounded-xl border-0 bg-white px-4 py-2.5 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
              value={selectValue}
              onChange={onMarketChange}
              disabled={catalogueQuery.isLoading}
            >
              {selection?.kind === 'coords' ? (
                <option value={NEAR_ME}>
                  Near me
                  {detectedDistrict 
                    ? ` — ${detectedDistrict}` 
                    : (feed ? ` — ${feed.location.label}` : ' — locating…')}
                </option>
              ) : null}

              {stateLocations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.label}
                </option>
              ))}
            </select>
          </div>

          <div className="min-w-[12rem] flex-1">
            <label htmlFor="mandi-commodity" className="mb-1 block text-sm font-medium text-slate-700">
              Commodity
            </label>
            <select
              id="mandi-commodity"
              className="block w-full rounded-xl border-0 bg-white px-4 py-2.5 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
              value={commodity}
              onChange={(event) => setCommodity(event.target.value)}
              disabled={catalogueQuery.isLoading}
            >
              {(catalogueQuery.data?.commodities ?? [commodity]).map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          <div className="min-w-[8rem] flex-[0.5]">
            <label htmlFor="mandi-unit" className="mb-1 block text-sm font-medium text-slate-700">
              Unit
            </label>
            <select
              id="mandi-unit"
              className="block w-full rounded-xl border-0 bg-white px-4 py-2.5 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
              value={displayUnit}
              onChange={(event) => setDisplayUnit(event.target.value as DisplayUnit)}
            >
              <option value="box">Per Box (20kg)</option>
              <option value="kg">Per Kg</option>
              <option value="quintal">Per Quintal</option>
            </select>
          </div>

          <button
            type="button"
            className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition bg-white text-amber-900 ring-1 ring-amber-200 hover:bg-amber-50"
            onClick={useMyLocation}
            disabled={geo.status === 'locating'}
            aria-busy={geo.status === 'locating'}
          >
            {geo.status === 'locating' ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <LocateFixed className="h-4 w-4" aria-hidden="true" />
            )}
            {geo.status === 'locating' ? 'Locating…' : 'Use my location'}
          </button>

          <button
            type="button"
            className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition text-slate-700 hover:bg-slate-100"
            onClick={() => feedQuery.refetch()}
            disabled={feedQuery.isFetching || !query}
            aria-busy={feedQuery.isFetching}
          >
            <RefreshCw
              className={`h-4 w-4 ${feedQuery.isFetching ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            Refresh
          </button>
        </div>

        {geo.status === 'error' && geo.message ? (
          <p className="mt-1 text-xs font-semibold text-rose-700 mt-3" role="status">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            {geo.message}
          </p>
        ) : null}
      </div>

      {/* ── Board ────────────────────────────────────────────────────────── */}
      <div className="mt-8">
        {selection?.kind === 'empty' ? (
          <div className="rounded-3xl bg-white/70 p-6 backdrop-blur-xl ring-1 ring-slate-900/5 shadow-[0_8px_30px_rgba(15,23,42,0.06)] bg-slate-50 border border-slate-200 flex flex-col items-center justify-center p-12 text-center" role="alert">
            <FlaskConical className="h-12 w-12 text-slate-400 mb-4" aria-hidden="true" />
            <h2 className="font-heading text-h4 text-slate-900">Awaiting live data for {selectedState}</h2>
            <p className="mt-2 text-body-sm text-slate-600">
              We are actively integrating pan-India market hubs (such as Agmarknet). Live Mandi prices for this region will be available soon.
            </p>
          </div>
        ) : feedQuery.isLoading || catalogueQuery.isLoading ? (
          <BoardSkeleton />
        ) : feedQuery.isError ? (
          <div className="rounded-3xl bg-white/70 p-6 backdrop-blur-xl ring-1 ring-slate-900/5 shadow-[0_8px_30px_rgba(15,23,42,0.06)] rounded-xl bg-rose-50 p-4 text-rose-800 ring-1 ring-rose-200" role="alert">
            <h2 className="font-heading text-h4 text-slate-900">
              The price board could not be loaded
            </h2>
            <p className="mt-2 text-body-sm text-slate-600">
              {feedQuery.error instanceof Error
                ? feedQuery.error.message
                : 'The request to the price service failed.'}
            </p>
            <button
              type="button"
              className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition bg-amber-400 text-amber-950 hover:bg-amber-300 mt-4"
              onClick={() => feedQuery.refetch()}
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Try again
            </button>
          </div>
        ) : feed ? (
          <>
            {/* Where the answer came from, in one line. */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-body-sm text-slate-600">
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="font-medium text-slate-900">
                  {feed.location.label}
                </span>
              </span>
              {feed.location.resolvedBy === 'coordinates' &&
              feed.location.distanceKm !== null ? (
                <span>· nearest hub, {feed.location.distanceKm} km away</span>
              ) : null}
              <span>·</span>
              <span>
                {feed.commodity} per {displayUnit === 'box' ? 'Box (20kg)' : displayUnit === 'kg' ? 'Kg' : 'Quintal'}
              </span>
              {feed.asOf ? (
                <>
                  <span>·</span>
                  <span>
                    latest arrivals {formatArrival(feed.asOf)} ({formatAge(feed.asOf)})
                  </span>
                </>
              ) : null}
            </div>

            {/*
              Present only when the board could not be served as asked — an
              upstream outage, or a state that publishes nothing for this
              commodity. It explains an empty board; it is not a label on
              filled-in numbers.
            */}
            {feed.note ? (
              <p
                role="status"
                className="mt-4 flex items-start gap-2 border border-slate-200 bg-slate-50 p-3 text-body-sm text-slate-600"
              >
                <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{feed.note}</span>
              </p>
            ) : null}

            {feed.prices.length > 0 ? (
              <>
                <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                  {feed.prices.map((quote) => (
                    <PriceCard key={`${quote.market}-${quote.arrivalDate}`} quote={quote} multiplier={multiplier} displayUnit={displayUnit} />
                  ))}
                </div>

                {feed.history.length > 1 ? (
                  <div className="mt-6">
                    <PriceTrend
                      points={feed.history}
                      caption={`${feed.commodity} in ${feed.location.state} — daily average`}
                      multiplier={multiplier}
                    />
                  </div>
                ) : null}
              </>
            ) : !feed.note ? (
              <div className="rounded-3xl bg-white/70 p-6 backdrop-blur-xl ring-1 ring-slate-900/5 shadow-[0_8px_30px_rgba(15,23,42,0.06)] mt-6" role="status">
                <div className="flex items-start gap-3">
                  <CloudSun className="mt-0.5 h-5 w-5 shrink-0 text-slate-600" aria-hidden="true" />
                  <div>
                    <h2 className="font-heading text-h4 text-slate-900">
                      No arrivals reported
                    </h2>
                    <p className="mt-1 text-body-sm text-slate-600">
                      No board in {feed.location.label} has published a{' '}
                      {feed.commodity} arrival for this period.
                    </p>
                  </div>
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
      </ToolShell>
      <SiteFooter />
    </div>
  );
}
