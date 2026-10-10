/**
 * Agmarknet daily mandi prices from the Government of India open data API
 * (data.gov.in, resource "Current Daily Price of Various Commodities from
 * Various Markets (Mandi)"). Server-only.
 *
 * Key: DATA_GOV_IN_API_KEY (free at data.gov.in → My Account). Without it the
 * public sample key is used, which data.gov.in limits to a handful of rows.
 *
 * Prices are Rs per quintal (100 kg), as published. Nothing is invented: when
 * the feed has no rows the caller gets an empty list and says so.
 */
import 'server-only';

const RESOURCE = '9ef84268-d588-465a-a308-a864a43d0070';
const SAMPLE_KEY = '579b464db66ec23bdd000001cdd3946e44ce4aad7209ff7b23ac571b';

/** Why the feed could not be read: the route turns this into plain words. */
export class MandiError extends Error {
  constructor(
    public kind: 'timeout' | 'network' | 'key' | 'upstream',
    message: string,
  ) {
    super(message);
  }
}

export interface MandiRecord {
  state: string;
  district: string;
  market: string;
  commodity: string;
  variety: string;
  grade: string;
  /** ISO YYYY-MM-DD. */
  arrivalDate: string;
  minPrice: number;
  maxPrice: number;
  modalPrice: number;
}

export interface MandiQuery {
  state?: string;
  district?: string;
  market?: string;
  commodity?: string;
  limit?: number;
}

export interface MandiResult {
  records: MandiRecord[];
  total: number;
  usingSampleKey: boolean;
  fetchedAt: string;
  source: string;
}

/** "07/10/2026" → "2026-10-07". */
function isoDate(ddmmyyyy: string): string {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(ddmmyyyy?.trim() ?? '');
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : ddmmyyyy;
}

const num = (v: unknown) => {
  const n = Number(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};

const clean = (v: string | undefined) => v?.trim().replace(/\s+/g, ' ') || undefined;

export async function fetchMandiPrices(query: MandiQuery): Promise<MandiResult> {
  const key = process.env.DATA_GOV_IN_API_KEY?.trim();
  const params = new URLSearchParams({
    'api-key': key || SAMPLE_KEY,
    format: 'json',
    limit: String(Math.min(Math.max(query.limit ?? 200, 1), 1000)),
    offset: '0',
  });
  // The state field needs the ".keyword" form; plain keys work for the rest.
  const state = clean(query.state);
  const district = clean(query.district);
  const market = clean(query.market);
  const commodity = clean(query.commodity);
  if (state) params.set('filters[state.keyword]', state);
  if (district) params.set('filters[district]', district);
  if (market) params.set('filters[market]', market);
  if (commodity) params.set('filters[commodity]', commodity);

  const url = `https://api.data.gov.in/resource/${RESOURCE}?${params}`;
  // data.gov.in is often slow and occasionally drops a request: wait longer,
  // and try once more on a timeout, network error or 5xx.
  let res: Response | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      res = await fetch(url, {
        headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible; KashRoot/1.0; +https://kashroot-web.vercel.app)' },
        next: { revalidate: 900 },
        signal: AbortSignal.timeout(22_000),
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

  // data.gov.in silently ignores filters it does not understand, so re-check.
  const norm = (v: string) => v.toLowerCase().replace(/[^a-z]/g, '');
  const same = (a: string, b?: string) => !b || norm(a).includes(norm(b)) || norm(b).includes(norm(a));
  const records = (json.records ?? [])
    .map((r) => ({
      state: String(r.state ?? ''),
      district: String(r.district ?? ''),
      market: String(r.market ?? ''),
      commodity: String(r.commodity ?? ''),
      variety: String(r.variety ?? ''),
      grade: String(r.grade ?? ''),
      arrivalDate: isoDate(String(r.arrival_date ?? '')),
      minPrice: num(r.min_price),
      maxPrice: num(r.max_price),
      modalPrice: num(r.modal_price),
    }))
    .filter((r) => same(r.state, state) && same(r.district, district) && same(r.market, market) && same(r.commodity, commodity))
    .sort((a, b) => b.arrivalDate.localeCompare(a.arrivalDate) || a.market.localeCompare(b.market));

  return {
    records,
    total: Number(json.total ?? records.length) || records.length,
    usingSampleKey: !key,
    fetchedAt: new Date().toISOString(),
    source: 'Agmarknet via data.gov.in',
  };
}
