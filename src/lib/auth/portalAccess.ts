'use client';

/**
 * Every portal is its own sign-in. One email is one KashRoot account, but it
 * opens a portal only when
 *   - the account has an account in that portal: created there, or added
 *     with "Create your <portal> account" (user_metadata.portals), and
 *   - it has signed in to that portal on this device (kr_portal_signins).
 * So signing in to Cold Storage Booking does not open the Farmer portal: the
 * Farmer portal asks to sign in, and to create a Farmer account if there is
 * none. Inside a portal people stay signed in until they sign out there.
 * The Admin portal counts the ADMIN role (granted by an admin) as its account.
 *
 * SECURITY: UX only — people can edit their own user_metadata, so the
 * database still checks every request (RLS).
 */
import { isPortalId, type PortalId } from '@/lib/auth/roles';
import { supabase } from '@/lib/supabase';

const KEY = 'kr_portal_signins';
/** Set once this device uses separate portal sign-ins; earlier sign-ins are adopted only before that. */
const SINCE = 'kr_portal_signins_since';

type MetaUser = { id: string; user_metadata?: Record<string, unknown> };

/** The portals an account has joined; null for accounts made before portals had separate accounts. */
export function portalsOf(user: Pick<MetaUser, 'user_metadata'> | null | undefined): PortalId[] | null {
  const list = user?.user_metadata?.portals;
  return Array.isArray(list) ? list.filter((p): p is PortalId => typeof p === 'string' && isPortalId(p)) : null;
}

/** Does the account have an account in this portal? */
export function isMember(portals: PortalId[] | null, roles: string[], portal: PortalId): boolean {
  if (portal === 'admin') return roles.includes('ADMIN');
  return (portals ?? []).includes(portal);
}

function readAll(): Record<string, PortalId[]> {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(all).map(([id, list]) => [id, Array.isArray(list) ? list.filter((p): p is PortalId => typeof p === 'string' && isPortalId(p)) : []]),
    );
  } catch {
    return {};
  }
}
function writeAll(all: Record<string, PortalId[]>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* private mode: nothing to keep */
  }
}

/** Portals this person has signed in to on this device. */
export function signedInPortals(userId: string): PortalId[] {
  return readAll()[userId] ?? [];
}

export function markPortalSignedIn(userId: string, portal: PortalId) {
  markSince();
  const all = readAll();
  all[userId] = [...new Set([...(all[userId] ?? []), portal])];
  writeAll(all);
}

/** Signed out of one portal; returns the portals still signed in on this device. */
export function markPortalSignedOut(userId: string, portal: PortalId): PortalId[] {
  const all = readAll();
  all[userId] = (all[userId] ?? []).filter((p) => p !== portal);
  writeAll(all);
  return all[userId];
}

/** The session ended on this device (Sign out, another account, expired): no portal stays signed in. */
export function forgetPortalSignIns() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing kept */
  }
}

if (typeof window !== 'undefined') {
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') forgetPortalSignIns();
  });
}

/** Adds a portal to the signed-in account (and the role a role portal needs). Returns the account's portals. */
export async function joinPortal(portal: PortalId, role?: string): Promise<PortalId[]> {
  const { data } = await supabase.auth.getUser();
  const portals = [...new Set([...(portalsOf(data.user) ?? []), portal])];
  const meta = data.user?.user_metadata ?? {};
  const roles = Array.isArray(meta.roles) ? meta.roles.filter((r): r is string => typeof r === 'string') : [];
  const { error } = await supabase.auth.updateUser({ data: { portals, ...(role ? { roles: [...new Set([...roles, ...(typeof meta.role === 'string' ? [meta.role] : []), role])] } : {}) } });
  if (error) throw new Error(error.message || 'Could not create the account for this portal.');
  return portals;
}

function markSince() {
  try {
    if (!localStorage.getItem(SINCE)) localStorage.setItem(SINCE, String(Date.now()));
  } catch {
    /* private mode */
  }
}

/**
 * Before portals had separate sign-ins, one sign-in opened every portal. A
 * device still signed in from then keeps the portal last signed in to open
 * (and it counts as joined) — once; every other portal asks to sign in.
 */
async function adoptEarlierSignIn(user: MetaUser): Promise<PortalId[] | null> {
  let portals = portalsOf(user);
  let last: string | null = null;
  try {
    if (localStorage.getItem(SINCE)) return portals;
    last = localStorage.getItem('auth_portal');
  } catch {
    return portals;
  }
  markSince();
  const all = readAll();
  all[user.id] = last && isPortalId(last) ? [last] : [];
  writeAll(all);
  if (last && isPortalId(last) && last !== 'admin' && portals === null) {
    portals = [last];
    await supabase.auth.updateUser({ data: { portals } }).catch(() => undefined);
  }
  return portals;
}

export interface PortalAccess {
  /** The account has an account in this portal. */
  member: boolean;
  /** …and has signed in to it on this device. */
  signedIn: boolean;
  /** Other portals signed in on this device. */
  others: PortalId[];
  email: string;
}

/**
 * May this signed-in person open this portal now, or must they sign in (or
 * create its account) first? `existing`: a session already on this device
 * (not one just made by signing in), which may date from before portals had
 * separate sign-ins.
 */
export async function portalAccess(user: MetaUser & { email?: string }, roles: string[], portal: PortalId, existing = true): Promise<PortalAccess> {
  const portals = existing ? await adoptEarlierSignIn(user) : portalsOf(user);
  const here = signedInPortals(user.id);
  return {
    member: isMember(portals, roles, portal),
    signedIn: here.includes(portal),
    others: here.filter((p) => p !== portal),
    email: user.email ?? '',
  };
}
