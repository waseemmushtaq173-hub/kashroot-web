'use client';

/**
 * Shared-database helpers for the portals: the signed-in account, staff
 * roles, and plain-language database errors. Every table is protected by
 * row-level security (supabase/migrations), so these calls only ever see
 * what the signed-in person is allowed to.
 */
import { supabase, supabaseConfigured } from '@/lib/supabase';
import { langFromPreference, type SpeechLang } from '@/lib/client/speech';

export { supabase, supabaseConfigured };

export interface Account {
  id: string;
  email: string;
  name: string;
  phone: string;
  district: string;
  village: string;
  lang: SpeechLang | null;
  /** Shop / business name from any portal's My details. */
  business: string;
  /** Fertiliser / pesticide licence number, if given. */
  licence: string;
  /** ADMIN, EXPERT, DEALER — granted by an admin. */
  staff: string[];
}

/** Turns a Supabase/PostgREST error into words a farmer or owner can act on. */
export function dbMessage(error: { message?: string; code?: string } | null | undefined, fallback = 'Something went wrong. Please try again.'): string {
  if (!error) return fallback;
  const m = error.message ?? '';
  if (error.code === 'PGRST205' || error.code === '42P01' || error.code === 'PGRST202' || /schema cache|does not exist/i.test(m)) {
    return 'The KashRoot database is not set up yet. The site owner needs to run the KashRoot SQL file in Supabase (SQL Editor).';
  }
  if (/JWT|not authenticated|permission denied|row-level security/i.test(m)) return 'Please sign in again to do this.';
  if (/Failed to fetch|NetworkError|network/i.test(m)) return 'No internet connection. Please try again.';
  if (/violates check constraint/i.test(m)) return 'Some details are not in the right format. Please check and try again.';
  // Messages raised by the kr_* database functions are already in plain words.
  if (error.code === 'P0001') return m;
  return m || fallback;
}

/** The signed-in account with its saved details (any portal's My details). */
export async function loadAccount(): Promise<Account | null> {
  if (!supabaseConfigured) return null;
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return null;
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const profiles = Object.entries(meta)
    .filter(([k, v]) => k.startsWith('profile_') && v && typeof v === 'object')
    .map(([, v]) => v as Record<string, unknown>);
  const pick = (key: string) => String(profiles.map((p) => p[key]).find((v) => typeof v === 'string' && v.trim()) ?? '');
  const staff = await supabase.from('staff_roles').select('role').eq('user_id', user.id);
  return {
    id: user.id,
    email: user.email ?? '',
    name: String(meta.full_name ?? '') || (user.email ?? '').split('@')[0],
    phone: String(meta.phone ?? '').replace(/[^\d+]/g, ''),
    district: pick('district') || pick('city'),
    village: pick('village'),
    lang: langFromPreference(pick('language')),
    business: pick('shop') || pick('business'),
    licence: pick('licence'),
    staff: staff.error ? [] : (staff.data ?? []).map((r) => String(r.role)),
  };
}

/** Rupees, Indian grouping. */
export const inr = (n: number) => `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

/** "5 min ago", "2 h ago", "3 Oct". */
export function ago(iso: string): string {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}
