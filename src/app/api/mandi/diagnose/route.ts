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

interface Probe {
  ask: string;
  status?: number | string;
  total?: unknown;
  rows?: number;
  states?: string[];
  commodities?: string[];
  newest?: string;
  fields?: string[];
}

/** What one data.gov.in list holds for one question: how many rows, which states and dates, which fields. */
async function probe(resource: string, ask: string, filters: Record<string, string>): Promise<Probe> {
  const key = process.env.DATA_GOV_IN_API_KEY?.trim();
  if (!key) return { ask, status: 'no DATA_GOV_IN_API_KEY' };
  const p = new URLSearchParams({ 'api-key': key, format: 'json', limit: '500', offset: '0', ...filters });
  try {
    const res = await govFetch(`https://api.data.gov.in/resource/${resource}?${p}`, { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible; KashRoot/1.0)' }, 12_000, 0);
    if (!res.ok) return { ask, status: res.status };
    const json = (await res.json()) as { total?: unknown; records?: Record<string, unknown>[] };
    const records = json.records ?? [];
    const pick = (r: Record<string, unknown>, name: string) => String(r[name] ?? r[name.toLowerCase()] ?? r[name.toUpperCase()] ?? '');
    const uniq = (name: string) => [...new Set(records.map((r) => pick(r, name)).filter(Boolean))].sort();
    const dates = records.map((r) => pick(r, 'arrival_date')).filter(Boolean);
    return {
      ask,
      status: res.status,
      total: json.total,
      rows: records.length,
      states: uniq('state').slice(0, 40),
      commodities: uniq('commodity').slice(0, 12),
      newest: dates.map((d) => d.split('/').reverse().join('-')).sort().at(-1),
      fields: records[0] ? Object.keys(records[0]) : undefined,
    };
  } catch (err) {
    return { ask, status: err instanceof Error ? err.message.slice(0, 120) : 'failed' };
  }
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
  let combined: unknown;
  try {
    const r = await fetchMandiPrices({ commodity, state, limit: 5 });
    combined = { source: r.source, rows: r.records.length, agmarknet: r.agmarknet, stale: r.stale ?? false, sample: r.records.slice(0, 3) };
  } catch (err) {
    combined = { error: err instanceof Error ? err.message : String(err) };
  }
  return NextResponse.json({ region: process.env.VERCEL_REGION ?? 'local', agmarknet, dataGov: Object.fromEntries(dataGov), combined }, { headers: { 'cache-control': 'no-store' } });
}
