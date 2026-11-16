/**
 * The database side of the official-list feeds, with the service key (the
 * feed table and its functions are for the server only). Server-only.
 */
import 'server-only';

import { createClient } from '@supabase/supabase-js';

import type { Feed } from '@/lib/officialFeed';
import { supabaseOrigin } from '@/lib/supabase-config';

const unquote = (v?: string) => (v ?? '').trim().replace(/^['"]+|['"]+$/g, '').trim();

/** The service-key client, or null when this site has no service key. */
export function serviceDb() {
  const origin = supabaseOrigin(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL);
  const key = unquote(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!origin || !key) return null;
  return createClient(origin, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** What the admin sees of a feed: everything but the file's fingerprint. */
export const FEED_PUBLIC_COLUMNS =
  'id, kind, source, source_url, file_url, active, replace_missing, last_checked_at, last_changed_at, last_status, last_error, last_rows, created_at';
/** What a refresh needs. */
export const FEED_RUN_COLUMNS = 'id, kind, source, source_url, file_url, active, replace_missing, last_hash';

export type FeedRow = Feed;

/** The table is not there yet (the SQL has not been run). */
export const tableMissing = (e: { code?: string; message?: string }) =>
  ['PGRST205', '42P01'].includes(e.code ?? '') || /schema cache|does not exist|Could not find the table/i.test(e.message ?? '');
