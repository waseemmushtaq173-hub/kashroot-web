/**
 * The eight public portals as they appear on the homepage cards and in the
 * header's Portals menu: name, a short description of the portal's ACTUAL
 * purpose, a recognisable icon, a distinctive colour identity and the direct
 * open/sign-in route. No promotional "3D" wording anywhere — only Cold
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
  gradientClass: string;
  borderClass: string;
  badgeBgClass: string;
  buttonClass: string;
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
    gradientClass: 'from-emerald-900 via-emerald-800 to-teal-900 text-white',
    borderClass: 'border-emerald-600/40',
    badgeBgClass: 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/30',
    buttonClass: 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold',
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
    gradientClass: 'from-amber-900 via-amber-800 to-orange-950 text-white',
    borderClass: 'border-amber-500/40',
    badgeBgClass: 'bg-amber-500/20 text-amber-200 border border-amber-400/30',
    buttonClass: 'bg-amber-400 hover:bg-amber-300 text-slate-950 font-semibold',
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
    gradientClass: 'from-orange-900 via-red-900 to-stone-900 text-white',
    borderClass: 'border-orange-500/40',
    badgeBgClass: 'bg-orange-500/20 text-orange-200 border border-orange-400/30',
    buttonClass: 'bg-orange-400 hover:bg-orange-300 text-slate-950 font-semibold',
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
    gradientClass: 'from-sky-950 via-cyan-900 to-slate-900 text-white',
    borderClass: 'border-cyan-500/40',
    badgeBgClass: 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/30',
    buttonClass: 'bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-semibold',
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
    gradientClass: 'from-indigo-950 via-blue-900 to-slate-950 text-white',
    borderClass: 'border-indigo-500/40',
    badgeBgClass: 'bg-indigo-500/20 text-indigo-200 border border-indigo-400/30',
    buttonClass: 'bg-indigo-400 hover:bg-indigo-300 text-slate-950 font-semibold',
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
    gradientClass: 'from-teal-950 via-emerald-950 to-cyan-950 text-white',
    borderClass: 'border-teal-500/40',
    badgeBgClass: 'bg-teal-500/20 text-teal-200 border border-teal-400/30',
    buttonClass: 'bg-teal-400 hover:bg-teal-300 text-slate-950 font-semibold',
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
    gradientClass: 'from-green-950 via-lime-950 to-emerald-950 text-white',
    borderClass: 'border-lime-500/40',
    badgeBgClass: 'bg-lime-500/20 text-lime-200 border border-lime-400/30',
    buttonClass: 'bg-lime-400 hover:bg-lime-300 text-slate-950 font-semibold',
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
    gradientClass: 'from-purple-950 via-fuchsia-950 to-slate-950 text-white',
    borderClass: 'border-purple-500/40',
    badgeBgClass: 'bg-purple-500/20 text-purple-200 border border-purple-400/30',
    buttonClass: 'bg-purple-400 hover:bg-purple-300 text-slate-950 font-semibold',
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
