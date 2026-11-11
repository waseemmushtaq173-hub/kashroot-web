'use client';

/**
 * Live Mandi Rates & Weather.
 *
 * - Weather: Open-Meteo through /api/weather + IMD through /api/v1/weather.
 *   Farm advice lines are simple rules on that data.
 * - Mandi: Agmarknet daily prices through /api/mandi (data.gov.in), filtered
 *   by state / district / market / commodity, sortable, Rs per quintal or kg.
 * - Also shows rates posted by approved Mandi Helpers.
 *
 * Nothing is invented: empty feeds and service errors are shown as such.
 * Every data point carries its source and timestamp.
 */
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  CalendarClock,
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Droplets,
  FileQuestion,
  LocateFixed,
  Loader2,
  MapPin,
  RefreshCw,
  Search,
  ShieldCheck,
  Sun,
  Thermometer,
  TriangleAlert,
  Wind,
  type LucideIcon,
} from 'lucide-react';

import { PortalShell } from '@/components/layout/PortalShell';
import { Badge, Btn, EmptyState, INPUT, PORTAL_THEMES, Panel, inr } from '@/components/portal/kit';
import { PostedRates } from '@/components/mandi/PostedRates';
import { LastUpdated, SavedAt } from '@/components/pwa/SavedAt';
import { useSavedAt } from '@/components/pwa/savedCopies';
import { perKg, recentRates } from '@/lib/db/mandiRates';
import { Tilt3D } from '@/components/three/Tilt3D';
import { ReadLink } from '@/components/voice/ReadLink';
import { mandiFromLink } from '@/lib/navIntent';
import { regionSpot, useRegion } from '@/lib/region';
import { MANDI_SAMPLE_KEY, mandiName, mandiUrl, narrowMandi, parseMandi, titleCase, type MandiQuery, type MandiRecord } from '@/lib/mandi-shared';

const theme = PORTAL_THEMES.buyer;

interface Place {
  name: string;
  admin: string;
  lat: number;
  lng: number;
  note?: string;
}

interface Forecast {
  place: Place;
  current: { time: string; temperature: number; humidity: number; precipitation: number; wind: number; code: number };
  hourly: { time: string; temperature: number; precipitationProbability: number; code: number }[];
  daily: { date: string; max: number; min: number; precipitation: number; code: number }[];
  source: string;
  fetchedAt: string;
  stale?: boolean;
}

interface ImdCurrentWeather {
  temperature: number;
  humidity: number;
  windSpeed: number;
  windDirection: number;
  rainfall: number;
  pressure: number;
  condition: string;
  observedAt: string;
  source: string;
  stationCode: string;
  stationName: string;
}

interface ImdHourlyForecast {
  time: string;
  temperature: number;
  humidity: number;
  precipitationProbability: number;
  rainfall: number;
  windSpeed: number;
  condition: string;
}

interface ImdDailyForecast {
  date: string;
  maxTemperature: number;
  minTemperature: number;
  totalRainfall: number;
  avgHumidity: number;
  maxWindSpeed: number;
  condition: string;
}

interface ImdWeatherWarning {
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  message: string;
  issuedAt: string;
  validUntil: string;
  affectedDistricts: string[];
  source: string;
}

interface ImdAgrometAdvisory {
  title: string;
  description: string;
  crops: string[];
  districts: string[];
  validFrom: string;
  validUntil: string;
  sourceOrganization: string;
  sourceUrl: string;
}

interface ImdWeatherResponse {
  current: ImdCurrentWeather;
  hourly: ImdHourlyForecast[];
  daily: ImdDailyForecast[];
  warnings: ImdWeatherWarning[];
  advisories: ImdAgrometAdvisory[];
  district: string;
  source: string;
  observationTime: string;
  stationCode: string;
  stationName: string;
  /** The route's own upstream was down: this is the server's last good copy. */
  stale?: boolean;
}

interface MandiResult {
  records: MandiRecord[];
  usingSampleKey: boolean;
  fetchedAt: string;
  source: string;
  direct?: boolean;
  partial?: boolean;
  widened?: string;
  stale?: boolean;
}

const STATES = [
  'Andhra Pradesh', 'Assam', 'Bihar', 'Chandigarh', 'Chattisgarh', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu and Kashmir',
  'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Nagaland', 'NCT of Delhi', 'Odisha',
  'Pondicherry', 'Punjab', 'Rajasthan', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttrakhand', 'West Bengal',
];

const QUICK_COMMODITIES = ['Apple'];
const BOX_COMMODITIES = new Set(['Apple']);

const WMO: [number[], string, LucideIcon][] = [
  [[0], 'Clear sky', Sun],
  [[1, 2], 'Partly cloudy', CloudSun],
  [[3], 'Overcast', Cloud],
  [[45, 48], 'Fog', CloudFog],
  [[51, 53, 55, 56, 57], 'Drizzle', CloudDrizzle],
  [[61, 63, 65, 66, 67, 80, 81, 82], 'Rain', CloudRain],
  [[71, 73, 75, 77, 85, 86], 'Snow', CloudSnow],
  [[95, 96, 99], 'Thunderstorm', CloudLightning],
];
const wmo = (code: number) => WMO.find(([codes]) => codes.includes(code)) ?? WMO[2];

const dayName = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
const daysOld = (iso: string) => Math.max(0, Math.floor((Date.now() - Date.parse(`${iso}T00:00:00+05:30`)) / 864e5));

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return iso;
  }
}

