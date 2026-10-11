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
const HEADERS: Record<string, string> = {
  Accept: 'application/json, text/plain, */*',
  'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36',
  Referer: 'https://agmarknet.gov.in/',
  Origin: 'https://agmarknet.gov.in',
};
/** Plain headers, as other working clients of this API send. */
const PLAIN_HEADERS: Record<string, string> = {
  Accept: 'application/json',
  'User-Agent': 'KashRoot/1.0 (+https://kashroot-web.vercel.app)',
};

export class AgmarknetError extends Error {}

interface Catalog {
  states: { id: number; name: string }[];
  districts: Map<number, string>;
  markets: { name: string; stateId: number; districtId: number }[];
  /** A crop can have a different id in the filters list and the commodities list: keep both. */
  commodities: { ids: number[]; name: string }[];
  at: number;
}
let cache: Catalog | null = null;

const norm = (v: string) => v.toLowerCase().replace(/&/g, 'and').replace(/[^a-z]/g, '');

async function get<T>(path: string, timeout = 12_000): Promise<T> {
  let res = await govFetch(`${API}/${path}`, PLAIN_HEADERS, timeout);
  // A 4xx can depend on the headers: ask again the way the Agmarknet website does.
  if (res.status >= 400 && res.status < 500) {
    const first = await res.text().catch(() => '');
    res = await govFetch(`${API}/${path}`, HEADERS, timeout);
    if (!res.ok) {
      const second = await res.text().catch(() => '');
      throw new AgmarknetError(`Agmarknet answered ${res.status} for ${path.split('?')[0]}: ${(second || first).replace(/\s+/g, ' ').slice(0, 300)}`);
    }
  }
  if (!res.ok) throw new AgmarknetError(`Agmarknet answered ${res.status} for ${path.split('?')[0]}: ${(await res.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 300)}`);
  return (await res.json()) as T;
}

