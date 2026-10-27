/**
 * Agmarknet daily mandi prices. Server-only. Two government sources, tried in
 * order:
 *   1. Agmarknet 2.0's own API (api.agmarknet.gov.in, no key) — see agmarknet.ts;
 *   2. data.gov.in (resource "Current Daily Price of Various Commodities from
 *      Various Markets (Mandi)"). Key: DATA_GOV_IN_API_KEY (free at
 *      data.gov.in → My Account); without it the public sample key is used,
 *      which data.gov.in limits to a handful of rows.
 *
 * Prices are Rs per quintal (100 kg), as published. Nothing is invented: when
 * the feed has no rows the caller gets an empty list and says so.
 */
import 'server-only';

import { MANDI_SAMPLE_KEY, mandiUrl, narrowMandi, parseMandi, titleCase, type MandiQuery, type MandiRecord } from '@/lib/mandi-shared';
import { fetchAgmarknet } from '@/lib/server/agmarknet';
import { causeCode, govFetch, type GovResponse } from '@/lib/server/govFetch';
import { keepGood, lastGood } from '@/lib/server/lastGood';

export type { MandiQuery, MandiRecord };

/** Why the feed could not be read: the route turns this into plain words. */
export class MandiError extends Error {
  constructor(
    public kind: 'timeout' | 'network' | 'key' | 'upstream',
    message: string,
  ) {
    super(message);
  }
}

export interface MandiResult {
  records: MandiRecord[];
  total: number;
  usingSampleKey: boolean;
  fetchedAt: string;
  source: string;
  /** Some states were not read in time (all-India search): ask again for the rest. */
  partial?: boolean;
  /** The exact district/market had no report today; a wider area is shown. */
  widened?: string;
  /** Agmarknet and data.gov.in did not answer: these are the last good reports, read at fetchedAt. */
  stale?: boolean;
}

/** Older kept reports than this are not shown in place of today's. */
const MANDI_KEEP_MS = 7 * 24 * 3600_000;

/**
 * Prices for a state + crop, then narrowed to the district and market here:
 * the government feeds only match names spelt exactly as they store them
 * ("Anantnag", not "anantnag"), so the whole state is read and matched
 * loosely. If the mandi asked for did not report today, nearby mandis are
 * shown with a note instead of an empty page.
 */
export async function fetchMandiPrices(query: MandiQuery): Promise<MandiResult> {
  const wide: MandiQuery = { state: titleCase(query.state), commodity: titleCase(query.commodity), limit: Math.max(query.limit ?? 1000, 1000) };
  const result = await stateWideOrLast(wide);
  if (!query.district?.trim() && !query.market?.trim()) return result;
  const n = narrowMandi(result.records, query.district, query.market, wide.state);
  return { ...result, records: n.records, total: n.records.length, widened: n.widened };
}

/** The state's reports; when both feeds are down, the last good ones for the same state and crop (lib/server/lastGood). */
async function stateWideOrLast(query: MandiQuery): Promise<MandiResult> {
  const key = `mandi:${query.state || 'all'}|${query.commodity || 'all'}`;
  try {
    const live = await fetchStateWide(query);
    // A partial all-India answer is not kept: it would hide the states it missed.
    if (!live.partial) keepGood(key, live, live.fetchedAt);
    return live;
  } catch (err) {
    const kept = await lastGood<MandiResult>(key);
    if (!kept || Date.now() - Date.parse(kept.fetchedAt) > MANDI_KEEP_MS) throw err;
    return { ...kept.body, fetchedAt: kept.fetchedAt, stale: true };
  }
}

async function fetchStateWide(query: MandiQuery): Promise<MandiResult> {
  // 1. Agmarknet 2.0 directly.
  let firstFailure = '';
  try {
    const a = await fetchAgmarknet(query);
    if (a.records.length || !process.env.DATA_GOV_IN_API_KEY) {
      return { records: a.records, total: a.records.length, usingSampleKey: false, fetchedAt: new Date().toISOString(), source: 'Agmarknet (agmarknet.gov.in)', partial: a.partial };
    }
  } catch (err) {
    firstFailure = `Agmarknet: ${[err instanceof Error ? err.message : String(err), causeCode(err)].filter(Boolean).join(' · ')}`;
    console.error(firstFailure);
  }
  // 2. data.gov.in as the backup.
  try {
    return await fetchDataGovIn(query);
  } catch (err) {
    if (err instanceof MandiError && firstFailure) err.message = `${firstFailure} · ${err.message}`;
    throw err;
  }
}

async function fetchDataGovIn(query: MandiQuery): Promise<MandiResult> {
  const key = process.env.DATA_GOV_IN_API_KEY?.trim();
  const url = mandiUrl(query, key || MANDI_SAMPLE_KEY);
  // data.gov.in is often slow and occasionally drops a request: one retry on
  // a timeout, network error or 5xx, inside the route's time limit.
  let res: GovResponse | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      res = await govFetch(url, { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible; KashRoot/1.0; +https://kashroot-web.vercel.app)' }, 12_000);
      if (res.status < 500) break;
    } catch (err) {
      if (attempt === 1) {
        // fetch() hides the real reason in `cause` (e.g. a certificate or reset error).
        const cause = (err as { cause?: { code?: string; message?: string } })?.cause;
        const why = ['data.gov.in:', err instanceof Error ? err.message : String(err), cause?.code, cause?.message].filter(Boolean).join(' · ');
        throw new MandiError(err instanceof Error && err.name === 'TimeoutError' ? 'timeout' : 'network', why);
      }
    }
  }
  if (!res) throw new MandiError('network', 'No response');
  if (res.status === 401 || res.status === 403) throw new MandiError('key', `data.gov.in answered ${res.status}`);
  if (!res.ok) throw new MandiError('upstream', `data.gov.in answered ${res.status}`);
  const json = (await res.json()) as { records?: Record<string, unknown>[]; total?: number | string };

  const records = parseMandi(json, query);

  return {
    records,
    total: Number(json.total ?? records.length) || records.length,
    usingSampleKey: !key,
    fetchedAt: new Date().toISOString(),
    source: 'Agmarknet via data.gov.in',
  };
}
