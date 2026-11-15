/**
 * The eight public portals as they appear on the homepage cards and in the
 * header's Portals menu: name, a short description of the portal's ACTUAL
 * purpose, a recognisable icon, a one-word badge and the direct open/sign-in
 * route; every card wears the one KashRoot look (components/landing/PortalGrid),
 * the portal's own identity is its icon and badge word. No promotional "3D"
 * wording anywhere — only Cold
 * Storage keeps its industrial digital twin, described by what it does.
 *
 * href mapping (directive route → this app's real home route):
 *   /kissan-tools  → /kissan-tools/dashboard   (the bare path has no page)
 *   /rental        → /rental/dashboard
 *   /dealer        → /dealer/dashboard
 *   /advisory      → /expert                   (the Advisory portal's home)
 *   /mandi         → /trader/dashboard         (the Mandi Helpers portal's home)
 *   /farmer/dashboard, /buyer/dashboard, /tracking exist as written.
 */
import type { LucideIcon } from 'lucide-react';
import { BarChart3, BookOpenCheck, ShoppingBag, Snowflake, Sprout, Store, Truck, Wrench } from 'lucide-react';

export interface PortalCardItem {
  id: string;
  name: string;
  purpose: string;
  href: string;
  actionLabel: string;
  iconName: string;
  emoji: string;
  /** One word for the gold badge on the homepage card: what the portal is for. */
  tag: string;
  icon: LucideIcon;
}

export const EIGHT_PORTALS_CONFIG: PortalCardItem[] = [
  {
    id: 'farmer',
    name: 'Farmer',
    purpose: 'List harvest lots, manage orchard health, track season schedules, and receive escrow payouts.',
    href: '/farmer/dashboard',
    actionLabel: 'Open Farmer Portal',
    iconName: 'Sprout',
    emoji: '🌳',
    tag: 'Grow',
    icon: Sprout,
  },
  {
    id: 'buyer',
    name: 'Buyer',
    purpose: 'Browse verified orchard produce, compare grades and box weights, and order with escrow protection.',
    href: '/buyer/dashboard',
    actionLabel: 'Open Buyer Portal',
    iconName: 'ShoppingBag',
    emoji: '📦',
    tag: 'Source',
    icon: ShoppingBag,
  },
  {
    id: 'kissan-tools',
    name: 'Kissan Tools',
    purpose: 'Explore orchard tractors, sprayers, harvesters, irrigation systems, and technical specifications.',
    href: '/kissan-tools/dashboard',
    actionLabel: 'Explore Equipment',
    iconName: 'Wrench',
    emoji: '🚜',
    tag: 'Equip',
    icon: Wrench,
  },
  {
    id: 'cold-storage',
    name: 'Cold Storage Booking',
    purpose: 'Inspect chambers, check live crate and bin capacity, and reserve cold storage space online.',
    href: '/rental/dashboard',
    actionLabel: 'Book Cold Storage',
    iconName: 'Snowflake',
    emoji: '❄️',
    tag: 'Store',
    icon: Snowflake,
  },
  {
    id: 'tracking',
    name: 'Tracking',
    purpose: 'Monitor live shipment routes, vehicle location, covered distance, and delivery ETA.',
    href: '/tracking',
    actionLabel: 'Track Shipments',
    iconName: 'Truck',
    emoji: '🚛',
    tag: 'Track',
    icon: Truck,
  },
  {
    id: 'agro-dealer',
    name: 'Agro-dealer',
    purpose: 'Manage certified seeds, fertilizers, pesticides, agricultural supplies, and dealer orders.',
    href: '/dealer/dashboard',
    actionLabel: 'Open Dealer Portal',
    iconName: 'Store',
    emoji: '🧪',
    tag: 'Supply',
    icon: Store,
  },
  {
    id: 'advisory',
    name: 'Advisory',
    purpose: 'Access crop advisories, soil diagnostics, disease management guides, and expert consultations.',
    href: '/expert',
    actionLabel: 'View Crop Advisory',
    iconName: 'BookOpenCheck',
    emoji: '🌿',
    tag: 'Advise',
    icon: BookOpenCheck,
  },
  {
    id: 'mandi-helpers',
    name: 'Mandi Helpers',
    purpose: 'Check daily mandi rates, compare regional market trends, and connect with verified traders.',
    href: '/trader/dashboard',
    actionLabel: 'Open Mandi Desk',
    iconName: 'BarChart3',
    emoji: '📈',
    tag: 'Trade',
    icon: BarChart3,
  },
];

/** Quick lookup by portal id (same ids as lib/auth/roles PortalId). */
export const PORTAL_CARD_BY_ID: Record<string, PortalCardItem> = Object.fromEntries(EIGHT_PORTALS_CONFIG.map((c) => [c.id, c]));

/**
 * lib/auth/roles PortalId → its card in EIGHT_PORTALS_CONFIG. The cards use
 * the directive's own ids, which differ from the auth portal ids; this table
 * is the one explicit bridge (menus, dropdowns and the My-portal button use
 * it to read the same purpose copy the cards show).
 */
export const PORTAL_CARD_FOR: Record<string, PortalCardItem> = {
  farmer: PORTAL_CARD_BY_ID.farmer,
  buyer: PORTAL_CARD_BY_ID.buyer,
  kissan: PORTAL_CARD_BY_ID['kissan-tools'],
  rental: PORTAL_CARD_BY_ID['cold-storage'],
  tracking: PORTAL_CARD_BY_ID.tracking,
  dealer: PORTAL_CARD_BY_ID['agro-dealer'],
  expert: PORTAL_CARD_BY_ID.advisory,
  trader: PORTAL_CARD_BY_ID['mandi-helpers'],
};
