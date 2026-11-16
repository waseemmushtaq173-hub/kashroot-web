/**
 * Who is really asking? The page cannot say: the database is asked as the
 * person behind the Bearer token. The team pass (lib/server/teamPass) only
 * opens pages; what changes things (or shows private details) is checked
 * again here with the database's own answer. Server-only.
 */
import 'server-only';

import { supabaseAnonKey, supabaseOrigin } from '@/lib/supabase-config';

/** Is the person behind this request's Bearer token the Super Admin (kr_is_super_admin, asked as them)? false when unsure. */
export async function isSuperAdminCaller(request: Request): Promise<boolean> {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();
  const origin = supabaseOrigin(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anon = supabaseAnonKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  if (!token || token.length > 4096 || !origin || !anon) return false;
  try {
    const res = await fetch(`${origin}/rest/v1/rpc/kr_is_super_admin`, {
      method: 'POST',
      headers: { apikey: anon, authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: '{}',
      cache: 'no-store',
      signal: AbortSignal.timeout(5_000),
    });
    return res.ok && (await res.json()) === true;
  } catch {
    return false;
  }
}
