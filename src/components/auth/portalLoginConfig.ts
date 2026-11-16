/**
 * Look and copy of each portal's own sign-in page. Complete literal Tailwind
 * classes only (the compiler cannot see built strings).
 */
import {
  Building2,
  FlaskConical,
  Megaphone,
  GraduationCap,
  Leaf,
  MapPinned,
  ShieldCheck,
  ShoppingBag,
  Tractor,
  Warehouse,
  type LucideIcon,
} from 'lucide-react';

import type { SceneMood } from '@/components/three/ValleyScene';
import type { PortalId } from '@/lib/auth/roles';

export interface RoleLoginTheme {
  canvas: string;
  iconTile: string;
  eyebrow: string;
  bullet: string;
  button: string;
  link: string;
  /** focus-visible outline colour for buttons and links. */
  outline: string;
  /** Focus ring colour for inputs. */
  inputFocus: string;
  /** Tint laid over the 3D scene so the story text stays readable. */
  sceneTint: string;
}

export interface PortalLoginCopy {
  icon: LucideIcon;
  mood: SceneMood;
  eyebrow: string;
  headline: string;
  description: string;
  highlights: string[];
  theme: RoleLoginTheme;
}

/**
 * Each portal's sign-in speaks in its own season's colours over the one
 * KashRoot frame (matching BRAND and PORTAL_THEMES in components/portal/kit).
 * The farmer keeps the deep chinar green; the cold store its glacier blue.
 */
const FARMER: RoleLoginTheme = {
  canvas: 'bg-gradient-to-br from-[#FBF8F0] via-[#F6F1E3] to-[#F3F0FF]',
  iconTile: 'bg-gradient-to-br from-red-700 to-[#14123A] text-red-50 shadow-lg shadow-red-950/30 ring-1 ring-amber-300/40',
  eyebrow: 'text-amber-200',
  bullet: 'text-amber-500',
  button: 'bg-red-800 text-white shadow-red-900/25 hover:bg-red-900',
  link: 'text-red-800 hover:text-red-900 hover:underline underline-offset-4',
  outline: 'focus-visible:outline-red-700',
  inputFocus: 'focus:ring-red-700',
  sceneTint: 'from-[#14123A]/80 via-red-950/35 to-transparent',
};

const BUYER: RoleLoginTheme = {
  canvas: 'bg-gradient-to-br from-[#FBF8F0] via-[#F6F1E3] to-[#E3F1F1]',
  iconTile: 'bg-gradient-to-br from-blue-700 to-blue-900 text-blue-50 shadow-lg shadow-blue-950/30 ring-1 ring-blue-300/40',
  eyebrow: 'text-blue-200',
  bullet: 'text-blue-300',
  button: 'bg-blue-800 text-white shadow-blue-950/25 hover:bg-blue-900',
  link: 'text-blue-800 hover:text-blue-900 hover:underline underline-offset-4',
  outline: 'focus-visible:outline-blue-700',
  inputFocus: 'focus:ring-blue-700',
  sceneTint: 'from-[#04211E]/80 via-blue-950/35 to-transparent',
};

const KISSAN: RoleLoginTheme = {
  canvas: 'bg-gradient-to-br from-[#FBF8F0] via-[#F6F1E3] to-[#E9F3E6]',
  iconTile: 'bg-gradient-to-br from-orange-800 to-orange-950 text-orange-50 shadow-lg shadow-orange-950/30 ring-1 ring-orange-300/40',
  eyebrow: 'text-orange-200',
  bullet: 'text-orange-300',
  button: 'bg-orange-800 text-white shadow-orange-950/25 hover:bg-orange-900',
  link: 'text-orange-800 hover:text-orange-900 hover:underline underline-offset-4',
  outline: 'focus-visible:outline-orange-700',
  inputFocus: 'focus:ring-orange-700',
  sceneTint: 'from-[#0B2413]/80 via-orange-950/35 to-transparent',
};

