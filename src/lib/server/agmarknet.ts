/**
 * Agmarknet 2.0 (agmarknet.gov.in, Directorate of Marketing & Inspection,
 * Govt. of India) — the same daily mandi prices data.gov.in republishes,
 * read from the Agmarknet site's own public API (no key). Server-only.
 *
 *   GET /v1/daily-price-arrival/filters        states, districts, markets (ids)
 *   GET /v1/commodities?page_size=500           commodity ids (paginated)
 *   GET /v1/prices-and-arrivals/date-wise/specific-commodity
 *         ?year=&month=&stateId=&commodityId=&includeExcel=false
 *       → { success, title, columns:[{key,title}], markets:[{marketName, dates:[{arrivalDate, data:[{variety, …prices}]}]}] }
 *
 * The API is not formally documented, so this reads it defensively: price
 * columns are found by their titles, and anything unexpected becomes an
 * AgmarknetError rather than wrong numbers.
 */
import 'server-only';

import type { MandiQuery, MandiRecord } from '@/lib/mandi-shared';
import { govFetch } from '@/lib/server/govFetch';

const API = 'https://api.agmarknet.gov.in/v1';
const HEADERS = {
  Accept: 'application/json, text/plain, */*',
  'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36',
  Referer: 'https://agmarknet.gov.in/',
  Origin: 'https://agmarknet.gov.in',
};

export class AgmarknetError extends Error {}

interface Catalog {
  states: { id: number; name: string }[];
  districts: Map<number, string>;
  markets: { name: string; stateId: number; districtId: number }[];
  commodities: { id: number; name: string }[];
  at: number;
}
let cache: Catalog | null = null;

const norm = (v: string) => v.toLowerCase().replace(/&/g, 'and').replace(/[^a-z]/g, '');

async function get<T>(path: string, timeout = 12_000): Promise<T> {
  const res = await govFetch(`${API}/${path}`, HEADERS, timeout);
  if (!res.ok) throw new AgmarknetError(`Agmarknet answered ${res.status} for ${path.split('?')[0]}`);
  return (await res.json()) as T;
}

async function catalog(): Promise<Catalog> {
  if (cache && Date.now() - cache.at < 24 * 3600_000) return cache;
  type Filters = {
    state_data?: { state_id: number; state_name: string }[];
    district_data?: { id: number; state_id: number; district_name: string }[];
    market_data?: { id: number; state_id: number; district_id: number; mkt_name: string }[];
    data?: Filters;
  };
  const raw = await get<Filters>('daily-price-arrival/filters');
  const f = raw.state_data ? raw : raw.data ?? {};
  const commodities: { id: number; name: string }[] = [];
  let path: string | null = 'commodities?page_size=500';
  for (let page = 0; path && page < 6; page++) {
    const r: { results?: { id: number; cmdt_name: string }[]; data?: { id: number; cmdt_name: string }[]; next_page?: string | null; next?: string | null } = await get(path);
    for (const c of r.results ?? r.data ?? []) if (!commodities.some((x) => x.id === c.id)) commodities.push({ id: c.id, name: c.cmdt_name });
    const next = r.next_page ?? r.next ?? null;
    path = next && next.includes('/v1/') ? next.slice(next.indexOf('/v1/') + 4) : null;
  }
  if (!f.state_data?.length || !commodities.length) throw new AgmarknetError('Agmarknet catalogue came back empty');
  cache = {
    states: f.state_data.map((s) => ({ id: s.state_id, name: s.state_name })),
    districts: new Map((f.district_data ?? []).map((d) => [d.id, d.district_name])),
    markets: (f.market_data ?? []).map((m) => ({ name: m.mkt_name, stateId: m.state_id, districtId: m.district_id })),
    commodities,
    at: Date.now(),
  };
  return cache;
}

/** Best catalogue match for a name: exact, then prefix, then contains. */
function match<T extends { name: string }>(list: T[], wanted: string): T | undefined {
  const w = norm(wanted);
  return list.find((x) => norm(x.name) === w) ?? list.find((x) => norm(x.name).startsWith(w)) ?? list.find((x) => norm(x.name).includes(w) || w.includes(norm(x.name)));
}

