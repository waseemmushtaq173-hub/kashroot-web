/**
 * Rate limits that hold across every server instance (20261103000000_rate_limits.sql).
 * Each Vercel instance only knows its own requests (lib/server/sign
 * rateLimited), so a burst spread over instances got several times the limit;
 * here the count is kept in the database. This instance's own count is checked
 * first: free, and it still stops a flood when the database is slow or the SQL
 * has not been run (then this falls back to it alone). Phone numbers and emails
 * in keys are hashed, so none is stored. Server-only.
 */
import 'server-only';

import { createHash } from 'node:crypto';

import { securityEvent } from '@/lib/server/securityLog';
import { clearHits, clientIp, countHit, rateLimited, recentCount } from '@/lib/server/sign';
import { supabaseAnonKey, supabaseOrigin } from '@/lib/supabase-config';

/** A key part that may be personal (phone, email, account): hashed. */
export const hashed = (value: string) => createHash('sha256').update(`kr-limit|${value.trim().toLowerCase()}`).digest('base64url').slice(0, 24);

/** One of the shared-count functions, with the server's secret; null when it is not set up or did not answer in time. */
async function rpc(fn: 'kr_rate_hit' | 'kr_rate_peek' | 'kr_rate_clear', args: Record<string, unknown>): Promise<unknown> {
  const secret = process.env.KYC_DB_SECRET?.trim();
  const origin = supabaseOrigin(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anon = supabaseAnonKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  if (!secret || !origin || !anon) return null;
  try {
    const res = await fetch(`${origin}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: anon, authorization: `Bearer ${anon}`, 'content-type': 'application/json' },
      body: JSON.stringify({ p_secret: secret, ...args }),
      cache: 'no-store',
      signal: AbortSignal.timeout(2_500),
    });
    return res.ok ? await res.json() : null;
  } catch {
    // The database did not answer in time: this instance's own count decides.
    return null;
  }
}
const seconds = (ms: number) => Math.max(1, Math.round(ms / 1000));

async function countHere(key: string, max: number, windowMs: number): Promise<boolean> {
  return (await rpc('kr_rate_hit', { p_key: key, p_max: max, p_window: seconds(windowMs) })) === true;
}

/** How many were counted under `key` in `windowMs`, across all instances — without counting this one (e.g. wrong passwords so far). */
export async function sharedCount(key: string, windowMs: number): Promise<number> {
  const here = recentCount(key, windowMs);
  const all = await rpc('kr_rate_peek', { p_key: key, p_window: seconds(windowMs) });
  return Math.max(here, typeof all === 'number' ? all : 0);
}

/** Count one (a wrong password) under `key`, here and across all instances. */
export async function sharedRecord(key: string, windowMs: number): Promise<void> {
  countHit(key);
  await rpc('kr_rate_hit', { p_key: key, p_max: 1_000_000, p_window: seconds(windowMs) });
}

/** Forget the count under `key` (a right password clears the wrong ones). */
export async function sharedClear(key: string): Promise<void> {
  clearHits(key);
  await rpc('kr_rate_clear', { p_key: key });
}

/** Count one request under `key`: true when it is over `max` in `windowMs`, here or across all instances. */
export async function sharedLimited(key: string, max: number, windowMs: number): Promise<boolean> {
  if (rateLimited(key, max, windowMs)) return true;
  return countHere(key, max, windowMs);
}

/** The same for one endpoint and the caller's network address; a refusal is logged (lib/server/securityLog), to spot floods and bots. */
export async function sharedIpLimited(request: Request, name: string, max: number, windowMs = 60_000): Promise<boolean> {
  const over = await sharedLimited(`${name}:ip:${hashed(clientIp(request))}`, max, windowMs);
  if (over) securityEvent('rate_limited', { request, detail: `${name}: over ${max} in ${seconds(windowMs)} s` });
  return over;
}