function advice(f: Forecast): { tone: 'amber' | 'blue' | 'green' | 'red'; text: string }[] {
  const out: { tone: 'amber' | 'blue' | 'green' | 'red'; text: string }[] = [];
  const wetSoon = f.hourly.slice(0, 12).some((h) => h.precipitationProbability >= 60);
  if (wetSoon) out.push({ tone: 'blue', text: 'Rain likely in the next 12 hours — hold sprays and fertiliser application.' });
  if (f.current.wind >= 15) out.push({ tone: 'amber', text: `Wind ${Math.round(f.current.wind)} km/h — spray drift risk; spray in calm morning hours.` });
  const frost = f.daily.slice(0, 3).find((d) => d.min <= 2);
  if (frost) out.push({ tone: 'red', text: `Frost risk on ${dayName(frost.date)} (min ${Math.round(frost.min)} °C) — protect blossoms and nurseries.` });
  const hot = f.daily.slice(0, 3).find((d) => d.max >= 32);
  if (hot) out.push({ tone: 'amber', text: `Heat on ${dayName(hot.date)} (max ${Math.round(hot.max)} °C) — irrigate early and shade fresh produce.` });
  if (out.length === 0) out.push({ tone: 'green', text: 'Settled weather — a good window for field work and harvest.' });
  return out;
}

function imdAdvice(w: ImdWeatherResponse): { tone: 'amber' | 'blue' | 'green' | 'red'; text: string; icon: LucideIcon }[] {
  const out: { tone: 'amber' | 'blue' | 'green' | 'red'; text: string; icon: LucideIcon }[] = [];
  const wetSoon = w.hourly.slice(0, 12).some((h) => h.precipitationProbability >= 60);
  if (wetSoon) out.push({ tone: 'blue', text: 'Rain likely in the next 12 hours — hold sprays and fertiliser application.', icon: CloudRain });
  if (w.current.windSpeed >= 15) out.push({ tone: 'amber', text: `Wind ${Math.round(w.current.windSpeed)} km/h — spray drift risk; spray in calm morning hours.`, icon: Wind });
  const frost = w.daily.slice(0, 3).find((d) => d.minTemperature <= 2);
  if (frost) out.push({ tone: 'red', text: `Frost risk on ${dayName(frost.date)} (min ${Math.round(frost.minTemperature)} °C) — protect blossoms and nurseries.`, icon: CloudSnow });
  const hot = w.daily.slice(0, 3).find((d) => d.maxTemperature >= 32);
  if (hot) out.push({ tone: 'amber', text: `Heat on ${dayName(hot.date)} (max ${Math.round(hot.maxTemperature)} °C) — irrigate early and shade fresh produce.`, icon: Sun });
  if (out.length === 0) out.push({ tone: 'green', text: 'Settled weather — a good window for field work and harvest.', icon: CloudSun });
  return out;
}

type DetailedError = Error & { detail?: string };

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err: DetailedError = new Error((data as { error?: string }).error || `Request failed (${res.status})`);
    err.detail = (data as { detail?: string }).detail || `HTTP ${res.status}`;
    throw err;
  }
  return data as T;
}

