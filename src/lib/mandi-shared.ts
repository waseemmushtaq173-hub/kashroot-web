/**
 * Agmarknet (data.gov.in) request building and row parsing, shared by the
 * server route and the in-browser fallback. No secrets here.
 */
export const MANDI_RESOURCE = '9ef84268-d588-465a-a308-a864a43d0070';
/** data.gov.in's published sample key: works for everyone, max 10 rows. */
export const MANDI_SAMPLE_KEY = '579b464db66ec23bdd000001cdd3946e44ce4aad7209ff7b23ac571b';

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

const clean = (v: string | undefined) => v?.trim().replace(/\s+/g, ' ') || undefined;

/** "07/10/2026" → "2026-10-07". */
function isoDate(ddmmyyyy: string): string {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(ddmmyyyy?.trim() ?? '');
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : ddmmyyyy;
}

const num = (v: unknown) => {
  const n = Number(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};

export function mandiUrl(query: MandiQuery, key: string): string {
  const params = new URLSearchParams({
    'api-key': key,
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
  return `https://api.data.gov.in/resource/${MANDI_RESOURCE}?${params}`;
}

export function parseMandi(json: { records?: Record<string, unknown>[] }, query: MandiQuery): MandiRecord[] {
  // data.gov.in silently ignores filters it does not understand, so re-check.
  const norm = (v: string) => v.toLowerCase().replace(/[^a-z]/g, '');
  const same = (a: string, b?: string) => !b || norm(a).includes(norm(b)) || norm(b).includes(norm(a));
  const [state, district, market, commodity] = [clean(query.state), clean(query.district), clean(query.market), clean(query.commodity)];
  return (json.records ?? [])
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
}
