'use client';

/**
 * Every portal is its own sign-in. One email is one KashRoot account, but it
 * opens a portal only when
 *   - the account has an account in that portal: created there, or added
 *     with "Create your <portal> account" (user_metadata.portals), and
 *   - it has signed in to that portal on this device (kr_portal_signins).
 * So signing in to Cold Storage Booking does not open the Farmer portal: the
 * Farmer portal asks to sign in, and to create a Farmer account if there is
 * none. The Admin portal counts the ADMIN role (granted by an admin) as its
 * account.
 *
 * How long a sign-in lasts (the limits are the constants below):
 *   - a portal stays open for PORTAL_SIGNIN_LIMIT_MS after its last use;
 *     use in it (written down at most once a minute) keeps it open. After
 *     that it is locked: its sign-in page offers "Continue as <name>" — one
 *     tap, because the account's session on this device is still good.
 *   - KashRoot not used on this device for DEVICE_IDLE_LIMIT_MS: the device
 *     signs out completely (lib/auth/session), remembering only the name and
 *     email for "Welcome back".
 * Only times and portal names are kept here — nothing secret.
 *
 * SECURITY: UX only — people can edit their own user_metadata, so the
 * database still checks every request (RLS).
 */
import { isPortalId, type PortalId } from '@/lib/auth/roles';
import { supabase } from '@/lib/supabase';

/** A portal sign-in lasts this long after its last use on this device. */
export const PORTAL_SIGNIN_LIMIT_MS = 12 * 60 * 60_000;
/** KashRoot unused on this device this long: the device signs out completely (the name and email are remembered). */
export const DEVICE_IDLE_LIMIT_MS = 7 * 24 * 60 * 60_000;
/** Use is written down at most this often. */
export const USE_STEP_MS = 60_000;

/** { [userId]: { [portal]: last use (ms) } } — one person per device. */
const KEY = 'kr_portal_signins';
/** Set once this device uses separate portal sign-ins; earlier sign-ins are adopted only before that. */
const SINCE = 'kr_portal_signins_since';
/** When KashRoot was last used on this device (ms). */
const DEVICE_KEY = 'kr_last_active';

type MetaUser = { id: string; user_metadata?: Record<string, unknown> };
type Uses = Partial<Record<PortalId, number>>;

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

function readAll(): Record<string, Uses> {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(all).map(([id, uses]) => [
        id,
        Array.isArray(uses)
          ? // Kept before sign-ins had a time limit: last use unknown, so locked (one tap opens it again).
            Object.fromEntries(uses.filter((p): p is PortalId => typeof p === 'string' && isPortalId(p)).map((p) => [p, 0]))
          : Object.fromEntries(Object.entries((uses ?? {}) as Record<string, unknown>).filter((e): e is [PortalId, number] => isPortalId(e[0]) && typeof e[1] === 'number')),
      ]),
    );
  } catch {
    return {};
  }
}
function writeAll(all: Record<string, Uses>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* private mode: nothing to keep */
  }
}

const isOpen = (at: number | undefined, now = Date.now()) => at !== undefined && now - at < PORTAL_SIGNIN_LIMIT_MS;

/** Portals this person has signed in to on this device — open, or locked after the time limit. */
export function signedInPortals(userId: string): PortalId[] {
  return Object.keys(readAll()[userId] ?? {}) as PortalId[];
}

/** Portals open now: signed in on this device and used within the time limit. */
export function openPortals(userId: string): PortalId[] {
  const now = Date.now();
  return Object.entries(readAll()[userId] ?? {})
    .filter(([, at]) => isOpen(at, now))
    .map(([p]) => p as PortalId);
}

/** Is this portal open now (signed in here, used within the time limit)? */
export function portalOpen(userId: string, portal: PortalId): boolean {
  return isOpen(readAll()[userId]?.[portal]);
}

/** Signed in (or "Continue as …"): the portal is open from now. Only this person's sign-ins are kept on the device. */
export function markPortalSignedIn(userId: string, portal: PortalId) {
  markSince();
  const all = readAll();
  writeAll({ [userId]: { ...(all[userId] ?? {}), [portal]: Date.now() } });
  markDeviceUsed(true);
}

/**
 * Use in an open portal keeps it open (written at most once a minute).
 * False when it is not open: signed out (here or in another tab), or locked
 * after the time limit — then use does not reopen it.
 */
export function touchPortal(userId: string, portal: PortalId): boolean {
  const all = readAll();
  const at = all[userId]?.[portal];
  const now = Date.now();
  if (!isOpen(at, now)) return false;
  if (now - at! >= USE_STEP_MS) writeAll({ ...all, [userId]: { ...all[userId], [portal]: now } });
  markDeviceUsed();
  return true;
}

/** Signed out of one portal; returns the portals still signed in on this device (open or locked). */
export function markPortalSignedOut(userId: string, portal: PortalId): PortalId[] {
  const all = readAll();
  const mine = { ...(all[userId] ?? {}) };
  delete mine[portal];
  all[userId] = mine;
  writeAll(all);
  return Object.keys(mine) as PortalId[];
}

/** The session ended on this device (Sign out, another account, expired): no portal stays signed in. */
export function forgetPortalSignIns() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing kept */
  }
}

/** When KashRoot was last used on this device (ms), or 0 when not known. */
function deviceLastUse(): number {
  try {
    return Number(localStorage.getItem(DEVICE_KEY) ?? 0) || 0;
  } catch {
    return 0;
  }
}

/** Has this device gone unused longer than DEVICE_IDLE_LIMIT_MS? */
export function deviceIdleTooLong(): boolean {
  const last = deviceLastUse();
  return last > 0 && Date.now() - last > DEVICE_IDLE_LIMIT_MS;
}

/**
 * KashRoot is being used on this device (written at most once a minute;
 * `now`: write it now, e.g. at sign-in). Not after the idle limit, until the
 * device has signed out (lib/auth/session).
 */
export function markDeviceUsed(now = false) {
  try {
    if (!now && deviceIdleTooLong()) return;
    if (now || Date.now() - deviceLastUse() >= USE_STEP_MS) localStorage.setItem(DEVICE_KEY, String(Date.now()));
  } catch {
    /* private mode */
  }
}

/** The device has signed out: its use starts again from nothing. */
export function forgetDeviceUse() {
  try {
    localStorage.removeItem(DEVICE_KEY);
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
  // Its last use is not known: it opens with one tap ("Continue as …").
  all[user.id] = last && isPortalId(last) ? { [last]: 0 } : {};
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
  /** …and has signed in to it on this device, and used it within the time limit. */
  signedIn: boolean;
  /** Signed in here, but unused past the time limit: one tap opens it again. */
  locked: boolean;
  /** Other portals open on this device. */
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
  const open = portalOpen(user.id, portal);
  return {
    member: isMember(portals, roles, portal),
    signedIn: open,
    locked: !open && signedInPortals(user.id).includes(portal),
    others: openPortals(user.id).filter((p) => p !== portal),
    email: user.email ?? '',
  };
}