/** Cold storage booking: glacier blue — ice chambers under a winter sky. */
const RENTAL: RoleLoginTheme = {
  canvas: 'bg-gradient-to-br from-[#F5FAFD] via-[#EDF5FB] to-[#DDEBF7]',
  iconTile: 'bg-gradient-to-br from-cyan-700 to-cyan-900 text-cyan-50 shadow-lg shadow-cyan-700/30 ring-1 ring-cyan-200/40',
  eyebrow: 'text-cyan-50',
  bullet: 'text-[#A5ADE8]',
  button: 'bg-cyan-900 text-white shadow-cyan-700/25 hover:bg-cyan-900',
  link: 'text-cyan-700 hover:text-cyan-900 hover:underline underline-offset-4',
  outline: 'focus-visible:outline-cyan-700',
  inputFocus: 'focus:ring-cyan-700',
  sceneTint: 'from-[#031E30]/80 via-cyan-900/35 to-transparent',
};

const TRACKING: RoleLoginTheme = {
  canvas: 'bg-gradient-to-br from-[#FBF8F0] via-[#F6F1E3] to-[#E0EFF9]',
  iconTile: 'bg-gradient-to-br from-violet-700 to-violet-900 text-violet-50 shadow-lg shadow-violet-700/30 ring-1 ring-violet-200/40',
  eyebrow: 'text-violet-50',
  bullet: 'text-[#A5ADE8]',
  button: 'bg-violet-700 text-white shadow-violet-700/25 hover:bg-violet-900',
  link: 'text-violet-700 hover:text-violet-900 hover:underline underline-offset-4',
  outline: 'focus-visible:outline-violet-700',
  inputFocus: 'focus:ring-violet-700',
  sceneTint: 'from-[#031E30]/80 via-violet-900/35 to-transparent',
};

const DEALER: RoleLoginTheme = {
  canvas: 'bg-gradient-to-br from-[#FBF8F0] via-[#F6F1E3] to-[#F1E9DC]',
  iconTile: 'bg-gradient-to-br from-fuchsia-800 to-fuchsia-900 text-fuchsia-50 shadow-lg shadow-fuchsia-950/30 ring-1 ring-fuchsia-300/40',
  eyebrow: 'text-fuchsia-200',
  bullet: 'text-fuchsia-300',
  button: 'bg-fuchsia-900 text-white shadow-fuchsia-950/25 hover:bg-fuchsia-900',
  link: 'text-fuchsia-800 hover:text-fuchsia-900 hover:underline underline-offset-4',
  outline: 'focus-visible:outline-fuchsia-800',
  inputFocus: 'focus:ring-fuchsia-800',
  sceneTint: 'from-[#221203]/80 via-fuchsia-950/35 to-transparent',
};

const EXPERT: RoleLoginTheme = {
  canvas: 'bg-gradient-to-br from-[#FBF8F0] via-[#F6F1E3] to-[#F9EBEF]',
  iconTile: 'bg-gradient-to-br from-teal-700 to-teal-950 text-teal-50 shadow-lg shadow-teal-950/30 ring-1 ring-teal-300/40',
  eyebrow: 'text-teal-200',
  bullet: 'text-teal-300',
  button: 'bg-teal-700 text-white shadow-teal-950/25 hover:bg-teal-800',
  link: 'text-teal-800 hover:text-teal-900 hover:underline underline-offset-4',
  outline: 'focus-visible:outline-teal-700',
  inputFocus: 'focus:ring-teal-700',
  sceneTint: 'from-[#330713]/80 via-teal-950/35 to-transparent',
};

