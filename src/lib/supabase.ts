/**
 * Browser Supabase client (anon/publishable key only — never a secret key).
 * Shared by auth, the API client's session refresh and public data reads.
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** False when the Supabase env vars are missing (e.g. a local build). */
export const supabaseConfigured = Boolean(url && anonKey);

export const supabase = createClient(url || 'https://placeholder.supabase.co', anonKey || 'placeholder-key');
