'use client';

/**
 * Live Mandi Rates & Weather.
 *
 * - Weather: Open-Meteo through /api/weather (any place in India, or the
 *   browser's location). Farm advice lines are simple rules on that data.
 * - Mandi: Agmarknet daily prices through /api/mandi (data.gov.in), filtered
 *   by state / district / market / commodity, sortable, Rs per quintal or kg.
 *
 * Nothing is invented: empty feeds and service errors are shown as such.
 */
import { useEffect, useMemo, useState } from 'react';
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
  LocateFixed,
  Loader2,
  MapPin,
  RefreshCw,
  Search,
  Sun,
  Thermometer,
  TriangleAlert,
  Wind,
  type LucideIcon,
} from 'lucide-react';

import { PortalShell } from '@/components/layout/PortalShell';
import { Badge, Btn, EmptyState, INPUT, PORTAL_THEMES, Panel, inr } from '@/components/portal/kit';
import { Tilt3D } from '@/components/three/Tilt3D';

const theme = PORTAL_THEMES.buyer;

interface Place {
  name: string;
  admin: string;
  lat: number;
  lng: number;
}
interface Forecast {
  place: Place;
  current: { time: string; temperature: number; humidity: number; precipitation: number; wind: number; code: number };
  hourly: { time: string; temperature: number; precipitationProbability: number; code: number }[];
  daily: { date: string; max: number; min: number; precipitation: number; code: number }[];
  source: string;
}
interface MandiRecord {
  state: string;
  district: string;
  market: string;
  commodity: string;
  variety: string;
  grade: string;
  arrivalDate: string;
  minPrice: number;
  maxPrice: number;
  modalPrice: number;
}
interface MandiResult {
  records: MandiRecord[];
  usingSampleKey: boolean;
  fetchedAt: string;
  source: string;
}

const STATES = [
  'Andhra Pradesh', 'Assam', 'Bihar', 'Chandigarh', 'Chattisgarh', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu and Kashmir',
  'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Nagaland', 'NCT of Delhi', 'Odisha',
  'Pondicherry', 'Punjab', 'Rajasthan', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttrakhand', 'West Bengal',
];
const COMMODITIES = [
  'Apple', 'Walnut', 'Almond(Badam)', 'Cherry', 'Pear(Marasebu)', 'Plum', 'Peach', 'Apricot(Jardalu/Khumani)', 'Grapes', 'Pomegranate',
  'Onion', 'Potato', 'Tomato', 'Garlic', 'Cauliflower', 'Cabbage', 'Green Chilli', 'Rice', 'Wheat', 'Maize',
];

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

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  return data as T;
}

