/**
 * Portal roles for the dedicated sign-in pages (/login/farmer, /login/buyer,
 * /login/seller) that replace the global "Welcome back" screen.
 *
 * Server-safe (no browser APIs), so the landing page and the login route can
 * both build links from it.
 *
 * Sign-in here is authApi.login (Supabase) followed by tokenStore.setToken with
 * the role of the page the user signed in through — the same binding the old
 * /login page did with its "Account Type" dropdown. The role is NOT verified
 * server-side yet (authApi.login returns a mock role); when the API returns
 * real roles, check them in RoleLoginForm before calling tokenStore.setToken.
 */
export type PortalRole = 'farmer' | 'buyer' | 'seller';

export const PORTAL_ROLES: readonly PortalRole[] = ['farmer', 'buyer', 'seller'];

export const ROLE_LABELS: Record<PortalRole, string> = {
  farmer: 'Farmer',
  buyer: 'Buyer',
  seller: 'Seller',
};

/** Value stored in localStorage `user_role` / the `user_role` cookie. */
export const ROLE_VALUE: Record<PortalRole, 'FARMER' | 'BUYER' | 'SELLER'> = {
  farmer: 'FARMER',
  buyer: 'BUYER',
  seller: 'SELLER',
};

/** Where each portal lands after sign-in when no `next` was requested. */
export const ROLE_HOME: Record<PortalRole, string> = {
  farmer: '/farmer/dashboard',
  buyer: '/buyer/dashboard',
  seller: '/seller/dashboard',
};

/** Auxiliary auth routes in this app. */
export const AUTH_ROUTES = {
  /** The register page reads no query yet; its role picker is on the form. */
  register: () => '/register',
  forgotPassword: '/forgot-password',
} as const;

export function isPortalRole(value: string): value is PortalRole {
  return (PORTAL_ROLES as readonly string[]).includes(value);
}

/** Link to a portal's sign-in, carrying where to go afterwards. */
export function loginHref(role: PortalRole, next?: string): string {
  return next ? `/login/${role}?next=${encodeURIComponent(next)}` : `/login/${role}`;
}

/** The portal for a stored `user_role` value (e.g. 'FARMER' → 'farmer'). */
export function portalRoleFromValue(value: string | null | undefined): PortalRole | null {
  return PORTAL_ROLES.find((role) => ROLE_VALUE[role] === value) ?? null;
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
