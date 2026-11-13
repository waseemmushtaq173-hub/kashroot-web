'use client';

/**
 * Orchard & Crop Health Analytics Panel — the fast 2D replacement for the
 * old decorative 3D orchard scene on the farmer dashboard.
 *
 * Real data only, no invented numbers:
 *  - Season stage (lib/seasons) with the orchard work that stage calls for.
 *  - Apple scab risk for the next 4 days from the Mills leaf-wetness model
 *    (/api/orchard/scab: Open-Meteo hourly temperature, humidity, rain).
 *  - Top-soil moisture 0–7 cm (Open-Meteo soil_moisture_0_to_7cm) — when the
 *    source has no value for this place it says "not available".
 *  - A 7-day precipitation chart: the past 3 days and the next 4, with the
 *    leaf-wetness hours of each wet spell.
 *
 * The spray-window hour count and the full scab map stay where they belong:
 * the "Spraying today" panel and /farmer/orchard-health — this panel links
 * to both.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CalendarDays, CloudRain, Droplets, Leaf, Loader2, MapPinned } from 'lucide-react';

import { Btn, Panel, PORTAL_THEMES } from '@/components/portal/kit';
import { regionSpot, useRegion } from '@/lib/region';
import { scabLevel, LEVEL_RANK, type ScabLevel, type WetSpell } from '@/lib/scab';
import { seasonForDate, type SeasonId } from '@/lib/seasons';

const theme = PORTAL_THEMES.farmer;

interface ScabAnswer {
  spells: WetSpell[];
  soilMoisture?: { value: number; at: string };
}

/** Colour-coded risk chips: honest labels for the Mills-model verdict. */
const SCAB_STYLE: Record<ScabLevel, { label: string; chip: string; note: string }> = {
  none: { label: 'Low', chip: 'bg-emerald-50 text-emerald-800 ring-emerald-200', note: 'Dry conditions — no infection window open.' },
  watch: { label: 'Watch', chip: 'bg-lime-50 text-lime-800 ring-lime-200', note: 'Leaf wetness is building — keep an eye on the forecast.' },
  light: { label: 'Light', chip: 'bg-amber-50 text-amber-800 ring-amber-200', note: 'A light infection window is likely — check your spray plan.' },
  moderate: { label: 'Moderate', chip: 'bg-orange-50 text-orange-800 ring-orange-200', note: 'A moderate infection window is likely — protect before the rain.' },
  severe: { label: 'Severe', chip: 'bg-rose-50 text-rose-800 ring-rose-200', note: 'A severe infection window is likely — spray before it, not after.' },
};

/** The season and the orchard work it calls for (Kashmir apple calendar). */
const SEASON_STYLE: Record<SeasonId, { label: string; chip: string; note: string }> = {
  spring: { label: 'Bud break to bloom', chip: 'bg-lime-50 text-lime-900 ring-lime-200', note: 'Scab watch matters most now — thinning sprays and beehive time.' },
  summer: { label: 'Fruit development', chip: 'bg-sky-50 text-sky-900 ring-sky-200', note: 'Irrigation, cover sprays and summer pruning.' },
  autumn: { label: 'Harvest', chip: 'bg-amber-50 text-amber-900 ring-amber-200', note: 'Pick by colour, grade well — book cold storage early.' },
  winter: { label: 'Dormant', chip: 'bg-slate-100 text-slate-800 ring-slate-200', note: 'Pruning, dormant-oil spray, tool and equipment care.' },
};

