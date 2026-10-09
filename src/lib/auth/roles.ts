/**
 * Portals and their sign-in pages. Every portal has its own sign-in at
 * /login/<portal> — there is no shared "pick your account type" form.
 *
 * Server-safe (no browser APIs), so server components, the login route and the
 * dashboards layout can all build links from it.
 *
 * Two kinds of portal:
 *   - Role portals (farmer, buyer, seller, logistics, admin) belong to one
 *     account type. Signing in through them checks the account's role.
 *   - Shared portals (kissan tools, rental, tracking, dealer, expert) are
 *     open to any signed-in account; each still has its own sign-in page.
 *
 * SECURITY: the role checks here are UX. The account role comes from Supabase
 * (app_metadata first, then user_metadata, which users can edit themselves), so
 * the backend must still enforce access on every request.
 */

/** Account role values stored in `user_role` and Supabase metadata. */
export type AccountRole = 'FARMER' | 'BUYER' | 'SELLER' | 'PROVIDER' | 'ADMIN' | 'EXPERT' | 'DEALER';

export type PortalId =
  | 'farmer'
  | 'buyer'
  | 'seller'
  | 'kissan'
  | 'rental'
  | 'logistics'
  | 'tracking'
  | 'dealer'
  | 'expert'
  | 'admin';

export interface PortalInfo {
  label: string;
  /** Account role the portal requires; null = any signed-in account. */
  requiredRole: AccountRole | null;
  /** Where the portal lands after sign-in when no `next` was requested. */
  home: string;
  /** The (dashboards) route segment the portal lives under. */
  segment: string;
  /** One line for menus and the sign-in chooser. */
  tagline: string;
}

export const PORTALS: Record<PortalId, PortalInfo> = {
  farmer: { label: 'Farmer', requiredRole: 'FARMER', home: '/farmer/dashboard', segment: 'farmer', tagline: 'Orchards, listings & advisory' },
  buyer: { label: 'Buyer', requiredRole: 'BUYER', home: '/buyer/dashboard', segment: 'buyer', tagline: 'Source verified produce' },
  seller: { label: 'Seller', requiredRole: 'SELLER', home: '/seller/dashboard', segment: 'seller', tagline: 'Catalogue, orders & payouts' },
  kissan: { label: 'Kissan Tools', requiredRole: null, home: '/kissan-tools/dashboard', segment: 'kissan-tools', tagline: 'Equipment & horti supplies' },
  rental: { label: 'Rental', requiredRole: null, home: '/rental/dashboard', segment: 'rental', tagline: 'Cold storage & machinery' },
  logistics: { label: 'Logistics', requiredRole: 'PROVIDER', home: '/provider/dashboard', segment: 'provider', tagline: 'Transport jobs & cold chain' },
  tracking: { label: 'Tracking', requiredRole: null, home: '/tracking/dashboard', segment: 'tracking', tagline: 'Find any consignment' },
  dealer: { label: 'Agro-dealer', requiredRole: null, home: '/dealer/dashboard', segment: 'dealer', tagline: 'Batch-coded inputs & compliance' },
  expert: { label: 'Advisory', requiredRole: null, home: '/expert', segment: 'expert', tagline: 'Ask agronomists, soil tests' },
  admin: { label: 'Admin', requiredRole: 'ADMIN', home: '/admin/dashboard', segment: 'admin', tagline: 'KYC, disputes & analytics' },
};

export const PORTAL_IDS = Object.keys(PORTALS) as PortalId[];

export function isPortalId(value: string): value is PortalId {
  return value in PORTALS;
}

/** The portal that owns a (dashboards) route segment, e.g. 'provider' → 'logistics'. */
export function portalForSegment(segment: string | null | undefined): PortalId | null {
  return PORTAL_IDS.find((id) => PORTALS[id].segment === segment) ?? null;
}

/** The portal whose role an account has, e.g. 'PROVIDER' → 'logistics'. */
export function portalForRole(role: string | null | undefined): PortalId | null {
  return PORTAL_IDS.find((id) => PORTALS[id].requiredRole === role) ?? null;
}

/** Link to a portal's sign-in, carrying where to go afterwards. */
export function loginHref(portal: PortalId, next?: string): string {
  return next ? `/login/${portal}?next=${encodeURIComponent(next)}` : `/login/${portal}`;
}

/** Roles a person can pick when creating an account. */
export const REGISTER_ROLES: { role: AccountRole; portal: PortalId; label: string }[] = [
  { role: 'FARMER', portal: 'farmer', label: 'Farmer' },
  { role: 'BUYER', portal: 'buyer', label: 'Buyer' },
  { role: 'SELLER', portal: 'seller', label: 'Seller' },
  { role: 'PROVIDER', portal: 'logistics', label: 'Logistics' },
];

/** Auxiliary auth routes in this app. */
export const AUTH_ROUTES = {
  /** Register, optionally with the account type preselected. */
  register: (portal?: PortalId) => {
    const role = REGISTER_ROLES.find((r) => r.portal === portal)?.role;
    return role ? `/register?role=${role}` : '/register';
  },
  forgotPassword: '/forgot-password',
} as const;

// ── Back-compat names used across the app ──────────────────────────────────
export type PortalRole = PortalId;
export const PORTAL_ROLES = PORTAL_IDS;
export const isPortalRole = isPortalId;
export const ROLE_LABELS = Object.fromEntries(PORTAL_IDS.map((id) => [id, PORTALS[id].label])) as Record<PortalId, string>;
export const ROLE_HOME = Object.fromEntries(PORTAL_IDS.map((id) => [id, PORTALS[id].home])) as Record<PortalId, string>;
export const portalRoleFromValue = portalForRole;

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
