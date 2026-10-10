/**
 * Browser Supabase client (anon/publishable key only — never a secret key).
 * Shared by auth, the API client's session refresh and public data reads.
 *
 * In the browser every call goes through this site's own /api/supabase
 * proxy, not straight to *.supabase.co: networks or blockers that stop the
 * Supabase domain can't break sign-in, and a misconfigured project address
 * comes back as a clear message instead of "Failed to fetch".
 */
import { createClient } from '@supabase/supabase-js';

import { supabaseAnonKey, supabaseOrigin } from '@/lib/supabase-config';

const origin = supabaseOrigin(process.env.NEXT_PUBLIC_SUPABASE_URL);
const anonKey = supabaseAnonKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

/** False when the Supabase env vars are missing (e.g. a local build). */
export const supabaseConfigured = Boolean(origin && anonKey);

const clientUrl = origin && typeof window !== 'undefined' ? `${window.location.origin}/api/supabase` : origin;

export const supabase = createClient(clientUrl || 'https://placeholder.supabase.co', anonKey || 'placeholder-key', {
  // Keep the session key tied to the project, not to the proxy's host.
  ...(origin ? { auth: { storageKey: `sb-${new URL(origin).hostname.split('.')[0]}-auth-token` } } : {}),
});