export default function MandiWeatherPage() {
  // Weather
  const [placeQuery, setPlaceQuery] = useState('');
  const [where, setWhere] = useState<{ q?: string; lat?: number; lng?: number; name?: string }>({ q: 'Srinagar' });
  const [suggestions, setSuggestions] = useState<Place[]>([]);
  const [locating, setLocating] = useState(false);

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
  });

  useEffect(() => {
    const text = placeQuery.trim();
    if (text.length < 3) return;
    const t = setTimeout(() => {
      getJson<{ places: Place[] }>(`/api/weather?search=${encodeURIComponent(text)}`)
        .then((r) => setSuggestions(r.places))
        .catch(() => setSuggestions([]));
    }, 350);
    return () => clearTimeout(t);
  }, [placeQuery]);

  const useMyLocation = () => {
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

  // Mandi
  const [filters, setFilters] = useState({ state: '', district: '', market: '', commodity: 'Apple' });
  const [applied, setApplied] = useState(filters);
  const [unit, setUnit] = useState<'quintal' | 'kg'>('quintal');
  const [sort, setSort] = useState<'price-asc' | 'price-desc' | 'date'>('date');

  const mandiQ = useQuery({
    queryKey: ['mandi', applied],
    queryFn: () => {
      const p = new URLSearchParams();
      Object.entries(applied).forEach(([k, v]) => v.trim() && p.set(k, v.trim()));
      return getJson<MandiResult>(`/api/mandi?${p}`);
    },
    staleTime: 10 * 60_000,
  });

  const factor = unit === 'kg' ? 0.01 : 1;
  const rows = useMemo(() => {
    const list = [...(mandiQ.data?.records ?? [])];
    if (sort === 'price-asc') list.sort((a, b) => a.modalPrice - b.modalPrice);
    else if (sort === 'price-desc') list.sort((a, b) => b.modalPrice - a.modalPrice);
    return list;
  }, [mandiQ.data, sort]);
  const stats = useMemo(() => {
    if (rows.length === 0) return null;
    const modal = rows.map((r) => r.modalPrice).filter((n) => n > 0);
    if (modal.length === 0) return null;
    const hi = rows.reduce((a, b) => (b.modalPrice > a.modalPrice ? b : a));
    const lo = rows.reduce((a, b) => (b.modalPrice > 0 && b.modalPrice < a.modalPrice ? b : a));
    const latest = rows.reduce((a, b) => (b.arrivalDate > a.arrivalDate ? b : a)).arrivalDate;
    return { avg: modal.reduce((s, n) => s + n, 0) / modal.length, hi, lo, latest };
  }, [rows]);

  const f = weatherQ.data;
  const [, condLabel, CondIcon] = f ? wmo(f.current.code) : [[], '', Cloud];

  return (
    <PortalShell
      standalone
      theme="buyer"
      eyebrow="Live mandi rates & weather"
      title="Today’s prices, today’s sky"
      description="Government-published wholesale prices from mandis across India, with the local forecast that decides when you pick, spray and ship."
      kpis={[
        { label: 'Weather', value: f ? `${Math.round(f.current.temperature)} °C` : '—', trend: f ? `${condLabel} · ${f.place.name}` : weatherQ.isError ? 'Unavailable right now' : 'Loading…' },
        { label: `${applied.commodity || 'All'} — average modal`, value: stats ? inr.format(stats.avg * factor) : '—', trend: stats ? `per ${unit} · ${rows.length} reports` : mandiQ.isError ? 'Unavailable right now' : mandiQ.isLoading ? 'Loading…' : 'No reports yet' },
        { label: 'Latest arrival date', value: stats ? dayName(stats.latest) : '—', trend: stats ? (daysOld(stats.latest) === 0 ? 'Reported today' : `${daysOld(stats.latest)} day(s) ago`) : 'Agmarknet' },
      ]}
    >
      {/* ── Weather ───────────────────────────────────────── */}
      <Panel theme={theme} title="Weather" icon={CloudSun}>
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
            <input id="place" className={`${INPUT} pl-9`} value={placeQuery} onChange={(e) => setPlaceQuery(e.target.value)} placeholder="Search a town, district or village" autoComplete="off" />
            {suggestions.length > 0 && placeQuery.trim().length >= 3 && (
              <ul role="listbox" className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl bg-white shadow-xl ring-1 ring-slate-900/10">
                {suggestions.map((p) => (
                  <li key={`${p.lat},${p.lng}`}>
                    <button
                      type="button"
                      className="flex w-full cursor-pointer items-center gap-2 px-4 py-2.5 text-left text-sm hover:bg-sky-50"
                      onClick={() => {
                        setWhere({ lat: p.lat, lng: p.lng, name: p.name });
                        setPlaceQuery(p.name);
                        setSuggestions([]);
                      }}
                    >
                      <MapPin className="h-4 w-4 text-sky-600" aria-hidden />
                      <span className="font-medium text-slate-900">{p.name}</span>
                      <span className="truncate text-slate-500">{p.admin}</span>
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

        {weatherQ.isLoading && <p className="mt-6 flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading forecast…</p>}
        {weatherQ.isError && (
          <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl bg-rose-50 p-4 text-sm text-rose-800 ring-1 ring-rose-200">
            <TriangleAlert className="h-4 w-4" aria-hidden /> {(weatherQ.error as Error).message}
            <Btn theme={theme} size="sm" variant="ghost" icon={RefreshCw} onClick={() => void weatherQ.refetch()}>Retry</Btn>
          </div>
        )}
        {f && (
          <div className="mt-6 space-y-5">
            <div className="grid gap-4 lg:grid-cols-[1.1fr_2fr]">
              <Tilt3D className="rounded-3xl" max={6}>
                <div className="relative h-full overflow-hidden rounded-3xl bg-gradient-to-br from-sky-500 to-indigo-600 p-6 text-white shadow-lg [transform-style:preserve-3d]">
                  <p className="flex items-center gap-1.5 text-sm text-sky-100"><MapPin className="h-4 w-4" aria-hidden /> {f.place.name}{f.place.admin ? `, ${f.place.admin}` : ''}</p>
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
              <div className="space-y-3">
                {advice(f).map((a) => (
                  <p key={a.text} className="flex items-start gap-2 rounded-2xl bg-white/70 p-3 text-sm text-slate-800 ring-1 ring-slate-900/5">
                    <Badge tone={a.tone}>Farm tip</Badge> {a.text}
                  </p>
                ))}
                <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Next 24 hours">
                  {f.hourly.filter((_, i) => i % 2 === 0).map((h) => {
                    const [, , Icon] = wmo(h.code);
                    return (
                      <div key={h.time} className="min-w-[4.5rem] rounded-2xl bg-white/80 p-2.5 text-center ring-1 ring-slate-900/5">
                        <p className="text-xs text-slate-500">{h.time.slice(11, 16)}</p>
                        <Icon className="mx-auto my-1 h-5 w-5 text-sky-600" aria-hidden />
                        <p className="text-sm font-semibold tabular-nums text-slate-900">{Math.round(h.temperature)}°</p>
                        <p className="text-[11px] text-sky-700">{h.precipitationProbability}%</p>
                      </div>
                    );
                  })}
                </div>
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
            <p className="text-xs text-slate-500">Weather data: {f.source}, CC BY 4.0.</p>
          </div>
        )}
      </Panel>

      {/* ── Mandi ─────────────────────────────────────────── */}
      <div className="mt-6">
        <Panel theme={theme} title="Mandi prices (Agmarknet)" icon={Thermometer}>
          <form
            className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_1fr_auto]"
            onSubmit={(e) => {
              e.preventDefault();
              setApplied(filters);
            }}
          >
            <label className="text-sm font-medium text-slate-700">
              Commodity
              <input list="commodities" className={`${INPUT} mt-1`} value={filters.commodity} onChange={(e) => setFilters({ ...filters, commodity: e.target.value })} placeholder="e.g. Apple" />
            </label>
            <label className="text-sm font-medium text-slate-700">
              State
              <input list="states" className={`${INPUT} mt-1`} value={filters.state} onChange={(e) => setFilters({ ...filters, state: e.target.value })} placeholder="All India" />
            </label>
            <label className="text-sm font-medium text-slate-700">
              District
              <input className={`${INPUT} mt-1`} value={filters.district} onChange={(e) => setFilters({ ...filters, district: e.target.value })} placeholder="Any" />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Market
              <input className={`${INPUT} mt-1`} value={filters.market} onChange={(e) => setFilters({ ...filters, market: e.target.value })} placeholder="Any" />
            </label>
            <div className="flex items-end">
              <Btn theme={theme} type="submit" icon={Search} className="w-full">Show prices</Btn>
            </div>
            <datalist id="commodities">{COMMODITIES.map((c) => <option key={c} value={c} />)}</datalist>
            <datalist id="states">{STATES.map((s) => <option key={s} value={s} />)}</datalist>
          </form>

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
            <span className="ms-auto inline-flex rounded-xl bg-slate-900/5 p-1" role="group" aria-label="Price unit">
              {(['quintal', 'kg'] as const).map((u) => (
                <button key={u} type="button" aria-pressed={unit === u} onClick={() => setUnit(u)} className={`cursor-pointer rounded-lg px-3 py-1 text-sm font-semibold ${unit === u ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}>
                  ₹ / {u}
                </button>
              ))}
            </span>
          </div>

          {mandiQ.isLoading && <p className="mt-6 flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Fetching today’s reports…</p>}
          {mandiQ.isError && (
            <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl bg-rose-50 p-4 text-sm text-rose-800 ring-1 ring-rose-200">
              <TriangleAlert className="h-4 w-4" aria-hidden /> {(mandiQ.error as Error).message}
              <Btn theme={theme} size="sm" variant="ghost" icon={RefreshCw} onClick={() => void mandiQ.refetch()}>Retry</Btn>
            </div>
          )}
          {mandiQ.data && rows.length === 0 && (
            <div className="mt-6">
              <EmptyState theme={theme} icon={Thermometer} title="No reports in the current feed" text={`No mandi has reported ${applied.commodity || 'that commodity'}${applied.state ? ` in ${applied.state}` : ''} in today’s Agmarknet data. Try another state or commodity.`} />
            </div>
          )}
          {stats && (
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl bg-emerald-50 p-4 ring-1 ring-emerald-200">
                <p className="text-xs uppercase tracking-wider text-emerald-800">Best price</p>
                <p className="text-xl font-bold tabular-nums text-emerald-950">{inr.format(stats.hi.modalPrice * factor)}</p>
                <p className="text-xs text-emerald-800">{stats.hi.market}, {stats.hi.district}</p>
              </div>
              <div className="rounded-2xl bg-sky-50 p-4 ring-1 ring-sky-200">
                <p className="text-xs uppercase tracking-wider text-sky-800">Average modal</p>
                <p className="text-xl font-bold tabular-nums text-sky-950">{inr.format(stats.avg * factor)}</p>
                <p className="text-xs text-sky-800">across {rows.length} reports</p>
              </div>
              <div className="rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200">
                <p className="text-xs uppercase tracking-wider text-amber-800">Lowest price</p>
                <p className="text-xl font-bold tabular-nums text-amber-950">{inr.format(stats.lo.modalPrice * factor)}</p>
                <p className="text-xs text-amber-800">{stats.lo.market}, {stats.lo.district}</p>
              </div>
            </div>
          )}
          {rows.length > 0 && (
            <div className="mt-5 overflow-x-auto rounded-2xl ring-1 ring-slate-900/5">
              <table className="w-full min-w-[760px] bg-white/80 text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
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
                  {rows.slice(0, 150).map((r, i) => (
                    <tr key={`${r.market}-${r.variety}-${r.arrivalDate}-${i}`} className="hover:bg-sky-50/60">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-900">{r.market}</p>
                        <p className="text-xs text-slate-500">{r.district}, {r.state}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{r.commodity}{r.variety ? ` · ${r.variety}` : ''}{r.grade && r.grade !== 'FAQ' ? ` · ${r.grade}` : ''}</td>
                      <td className="px-4 py-3">
                        <span className="text-slate-800">{dayName(r.arrivalDate)}</span>
                        {daysOld(r.arrivalDate) > 2 && <span className="block text-xs text-amber-700">{daysOld(r.arrivalDate)} days old</span>}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-600">{inr.format(r.minPrice * factor)}</td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-900">{inr.format(r.modalPrice * factor)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-600">{inr.format(r.maxPrice * factor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {mandiQ.data && (
            <p className="mt-3 text-xs text-slate-500">
              Source: {mandiQ.data.source}, prices in ₹ per quintal as published (÷100 for per kg). Fetched {new Date(mandiQ.data.fetchedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}.
              {mandiQ.data.usingSampleKey && ' Showing the limited public sample — the site owner can add a free data.gov.in key for the full feed.'}
            </p>
          )}
        </Panel>
      </div>
    </PortalShell>
  );
}