async function mandiFromBrowser(query: MandiQuery): Promise<MandiResult> {
  const wide = { state: titleCase(query.state), commodity: titleCase(query.commodity) };
  const res = await fetch(mandiUrl({ ...wide, limit: 10 }, MANDI_SAMPLE_KEY), { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`data.gov.in answered ${res.status}`);
  const n = narrowMandi(parseMandi(await res.json(), wide), query.district, query.market, wide.state);
  return { records: n.records, widened: n.widened, usingSampleKey: true, fetchedAt: new Date().toISOString(), source: 'Agmarknet via data.gov.in', direct: true };
}

const noSubscribe = () => () => {};

export default function MandiWeatherPage() {
  // Weather location
  const [placeQuery, setPlaceQuery] = useState('');
  const [pickedPlace, setWhere] = useState<{ q?: string; lat?: number; lng?: number; name?: string } | null>(null);
  const [suggestions, setSuggestions] = useState<Place[]>([]);
  const [locating, setLocating] = useState(false);
  const { region } = useRegion();
  const inBrowser = useSyncExternalStore(noSubscribe, () => true, () => false);
  const where = useMemo(() => {
    if (pickedPlace) return pickedPlace;
    const s = regionSpot(region);
    return s ? (s.lat !== undefined && s.lng !== undefined ? { lat: s.lat, lng: s.lng, name: s.name } : { q: s.name }) : { q: 'Srinagar' };
  }, [pickedPlace, region]);

  // Open-Meteo weather
  const weatherQ = useQuery({
    queryKey: ['weather', where],
    queryFn: () => {
      const p = new URLSearchParams();
      if (where.lat !== undefined && where.lng !== undefined) {
        p.set('lat', String(where.lat));
        p.set('lng', String(where.lng));
        if (where.name) p.set('name', where.name);
      } else p.set('q', where.q ?? 'Srinagar');
      return getJson<Forecast>(`/api/weather?${p}`);
    },
    staleTime: 5 * 60_000,
    enabled: inBrowser,
    networkMode: 'offlineFirst',
  });
  const weatherSavedAt = useSavedAt('/api/weather', () => void weatherQ.refetch());

  // IMD weather (district-based)
  const districtForImd = useMemo(() => {
    if (where.lat && where.lng) return undefined; // will use lat/lng
    // Extract district from place name or use region
    const name = where.q ?? where.name ?? 'Srinagar';
    return name.split(' ').pop() ?? 'Srinagar';
  }, [where]);

  const imdWeatherQ = useQuery({
    queryKey: ['imd-weather', where],
    queryFn: () => {
      const p = new URLSearchParams();
      if (where.lat !== undefined && where.lng !== undefined) {
        p.set('lat', String(where.lat));
        p.set('lng', String(where.lng));
      } else if (districtForImd) {
        p.set('district', districtForImd);
      }
      return getJson<ImdWeatherResponse>(`/api/v1/weather?${p}`);
    },
    staleTime: 15 * 60_000,
    enabled: inBrowser,
    networkMode: 'offlineFirst',
  });
  const imdWeatherSavedAt = useSavedAt('/api/v1/weather', () => void imdWeatherQ.refetch());

  // Location search
  const picked = useRef('');
  useEffect(() => {
    const text = placeQuery.trim();
    if (text.length < 3 || text === picked.current) return;
    let live = true;
    const t = setTimeout(() => {
      getJson<{ places: Place[] }>(`/api/weather?search=${encodeURIComponent(text)}`)
        .then((r) => live && setSuggestions(r.places))
        .catch(() => live && setSuggestions([]));
    }, 350);
    return () => { live = false; clearTimeout(t); };
  }, [placeQuery]);

  const useMyLocation = () => {
    setSuggestions([]);
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setWhere({ lat: Math.round(pos.coords.latitude * 1e4) / 1e4, lng: Math.round(pos.coords.longitude * 1e4) / 1e4, name: 'Your location' });
        setLocating(false);
      },
      () => setLocating(false),
      { timeout: 10_000, maximumAge: 600_000 },
    );
  };

  // Mandi filters
  const [filters, setFilters] = useState<{ state: string; district: string; market: string; commodity: string; variety: string; grade: string }>({ state: '', district: '', market: '', commodity: 'Apple', variety: '', grade: '' });
  const [applied, setApplied] = useState<{ state: string; district: string; market: string; commodity: string; variety: string; grade: string }>({ state: '', district: '', market: '', commodity: 'Apple', variety: '', grade: '' });
  const [commodities, setCommodities] = useState<string[]>([]);
  const [commodityVarieties, setCommodityVarieties] = useState<Record<string, string[]>>({});
  const [commodityLoading, setCommodityLoading] = useState(false);
  const fromLink = useCallback((p: URLSearchParams) => {
    const asked = mandiFromLink(p);
    if (!asked) return;
    const next = { state: '', district: '', market: '', commodity: 'Apple', variety: '', grade: '', ...asked };
    setFilters(next);
    setApplied(next);
  }, []);
  useEffect(() => {
    let live = true;
    const t = setTimeout(async () => {
      try {
        setCommodityLoading(true);
        const res = await fetch('/api/mandi/commodities', { headers: { Accept: 'application/json' } });
        if (!res.ok) throw new Error(`commodities feed answered ${res.status}`);
        const data = await res.json();
        setCommodities(data.commodities ?? []);
        setCommodityVarieties(data.varieties ?? {});
      } catch (err) {
        console.error('Commodity discovery failed:', err);
      } finally {
        if (live) setCommodityLoading(false);
      }
    }, 0);
    return () => { live = false; };
  }, []);

  const [unit, setUnit] = useState<'quintal' | 'kg' | 'box'>('box');
  const [boxKg, setBoxKg] = useState(17);
  const [sort, setSort] = useState<'price-asc' | 'price-desc' | 'date'>('date');

  const mandiQ = useQuery({
    queryKey: ['mandi', applied],
    queryFn: () => {
      const p = new URLSearchParams();
      Object.entries(applied).forEach(([k, v]) => v.trim() && p.set(k, v.trim()));
      return getJson<MandiResult>(`/api/mandi?${p}`).catch((serverError: DetailedError) =>
        mandiFromBrowser(applied).catch((browserError: Error) => {
          serverError.detail = `Server: ${serverError.detail ?? '—'} | This phone: ${browserError.message || String(browserError)}`;
          return Promise.reject(serverError);
        }),
      );
    },
    staleTime: 10 * 60_000,
    networkMode: 'offlineFirst',
  });
  const mandiSavedAt = useSavedAt('/api/mandi', () => void mandiQ.refetch());

  const isBoxCommodity = applied.commodity && BOX_COMMODITIES.has(applied.commodity);
  const defaultUnit = isBoxCommodity ? 'box' : 'quintal';
  const effectiveUnit = unit === 'box' && !isBoxCommodity ? 'quintal' : unit;
  const factor = effectiveUnit === 'kg' ? 0.01 : effectiveUnit === 'box' ? (boxKg > 0 ? boxKg : 17) / 100 : 1;
  const unitLabel = effectiveUnit === 'box' ? `box (${boxKg} kg)` : effectiveUnit;

  const rows = useMemo(() => {
    const list = [...(mandiQ.data?.records ?? [])].filter((r) =>
      r.commodity.toLowerCase().replace(/[^a-z]/g, '') === 'apple'
    );
    if (sort === 'price-asc') list.sort((a, b) => a.modalPrice - b.modalPrice);
    else if (sort === 'price-desc') list.sort((a, b) => b.modalPrice - a.modalPrice);
    else list.sort((a, b) => b.arrivalDate.localeCompare(a.arrivalDate) || a.market.localeCompare(b.market));
    return list;
  }, [mandiQ.data, sort]);

  const byState = useMemo(() => {
    const groups = new Map<string, MandiRecord[]>();
    for (const r of rows) groups.set(r.state, [...(groups.get(r.state) ?? []), r]);
    return [...groups.entries()].sort(([a], [b]) => (/jammu/i.test(a) ? -1 : /jammu/i.test(b) ? 1 : a.localeCompare(b)));
  }, [rows]);

  const showState = (state: string) => {
    const next = { ...applied, state, district: '', market: '' };
    setFilters(next);
    setApplied(next);
  };

  const unusual = useMemo(() => {
    const sorted = rows.map((r) => r.modalPrice).filter((n) => n > 0).sort((a, b) => a - b);
    if (sorted.length < 4) return new Set<MandiRecord>();
    const median = sorted[Math.floor(sorted.length / 2)];
    return new Set(rows.filter((r) => r.modalPrice <= 0 || r.modalPrice < median / 3 || r.modalPrice > median * 3));
  }, [rows]);

  const stats = useMemo(() => {
    const usable = rows.filter((r) => r.modalPrice > 0 && !unusual.has(r));
    if (usable.length === 0) return null;
    const hi = usable.reduce((a, b) => (b.modalPrice > a.modalPrice ? b : a));
    const lo = usable.reduce((a, b) => (b.modalPrice < a.modalPrice ? b : a));
    const latest = rows.reduce((a, b) => (b.arrivalDate > a.arrivalDate ? b : a)).arrivalDate;
    return { avg: usable.reduce((s, r) => s + r.modalPrice, 0) / usable.length, hi, lo, latest, count: usable.length };
  }, [rows, unusual]);

  const postedQ = useQuery({ queryKey: ['posted-rates'], queryFn: () => recentRates(), staleTime: 5 * 60_000, networkMode: 'offlineFirst' });
  const posted = useMemo(() => {
    const want = applied.commodity.trim().toLowerCase();
    const list = (postedQ.data ?? []).filter((r) => !want || r.commodity.toLowerCase().includes(want) || want.includes(r.commodity.toLowerCase()));
    const kg = list.map((r) => perKg(r, r.modal_price)).filter((n): n is number => n !== null && n > 0);
    if (!kg.length) return null;
    const latest = list.reduce((a, b) => (b.rate_date > a.rate_date ? b : a)).rate_date;
    return { avgKg: kg.reduce((s, n) => s + n, 0) / kg.length, count: kg.length, mandis: new Set(list.map((r) => r.mandi)).size, latest };
  }, [postedQ.data, applied.commodity]);

  const f = weatherQ.data;
  const imd = imdWeatherQ.data;
  const [, condLabel, CondIcon] = f ? wmo(f.current.code) : [[], '', Cloud];

  return (
    <PortalShell
      standalone
      theme="buyer"
      eyebrow="Live mandi rates & weather"
      title="Today's prices, today's sky"
      description="Daily rates posted by checked traders at Kashmir's mandis, government-published prices when their service is open, and the local forecast that decides when you pick, spray and ship."
      kpis={[
        {
          label: 'Weather (Open-Meteo)',
          value: f ? `${Math.round(f.current.temperature)} °C` : '—',
          trend: f ? `${condLabel} · ${f.place.name}` : weatherQ.isError ? 'Unavailable' : 'Loading…',
        },
        imd ? {
          label: 'Weather (IMD)',
          value: `${Math.round(imd.current.temperature)} °C`,
          trend: `${imd.current.condition} · ${imd.stationName} (${imd.stationCode})`,
        } : {
          label: 'Weather (IMD)',
          value: '—',
          trend: imdWeatherQ.isError ? 'Unavailable' : imdWeatherQ.isLoading ? 'Loading…' : 'No district selected',
        },
        stats || !posted
          ? {
              label: `${applied.commodity || 'Select a commodity'}`,
              value: '—',
              trend: stats ? `per ${unitLabel}` : mandiQ.isError ? 'Unavailable' : mandiQ.isLoading ? 'Loading…' : 'Select a commodity',
            }
          : {
              label: `${applied.commodity} — average modal`,
              value: `${inr.format(posted.avgKg * factor)}`,
              trend: `per ${unitLabel} · ${posted.count} rate${posted.count === 1 ? '' : 's'} from ${posted.mandis} mandi${posted.mandis === 1 ? '' : 's'}`,
            },
        stats || !posted
          ? {
              label: 'Latest arrival date',
              value: stats ? dayName(stats.latest) : '—',
              trend: stats ? (daysOld(stats.latest) === 0 ? 'Reported today' : `${daysOld(stats.latest)} day(s) ago`) : 'Agmarknet',
            }
          : {
              label: 'Latest rate posted',
              value: dayName(posted.latest),
              trend: daysOld(posted.latest) === 0 ? 'Posted today by Mandi Helpers' : `${daysOld(posted.latest)} day(s) ago`,
            },
      ]}
    >
      <ReadLink onRead={fromLink} />

      {/* ── Weather Panel ───────────────────────────────────── */}
      <Panel theme={theme} title="Weather" icon={CloudSun} action={
        <>
          {f?.stale && <LastUpdated at={f.fetchedAt} source={f.source} className="mr-2" />}
          {imd?.stale && <LastUpdated at={imd.observationTime} source="Open-Meteo" />}
        </>
      }>
        <div className="flex flex-col gap-3 md:flex-row">
          <form
            className="relative flex-1"
            onSubmit={(e) => {
              e.preventDefault();
              if (placeQuery.trim()) setWhere({ q: placeQuery.trim() });
              setSuggestions([]);
            }}
          >
            <label htmlFor="place" className="sr-only">Town, district or village</label>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input
              id="place"
              className={`${INPUT} pl-9`}
              value={placeQuery}
              onChange={(e) => setPlaceQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && setSuggestions([])}
              placeholder="Search a town, district or village"
              autoComplete="off"
            />
            {suggestions.length > 0 && placeQuery.trim().length >= 3 && (
              <ul role="listbox" className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl bg-white shadow-xl ring-1 ring-slate-900/10">
                {suggestions.map((p) => (
                  <li key={`${p.lat},${p.lng}`}>
                    <button
                      type="button"
                      className="flex w-full cursor-pointer items-center gap-2 px-4 py-2.5 text-left text-sm hover:bg-sky-50"
                      onClick={() => {
                        setWhere({ lat: p.lat, lng: p.lng, name: p.name });
                        picked.current = p.name;
                        setPlaceQuery(p.name);
                        setSuggestions([]);
                      }}
                    >
                      <MapPin className="h-4 w-4 text-sky-600" aria-hidden />
                      <span className="font-semibold text-slate-900">{p.name}</span>
                      <span className="truncate text-slate-500">{p.admin}</span>
                      {p.note && <span className="sr-only">{p.note}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </form>
          <Btn theme={theme} variant="soft" icon={locating ? Loader2 : LocateFixed} onClick={useMyLocation} disabled={locating}>
            Use my location
          </Btn>
        </div>

        {/* Loading / Error states for Open-Meteo */}
        {!weatherQ.data && !weatherQ.isError && (
          <div role="status" className="mt-6">
            <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading Open-Meteo forecast…</p>
            <div aria-hidden className="mt-3 h-[60rem] animate-pulse rounded-2xl bg-gradient-to-r from-slate-200/70 via-[#FBF8F0] to-slate-200/70 ring-1 ring-[#E8A317]/15 motion-reduce:animate-none sm:h-[41rem] lg:h-[22rem]" />
          </div>
        )}
        {weatherQ.isError && (
          <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl bg-rose-50 p-4 text-sm text-rose-800 ring-1 ring-rose-200">
            <TriangleAlert className="h-4 w-4" aria-hidden /> {(weatherQ.error as Error).message}
            <Btn theme={theme} size="sm" variant="ghost" icon={RefreshCw} onClick={() => void weatherQ.refetch()}>Retry</Btn>
            {(weatherQ.error as DetailedError).detail && (
              <details className="w-full text-xs text-rose-900/80">
                <summary className="cursor-pointer">Technical details</summary>
                <p className="mt-1 break-words font-mono">{`${(weatherQ.error as DetailedError).detail}`}</p>
              </details>
            )}
          </div>
        )}

        {/* Loading / Error states for IMD */}
        {inBrowser && !imdWeatherQ.data && !imdWeatherQ.isError && (
          <div role="status" className="mt-6">
            <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading IMD forecast…</p>
          </div>
        )}
        {imdWeatherQ.isError && (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl bg-amber-50 p-3 text-sm text-amber-800 ring-1 ring-amber-200">
            <TriangleAlert className="h-4 w-4" aria-hidden /> IMD: {(imdWeatherQ.error as Error).message}
            <Btn theme={theme} size="sm" variant="ghost" icon={RefreshCw} onClick={() => void imdWeatherQ.refetch()}>Retry</Btn>
          </div>
        )}

        {/* Open-Meteo Weather Display */}
        {f && (
          <div className="mt-6 space-y-5 border-t border-slate-200 pt-4">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
              <span>Source: {f.source}, CC BY 4.0</span>
              {f.stale && <span className="ml-2 text-amber-600">(stale)</span>}
              {f.stale && <LastUpdated at={f.fetchedAt} source={f.source} className="ml-auto" />}
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,2fr)]">
              <Tilt3D className="min-w-0 rounded-3xl" max={6}>
                <div className="relative h-full overflow-hidden rounded-3xl bg-gradient-to-br from-sky-500 to-indigo-600 p-6 text-white shadow-lg [transform-style:preserve-3d]">
                  <p className="flex items-center gap-1.5 text-sm text-sky-100">
                    <MapPin className="h-4 w-4" aria-hidden />
                    {f.place.name}{f.place.admin ? `, ${f.place.admin}` : ''}
                  </p>
                  <div data-depth className="mt-3 flex items-center gap-4">
                    <CondIcon className="h-14 w-14 drop-shadow" aria-hidden />
                    <div>
                      <p className="text-5xl font-semibold tabular-nums">{Math.round(f.current.temperature)}°</p>
                      <p className="text-sky-100">{condLabel}</p>
                    </div>
                  </div>
                  <dl className="mt-5 grid grid-cols-3 gap-2 text-sm">
                    <div><dt className="flex items-center gap-1 text-sky-100"><Droplets className="h-3.5 w-3.5" aria-hidden /> Humidity</dt><dd className="font-semibold">{f.current.humidity}%</dd></div>
                    <div><dt className="flex items-center gap-1 text-sky-100"><Wind className="h-3.5 w-3.5" aria-hidden /> Wind</dt><dd className="font-semibold">{Math.round(f.current.wind)} km/h</dd></div>
                    <div><dt className="flex items-center gap-1 text-sky-100"><CloudRain className="h-3.5 w-3.5" aria-hidden /> Rain</dt><dd className="font-semibold">{f.current.precipitation} mm</dd></div>
                  </dl>
                </div>
              </Tilt3D>
              <div className="min-w-0 space-y-3">
                {advice(f).map((a) => (
                  <p key={a.text} className="flex items-start gap-2 rounded-2xl bg-white/70 p-3 text-sm text-slate-800 ring-1 ring-slate-900/5">
                    <Badge tone={a.tone}>Farm tip</Badge> {a.text}
                  </p>
                ))}
                <div className="flex gap-2 overflow-x-auto overscroll-x-contain pb-1" aria-label="Next 24 hours (Open-Meteo)">
                  {f.hourly.filter((_, i) => i % 2 === 0).map((h) => {
                    const [, , Icon] = wmo(h.code);
                    return (
                      <div key={h.time} className="min-w-[4.5rem] shrink-0 rounded-2xl bg-white/80 p-2.5 text-center ring-1 ring-slate-900/5">
                        <p className="text-xs text-slate-500">{h.time.slice(11, 16)}</p>
                        <Icon className="mx-auto my-1 h-5 w-5 text-sky-600" aria-hidden />
                        <p className="text-sm font-semibold tabular-nums text-slate-900">{Math.round(h.temperature)}°</p>
                        <p className="text-[11px] text-sky-700">{h.precipitationProbability}%</p>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
                {f.daily.map((d) => {
                  const [, label, Icon] = wmo(d.code);
                  return (
                    <Tilt3D key={d.date} className="rounded-2xl" max={8}>
                      <div className="h-full rounded-2xl bg-white/85 p-3 text-center shadow-sm ring-1 ring-slate-900/5 [transform-style:preserve-3d]">
                        <p className="text-xs font-semibold text-slate-600">{dayName(d.date)}</p>
                        <Icon data-depth className="mx-auto my-2 h-7 w-7 text-sky-600" aria-label={label} />
                        <p className="text-sm font-semibold tabular-nums text-slate-900">{Math.round(d.max)}° / <span className="text-slate-500">{Math.round(d.min)}°</span></p>
                        <p className="text-[11px] text-sky-700">{d.precipitation} mm</p>
                      </div>
                    </Tilt3D>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* IMD Weather Display */}
        {imd && (
          <div className="mt-6 space-y-5 border-t border-slate-200 pt-4">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
              <span>Source: {imd.source} — Station: {imd.stationName} ({imd.stationCode})</span>
              {imd.stale && <LastUpdated at={imd.observationTime} source="Open-Meteo" className="ml-auto" />}
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,2fr)]">
              <Tilt3D className="min-w-0 rounded-3xl" max={6}>
                <div className="relative h-full overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-500 to-teal-600 p-6 text-white shadow-lg [transform-style:preserve-3d]">
                  <p className="flex items-center gap-1.5 text-sm text-emerald-100">
                    <MapPin className="h-4 w-4" aria-hidden />
                    {imd.district} district · {imd.stationName}
                  </p>
                  <div data-depth className="mt-3 flex items-center gap-4">
                    <span className="text-5xl" aria-hidden>🌡️</span>
                    <div>
                      <p className="text-5xl font-semibold tabular-nums">{Math.round(imd.current.temperature)}°</p>
                      <p className="text-emerald-100">{imd.current.condition}</p>
                    </div>
                  </div>
                  <dl className="mt-5 grid grid-cols-3 gap-2 text-sm">
                    <div><dt className="flex items-center gap-1 text-emerald-100"><Droplets className="h-3.5 w-3.5" aria-hidden /> Humidity</dt><dd className="font-semibold">{imd.current.humidity}%</dd></div>
                    <div><dt className="flex items-center gap-1 text-emerald-100"><Wind className="h-3.5 w-3.5" aria-hidden /> Wind</dt><dd className="font-semibold">{Math.round(imd.current.windSpeed)} km/h @ {imd.current.windDirection}°</dd></div>
                    <div><dt className="flex items-center gap-1 text-emerald-100"><CloudRain className="h-3.5 w-3.5" aria-hidden /> Rain</dt><dd className="font-semibold">{imd.current.rainfall} mm</dd></div>
                    <div style={{ gridColumn: 'span 2' }}><dt className="flex items-center gap-1 text-emerald-100"><FileQuestion className="h-3.5 w-3.5" aria-hidden /> Pressure</dt><dd className="font-semibold">{imd.current.pressure} hPa</dd></div>
                  </dl>
                </div>
              </Tilt3D>
              <div className="min-w-0 space-y-3">
                {imdAdvice(imd).map((a) => (
                  <p key={a.text} className="flex items-start gap-2 rounded-2xl bg-white/70 p-3 text-sm text-slate-800 ring-1 ring-slate-900/5">
                    <Badge tone={a.tone}><a.icon className="h-3.5 w-3.5" aria-hidden /> Farm tip</Badge> {a.text}
                  </p>
                ))}
                {imd.warnings.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-rose-800 flex items-center gap-1"><TriangleAlert className="h-4 w-4" aria-hidden /> Weather warnings</p>
                    {imd.warnings.map((w, i) => (
                      <div key={i} className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800 ring-1 ring-rose-200">
                        <span className="font-semibold uppercase">{w.severity}</span>: {w.message}
                        <div className="mt-1 text-xs text-rose-700">Issued: {formatDateTime(w.issuedAt)} · Valid until: {formatDateTime(w.validUntil)}</div>
                        <div className="text-xs text-rose-700">Districts: {w.affectedDistricts.join(', ')}</div>
                      </div>
                    ))}
                  </div>
                )}
                {imd.advisories.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-sky-800 flex items-center gap-1"><CloudSun className="h-4 w-4" aria-hidden /> Agromet Advisories</p>
                    {imd.advisories.map((a, i) => (
                      <div key={i} className="rounded-xl bg-sky-50 p-3 text-sm text-sky-900 ring-1 ring-sky-200">
                        <p className="font-semibold">{a.title}</p>
                        <p className="mt-1">{a.description}</p>
                        <div className="mt-1 text-xs text-sky-700">Crops: {a.crops.join(', ')} · Districts: {a.districts.join(', ')}</div>
                        <div className="text-xs text-sky-700">Valid: {a.validFrom} to {a.validUntil} · Source: {a.sourceOrganization}</div>
                        {a.sourceUrl && (
                          <a href={a.sourceUrl} target="_blank" rel="noreferrer" className="text-xs text-sky-600 underline mt-1 inline-block">Read full advisory ↗</a>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-2 overflow-x-auto overscroll-x-contain pb-1" aria-label="Next 24 hours (IMD)">
                  {imd.hourly.filter((_, i) => i % 2 === 0).map((h) => (
                    <div key={h.time} className="min-w-[4.5rem] shrink-0 rounded-2xl bg-white/80 p-2.5 text-center ring-1 ring-slate-900/5">
                      <p className="text-xs text-slate-500">{h.time.slice(11, 16)}</p>
                      <p className="text-sm font-semibold tabular-nums text-slate-900">{Math.round(h.temperature)}°</p>
                      <p className="text-[11px] text-emerald-700">{h.precipitationProbability}% 🌧️</p>
                      <p className="text-[11px] text-slate-600">{h.condition}</p>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
                  {imd.daily.map((d) => (
                    <Tilt3D key={d.date} className="rounded-2xl" max={8}>
                      <div className="h-full rounded-2xl bg-white/85 p-3 text-center shadow-sm ring-1 ring-slate-900/5 [transform-style:preserve-3d]">
                        <p className="text-xs font-semibold text-slate-600">{dayName(d.date)}</p>
                        <p className="text-2xl my-1" aria-hidden>{d.condition === 'Rain' ? '🌧️' : d.condition === 'Clear sky' ? '☀️' : '⛅'}</p>
                        <p className="text-sm font-semibold tabular-nums text-slate-900">{Math.round(d.maxTemperature)}° / <span className="text-slate-500">{Math.round(d.minTemperature)}°</span></p>
                        <p className="text-[11px] text-emerald-700">{d.totalRainfall} mm</p>
                      </div>
                    </Tilt3D>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {(!f && !imd) && !weatherQ.isError && !imdWeatherQ.isError && inBrowser && (
          <p className="mt-6 text-center text-slate-500">Select a location or enable location access to see weather forecasts.</p>
        )}
      </Panel>

      {/* ── Rates posted by approved Mandi Helpers ───────── */}
      <div className="mt-6">
        <PostedRates theme={theme} commodity={applied.commodity} />
      </div>

      {/* ── Mandi Prices ───────────────────────────────────── */}
      <div className="mt-6">
        <Panel theme={theme} title="Mandi prices (Agmarknet)" icon={Thermometer} action={
          <>
            {mandiQ.data?.stale && <LastUpdated at={mandiQ.data.fetchedAt} source={mandiQ.data.source} className="mr-2" />}
            {mandiQ.data?.stale && <Badge tone="amber">Stale</Badge>}
          </>
        }>
          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_1fr_1fr_auto]">
            <label className="text-sm font-medium text-slate-700">Commodity</label>
            <input list="commodities" className={`${INPUT} mt-1`} value={filters.commodity} onChange={(e) => setFilters({ ...filters, commodity: e.target.value, variety: '', grade: '' })} placeholder="Apple" />
            <label className="text-sm font-medium text-slate-700">State</label>
            <input list="states" className={`${INPUT} mt-1`} value={filters.state} onChange={(e) => setFilters({ ...filters, state: e.target.value })} placeholder="All India" />
            <label className="text-sm font-medium text-slate-700">District</label>
            <input className={`${INPUT} mt-1`} value={filters.district} onChange={(e) => setFilters({ ...filters, district: e.target.value })} placeholder="Any" />
            <label className="text-sm font-medium text-slate-700">Market</label>
            <input className={`${INPUT} mt-1`} value={filters.market} onChange={(e) => setFilters({ ...filters, market: e.target.value })} placeholder="Any" />
            <div className="flex items-end">
              <Btn theme={theme} type="submit" icon={Search} className="w-full">Show prices</Btn>
            </div>
            <datalist id="commodities">{commodities.map((c) => <option key={c} value={c} />)}</datalist>
            <datalist id="states">{STATES.map((s) => <option key={s} value={s} />)}</datalist>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-sm text-slate-600">Sort:</span>
            {([
              ['price-asc', 'Price low → high', ArrowUpNarrowWide],
              ['price-desc', 'Price high → low', ArrowDownWideNarrow],
              ['date', 'Newest first', CalendarClock],
            ] as const).map(([id, label, Icon]) => (
              <Btn key={id} theme={theme} size="sm" variant={sort === id ? 'solid' : 'soft'} icon={Icon} aria-pressed={sort === id} onClick={() => setSort(id)}>
                {label}
              </Btn>
            ))}
            <span className="ms-auto inline-flex flex-wrap items-center gap-2">
              <span className="inline-flex rounded-xl bg-slate-900/5 p-1" role="group" aria-label="Price unit">
                {(['quintal', 'kg', 'box'] as const).map((u) => (
                  <button key={u} type="button" aria-pressed={effectiveUnit === u} onClick={() => setUnit(u)} className={`min-h-11 cursor-pointer rounded-lg px-3 py-1 text-sm font-semibold ${effectiveUnit === u ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}>
                    ₹ / {u}
                  </button>
                ))}
              </span>
              {effectiveUnit === 'box' && (
                <label className="inline-flex items-center gap-1.5 text-sm text-slate-700">
                  Box
                  <input type="number" min={1} max={50} value={boxKg} onChange={(e) => setBoxKg(Math.min(50, Math.max(1, Number(e.target.value) || 17)))} className="min-h-11 w-16 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm" aria-label="Box weight in kg" />
                  kg
                </label>
              )}
            </span>
          </div>

          {mandiQ.isLoading && applied.commodity && (
            <p className="mt-6 flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Fetching today&rsquo;s reports…</p>
          )}
          {mandiQ.isError && applied.commodity && (
            <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl bg-rose-50 p-4 text-sm text-rose-800 ring-1 ring-rose-200">
              <TriangleAlert className="h-4 w-4" aria-hidden /> {(mandiQ.error as Error).message}
              <Btn theme={theme} size="sm" variant="ghost" icon={RefreshCw} onClick={() => void mandiQ.refetch()}>Retry</Btn>
              <a href="https://agmarknet.gov.in/" target="_blank" rel="noreferrer" className="text-sm font-semibold text-rose-900 underline">Open agmarknet.gov.in</a>
              {(mandiQ.error as DetailedError).detail && (
                <details className="w-full text-xs text-rose-900/80">
                  <summary className="cursor-pointer">Technical details (for the site owner)</summary>
                  <p className="mt-1 break-words font-mono">{`${(mandiQ.error as DetailedError).detail}`}</p>
                </details>
              )}
            </div>
          )}
          {mandiQ.data?.stale && applied.commodity && <LastUpdated at={mandiQ.data.fetchedAt} source={mandiQ.data.source} className="mt-5" />}
          {mandiQ.data?.widened && rows.length > 0 && (
            <p className="mt-5 flex items-start gap-2 rounded-2xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {mandiQ.data.widened}
            </p>
          )}
          {mandiQ.data && rows.length === 0 && applied.commodity && (
            <div className="mt-6">
              <EmptyState theme={theme} icon={Thermometer} title={`No reports for ${applied.commodity}`} text={`No mandi has reported ${applied.commodity}${applied.state ? ` in ${applied.state}` : ''} to Agmarknet today. Mandis report only on days they trade — check the rates posted by Mandi Helpers above, or try another commodity.`} />
            </div>
          )}
          {stats && (
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl bg-emerald-50 p-4 ring-1 ring-emerald-200">
                <p className="text-xs uppercase tracking-wider text-emerald-800">Best price</p>
                <p className="text-xl font-bold tabular-nums text-emerald-950">{inr.format(stats.hi.modalPrice * factor)}</p>
                <p className="text-xs text-emerald-800">{mandiName(stats.hi.market)}, {stats.hi.district} · per {unitLabel}</p>
              </div>
              <div className="rounded-2xl bg-sky-50 p-4 ring-1 ring-sky-200">
                <p className="text-xs uppercase tracking-wider text-sky-800">Average modal</p>
                <p className="text-xl font-bold tabular-nums text-sky-950">{inr.format(stats.avg * factor)}</p>
                <p className="text-xs text-sky-800">across {stats.count} reports · per {unitLabel}{unusual.size ? ` · ${unusual.size} unusual left out` : ''}</p>
              </div>
              <div className="rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200">
                <p className="text-xs uppercase tracking-wider text-amber-800">Lowest price</p>
                <p className="text-xl font-bold tabular-nums text-amber-950">{inr.format(stats.lo.modalPrice * factor)}</p>
                <p className="text-xs text-amber-800">{mandiName(stats.lo.market)}, {stats.lo.district} · per {unitLabel}</p>
              </div>
            </div>
          )}
          {rows.length > 0 && byState.length > 1 && (
            <p className="mt-5 text-sm text-slate-700">
              <strong>{byState.length} states</strong> · {new Set(rows.map((r) => `${r.state}|${r.market}`)).size} mandis reporting {applied.commodity} —
              the latest report from each. Tap a state to see only its mandis.
              {mandiQ.data?.partial && <span className="block text-amber-800">Some states took too long to answer; press Show prices again to load the rest.</span>}
            </p>
          )}
          {rows.length > 0 && (
            <div className="mt-3 overflow-x-auto rounded-2xl ring-1 ring-slate-900/5">
              <table className="w-full min-w-[760px] bg-white/80 text-left text-sm">
                <thead className="bg-ivory text-xs font-semibold uppercase tracking-wider text-slate-600">
                  <tr>
                    <th className="px-4 py-3">Market</th>
                    <th className="px-4 py-3">Commodity · variety</th>
                    <th className="px-4 py-3">Arrival</th>
                    <th className="px-4 py-3 text-right">Min</th>
                    <th className="px-4 py-3 text-right">Modal</th>
                    <th className="px-4 py-3 text-right">Max</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-900/5">
                  {byState.map(([state, list]) => (
                    <Fragment key={state}>
                      {byState.length > 1 && (
                        <tr className="bg-sky-50/80">
                          <td colSpan={6} className="px-4 py-2">
                            <button type="button" onClick={() => showState(state)} className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-sky-900 hover:underline" title={`Show only ${state}`}>
                              {state}
                            </button>
                            <span className="ms-2 text-xs text-sky-800">{new Set(list.map((r) => r.market)).size} mandis · {list.length} reports</span>
                          </td>
                        </tr>
                      )}
                      {list.map((r, i) => (
                        <tr key={`${state}-${r.market}-${r.variety}-${r.arrivalDate}-${i}`} className="hover:bg-sky-50/60">
                          <td className="px-4 py-3">
                            <p className="font-semibold text-slate-900" title={r.market}>{mandiName(r.market)} mandi</p>
                            <p className="text-xs text-slate-500">{r.district ? `${r.district}, ` : ''}{r.state}</p>
                          </td>
                          <td className="px-4 py-3 text-slate-700">{r.commodity}{r.variety ? ` · ${r.variety}` : ''}{r.grade && r.grade !== 'FAQ' ? ` · ${r.grade}` : ''}</td>
                          <td className="px-4 py-3">
                            <span className="text-slate-800">{dayName(r.arrivalDate)}</span>
                            {daysOld(r.arrivalDate) > 2 && <span className="block text-xs text-amber-700">{daysOld(r.arrivalDate)} days old</span>}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-slate-600">{inr.format(r.minPrice * factor)}</td>
                          <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-900">
                            {inr.format(r.modalPrice * factor)}
                            {unusual.has(r) && (
                              <span className="block text-[11px] font-medium text-amber-700" title="Far from the other mandis' prices — possibly a typing slip in the government feed">
                                unusual — check
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-slate-600">{inr.format(r.maxPrice * factor)}</td>
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </PortalShell>
  );
}