const TRADER: RoleLoginTheme = {
  canvas: 'bg-gradient-to-br from-[#FBF8F0] via-[#F6F1E3] to-[#EFEAF9]',
  iconTile: 'bg-gradient-to-br from-amber-700 to-amber-900 text-amber-50 shadow-lg shadow-amber-700/30 ring-1 ring-amber-200/40',
  eyebrow: 'text-amber-50',
  bullet: 'text-[#A5ADE8]',
  button: 'bg-amber-900 text-white shadow-amber-700/25 hover:bg-amber-900',
  link: 'text-amber-700 hover:text-amber-900 hover:underline underline-offset-4',
  outline: 'focus-visible:outline-amber-700',
  inputFocus: 'focus:ring-amber-700',
  sceneTint: 'from-[#1E0B33]/80 via-amber-900/35 to-transparent',
};

const ADMIN: RoleLoginTheme = {
  canvas: 'bg-gradient-to-br from-[#FBF8F0] via-[#F6F1E3] to-[#E3E8F4]',
  iconTile: 'bg-gradient-to-br from-indigo-800 to-[#0B1F3A] text-indigo-50 shadow-lg shadow-indigo-950/30 ring-1 ring-indigo-300/40',
  eyebrow: 'text-indigo-200',
  bullet: 'text-indigo-300',
  button: 'bg-indigo-900 text-white shadow-indigo-950/25 hover:bg-[#0B1F3A]',
  link: 'text-indigo-900 hover:text-indigo-950 hover:underline underline-offset-4',
  outline: 'focus-visible:outline-indigo-800',
  inputFocus: 'focus:ring-indigo-800',
  sceneTint: 'from-[#050E22]/80 via-indigo-950/35 to-transparent',
};

const HUB: RoleLoginTheme = {
  canvas: 'bg-gradient-to-br from-[#F4F8FF] via-[#EAF1FF] to-[#E0EBFF]',
  iconTile: 'bg-gradient-to-br from-sky-700 to-blue-900 text-sky-50 shadow-lg shadow-blue-950/30 ring-1 ring-sky-300/40',
  eyebrow: 'text-sky-200',
  bullet: 'text-sky-300',
  button: 'bg-sky-800 text-white shadow-sky-950/25 hover:bg-sky-900',
  link: 'text-sky-800 hover:text-sky-900 hover:underline underline-offset-4',
  outline: 'focus-visible:outline-sky-700',
  inputFocus: 'focus:ring-sky-700',
  sceneTint: 'from-[#06182E]/80 via-sky-950/35 to-transparent',
};

const BUSINESS: RoleLoginTheme = {
  canvas: 'bg-gradient-to-br from-[#F6F4FF] via-[#EEEAFF] to-[#E4DEFF]',
  iconTile: 'bg-gradient-to-br from-indigo-700 to-violet-900 text-indigo-50 shadow-lg shadow-indigo-950/30 ring-1 ring-violet-300/40',
  eyebrow: 'text-violet-200',
  bullet: 'text-violet-300',
  button: 'bg-indigo-800 text-white shadow-indigo-950/25 hover:bg-indigo-900',
  link: 'text-indigo-800 hover:text-indigo-900 hover:underline underline-offset-4',
  outline: 'focus-visible:outline-indigo-700',
  inputFocus: 'focus:ring-indigo-700',
  sceneTint: 'from-[#14123A]/80 via-indigo-950/35 to-transparent',
};

