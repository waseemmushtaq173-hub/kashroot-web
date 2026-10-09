/**
 * Server-side check that a request comes from a signed-in KashRoot user: the
 * browser sends its Supabase access token as a Bearer header and Supabase
 * confirms it. Used to keep paid lookups (vehicle, Aadhaar, PAN) from being
 * called anonymously.
 */
import 'server-only';
import { createClient, type User } from '@supabase/supabase-js';

export async function requireUser(request: Request): Promise<User | null> {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!token || !url || !anon) return null;
  const client = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.getUser(token);
  return error ? null : data.user;
}
