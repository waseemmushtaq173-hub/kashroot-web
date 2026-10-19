'use client';

/**
 * Staff roles (admin, expert, dealer — granted by an admin in staff_roles),
 * asked from the database once and kept for ten minutes in this tab, so
 * opening a portal does not wait for the same answer three times. Signing in
 * asks afresh (`fresh`), so a newly granted role shows at the next sign-in.
 */
import { supabase } from '@/lib/supabase';

const KEY = 'kr_staff_roles';
const TTL = 10 * 60_000;
let pending: { id: string; promise: Promise<string[]> } | null = null;

export function staffRolesOf(userId: string, fresh = false): Promise<string[]> {
  if (!fresh) {
    try {
      const kept = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as { id: string; roles: string[]; at: number } | null;
      if (kept && kept.id === userId && Date.now() - kept.at < TTL && Array.isArray(kept.roles)) return Promise.resolve(kept.roles);
    } catch {
      /* private mode: ask the database */
    }
    if (pending?.id === userId) return pending.promise;
  }
  const promise = (async () => {
    const { data, error } = await supabase.from('staff_roles').select('role').eq('user_id', userId);
    const roles = error ? [] : (data ?? []).map((r) => String(r.role));
    if (!error) {
      try {
        sessionStorage.setItem(KEY, JSON.stringify({ id: userId, roles, at: Date.now() }));
      } catch {
        /* nothing kept */
      }
    }
    return roles;
  })();
  pending = { id: userId, promise };
  return promise;
}

export function forgetStaffRoles() {
  pending = null;
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* nothing kept */
  }
}
