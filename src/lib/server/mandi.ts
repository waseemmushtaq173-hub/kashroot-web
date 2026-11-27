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

import { MANDI_SAMPLE_KEY, mandiUrl, narrowMandi, parseMandi, recentOnly, titleCase, type MandiQuery, type MandiRecord } from '@/lib/mandi-shared';
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
  /** The feeds had nothing (or did not answer): these are the last good reports, read at fetchedAt, each with its own date. */
  stale?: boolean;
  /**
   * Whether Agmarknet's own price service could be read: "captcha" when it asks every visitor to solve a CAPTCHA
   * (so no website can read it), "down" when it did not answer. Lets the page say why a list is short or empty
   * instead of claiming no mandi reported.
   */
  agmarknet?: 'ok' | 'captcha' | 'down';
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
  const wide: MandiQuery = { state: titleCase(query.state), commodity: titleCase(query.commodity), limit: Math.max(query.limit ?? 2000, 2000) };
  const result = await stateWideOrLast(wide);
  if (!query.district?.trim() && !query.market?.trim()) return result;
  const n = narrowMandi(result.records, query.district, query.market, wide.state);
  return { ...result, records: n.records, total: n.records.length, widened: n.widened };
}

/**
 * The state's reports. When both feeds are down, or have nothing for this crop, the last good reports for the
 * same state and crop that are still recent (lib/server/lastGood) — each keeps its own arrival date, and the answer
 * says it is a kept copy. An empty answer is never kept: it would wipe out the last good reports.
 */
async function stateWideOrLast(query: MandiQuery): Promise<MandiResult> {
  const key = `mandi:${query.state || 'all'}|${query.commodity || 'all'}`;
  let live: MandiResult | undefined;
  let failure: unknown;
  try {
    live = await fetchStateWide(query);
  } catch (err) {
    failure = err;
  }
  if (live?.records.length) {
    // A partial all-India answer is not kept: it would hide the states it missed.
    if (!live.partial) keepGood(key, live, live.fetchedAt);
    return live;
  }
  const kept = await lastGood<MandiResult>(key);
  const earlier = kept && Date.now() - Date.parse(kept.fetchedAt) <= MANDI_KEEP_MS ? recentOnly(kept.body.records, 7) : [];
  if (kept && earlier.length) {
    return { ...kept.body, records: earlier, total: earlier.length, fetchedAt: kept.fetchedAt, stale: true, agmarknet: live?.agmarknet ?? kept.body.agmarknet };
  }
  if (live) return live;
  throw failure;
}

/** Agmarknet asks every visitor to solve a CAPTCHA: no website can read it, so do not ask again for a while. */
let captchaUntil = 0;
const CAPTCHA_PAUSE_MS = 30 * 60_000;

async function fetchStateWide(query: MandiQuery): Promise<MandiResult> {
  // 1. Agmarknet 2.0 directly (unless it was found to be behind a CAPTCHA a moment ago).
  let firstFailure = '';
  let agmarknet: NonNullable<MandiResult['agmarknet']> = 'ok';
  if (Date.now() < captchaUntil) {
    agmarknet = 'captcha';
  } else {
    try {
      const a = await fetchAgmarknet(query);
      if (a.records.length || !process.env.DATA_GOV_IN_API_KEY) {
        return { records: a.records, total: a.records.length, usingSampleKey: false, fetchedAt: new Date().toISOString(), source: 'Agmarknet (agmarknet.gov.in)', partial: a.partial, agmarknet };
      }
    } catch (err) {
      firstFailure = `Agmarknet: ${[err instanceof Error ? err.message : String(err), causeCode(err)].filter(Boolean).join(' · ')}`;
      if (/captcha/i.test(firstFailure)) {
        agmarknet = 'captcha';
        captchaUntil = Date.now() + CAPTCHA_PAUSE_MS;
      } else {
        agmarknet = 'down';
      }
      console.error(firstFailure);
    }
  }
  // 2. data.gov.in as the backup.
  try {
    return { ...(await fetchDataGovIn(query)), agmarknet };
  } catch (err) {
    if (err instanceof MandiError && firstFailure) err.message = `${firstFailure} · ${err.message}`;
    throw err;
  }
}

/** One data.gov.in request (with one retry on a timeout, network error or 5xx), as parsed JSON. */
async function readDataGovIn(query: MandiQuery, key: string | undefined): Promise<{ records?: Record<string, unknown>[]; total?: number | string }> {
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
  return (await res.json()) as { records?: Record<string, unknown>[]; total?: number | string };
}

async function fetchDataGovIn(query: MandiQuery): Promise<MandiResult> {
  const key = process.env.DATA_GOV_IN_API_KEY?.trim();
  // The feed matches a state only letter for letter ("Keralam", not "Kerala"; "Uttarakhand", not "Uttrakhand"), and one
  // crop's whole list is a few hundred rows. So with a crop chosen, ask by crop alone and pick the state here.
  const byCrop = Boolean(query.commodity?.trim() && query.state?.trim());
  let json = await readDataGovIn(byCrop ? { ...query, state: undefined } : query, key);
  let narrowedHere = byCrop;
  if (byCrop && Number(json.total ?? 0) > (json.records?.length ?? 0)) {
    // The crop's list was cut short: ask for the state exactly instead.
    json = await readDataGovIn(query, key);
    narrowedHere = false;
  }

  const records = parseMandi(json, query);

  return {
    records,
    total: narrowedHere ? records.length : Number(json.total ?? records.length) || records.length,
    usingSampleKey: !key,
    fetchedAt: new Date().toISOString(),
    source: 'Agmarknet via data.gov.in',
  };
}
