/**
 * GET /api/mandi/diagnose?commodity=Apple&state=Jammu and Kashmir
 * Shows what the government price sources answer from this server right
 * now, so a failing mandi board can be traced. Public data only: the
 * data.gov.in key is used to ask but never shown.
 */
import { NextResponse } from 'next/server';

import { MANDI_RESOURCE } from '@/lib/mandi-shared';
import { diagnoseAgmarknet } from '@/lib/server/agmarknet';
import { govFetch } from '@/lib/server/govFetch';
import { fetchMandiPrices } from '@/lib/server/mandi';
import { ipLimited, tooMany } from '@/lib/server/sign';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** data.gov.in's other daily price list ("Variety-wise Daily Market Prices Data of Commodity"). */
const VARIETY_RESOURCE = '35985678-0d79-46b4-9ed6-6f13308a1d24';

interface Answer {
  status: number | string;
  total?: unknown;
  records: Record<string, unknown>[];
}

/** One question to one data.gov.in list (never cached, so it shows what the list holds now). */
async function ask(resource: string, filters: Record<string, string>, limit = 500, offset = 0): Promise<Answer> {
  const key = process.env.DATA_GOV_IN_API_KEY?.trim();
  if (!key) return { status: 'no DATA_GOV_IN_API_KEY', records: [] };
  const p = new URLSearchParams({ 'api-key': key, format: 'json', limit: String(limit), offset: String(offset), ...filters });
  try {
    const res = await govFetch(`https://api.data.gov.in/resource/${resource}?${p}`, { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible; KashRoot/1.0)' }, 12_000, 0);
    if (!res.ok) return { status: res.status, records: [] };
    const json = (await res.json()) as { total?: unknown; records?: Record<string, unknown>[] };
    return { status: res.status, total: json.total, records: json.records ?? [] };
  } catch (err) {
    return { status: err instanceof Error ? err.message.slice(0, 120) : 'failed', records: [] };
  }
}

/** A field whatever its capitals ("arrival_date" in one list, "Arrival_Date" in the other). */
const field = (r: Record<string, unknown>, name: string) => String(Object.entries(r).find(([k]) => k.toLowerCase() === name)?.[1] ?? '');

/** What one list holds for one question: how many rows, which states and dates, which fields. */
async function probe(resource: string, ask_: string, filters: Record<string, string>) {
  const a = await ask(resource, filters);
  const uniq = (name: string) => [...new Set(a.records.map((r) => field(r, name)).filter(Boolean))].sort();
  return {
    ask: ask_,
    status: a.status,
    total: a.total,
    rows: a.records.length,
    states: uniq('state').slice(0, 40),
    commodities: uniq('commodity').slice(0, 12),
    dates: uniq('arrival_date').slice(-5),
    fields: a.records[0] ? Object.keys(a.records[0]) : undefined,
  };
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * How recent the big "variety-wise" list is for one crop in one state: its first and last rows as the list
 * orders them, and how many rows it has for each of the last 10 days (in the date spellings it might use).
 */
async function recency(resource: string, filters: Record<string, string>) {
  const first = await ask(resource, filters, 2, 0);
  const total = Number(first.total) || 0;
  const last = total > 3 ? await ask(resource, filters, 3, total - 3) : { status: 'too few rows', records: [] as Record<string, unknown>[] };
  const days = Array.from({ length: 10 }, (_, i) => new Date(Date.now() + 5.5 * 3600_000 - i * 86_400_000));
  const perDay = await Promise.all(
    days.map(async (d) => {
      const [y, m, dd] = [d.getUTCFullYear(), pad(d.getUTCMonth() + 1), pad(d.getUTCDate())];
      const spellings = { 'dd/mm/yyyy': `${dd}/${m}/${y}`, 'yyyy-mm-dd': `${y}-${m}-${dd}` };
      const counts = await Promise.all(Object.values(spellings).map(async (v) => (await ask(resource, { ...filters, 'filters[arrival_date]': v }, 1)).total));
      return { day: `${y}-${m}-${dd}`, ...Object.fromEntries(Object.keys(spellings).map((k, i) => [k, counts[i]])) };
    }),
  );
  return { total, first: first.records, last: last.records, perDay };
}

export async function GET(request: Request) {
  if (ipLimited(request, 'mandi-diagnose', 5)) return tooMany();
  const q = new URL(request.url).searchParams;
  const commodity = q.get('commodity')?.slice(0, 40) || 'Apple';
  const state = q.get('state')?.slice(0, 40) || 'Jammu and Kashmir';
  const agmarknet = await diagnoseAgmarknet(commodity, state);
  const asks: [string, Record<string, string>][] = [
    ['everything', {}],
    [commodity, { 'filters[commodity]': commodity }],
    [state, { 'filters[state.keyword]': state }],
    [`${commodity} in ${state}`, { 'filters[commodity]': commodity, 'filters[state.keyword]': state }],
  ];
  const dataGov = await Promise.all(
    [
      ['daily', MANDI_RESOURCE],
      ['variety', VARIETY_RESOURCE],
    ].map(async ([name, id]) => [name, await Promise.all(asks.map(([ask, f]) => probe(id, ask, f)))] as const),
  );
  const wanted = { 'filters[commodity]': commodity, 'filters[state.keyword]': state };
  const recent = await recency(VARIETY_RESOURCE, wanted);
  let combined: unknown;
  try {
    const r = await fetchMandiPrices({ commodity, state, limit: 5 });
    combined = { source: r.source, rows: r.records.length, agmarknet: r.agmarknet, stale: r.stale ?? false, sample: r.records.slice(0, 3) };
  } catch (err) {
    combined = { error: err instanceof Error ? err.message : String(err) };
  }
  return NextResponse.json({ region: process.env.VERCEL_REGION ?? 'local', agmarknet, dataGov: Object.fromEntries(dataGov), recent: { resource: 'variety', ...recent }, combined }, { headers: { 'cache-control': 'no-store' } });
}
