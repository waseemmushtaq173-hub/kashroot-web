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

/** Other spellings of the same state, as people type them and as the feeds have spelt them over the years. */
const STATE_SPELLINGS: Record<string, string> = {
  kerala: 'keralam',
  uttrakhand: 'uttarakhand',
  uttaranchal: 'uttarakhand',
  chattisgarh: 'chhattisgarh',
  pondicherry: 'puducherry',
  orissa: 'odisha',
  delhi: 'nctofdelhi',
  newdelhi: 'nctofdelhi',
  jk: 'jammuandkashmir',
  jandk: 'jammuandkashmir',
  jammukashmir: 'jammuandkashmir',
};

/** One key for every spelling of a state: "Kerala" and "Keralam", "Uttrakhand" and "Uttarakhand", "Jammu & Kashmir" and "Jammu and Kashmir". */
export function stateKey(v: string): string {
  const k = v.toLowerCase().replace(/&/g, 'and').replace(/[^a-z]/g, '');
  return STATE_SPELLINGS[k] ?? k;
}

/** The same state whatever the spelling ("Andaman and Nicobar" = "Andaman and Nicobar Islands"). No state asked for: every state. */
export function sameState(a: string, b?: string): boolean {
  if (!b) return true;
  const [x, y] = [stateKey(a), stateKey(b)];
  if (x === y) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short.length >= 8 && long.startsWith(short);
}

/** Reports dated within the last `days` days (India time), newest first. Older ones are not shown as if they were current. */
export function recentOnly(records: MandiRecord[], days: number, now: number = Date.now()): MandiRecord[] {
  const cutoff = new Date(now + 5.5 * 3600_000 - days * 86_400_000).toISOString().slice(0, 10);
  return records.filter((r) => r.arrivalDate >= cutoff);
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

export function mandiUrl(query: MandiQuery, key: string): string {
  const params = new URLSearchParams({
    'api-key': key,
    format: 'json',
    limit: String(Math.min(Math.max(query.limit ?? 200, 1), 2000)),
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
  // Exact match for commodity (avoid "Apple" matching "Custard Apple"); fuzzy
  // includes-match for state/district/market where spellings vary.
  const same = (a: string, b?: string) => !b || norm(a) === norm(b);
  const sameFuzzy = (a: string, b?: string) => !b || norm(a).includes(norm(b)) || norm(b).includes(norm(a));
  // "Kerala" is "Keralam" in the feed, "Uttrakhand" is "Uttarakhand": states match by spelling-free key.
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
    .filter((r) => sameState(r.state, state) && sameFuzzy(r.district, district) && sameFuzzy(r.market, market) && same(r.commodity, commodity))
    .sort((a, b) => b.arrivalDate.localeCompare(a.arrivalDate) || a.market.localeCompare(b.market));
}

/** Letters only, lower case: "APMC/MAC Shopian" → "apmcmacshopian". */
const letters = (v: string) => v.toLowerCase().replace(/[^a-z]/g, '');

/**
 * Does a mandi/district name match what someone typed, whatever the spelling
 * or capitals? "anantnag" = "Anantnag"; "jablipora" ~ "Jablipora"; "shopian"
 * matches "APMC/MAC Shopian". Also accepts the first 5 letters for Kashmiri
 * spelling variants ("pulwama"/"pulwamah").
 */
export function placeMatches(name: string, typed: string): boolean {
  const a = letters(name);
  const b = letters(typed);
  if (!b) return true;
  return a.includes(b) || b.includes(a) || (b.length >= 5 && a.includes(b.slice(0, 5)));
}

export interface Narrowed {
  records: MandiRecord[];
  /** Set when the exact district/market had no report and a wider area is shown. */
  widened?: string;
}

/**
 * Keep the rows for the district and market asked for. When that mandi has not
 * reported today, show the district's other mandis, then the state's — and say
 * so — rather than an empty page.
 */
export function narrowMandi(records: MandiRecord[], district?: string, market?: string, state?: string): Narrowed {
  const d = titleCase(district);
  const m = titleCase(market);
  const inDistrict = d ? records.filter((r) => placeMatches(r.district, d) || placeMatches(r.market, d)) : records;
  if (m) {
    const exact = inDistrict.filter((r) => placeMatches(r.market, m));
    if (exact.length) return { records: exact };
    const anyMarket = records.filter((r) => placeMatches(r.market, m));
    if (anyMarket.length) return { records: anyMarket };
    if (d && inDistrict.length) return { records: inDistrict, widened: `${m} has not reported to Agmarknet today — showing the other ${d} mandis that did.` };
    if (records.length) return { records, widened: `${m}${d ? ` (${d})` : ''} has not reported to Agmarknet today — showing every ${state || 'reporting'} mandi that did.` };
    return { records: [] };
  }
  if (d) {
    if (inDistrict.length) return { records: inDistrict };
    if (records.length) return { records, widened: `No mandi in ${d} has reported to Agmarknet today — showing every ${state || 'reporting'} mandi that did.` };
  }
  return { records };
}

/** "jammu and kashmir" → "Jammu and Kashmir", "apple" → "Apple" (the feeds match names exactly). */
export function titleCase(v?: string): string | undefined {
  const t = v?.trim().replace(/\s+/g, ' ');
  if (!t) return undefined;
  return t.toLowerCase().replace(/(^|[\s(/-])([a-z])/g, (_, pre: string, c: string) => pre + c.toUpperCase()).replace(/\b(And|Of|The)\b/g, (w, _x, i: number) => (i === 0 ? w : w.toLowerCase()));
}

/** "APMC/MAC Shopian" → "Shopian" (the mandi's place), for display. */
export function mandiName(market: string): string {
  return market.replace(/^\s*(APMC\/MAC|MAC\/APMC|APMC|MAC)[\s/-]+/i, '').replace(/\s*\((F&V|Fruit[^)]*)\)\s*$/i, '').trim() || market;
}
