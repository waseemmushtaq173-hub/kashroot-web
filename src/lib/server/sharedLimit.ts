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

import { clientIp, rateLimited } from '@/lib/server/sign';
import { supabaseAnonKey, supabaseOrigin } from '@/lib/supabase-config';

/** A key part that may be personal (phone, email, account): hashed. */
export const hashed = (value: string) => createHash('sha256').update(`kr-limit|${value.trim().toLowerCase()}`).digest('base64url').slice(0, 24);

async function countHere(key: string, max: number, windowMs: number): Promise<boolean> {
  const secret = process.env.KYC_DB_SECRET?.trim();
  const origin = supabaseOrigin(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anon = supabaseAnonKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  if (!secret || !origin || !anon) return false;
  try {
    const res = await fetch(`${origin}/rest/v1/rpc/kr_rate_hit`, {
      method: 'POST',
      headers: { apikey: anon, authorization: `Bearer ${anon}`, 'content-type': 'application/json' },
      body: JSON.stringify({ p_secret: secret, p_key: key, p_max: max, p_window: Math.max(1, Math.round(windowMs / 1000)) }),
      cache: 'no-store',
      signal: AbortSignal.timeout(2_500),
    });
    return res.ok && (await res.json()) === true;
  } catch {
    // The database did not answer in time: this instance's own count decides.
    return false;
  }
}

/** Count one request under `key`: true when it is over `max` in `windowMs`, here or across all instances. */
export async function sharedLimited(key: string, max: number, windowMs: number): Promise<boolean> {
  if (rateLimited(key, max, windowMs)) return true;
  return countHere(key, max, windowMs);
}

/** The same for one endpoint and the caller's network address. */
export const sharedIpLimited = (request: Request, name: string, max: number, windowMs = 60_000) => sharedLimited(`${name}:ip:${hashed(clientIp(request))}`, max, windowMs);
