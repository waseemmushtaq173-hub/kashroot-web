import { supabase } from '@/lib/supabase';

/**
 * fetch() with the signed-in user's Supabase access token, for protected /api
 * routes. The token comes from the Supabase session itself (refreshed by
 * Supabase when it is near its end), never from a copy kept elsewhere.
 */
export async function authFetch(input: string, init: RequestInit = {}): Promise<Response> {
  let token: string | null = null;
  if (typeof window !== 'undefined') {
    try {
      token = (await supabase.auth.getSession()).data.session?.access_token ?? null;
    } catch {
      token = null;
    }
  }
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (typeof init.body === 'string' && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  return fetch(input, { ...init, headers });
}