const num = (v: unknown) => {
  const n = Number(String(v ?? '').replace(/[,₹\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

/** "07-10-2026", "07/10/2026" or "2026-10-07…" → "2026-10-07". */
function isoDate(v: unknown): string {
  const s = String(v ?? '').trim();
  const dmy = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/.exec(s);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  const ymd = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return ymd ? `${ymd[1]}-${ymd[2]}-${ymd[3]}` : s;
}

interface Report {
  success?: boolean;
  message?: string;
  title?: string;
  columns?: { key: string; title: string }[];
  markets?: { marketName: string; dates?: { arrivalDate: string; data?: Record<string, unknown>[] }[] }[];
  data?: Report;
}

async function monthReport(year: number, month: number, stateId: number, commodityId: number): Promise<Report> {
  const q = new URLSearchParams({ year: String(year), month: String(month), stateId: String(stateId), commodityId: String(commodityId), includeExcel: 'false' });
  const raw = await get<Report>(`prices-and-arrivals/date-wise/specific-commodity?${q}`, 15_000);
  return raw.markets || raw.columns ? raw : raw.data ?? raw;
}

/** Prices for one commodity in the given states, newest first (₹ per quintal). */
export async function fetchAgmarknet(query: MandiQuery): Promise<{ records: MandiRecord[]; states: string[] }> {
  const cat = await catalog();
  const commodity = match(cat.commodities, query.commodity || 'Apple');
  if (!commodity) throw new AgmarknetError(`Agmarknet has no commodity called ${query.commodity}`);
  const wantedStates = query.state ? [query.state] : ['Jammu and Kashmir', 'Himachal Pradesh', 'Delhi'];
  const states = wantedStates.map((s) => match(cat.states, s)).filter((s): s is { id: number; name: string } => Boolean(s));
  if (!states.length) throw new AgmarknetError(`Agmarknet has no state called ${query.state}`);

  const now = new Date(Date.now() + 5.5 * 3600_000); // IST
  const months = [
    { y: now.getUTCFullYear(), m: now.getUTCMonth() + 1 },
    { y: now.getUTCMonth() === 0 ? now.getUTCFullYear() - 1 : now.getUTCFullYear(), m: now.getUTCMonth() === 0 ? 12 : now.getUTCMonth() },
  ];

  const records: MandiRecord[] = [];
  let answered = false;
  for (const state of states) {
    for (const { y, m } of months) {
      let report: Report;
      try {
        report = await monthReport(y, m, state.id, commodity.id);
      } catch (err) {
        if (states.length === 1) throw err;
        continue;
      }
      answered = true;
      if (report.success === false) continue;
      const cols = report.columns ?? [];
      const keyFor = (re: RegExp, fallback: string) => cols.find((c) => re.test(c.title ?? '') || re.test(c.key ?? ''))?.key ?? fallback;
      const kMin = keyFor(/min/i, 'minimumPrice');
      const kMax = keyFor(/max/i, 'maximumPrice');
      const kModal = keyFor(/modal/i, 'modalPrice');
      const kGrade = keyFor(/grade/i, 'grade');
      for (const market of report.markets ?? []) {
        const m = cat.markets.find((x) => x.stateId === state.id && norm(x.name) === norm(market.marketName));
        const district = m ? cat.districts.get(m.districtId) ?? '' : '';
        if (query.district && district && !norm(district).includes(norm(query.district))) continue;
        if (query.market && !norm(market.marketName).includes(norm(query.market))) continue;
        for (const day of market.dates ?? []) {
          for (const row of day.data ?? []) {
            const modal = num(row[kModal]);
            if (!modal) continue;
            records.push({
              state: state.name,
              district,
              market: market.marketName,
              commodity: commodity.name,
              variety: String(row.variety ?? ''),
              grade: String(row[kGrade] ?? ''),
              arrivalDate: isoDate(day.arrivalDate),
              minPrice: num(row[kMin]) || modal,
              maxPrice: num(row[kMax]) || modal,
              modalPrice: modal,
            });
          }
        }
      }
      // The current month already has rows: no need for last month.
      if (records.some((r) => r.state === state.name)) break;
    }
  }
  if (!answered) throw new AgmarknetError('Agmarknet did not answer');
  records.sort((a, b) => b.arrivalDate.localeCompare(a.arrivalDate) || a.market.localeCompare(b.market));
  return { records: records.slice(0, Math.min(query.limit ?? 200, 500)), states: states.map((s) => s.name) };
}

/** What Agmarknet answers right now, for /api/mandi/diagnose (no secrets involved). */
export async function diagnoseAgmarknet(commodityName = 'Apple', stateName = 'Jammu and Kashmir') {
  const steps: Record<string, unknown> = {};
  try {
    const cat = await catalog();
    steps.catalogue = { states: cat.states.length, markets: cat.markets.length, commodities: cat.commodities.length };
    const c = match(cat.commodities, commodityName);
    const s = match(cat.states, stateName);
    steps.matched = { commodity: c ?? null, state: s ?? null };
    if (c && s) {
      const now = new Date();
      const r = await monthReport(now.getFullYear(), now.getMonth() + 1, s.id, c.id);
      steps.report = {
        success: r.success,
        title: r.title,
        message: r.message,
        columns: r.columns,
        markets: r.markets?.length ?? 0,
        firstRow: r.markets?.[0]?.dates?.[0] ? { arrivalDate: r.markets[0].dates[0].arrivalDate, row: r.markets[0].dates[0].data?.[0] } : null,
      };
    }
  } catch (err) {
    steps.error = err instanceof Error ? `${err.name}: ${err.message}${(err as { cause?: { code?: string } }).cause?.code ? ` (${(err as { cause?: { code?: string } }).cause!.code})` : ''}` : String(err);
  }
  return steps;
}
