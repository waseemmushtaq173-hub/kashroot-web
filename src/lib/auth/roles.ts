/**
 * The three roles with a dedicated sign-in page (/login/farmer, /login/buyer,
 * /login/seller), replacing the global "Welcome back" screen for them.
 *
 * Server-safe (no browser APIs), so the landing page and the login route can
 * both build links from it.
 *
 * Adapted from the web-overhaul stub for this repo's auth: sign-in is Supabase
 * via `authApi.login`, which returns no role list, so the stub's
 * ACCEPTED_BACKEND_ROLES check and `portalRoleForBackendRole` are dropped. The
 * role a session is scoped to is the portal it signed in through — written to
 * localStorage by `tokenStore.setToken` and enforced by the dashboard guard in
 * src/app/(dashboards)/layout.tsx.
 *
 * The type is `LoginRole`, not the stub's `PortalRole`: src/lib/auth/portals.ts
 * already exports a `PortalRole` for all eight gated portals in upper case, and
 * two same-named types would collide wherever a file needs both.
 */
import { PORTALS_BY_ROLE, type PortalRole } from './portals';

export type LoginRole = 'farmer' | 'buyer' | 'seller';

export const LOGIN_ROLES: readonly LoginRole[] = ['farmer', 'buyer', 'seller'];

export const ROLE_LABELS: Record<LoginRole, string> = {
  farmer: 'Farmer',
  buyer: 'Buyer',
  seller: 'Seller',
};

/** The session role string this repo stores for each login page. */
export const SESSION_ROLE: Record<LoginRole, Extract<PortalRole, 'FARMER' | 'BUYER' | 'SELLER'>> = {
  farmer: 'FARMER',
  buyer: 'BUYER',
  seller: 'SELLER',
};

/** Mirrors /register, which offers only these two roles. */
export const SELF_REGISTER_ROLES: readonly LoginRole[] = ['farmer', 'buyer'];

/** Where each role lands after sign-in when no `next` was requested. */
export const ROLE_HOME: Record<LoginRole, string> = {
  farmer: PORTALS_BY_ROLE.FARMER.dashboard,
  buyer: PORTALS_BY_ROLE.BUYER.dashboard,
  seller: PORTALS_BY_ROLE.SELLER.dashboard,
};

/** Auxiliary auth routes in this app. */
export const AUTH_ROUTES = {
  register: (role: LoginRole) => `/register?role=${role}`,
  forgotPassword: '/forgot-password',
  /** Admin, Expert, Kissan Partner, Provider and Rental sign in here. */
  otherRoles: '/login',
} as const;

export function isLoginRole(value: string): value is LoginRole {
  return (LOGIN_ROLES as readonly string[]).includes(value);
}

/** The dedicated sign-in for a stored session role, if it has one. */
export function loginRoleForSessionRole(sessionRole: string | null | undefined): LoginRole | null {
  return LOGIN_ROLES.find((role) => SESSION_ROLE[role] === sessionRole) ?? null;
}

/** Link to a role's sign-in, carrying where to go afterwards. */
export function loginHref(role: LoginRole, next?: string): string {
  return next ? `/login/${role}?next=${encodeURIComponent(next)}` : `/login/${role}`;
}

/**
 * `next` arrives from the query string, so it is attacker-controlled. Only a
 * same-origin path is honoured: "//evil.com", "/\evil.com" and "/<TAB>/evil.com"
 * all resolve to another host in a browser and would turn sign-in into an open
 * redirect. Resolving against a placeholder origin with the same URL parser the
 * browser uses catches every such spelling, not just the ones listed here.
 */
export function safeNextPath(next: string | null | undefined, fallback: string): string {
  if (!next || !next.startsWith('/')) return fallback;
  const base = 'https://kashroot.invalid';
  try {
    const url = new URL(next, base);
    return url.origin === base ? `${url.pathname}${url.search}${url.hash}` : fallback;
  } catch {
    return fallback;
  }
}

/** First usable value from `?next=` / `?returnTo=`, which may repeat. */
export function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
