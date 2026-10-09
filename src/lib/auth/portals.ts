import {
  GraduationCap,
  PackageSearch,
  ShieldCheck,
  Sprout,
  Store,
  Tractor,
  Truck,
  Warehouse,
  type LucideIcon,
} from 'lucide-react';

/**
 * Portal registry — the single source of truth for signing in.
 *
 * `role` must match the strings the dashboard guard compares against in
 * src/app/(dashboards)/layout.tsx. That guard is what scopes a session to one
 * portal, so any role missing from this file has no way to reach its own
 * dashboard: the guard rejects the session and the recovery link lands back on
 * a picker that cannot mint the role it needs.
 */
export type PortalRole =
  | 'FARMER'
  | 'BUYER'
  | 'SELLER'
  | 'EXPERT'
  | 'ADMIN'
  | 'PROVIDER'
  | 'KISSAN_PARTNER'
  | 'RENTAL';

export type PortalAccent = 'emerald' | 'sky' | 'amber' | 'violet' | 'rose' | 'slate';

export interface Portal {
  role: PortalRole;
  /** URL segment, also the key for the shared /login/[portal] route. */
  slug: string;
  label: string;
  detail: string;
  /** How the role is named when the dashboard guard turns someone away. */
  accountLabel: string;
  /** Where the sign-in form for this portal lives. */
  loginHref: string;
  /** Where a signed-in session lands. */
  dashboard: string;
  /**
   * Self-service sign-up, where it exists. /register only offers FARMER and
   * BUYER and RegisterDto only accepts those two; partner and staff accounts
   * are provisioned, so those portals deliberately have no sign-up link.
   */
  signupHref?: string;
  accent: PortalAccent;
  icon: LucideIcon;
  /** Trade portals have their own designed page and lead the picker. */
  primary: boolean;
}

export const PORTALS: Portal[] = [
  {
    role: 'FARMER',
    slug: 'farmer',
    label: 'Farmer Login',
    detail: 'Orchard tools, harvest listings, and crop support.',
    accountLabel: 'Farmer',
    loginHref: '/farmer/login',
    dashboard: '/farmer/dashboard',
    signupHref: '/register',
    accent: 'emerald',
    icon: Sprout,
    primary: true,
  },
  {
    role: 'BUYER',
    slug: 'buyer',
    label: 'Buyer Login',
    detail: 'Source verified produce from Kashmiri growers.',
    accountLabel: 'Buyer',
    loginHref: '/buyer/login',
    dashboard: '/buyer/dashboard',
    signupHref: '/register',
    accent: 'sky',
    icon: Store,
    primary: true,
  },
  {
    role: 'SELLER',
    slug: 'seller',
    label: 'Seller Login',
    detail: 'Manage your products, stock, and supplier offers.',
    accountLabel: 'Seller',
    loginHref: '/seller/login',
    dashboard: '/seller/dashboard',
    accent: 'amber',
    icon: PackageSearch,
    primary: true,
  },
  {
    role: 'KISSAN_PARTNER',
    slug: 'kissan-tools',
    label: 'Kissan Partner Login',
    detail: 'Orchard equipment, sprayers, and horticulture supplies.',
    accountLabel: 'Kissan Partner',
    loginHref: '/login/kissan-tools',
    dashboard: '/kissan-tools/dashboard',
    accent: 'emerald',
    icon: Tractor,
    primary: false,
  },
  {
    role: 'RENTAL',
    slug: 'rental',
    label: 'Rental Partner Login',
    detail: 'Cold storage space, tractors, and pruning gear.',
    accountLabel: 'Equipment / Machinery Rental',
    loginHref: '/login/rental',
    dashboard: '/rental/dashboard',
    accent: 'slate',
    icon: Warehouse,
    primary: false,
  },
  {
    role: 'PROVIDER',
    slug: 'provider',
    label: 'Logistics Login',
    detail: 'Shipment tracking and provider dispatch.',
    accountLabel: 'Logistics & Provider',
    loginHref: '/login/provider',
    dashboard: '/provider/dashboard',
    accent: 'sky',
    icon: Truck,
    primary: false,
  },
  {
    role: 'EXPERT',
    slug: 'expert',
    label: 'Expert Login',
    detail: 'Advisory desk for agronomists and crop specialists.',
    accountLabel: 'Agricultural Expert',
    loginHref: '/login/expert',
    dashboard: '/expert',
    signupHref: '/register/expert',
    accent: 'violet',
    icon: GraduationCap,
    primary: false,
  },
  {
    role: 'ADMIN',
    slug: 'admin',
    label: 'Admin Login',
    detail: 'Quality audit, escrow verification, and KYC governance.',
    accountLabel: 'Platform Admin',
    loginHref: '/login/admin',
    dashboard: '/admin/dashboard',
    accent: 'rose',
    icon: ShieldCheck,
    primary: false,
  },
];

