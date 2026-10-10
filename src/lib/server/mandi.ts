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

import { MANDI_SAMPLE_KEY, mandiUrl, parseMandi, type MandiQuery, type MandiRecord } from '@/lib/mandi-shared';
import { fetchAgmarknet } from '@/lib/server/agmarknet';

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
}

export async function fetchMandiPrices(query: MandiQuery): Promise<MandiResult> {
  // 1. Agmarknet 2.0 directly.
  let firstFailure = '';
  try {
    const a = await fetchAgmarknet(query);
    if (a.records.length || !process.env.DATA_GOV_IN_API_KEY) {
      return { records: a.records, total: a.records.length, usingSampleKey: false, fetchedAt: new Date().toISOString(), source: 'Agmarknet (agmarknet.gov.in)' };
    }
  } catch (err) {
    firstFailure = err instanceof Error ? err.message : String(err);
    console.error('Agmarknet 2.0:', firstFailure);
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
  let res: Response | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      res = await fetch(url, {
        headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible; KashRoot/1.0; +https://kashroot-web.vercel.app)' },
        next: { revalidate: 900 },
        signal: AbortSignal.timeout(12_000),
      });
      if (res.status < 500) break;
    } catch (err) {
      if (attempt === 1) {
        // fetch() hides the real reason in `cause` (e.g. a certificate or reset error).
        const cause = (err as { cause?: { code?: string; message?: string } })?.cause;
        const why = [err instanceof Error ? err.message : String(err), cause?.code, cause?.message].filter(Boolean).join(' · ');
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