/** For /api/mandi/diagnose: what the filters list contains (keys and one sample of each). */
export async function filtersShape(): Promise<Record<string, unknown>> {
  const raw = await get<Record<string, unknown>>('daily-price-arrival/filters');
  const f = (raw.state_data ? raw : (raw.data as Record<string, unknown>) ?? {}) as Record<string, unknown>;
  return Object.fromEntries(Object.entries(f).map(([k, v]) => [k, Array.isArray(v) ? { count: v.length, first: v[0] } : typeof v]));
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
  const commodities: { ids: number[]; name: string }[] = [];
  const add = (id: number, name: string) => {
    if (!Number.isFinite(id) || !name) return;
    const known = commodities.find((c) => norm(c.name) === norm(name));
    if (!known) commodities.push({ ids: [id], name });
    else if (!known.ids.includes(id)) known.ids.push(id);
  };
  // Crops in the filters list (the ids other working clients send)…
  for (const list of Object.values(f as Record<string, unknown>)) {
    if (!Array.isArray(list) || !list.length || typeof list[0] !== 'object') continue;
    const sample = list[0] as Record<string, unknown>;
    const nameKey = Object.keys(sample).find((k) => /cmdt.*name|commodity.*name/i.test(k));
    const idKey = Object.keys(sample).find((k) => /^(cmdt_?id|commodity_?id)$/i.test(k)) ?? (nameKey ? Object.keys(sample).find((k) => k === 'id') : undefined);
    if (!nameKey || !idKey) continue;
    for (const c of list as Record<string, unknown>[]) add(Number(c[idKey]), String(c[nameKey] ?? ''));
    break;
  }
  // …and in the commodities list.
  let path: string | null = 'commodities?page_size=500';
  for (let page = 0; path && page < 6; page++) {
    let r: { results?: Record<string, unknown>[]; data?: Record<string, unknown>[]; next_page?: string | null; next?: string | null };
    try {
      r = await get(path);
    } catch (err) {
      if (commodities.length) break;
      throw err;
    }
    for (const c of r.results ?? r.data ?? []) {
      add(Number(c.id), String(c.cmdt_name ?? ''));
      if (c.cmdt_id !== undefined) add(Number(c.cmdt_id), String(c.cmdt_name ?? ''));
    }
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

/** The crop id Agmarknet accepted last time, per crop name: tried first. */
const acceptedId = new Map<string, number>();

async function monthReport(year: number, month: number, stateId: number, commodityIds: number[], crop = ''): Promise<Report> {
  const tried: string[] = [];
  const known = acceptedId.get(crop);
  const ids = known !== undefined ? [known, ...commodityIds.filter((i) => i !== known)] : commodityIds;
  for (const commodityId of ids) {
    const q = new URLSearchParams({ year: String(year), month: String(month), stateId: String(stateId), commodityId: String(commodityId), includeExcel: 'false' });
    try {
      const raw = await get<Report>(`prices-and-arrivals/date-wise/specific-commodity?${q}`, 15_000);
      if (crop) acceptedId.set(crop, commodityId);
      return raw.markets || raw.columns ? raw : raw.data ?? raw;
    } catch (err) {
      tried.push(`commodityId ${commodityId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  throw new AgmarknetError(tried.join(' | '));
}

/** Prices for one commodity — in one state, or in every state when none is chosen —
 * as the latest report from each mandi (and variety), newest first (₹ per quintal). */
export async function fetchAgmarknet(query: MandiQuery): Promise<{ records: MandiRecord[]; states: string[]; partial: boolean }> {
  const cat = await catalog();
  const commodity = match(cat.commodities, query.commodity || 'Apple');
  if (!commodity) throw new AgmarknetError(`Agmarknet has no commodity called ${query.commodity}`);
  let states: { id: number; name: string }[];
  if (query.state) {
    const one = match(cat.states, query.state);
    if (!one) throw new AgmarknetError(`Agmarknet has no state called ${query.state}`);
    states = [one];
  } else {
    // Every state; Jammu and Kashmir first, as it also tells us early whether
    // Agmarknet accepts the request at all.
    const jk = match(cat.states, 'Jammu and Kashmir');
    states = jk ? [jk, ...cat.states.filter((x) => x.id !== jk.id)] : [...cat.states];
  }

  const now = new Date(Date.now() + 5.5 * 3600_000); // IST
  const thisMonth = { y: now.getUTCFullYear(), m: now.getUTCMonth() + 1 };
  const lastMonth = { y: now.getUTCMonth() === 0 ? now.getUTCFullYear() - 1 : now.getUTCFullYear(), m: now.getUTCMonth() === 0 ? 12 : now.getUTCMonth() };
  // Early in the month the new month has few reports: also read last month.
  const alsoLastMonth = states.length === 1 || now.getUTCDate() <= 10;

  const records: MandiRecord[] = [];
  const failures: string[] = [];
  let answered = false;

  const readState = async (state: { id: number; name: string }) => {
    for (const { y, m } of alsoLastMonth ? [thisMonth, lastMonth] : [thisMonth]) {
      let report: Report;
      try {
        report = await monthReport(y, m, state.id, commodity.ids, commodity.name);
      } catch (err) {
        failures.push(`${state.name} ${m}/${y}: ${err instanceof Error ? err.message : String(err)}`);
        continue;
      }
      answered = true;
      if (report.success === false) continue;
      const before = records.length;
      const cols = report.columns ?? [];
      const keyFor = (re: RegExp, fallback: string) => cols.find((c) => re.test(c.title ?? '') || re.test(c.key ?? ''))?.key ?? fallback;
      const kMin = keyFor(/min/i, 'minimumPrice');
      const kMax = keyFor(/max/i, 'maximumPrice');
      const kModal = keyFor(/modal/i, 'modalPrice');
      const kGrade = keyFor(/grade/i, 'grade');
      for (const market of report.markets ?? []) {
        const mk = cat.markets.find((x) => x.stateId === state.id && norm(x.name) === norm(market.marketName));
        const district = mk ? cat.districts.get(mk.districtId) ?? '' : '';
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
      if (records.length > before) break; // this month has reports: last month not needed
    }
  };

  // The first state alone: if Agmarknet refuses it, the request itself is wrong —
  // stop and say why instead of asking 36 more times.
  await readState(states[0]);
  if (!answered) throw new AgmarknetError(`Agmarknet refused the price report — ${failures[0] ?? 'no reply'}`.slice(0, 600));

  // The rest, six at a time, within the route's time limit.
  const deadline = Date.now() + 35_000;
  let next = 1;
  let partial = false;
  const worker = async () => {
    while (next < states.length) {
      if (Date.now() > deadline) {
        partial = true;
        return;
      }
      await readState(states[next++]);
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));

  // One row per mandi and variety: its latest report.
  records.sort((a, b) => b.arrivalDate.localeCompare(a.arrivalDate));
  const seen = new Set<string>();
  const latest = records.filter((r) => {
    const k = `${r.state}|${r.market}|${r.variety}|${r.grade}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  latest.sort((a, b) => a.state.localeCompare(b.state) || a.market.localeCompare(b.market) || b.arrivalDate.localeCompare(a.arrivalDate));
  return { records: latest.slice(0, Math.min(query.limit ?? 1000, 2000)), states: states.map((x) => x.name), partial };
}

/** What Agmarknet answers right now, for /api/mandi/diagnose (no secrets involved). */
export async function diagnoseAgmarknet(commodityName = 'Apple', stateName = 'Jammu and Kashmir') {
  const steps: Record<string, unknown> = {};
  try {
    const cat = await catalog();
    steps.catalogue = { states: cat.states.length, markets: cat.markets.length, commodities: cat.commodities.length };
    steps.filters = await filtersShape().catch((e) => String(e));
    const c = match(cat.commodities, commodityName);
    const s = match(cat.states, stateName);
    steps.matched = { commodity: c ?? null, state: s ?? null };
    if (c && s) {
      const now = new Date();
      const r = await monthReport(now.getFullYear(), now.getMonth() + 1, s.id, c.ids, c.name);
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
