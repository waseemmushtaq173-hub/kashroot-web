'use client';

/**
 * Shared-database helpers for the portals: the signed-in account, staff
 * roles, and plain-language database errors. Every table is protected by
 * row-level security (supabase/migrations), so these calls only ever see
 * what the signed-in person is allowed to.
 */
import { supabase, supabaseConfigured } from '@/lib/supabase';
import { staffRolesOf } from '@/lib/auth/staffRoles';
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
/** The identity check (KYC) opens in every portal: "Verify now" on the error, or at the top of the page. */
export const VERIFY_FIRST = 'Verify your identity first (Aadhaar, about a minute): tap “Verify now”, then try again.';
/** A new row refused by the database: a missing identity check, or a session that has ended. */
const REFUSED = 'Verify your identity first (Aadhaar, about a minute): tap “Verify now”, then try again. Already verified? Sign in again and try once more.';

/**
 * Shown to everyone (owner, farmer, admin) when the live database is missing a
 * table, column or function the site needs: a setup file has not been run in
 * Supabase. Admin → Setup check says which one.
 */
export const SETUP_NEEDED = 'This part of KashRoot is still being set up, so it cannot be used just now. Please try again later. (KashRoot team: open Admin portal → Setup check.)';

/**
 * The error means the database has not had every setup file run: a missing
 * table (42P01, PGRST205), column (42703, PGRST204) or function (42883,
 * PGRST202), or one the API does not know about yet.
 */
export function isSetupMissing(error: { message?: string; code?: string } | null | undefined): boolean {
  if (!error) return false;
  if (['PGRST202', 'PGRST204', 'PGRST205', '42P01', '42703', '42883'].includes(error.code ?? '')) return true;
  return /schema cache|does not exist|Could not find the (function|table)/i.test(error.message ?? '');
}

export function dbMessage(error: { message?: string; code?: string } | null | undefined, fallback = 'Something went wrong. Please try again.'): string {
  if (!error) return fallback;
  const m = error.message ?? '';
  if (isSetupMissing(error)) return SETUP_NEEDED;
  // A new row refused by the "KYC before …" rules — or by an ended session.
  if (/new row violates row-level security/i.test(m)) return REFUSED;
  if (/JWT|not authenticated|permission denied|row-level security/i.test(m)) return 'Please sign in again to do this.';
  if (/Failed to fetch|NetworkError|network/i.test(m)) {
    return typeof navigator !== 'undefined' && navigator.onLine === false
      ? 'You are offline — this needs the internet. Try again when you have signal.'
      : 'Could not reach KashRoot. Check your internet and try again.';
  }
  if (/violates check constraint/i.test(m)) return 'Some details are not in the right format. Please check and try again.';
  // Messages raised by the kr_* database functions are already in plain words.
  if (error.code === 'P0001') return m;
  return m || fallback;
}

let accountMemo: { key: string; at: number; promise: Promise<Account | null> } | null = null;

/**
 * The signed-in account with its saved details (any portal's My details).
 * Read from the session kept on this device (no round trip to the sign-in
 * service — the database checks every request itself), and shared for a
 * minute by everything on the page that asks, so a portal opens without
 * waiting for the same answer several times. Saving My details changes
 * the session, which starts a fresh read.
 */
export async function loadAccount(): Promise<Account | null> {
  if (!supabaseConfigured) return null;
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user;
  if (!user) return null;
  const key = `${user.id}|${user.updated_at ?? ''}|${JSON.stringify(user.user_metadata ?? {})}`;
  if (accountMemo && accountMemo.key === key && Date.now() - accountMemo.at < 60_000) return accountMemo.promise;
  const promise = accountOf(user);
  accountMemo = { key, at: Date.now(), promise };
  promise.catch(() => {
    if (accountMemo?.promise === promise) accountMemo = null;
  });
  return promise;
}

async function accountOf(user: { id: string; email?: string; user_metadata?: Record<string, unknown> }): Promise<Account> {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const profiles = Object.entries(meta)
    .filter(([k, v]) => k.startsWith('profile_') && v && typeof v === 'object')
    .map(([, v]) => v as Record<string, unknown>);
  const pick = (key: string) => String(profiles.map((p) => p[key]).find((v) => typeof v === 'string' && v.trim()) ?? '');
  const staff = await staffRolesOf(user.id);
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
    staff,
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
