'use client';

/**
 * Staff roles (admin, expert, dealer — granted by an admin in staff_roles),
 * asked from the database once and kept for ten minutes in this tab, so
 * opening a portal does not wait for the same answer three times. Only a
 * found role is kept in the tab: someone without one (or just approved by an
 * admin) is asked again on the next page load, so a new role shows at once.
 * Signing in asks afresh (`fresh`).
 *
 * Besides that, every answer — "none" too — is remembered on this device for
 * the next visit (`staffRolesQuick`). A database answer takes about a second,
 * and a portal that waited for it showed nothing in the meantime, on every
 * page load, for the many people who have no staff role at all. The portals
 * that do not depend on it (every one except Admin and the KashRoot Hub) open
 * at once on what the device knew, and ask again in the background when that
 * is more than a minute old: a role given or taken away shows from the next
 * page load. The database's own rules decide what anyone may do either way.
 */
import { supabase } from '@/lib/supabase';

const KEY = 'kr_staff_roles';
const TTL = 10 * 60_000;
/** The last answer for an account, kept on this device between visits (see staffRolesQuick). */
const KNOWN = 'kr_staff_roles_known';
/** A remembered answer older than this is asked again in the background. */
const REFRESH_AFTER = 60_000;
let pending: { id: string; promise: Promise<string[]> } | null = null;

interface Known {
  id: string;
  roles: string[];
  at: number;
}

/** What this device last learned about an account's staff roles, however old; null when it never asked. */
export function staffRolesKnown(userId: string): Known | null {
  try {
    const kept = JSON.parse(localStorage.getItem(KNOWN) ?? 'null') as Known | null;
    return kept && kept.id === userId && Array.isArray(kept.roles) && typeof kept.at === 'number' ? kept : null;
  } catch {
    return null;
  }
}

function remember(userId: string, roles: string[]) {
  try {
    localStorage.setItem(KNOWN, JSON.stringify({ id: userId, roles, at: Date.now() } satisfies Known));
  } catch {
    /* private mode: asked again next time */
  }
}

export function staffRolesOf(userId: string, fresh = false): Promise<string[]> {
  if (!fresh) {
    try {
      const kept = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as { id: string; roles: string[]; at: number } | null;
      if (kept && kept.id === userId && Date.now() - kept.at < TTL && Array.isArray(kept.roles) && kept.roles.length) return Promise.resolve(kept.roles);
    } catch {
      /* private mode: ask the database */
    }
    if (pending?.id === userId) return pending.promise;
  }
  const promise = (async () => {
    const { data, error } = await supabase.from('staff_roles').select('role').eq('user_id', userId);
    const roles = error ? [] : (data ?? []).map((r) => String(r.role));
    if (!error) remember(userId, roles);
    if (!error && roles.length) {
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

/**
 * The staff roles without making the person wait for the database when this device already knows the answer. Known: it is
 * returned at once, and asked again in the background when it is more than a minute old. Never asked here: asked, as before.
 */
export function staffRolesQuick(userId: string): Promise<string[]> {
  const known = staffRolesKnown(userId);
  if (!known) return staffRolesOf(userId);
  if (Date.now() - known.at > REFRESH_AFTER && !pending) void staffRolesOf(userId, true).catch(() => undefined);
  return Promise.resolve(known.roles);
}

export function forgetStaffRoles() {
  pending = null;
  try {
    sessionStorage.removeItem(KEY);
    localStorage.removeItem(KNOWN);
  } catch {
    /* nothing kept */
  }
}