export function OrchardAnalyticsPanel({ district }: { district?: string | null }) {
  // Where: the farmer's own district (My details), else their area
  // (phone location or chosen state), else Srinagar — same as the weather panel.
  const own = district?.trim();
  const { region } = useRegion({ district: own });
  const spot = regionSpot(region);
  const place = own || spot?.name || 'Srinagar';
  const approximate = Boolean(own) && spot?.exact === false;
  const query = spot && spot.lat !== undefined && spot.lng !== undefined ? `lat=${spot.lat}&lng=${spot.lng}` : null;

  // Each answer kept with the request it answers, so a new place never shows the last one's data.
  const [got, setGot] = useState<{ query: string; data?: ScabAnswer; error?: string } | null>(null);
  const data = got?.query === query ? (got.data ?? null) : null;
  const error = got?.query === query ? (got.error ?? null) : null;

  useEffect(() => {
    if (!query) return;
    let live = true;
    fetch(`/api/orchard/scab?${query}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? 'Orchard weather is not available right now.');
        if (live) setGot({ query, data: j as ScabAnswer });
      })
      .catch((err) => live && setGot({ query, error: err instanceof Error ? err.message : 'Orchard weather is not available right now.' }));
    return () => {
      live = false;
    };
  }, [query]);

  const season = seasonForDate(new Date());
  const seasonInfo = SEASON_STYLE[season];

  // The worst scab level any FORECAST wet spell opens (past spells are history).
  const forecast = data?.spells.filter((s) => !s.past) ?? [];
  let level: ScabLevel = 'none';
  for (const s of forecast) {
    const l = scabLevel(s.hours, s.meanTemp);
    if (LEVEL_RANK[l] > LEVEL_RANK[level]) level = l;
  }
  const scabInfo = SCAB_STYLE[level];
  const nextSpell = forecast[0];

  // Soil moisture 0–7 cm as a readable percent (Open-Meteo gives m³/m³).
  const soilPct = data?.soilMoisture ? Math.round(data.soilMoisture.value * 100) : null;
  const soilStyle =
    soilPct == null ? null : soilPct < 15
      ? { chip: 'bg-rose-50 text-rose-800 ring-rose-200', note: 'Topsoil is dry — plan irrigation.' }
      : soilPct < 28
        ? { chip: 'bg-amber-50 text-amber-800 ring-amber-200', note: 'Topsoil moisture is moderate.' }
        : { chip: 'bg-emerald-50 text-emerald-800 ring-emerald-200', note: 'Topsoil is well supplied.' };

  const spell = nextSpell ? `Next wet spell ${spellWhen(nextSpell.start)}: ${nextSpell.hours} wet hour${nextSpell.hours === 1 ? '' : 's'} around ${Math.round(nextSpell.meanTemp)}°C.` : null;

  return (
    <Panel
      theme={theme}
      title={`Orchard & crop health · ${place}`}
      icon={Leaf}
      action={
        <Btn theme={theme} variant="ghost" size="sm" href="/farmer/orchard-health">
          Scab map & spray log <span aria-hidden>→</span>
        </Btn>
      }
    >
      {approximate && (
        <p className="mb-3 flex items-center gap-1.5 rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-950 ring-1 ring-amber-200">
          <MapPinned className="h-4 w-4 shrink-0" aria-hidden /> Using {spot?.name} weather (nearest station town). Add your village or district in My details for your own orchard.
        </p>
      )}
      {!query && !own ? (
        <p className="text-sm text-slate-600">
          Add your district in <strong>My details</strong> (or press <strong>Use my location</strong> on the home page) to see the scab risk, soil moisture and rain outlook for your orchard.
        </p>
      ) : error ? (
        <p className="text-sm text-slate-600">{error}</p>
      ) : !data ? (
        <p className="flex items-center gap-2 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading orchard weather…</p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className={`rounded-2xl p-4 ring-1 ${seasonInfo.chip}`}>
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide opacity-80"><CalendarDays className="h-4 w-4" aria-hidden /> Season stage</p>
              <p className="mt-1 text-lg font-bold">{seasonInfo.label}</p>
              <p className="mt-1 text-xs leading-relaxed opacity-90">{seasonInfo.note}</p>
            </div>
            <div className={`rounded-2xl p-4 ring-1 ${scabInfo.chip}`}>
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide opacity-80"><CloudRain className="h-4 w-4" aria-hidden /> Scab risk · next 4 days</p>
              <p className="mt-1 text-lg font-bold">{scabInfo.label}</p>
              <p className="mt-1 text-xs leading-relaxed opacity-90">{scabInfo.note}</p>
            </div>
            <div className={`rounded-2xl p-4 ring-1 ${soilStyle ? soilStyle.chip : 'bg-slate-50 text-slate-700 ring-slate-200'}`}>
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide opacity-80"><Droplets className="h-4 w-4" aria-hidden /> Soil moisture · 0–7 cm</p>
              <p className="mt-1 text-lg font-bold">{soilPct == null ? 'Not available' : `${soilPct}%`}</p>
              <p className="mt-1 text-xs leading-relaxed opacity-90">{soilStyle ? soilStyle.note : 'The weather source has no soil reading for this place right now.'}</p>
            </div>
          </div>

          {spell && <p className="mt-3 text-xs font-medium text-slate-600">{spell}</p>}

          {data.spells.length > 0 && (
            <div className="mt-4">
              <p className="mb-1 text-xs font-semibold text-slate-500">Rain & wet spells — past 3 days and the next 4 (Open-Meteo)</p>
              <RainChart days={spellDays(data.spells)} />
            </div>
          )}

          <p className="mt-3 text-xs text-slate-500">
            Scab risk from the leaf-wetness (Mills) model on Open-Meteo hourly weather · <Link href="/farmer/season-planner" className="font-semibold text-emerald-800 underline">Season planner</Link> for tasks and costs.
          </p>
        </>
      )}
    </Panel>
  );
}

/** "Thu 2 pm" from an ISO spell start, in the viewer's own clock. */
function spellWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'soon';
  return d.toLocaleString('en-IN', { weekday: 'short', hour: 'numeric', minute: '2-digit' });
}

interface SpellDay {
  key: string;
  label: string;
  rain: number;
  hours: number;
  past: boolean;
}

/** One column per calendar day the spells touch, past days before forecast ones. */
function spellDays(spells: WetSpell[]): SpellDay[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const byDay = new Map<string, SpellDay>();
  for (const s of spells) {
    const d = new Date(s.start);
    if (Number.isNaN(d.getTime())) continue;
    d.setHours(0, 0, 0, 0);
    const key = d.toISOString().slice(0, 10);
    const day = byDay.get(key) ?? {
      key,
      label: d.toLocaleDateString('en-IN', { weekday: 'short' }),
      rain: 0,
      hours: 0,
      past: d.getTime() < today.getTime(),
    };
    day.rain += s.rainMm;
    day.hours += s.hours;
    byDay.set(key, day);
  }
  return [...byDay.values()].sort((a, b) => (a.key < b.key ? -1 : 1)).slice(-7);
}

/** Compact SVG bar chart: bar height = rain mm, caption = leaf-wetness hours. */
function RainChart({ days }: { days: SpellDay[] }) {
  if (days.length === 0) return null;
  const W = 280;
  const H = 96;
  const colW = W / days.length;
  const chartTop = 10;
  const base = H - 22;
  const max = Math.max(10, ...days.map((d) => d.rain));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Rain in millimetres and leaf-wetness hours per day">
      {days.map((d, i) => {
        const h = Math.round(((base - chartTop) * d.rain) / max);
        const x = i * colW + colW * 0.18;
        const bw = colW * 0.64;
        const y = base - h;
        return (
          <g key={d.key}>
            {d.rain > 0 && (
              <rect x={x} y={y} width={bw} height={h} rx={3} fill={d.past ? '#94A3B8' : '#059669'} opacity={d.past ? 0.7 : 1}>
                <title>{`${d.label}: ${d.rain.toFixed(1)} mm, ${d.hours} wet hour${d.hours === 1 ? '' : 's'}${d.past ? ' (past)' : ' (forecast)'}`}</title>
              </rect>
            )}
            <text x={x + bw / 2} y={base + 13} textAnchor="middle" className="fill-slate-500" fontSize="9">{d.label}</text>
            <text x={x + bw / 2} y={base + 3} textAnchor="middle" fontSize="8" className="fill-slate-400">{d.hours > 0 ? `${d.hours} h` : ''}</text>
          </g>
        );
      })}
      <line x1={0} y1={base} x2={W} y2={base} stroke="#CBD5E1" strokeWidth={1} />
      <text x={2} y={9} fontSize="8" className="fill-slate-400">mm · grey = past, green = forecast</text>
    </svg>
  );
}