export const PORTALS_BY_ROLE = Object.fromEntries(
  PORTALS.map((portal) => [portal.role, portal]),
) as Record<PortalRole, Portal>;

/** Portals served by the shared /login/[portal] route. */
export const SHARED_LOGIN_PORTALS = PORTALS.filter((portal) => !portal.primary);

export function portalBySlug(slug: string): Portal | undefined {
  return PORTALS.find((portal) => portal.slug === slug);
}

const PORTAL_SLUGS = new Set(PORTALS.map((portal) => portal.slug));

/**
 * Accepts a `returnTo` only if it is a same-origin path. A value starting with
 * `//` (or `/\`, which browsers normalise to `//`) is read as a protocol-
 * relative URL and would turn the login flow into an open redirect, so those
 * are rejected along with anything carrying whitespace or control characters.
 */
export function sanitizePath(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || !raw.startsWith('/')) return undefined;
  // '//' is a protocol-relative URL, and a leading slash-backslash is
  // normalised to '//' by browsers, so both are rejected.
  if (raw[1] === '/' || raw[1] === '\\') return undefined;
  for (const char of raw) {
    if (char.charCodeAt(0) <= 0x20) return undefined;
  }
  return raw;
}

/**
 * Where this portal should land after sign-in. A `returnTo` pointing into a
 * different portal is dropped rather than followed: the dashboard guard would
 * only reject it, so the session is better off on its own dashboard.
 */
export function returnToFor(value: string | string[] | undefined, portal: Portal): string {
  const path = sanitizePath(value);
  if (!path) return portal.dashboard;
  const segment = path.split('/')[1]?.split(/[?#]/)[0];
  if (segment && PORTAL_SLUGS.has(segment) && segment !== portal.slug) return portal.dashboard;
  return path;
}

/** Appends a validated `returnTo` to a login link so it survives the hop. */
export function withReturnTo(href: string, returnTo: string | undefined): string {
  return returnTo ? `${href}?returnTo=${encodeURIComponent(returnTo)}` : href;
}

// Accent classes are written out in full so Tailwind's scanner picks them up.
export const ACCENT_BUTTON: Record<PortalAccent, string> = {
  emerald: 'bg-emerald-700 hover:bg-emerald-800',
  sky: 'bg-sky-700 hover:bg-sky-800',
  amber: 'bg-amber-700 hover:bg-amber-800',
  violet: 'bg-violet-700 hover:bg-violet-800',
  rose: 'bg-rose-700 hover:bg-rose-800',
  slate: 'bg-slate-700 hover:bg-slate-800',
};

export const ACCENT_BADGE: Record<PortalAccent, string> = {
  emerald: 'bg-emerald-100 text-emerald-800',
  sky: 'bg-sky-100 text-sky-800',
  amber: 'bg-amber-100 text-amber-800',
  violet: 'bg-violet-100 text-violet-800',
  rose: 'bg-rose-100 text-rose-800',
  slate: 'bg-slate-200 text-slate-800',
};

export const ACCENT_HEADING: Record<PortalAccent, string> = {
  emerald: 'text-emerald-950',
  sky: 'text-sky-950',
  amber: 'text-amber-950',
  violet: 'text-violet-950',
  rose: 'text-rose-950',
  slate: 'text-slate-900',
};

export const ACCENT_LINK: Record<PortalAccent, string> = {
  emerald: 'hover:text-emerald-800',
  sky: 'hover:text-sky-800',
  amber: 'hover:text-amber-800',
  violet: 'hover:text-violet-800',
  rose: 'hover:text-rose-800',
  slate: 'hover:text-slate-900',
};

export const ACCENT_PAGE: Record<PortalAccent, string> = {
  emerald: 'bg-gradient-to-br from-lime-100 via-emerald-50 to-white',
  sky: 'bg-gradient-to-br from-sky-100 via-white to-indigo-50',
  amber: 'bg-gradient-to-br from-amber-100 via-orange-50 to-white',
  violet: 'bg-gradient-to-br from-violet-100 via-white to-indigo-50',
  rose: 'bg-gradient-to-br from-rose-100 via-white to-orange-50',
  slate: 'bg-gradient-to-br from-slate-200 via-white to-sky-50',
};