export const PORTAL_LOGIN: Record<PortalId, PortalLoginCopy> = {
  farmer: {
    icon: Leaf,
    mood: 'spring',
    eyebrow: 'Farmer portal',
    headline: 'Manage your orchards',
    description: 'Track today’s mandi rates, list your harvest and get paid directly by UPI after delivery.',
    highlights: ['Live rates from your nearest mandi', 'List apples, saffron, walnuts and more', 'Payment released only on delivery'],
    theme: FARMER,
  },
  buyer: {
    icon: ShoppingBag,
    mood: 'summer',
    eyebrow: 'Buyer portal',
    headline: 'Source authentic produce',
    description: 'Buy saffron, premium apples and dry fruits direct from verified growers — pay only after the goods arrive.',
    highlights: ['Verified growers and traders', 'Compare offers side by side', 'Pay after delivery on every order'],
    theme: BUYER,
  },
  kissan: {
    icon: Tractor,
    mood: 'autumn',
    eyebrow: 'Kissan Tools',
    headline: 'Everything the orchard needs',
    description: 'Sprays, nutrients, packaging and tools from verified dealers, delivered to your village.',
    highlights: ['Genuine, batch-coded inputs', 'Cart and order tracking', 'Delivered to your village'],
    theme: KISSAN,
  },
  rental: {
    icon: Warehouse,
    mood: 'dusk',
    eyebrow: 'Cold storage booking',
    headline: 'Your place in the cold store',
    description: 'See the whole cold store in 3D, choose the chamber and the exact place for your boxes, and pay the owner directly.',
    highlights: ['Whole-store plan and 3D view', 'Choose your own chamber and place', 'Pay the owner directly by UPI'],
    theme: RENTAL,
  },
  tracking: {
    icon: MapPinned,
    mood: 'winter',
    eyebrow: 'Consignment tracking',
    headline: 'Know where your load is',
    description: 'Look up any registered vehicle carrying your produce and follow it to the market.',
    highlights: ['Vehicle registration lookup', 'Toll-plaza crossings on the route', 'Share status with buyers'],
    theme: TRACKING,
  },
  dealer: {
    icon: FlaskConical,
    mood: 'autumn',
    eyebrow: 'Agro-dealer portal',
    headline: 'Sell inputs farmers can trust',
    description: 'Register every batch code, keep licences current and let farmers verify what they buy.',
    highlights: ['Batch registry farmers can scan', 'Licence and compliance checklist', 'Verified-dealer badge'],
    theme: DEALER,
  },
  expert: {
    icon: GraduationCap,
    mood: 'dusk',
    eyebrow: 'Advisory hub',
    headline: 'Answers from agronomists',
    description: 'Ask about pests, disease and nutrition, order soil tests, and follow trusted spray protocols.',
    highlights: ['Replies from verified experts', 'Disease protocols and SOPs', 'Soil test with a fertiliser plan'],
    theme: EXPERT,
  },
  trader: {
    icon: Megaphone,
    mood: 'autumn',
    eyebrow: 'Mandi Helpers',
    headline: 'Post today’s mandi rates',
    description: 'Commission agents and traders post each day’s rates for farmers. KashRoot checks who you are, and accurate rates are counted as your paid work.',
    highlights: ['Post rates for your mandi in a minute', 'Rates checked by other traders and farmers', 'Accurate rates earn you payment'],
    theme: TRADER,
  },
  admin: {
    icon: ShieldCheck,
    mood: 'dawn',
    eyebrow: 'Governance console',
    headline: 'Keep every trade fair',
    description: 'Verify identities, settle disputes and watch regional trade health. Staff accounts only.',
    highlights: ['KYC review queue', 'Dispute recommendation and resolution', 'Regional trade analytics'],
    theme: ADMIN,
  },
  hub: {
    icon: Warehouse,
    mood: 'dusk',
    eyebrow: 'KashRoot Hub',
    headline: 'Watch every pickup and order',
    description: 'For KashRoot hub staff: see each order from the orchard gate to the buyer, the vehicles and drivers on the road, and what is waiting at the hub. Team accounts only.',
    highlights: ['Pickups by step, live', 'Vehicle, driver and hub for each order', 'Opens only with the KashRoot team pass'],
    theme: HUB,
  },
  business: {
    icon: Building2,
    mood: 'dawn',
    eyebrow: 'Business admin',
    headline: 'Run your business team',
    description: 'For the owner, managers and staff of a cold store, agro-dealer, shop or helper team: invite your people, confirm bookings, handle orders and set where you are paid. This is not the customer sign-in.',
    highlights: ['Owner, manager and staff roles', 'Bookings and orders for your business only', 'Payout details changed only by the owner, after two-step sign-in'],
    theme: BUSINESS,
  },
};
