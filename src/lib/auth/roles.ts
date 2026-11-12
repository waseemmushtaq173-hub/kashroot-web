/**
 * Portals and their sign-in pages. Every portal has its own sign-in at
 * /login/<portal> — there is no shared "pick your account type" form.
 *
 * Server-safe (no browser APIs), so server components, the login route and the
 * dashboards layout can all build links from it.
 *
 * Two kinds of portal:
 *   - Role portals (farmer, buyer, admin) belong to one account type. Signing
 *     in through them checks the account's role. Selling (produce and farm
 *     inputs) is part of the Farmer portal; there is no separate Seller or
 *     Logistics portal any more (old links redirect, see next.config.ts).
 *   - Shared portals (kissan tools, cold storage, tracking, dealer, expert,
 *     trader) are open to any signed-in account; each has its own sign-in
 *     page. Tracking also works without signing in, to follow a load by its code.
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
  | 'kissan'
  | 'rental'
  | 'tracking'
  | 'dealer'
  | 'expert'
  | 'trader'
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
  /** The portal's own colour identity: a 3D-styled badge in menus and cards. */
  theme: PortalTheme;
}

/** Each portal's colour, for the 3D-badged menus (Server-safe: plain strings). */
export interface PortalTheme {
  /** Tailwind gradient for the badge tile. */
  badge: string;
  /** Softer wash behind menu rows on hover. */
  wash: string;
  /** Ring accent for the badge and rows. */
  ring: string;
  /** Deep accent text colour. */
  text: string;
}

export const PORTALS: Record<PortalId, PortalInfo> = {
  farmer: {
    label: 'Farmer', requiredRole: 'FARMER', home: '/farmer/dashboard', segment: 'farmer',
    tagline: 'Orchards, produce sales, escrow & season planner',
    theme: { badge: 'from-emerald-800 to-emerald-500', wash: 'hover:bg-emerald-50', ring: 'ring-emerald-700/30', text: 'text-emerald-900' },
  },
  buyer: {
    label: 'Buyer', requiredRole: 'BUYER', home: '/buyer/dashboard', segment: 'buyer',
    tagline: 'Verified produce lots, 3D packaging & escrow checkout',
    theme: { badge: 'from-amber-600 to-amber-400', wash: 'hover:bg-amber-50', ring: 'ring-amber-600/30', text: 'text-amber-900' },
  },
  kissan: {
    label: 'Kissan Tools', requiredRole: null, home: '/kissan-tools/dashboard', segment: 'kissan-tools',
    tagline: 'Interactive 3D tractors, sprayers & harvester specs',
    theme: { badge: 'from-orange-700 to-orange-500', wash: 'hover:bg-orange-50', ring: 'ring-orange-700/30', text: 'text-orange-900' },
  },
  rental: {
    label: 'Cold Storage Booking', requiredRole: null, home: '/rental/dashboard', segment: 'rental',
    tagline: 'Industrial 2D/3D digital twin & crate/bin booking',
    theme: { badge: 'from-cyan-600 to-sky-400', wash: 'hover:bg-cyan-50', ring: 'ring-cyan-600/30', text: 'text-cyan-900' },
  },
  tracking: {
    label: 'Tracking', requiredRole: null, home: '/tracking/dashboard', segment: 'tracking',
    tagline: 'Live truck GPS & route telemetry, app-style',
    theme: { badge: 'from-indigo-700 to-indigo-400', wash: 'hover:bg-indigo-50', ring: 'ring-indigo-700/30', text: 'text-indigo-900' },
  },
  dealer: {
    label: 'Agro-dealer', requiredRole: null, home: '/dealer/dashboard', segment: 'dealer',
    tagline: '3D seeds, fertilizers, pesticides & dealer inventory',
    theme: { badge: 'from-teal-600 to-lime-400', wash: 'hover:bg-teal-50', ring: 'ring-teal-600/30', text: 'text-teal-900' },
  },
  expert: {
    label: 'Advisory', requiredRole: null, home: '/expert', segment: 'expert',
    tagline: '3D plant pathology, soil health & verified advice',
    theme: { badge: 'from-green-800 to-green-600', wash: 'hover:bg-green-50', ring: 'ring-green-800/30', text: 'text-green-900' },
  },
  trader: {
    label: 'Mandi Helpers', requiredRole: null, home: '/trader/dashboard', segment: 'trader',
    tagline: 'Live Agmarknet rates, trader connect & price charts',
    theme: { badge: 'from-purple-700 to-fuchsia-500', wash: 'hover:bg-purple-50', ring: 'ring-purple-700/30', text: 'text-purple-900' },
  },
  admin: {
    label: 'Admin', requiredRole: 'ADMIN', home: '/admin/dashboard', segment: 'admin',
    tagline: 'KYC, disputes & analytics',
    theme: { badge: 'from-slate-700 to-slate-500', wash: 'hover:bg-slate-100', ring: 'ring-slate-600/30', text: 'text-slate-800' },
  },
};

