/**
 * Daily mandi rates posted on KashRoot by approved mandi reporters
 * (mandi_rates), read on the server for the assistant. The table is public
 * to read, so the anon key is enough. Server-only.
 */
import 'server-only';

import type { MandiRate } from '@/lib/db/mandiRates';
import { supabaseAnonKey, supabaseOrigin } from '@/lib/supabase-config';

export type PostedRate = MandiRate;

/** Today's date in India, YYYY-MM-DD. */
export const istDate = (offsetDays = 0) => new Date(Date.now() + 5.5 * 3_600_000 + offsetDays * 86_400_000).toISOString().slice(0, 10);

/** The latest rate per mandi, variety and grade for a crop, from the last few days. Throws if the database cannot be read. */
export async function postedRates(commodity: string, days = 4): Promise<PostedRate[]> {
  const origin = supabaseOrigin(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = supabaseAnonKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  if (!origin || !key) throw new Error('The KashRoot database is not configured.');
  const crop = commodity.replace(/\(.*\)/, '').replace(/[*,()]/g, ' ').trim();
  const params = new URLSearchParams({ select: '*', rate_date: `gte.${istDate(-days)}`, order: 'rate_date.desc,created_at.desc', limit: '500' });
  if (crop) params.set('commodity', `ilike.*${crop}*`);
  const read = (p: URLSearchParams) =>
    fetch(`${origin}/rest/v1/mandi_rates?${p}`, { headers: { apikey: key, authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(6_000), cache: 'no-store' });
  // Only rates that are confirmed or not yet questioned — never ones reported wrong.
  const checked = new URLSearchParams(params);
  checked.set('status', 'in.(verified,pending)');
  let res = await read(checked);
  // Before the rate-checking SQL is run there is no status column yet.
  if (res.status === 400) res = await read(params);
  if (!res.ok) throw new Error(`KashRoot rates could not be read (HTTP ${res.status}).`);
  const seen = new Set<string>();
  return ((await res.json()) as PostedRate[]).filter((r) => {
    const k = `${r.mandi}|${r.commodity}|${r.variety ?? ''}|${r.grade ?? ''}`.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Price per kg, when it can be worked out (a box needs its weight). */
export function perKilo(r: Pick<PostedRate, 'unit' | 'box_kg'>, price: number): number | null {
  if (r.unit === 'kg') return price;
  if (r.unit === 'quintal') return price / 100;
  return r.box_kg ? price / r.box_kg : null;
}
