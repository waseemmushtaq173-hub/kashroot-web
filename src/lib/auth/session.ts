'use client';

/**
 * Staying signed in.
 *
 *   - The Supabase session (kept by supabase-js in this browser) is the one
 *     source of truth. Every portal checks it — and refreshes it when its
 *     short-lived token has expired — instead of a copied token, so the site
 *     never looks signed in while the data refuses to load, or sends someone
 *     to sign-in while their session is still good.
 *   - Closed the app and came back — after minutes or months: straight in.
 *     There is no time limit: people stay signed in on their phone until
 *     they press Sign out themselves.
 *   - After Sign out, the next sign-in needs their email and password again
 *     (signOutCompletely forgets them on this device). Everything they saved
 *     stays in their account.
 */
import { useEffect, useState } from 'react';
import { isAuthRetryableFetchError, type Session } from '@supabase/supabase-js';

import { authApi, rolesOf, tokenStore } from '@/lib/api/auth';
import { forgetPortalSignIns, markPortalSignedOut, portalAccess, signedInPortals } from '@/lib/auth/portalAccess';
import { forgetStaffRoles, staffRolesOf } from '@/lib/auth/staffRoles';
import { isPortalId, type PortalId } from '@/lib/auth/roles';
import { supabase, supabaseConfigured } from '@/lib/supabase';

const ACTIVE_KEY = 'kr_last_active';
const REMEMBER_KEY = 'kr_remember';

export interface RememberedPerson {
  email: string;
  name: string;
  portal: PortalId;
}

export interface ActiveSession {
  session: Session;
  roles: string[];
  name: string;
}

const read = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key: string, value: string | null) => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* private mode: nothing to keep */
  }
};

export function rememberedPerson(): RememberedPerson | null {
  try {
    const p = JSON.parse(read(REMEMBER_KEY) ?? 'null') as RememberedPerson | null;
    return p && typeof p.email === 'string' && p.email ? p : null;
  } catch {
    return null;
  }
}

export function rememberPerson(p: RememberedPerson) {
  write(REMEMBER_KEY, JSON.stringify(p));
}

export function forgetPerson() {
  write(REMEMBER_KEY, null);
}

/** Note that the person used KashRoot now (at most once a minute). */
export function touchActivity() {
  const last = Number(read(ACTIVE_KEY) ?? 0);
  if (Date.now() - last > 60_000) write(ACTIVE_KEY, String(Date.now()));
}

let listening = false;
/** Keep the portals' copy of the token in step with Supabase (refreshes, sign-out elsewhere). */
function listen() {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') tokenStore.removeToken();
    else if (session && (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') && read('auth_token')) {
      write('auth_token', session.access_token);
    }
  });
  const onActive = () => {
    if (document.visibilityState === 'visible') touchActivity();
  };
  document.addEventListener('visibilitychange', onActive);
  window.addEventListener('pointerdown', onActive, { passive: true });
}

/**
 * The signed-in person on this device, or null. Refreshes an expired token
 * and keeps the stored roles in step.
 */
export async function restoreSession(): Promise<ActiveSession | null> {
  if (!supabaseConfigured || typeof window === 'undefined') return null;
  listen();
  const { data } = await supabase.auth.getSession();
  let session = data.session;
  if (!session) {
    tokenStore.removeToken();
    return null;
  }
  // getSession() returns what is stored; make sure the token is still accepted.
  if (session.expires_at && session.expires_at * 1000 < Date.now() + 30_000) {
    const refreshed = await supabase.auth.refreshSession().catch((error: unknown) => ({ data: { session: null }, error }));
    if (refreshed.data.session) session = refreshed.data.session;
    else if (!isAuthRetryableFetchError(refreshed.error)) {
      // The sign-in service said no: the session really has ended.
      tokenStore.removeToken();
      return null;
    }
    // Otherwise no signal or the sign-in service is busy: they are still
    // signed in. Keep them on the page; supabase-js renews the token by
    // itself as soon as it can.
  }
  const user = session.user;
  const roles = [...new Set([...rolesOf(user), ...(await staffRolesOf(user.id))])];
  const stored = read('user_role');
  tokenStore.setToken(session.access_token, stored && roles.includes(stored) ? stored : roles[0], roles);
  touchActivity();
  const name = String(user.user_metadata?.full_name ?? '') || (user.email ?? '').split('@')[0];
  return { session, roles, name };
}

/** After a successful sign-in: remember who this is on this device and start the activity clock. */
export async function rememberSignedIn(portal: PortalId, email: string) {
  touchActivity();
  write(ACTIVE_KEY, String(Date.now()));
  const { data } = await supabase.auth.getSession();
  const name = String(data.session?.user.user_metadata?.full_name ?? '') || email.split('@')[0];
  rememberPerson({ email, name, portal });
}

/** The portal of the person signed in on this device (no network), or null. */
export function useMyPortal(): PortalId | null {
  const [portal, setPortal] = useState<PortalId | null>(null);
  useEffect(() => {
    let live = true;
    const run = async () => {
      if (!supabaseConfigured) return;
      const { data } = await supabase.auth.getSession();
      if (!live || !data.session) return;
      // A portal they are signed in to here: the last one used, else any.
      const here = signedInPortals(data.session.user.id);
      const last = read('auth_portal');
      setPortal(last && isPortalId(last) && here.includes(last) ? last : here[0] ?? null);
    };
    void run();
    return () => {
      live = false;
    };
  }, []);
  return portal;
}

/**
 * Whether someone is signed in on this device (null while checking) — with a
 * portal: signed in to that portal (each portal has its own sign-in).
 */
export function useSignedIn(portal?: PortalId): boolean | null {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    const run = async () => {
      if (!supabaseConfigured) return live && setSignedIn(false);
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user;
      if (!user || !portal) return live && setSignedIn(Boolean(user));
      // The portal layout already checked the account; here: signed in to this portal on this device.
      const access = await portalAccess(user, rolesOf(user), portal);
      if (live) setSignedIn(access.signedIn);
    };
    void run();
    return () => {
      live = false;
    };
  }, [portal]);
  return signedIn;
}

/** The person pressed Sign out: end the session and forget them on this device. */
export async function signOutCompletely() {
  forgetPerson();
  forgetPortalSignIns();
  forgetStaffRoles();
  await authApi.logout();
}

/**
 * Sign out of one portal. The other portals they are signed in to on this
 * device stay signed in; signing out of the last one ends the session.
 */
export async function signOutOfPortal(portal: PortalId) {
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user;
  if (!user) return;
  if (markPortalSignedOut(user.id, portal).length === 0) await signOutCompletely();
}