export const PORTAL_IDS = Object.keys(PORTALS) as PortalId[];

/**
 * Portals shown to the public (home page, menu, sign-in chooser). The Admin
 * portal is never listed: only the owner knows its address, and it also needs
 * the admin's own access code after signing in.
 */
export const PUBLIC_PORTAL_IDS = PORTAL_IDS.filter((id) => id !== 'admin');

export function isPortalId(value: string): value is PortalId {
  return value in PORTALS;
}

/** The portal a path belongs to ('/farmer/dashboard?tab=x' → 'farmer'), or null for pages outside portals. */
export function portalOfPath(path: string): PortalId | null {
  const segment = path.split(/[/?#]/)[1] ?? '';
  return portalForSegment(segment);
}

/** The portal that owns a (dashboards) route segment, e.g. 'kissan-tools' → 'kissan'. */
export function portalForSegment(segment: string | null | undefined): PortalId | null {
  return PORTAL_IDS.find((id) => PORTALS[id].segment === segment) ?? null;
}

/**
 * The portal whose role an account has, e.g. 'BUYER' → 'buyer'. Accounts made
 * for the old Seller and Logistics portals go to Farmer (selling) and
 * Tracking (transport).
 */
export function portalForRole(role: string | null | undefined): PortalId | null {
  if (role === 'SELLER') return 'farmer';
  if (role === 'PROVIDER') return 'tracking';
  return PORTAL_IDS.find((id) => PORTALS[id].requiredRole === role) ?? null;
}

/** Link to a portal's sign-in, carrying where to go afterwards. */
export function loginHref(portal: PortalId, next?: string): string {
  return next ? `/login/${portal}?next=${encodeURIComponent(next)}` : `/login/${portal}`;
}

/** A tab of a portal's dashboard (each dashboard opens the tab in ?tab=). Signed out, the portal's sign-in comes first and returns here. */
export const portalTab = (portal: PortalId, tab: string) => `${PORTALS[portal].home}?tab=${tab}`;

/**
 * Where produce and farm supplies are bought and sold, by portal — used by the
 * footer, the old produce / supplies links, the voice actions and the assistant.
 */
export const MARKET_PLACES = {
  buyProduce: { href: portalTab('buyer', 'shop'), label: 'Buy produce', where: 'Buyer portal → Buy apples & produce' },
  sellProduce: { href: portalTab('farmer', 'lots'), label: 'Sell your harvest', where: 'Farmer portal → What I sell' },
  farmSupplies: { href: portalTab('kissan', 'shop'), label: 'Farm supplies', where: 'Kissan Tools → Shop' },
} as const;

/** Roles a person can pick when creating an account. */
export const REGISTER_ROLES: { role: AccountRole; portal: PortalId; label: string }[] = [
  { role: 'FARMER', portal: 'farmer', label: 'Farmer' },
  { role: 'BUYER', portal: 'buyer', label: 'Buyer' },
];

/** Account types a person can create themselves. */
export type SignUpRole = 'FARMER' | 'BUYER' | 'SELLER' | 'PROVIDER';

/**
 * Every portal except admin has its own create-account page
 * (/register/<portal>) with the account type already fixed — nobody who came
 * through a portal is asked which kind of account they want. Shared portals
 * create the account most of their users need: growers for tools, rental,
 * tracking and advisory; input sellers for agro-dealers; buyers for mandi
 * traders (commission agents buy from farmers).
 */
export const SIGNUP_ROLE: Partial<Record<PortalId, SignUpRole>> = {
  farmer: 'FARMER',
  buyer: 'BUYER',
  kissan: 'FARMER',
  rental: 'FARMER',
  tracking: 'FARMER',
  dealer: 'SELLER',
  expert: 'FARMER',
  trader: 'BUYER',
};

export const SIGNUP_PORTALS = PORTAL_IDS.filter((id) => SIGNUP_ROLE[id]);

/** Auxiliary auth routes in this app. */
export const AUTH_ROUTES = {
  /** A portal's own create-account page, or the general one with a picker. */
  register: (portal?: PortalId) => (portal && SIGNUP_ROLE[portal] ? `/register/${portal}` : '/register'),
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
