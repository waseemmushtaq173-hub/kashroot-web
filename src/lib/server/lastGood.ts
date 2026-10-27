/**
 * The last good answer from an outside source (Open-Meteo, Agmarknet /
 * data.gov.in, NHB, OpenStreetMap), so a source that is down shows "last
 * updated …" instead of an error. Two layers:
 *   - this server instance's memory (instant, lost when the instance ends);
 *   - the source_cache table (20261101000000_source_cache.sql), shared by
 *     every instance and kept across deployments. Read and written only with
 *     KYC_DB_SECRET; without it, memory alone is used.
 * Only public data goes in: never anything about a person. Server-only.
 */
import 'server-only';

import { after } from 'next/server';

import { supabaseAnonKey, supabaseOrigin } from '@/lib/supabase-config';

export interface Kept<T> {
  body: T;
  /** When the source gave this answer (ISO time). */
  fetchedAt: string;
}

const MEMORY_MAX = 300;
const memory = new Map<string, Kept<unknown>>();

function remember(key: string, kept: Kept<unknown>) {
  memory.delete(key);
  memory.set(key, kept);
  // Oldest out first (a Map keeps the order things were added).
  while (memory.size > MEMORY_MAX) memory.delete(memory.keys().next().value as string);
}

async function rpc(fn: 'kr_cache_put' | 'kr_cache_get', args: Record<string, unknown>): Promise<unknown> {
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
      signal: AbortSignal.timeout(4_000),
    });
    // Before the source cache SQL is run (or the database is down): memory only.
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

/**
 * Keep a good answer. The database copy is written after the response has
 * gone (after()), so the person never waits for it. Never throws: keeping a
 * copy must not break the answer itself.
 */
export function keepGood<T>(key: string, body: T, fetchedAt: string): void {
  remember(key, { body, fetchedAt });
  const save = () => rpc('kr_cache_put', { p_key: key, p_body: body, p_fetched_at: fetchedAt });
  try {
    after(save);
  } catch {
    // Called outside a request (e.g. at build time): save in the background.
    void save();
  }
}

/** The last good answer for this key, or null. */
export async function lastGood<T>(key: string): Promise<Kept<T> | null> {
  const here = memory.get(key) as Kept<T> | undefined;
  if (here) return here;
  const row = (await rpc('kr_cache_get', { p_key: key })) as { body?: T; fetched_at?: string } | null;
  if (!row?.body || !row.fetched_at) return null;
  const kept = { body: row.body, fetchedAt: new Date(row.fetched_at).toISOString() };
  remember(key, kept as Kept<unknown>);
  return kept;
}
