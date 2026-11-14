/**
 * Look and copy of each portal's own sign-in page. Complete literal Tailwind
 * classes only (the compiler cannot see built strings).
 */
import {
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
  canvas: 'bg-gradient-to-br from-[#FBF8F0] via-[#F6F1E3] to-[#E3F0E7]',
  iconTile: 'bg-gradient-to-br from-emerald-700 to-[#052E26] text-emerald-50 shadow-lg shadow-emerald-950/30 ring-1 ring-amber-300/40',
  eyebrow: 'text-amber-200',
  bullet: 'text-amber-500',
  button: 'bg-emerald-800 text-white shadow-emerald-900/25 hover:bg-emerald-900',
  link: 'text-emerald-800 hover:text-emerald-900 hover:underline underline-offset-4',
  outline: 'focus-visible:outline-emerald-700',
  inputFocus: 'focus:ring-emerald-700',
  sceneTint: 'from-[#052E26]/80 via-emerald-950/35 to-transparent',
};

const BUYER: RoleLoginTheme = {
  canvas: 'bg-gradient-to-br from-[#FBF8F0] via-[#F6F1E3] to-[#E3F1F1]',
  iconTile: 'bg-gradient-to-br from-teal-700 to-teal-900 text-teal-50 shadow-lg shadow-teal-950/30 ring-1 ring-teal-300/40',
  eyebrow: 'text-teal-200',
  bullet: 'text-teal-300',
  button: 'bg-teal-800 text-white shadow-teal-950/25 hover:bg-teal-900',
  link: 'text-teal-800 hover:text-teal-900 hover:underline underline-offset-4',
  outline: 'focus-visible:outline-teal-700',
  inputFocus: 'focus:ring-teal-700',
  sceneTint: 'from-[#04211E]/80 via-teal-950/35 to-transparent',
};

const KISSAN: RoleLoginTheme = {
  canvas: 'bg-gradient-to-br from-[#FBF8F0] via-[#F6F1E3] to-[#E9F3E6]',
  iconTile: 'bg-gradient-to-br from-green-800 to-green-950 text-green-50 shadow-lg shadow-green-950/30 ring-1 ring-green-300/40',
  eyebrow: 'text-green-200',
  bullet: 'text-green-300',
  button: 'bg-green-800 text-white shadow-green-950/25 hover:bg-green-900',
  link: 'text-green-800 hover:text-green-900 hover:underline underline-offset-4',
  outline: 'focus-visible:outline-green-700',
  inputFocus: 'focus:ring-green-700',
  sceneTint: 'from-[#0B2413]/80 via-green-950/35 to-transparent',
};

/** Cold storage booking: glacier blue — ice chambers under a winter sky. */
const RENTAL: RoleLoginTheme = {
  canvas: 'bg-gradient-to-br from-[#F5FAFD] via-[#EDF5FB] to-[#DDEBF7]',
  iconTile: 'bg-gradient-to-br from-sky-700 to-sky-950 text-sky-50 shadow-lg shadow-sky-950/30 ring-1 ring-sky-300/40',
  eyebrow: 'text-sky-200',
  bullet: 'text-sky-300',
  button: 'bg-sky-800 text-white shadow-sky-950/25 hover:bg-sky-900',
  link: 'text-sky-800 hover:text-sky-900 hover:underline underline-offset-4',
  outline: 'focus-visible:outline-sky-700',
  inputFocus: 'focus:ring-sky-700',
  sceneTint: 'from-[#031E30]/80 via-sky-950/35 to-transparent',
};

const TRACKING: RoleLoginTheme = {
  canvas: 'bg-gradient-to-br from-[#FBF8F0] via-[#F6F1E3] to-[#E0EFF9]',
  iconTile: 'bg-gradient-to-br from-sky-700 to-sky-900 text-sky-50 shadow-lg shadow-sky-950/30 ring-1 ring-sky-300/40',
  eyebrow: 'text-sky-200',
  bullet: 'text-sky-300',
  button: 'bg-sky-700 text-white shadow-sky-950/25 hover:bg-sky-800',
  link: 'text-sky-800 hover:text-sky-900 hover:underline underline-offset-4',
  outline: 'focus-visible:outline-sky-700',
  inputFocus: 'focus:ring-sky-700',
  sceneTint: 'from-[#031E30]/80 via-sky-950/35 to-transparent',
};

const DEALER: RoleLoginTheme = {
  canvas: 'bg-gradient-to-br from-[#FBF8F0] via-[#F6F1E3] to-[#F1E9DC]',
  iconTile: 'bg-gradient-to-br from-amber-800 to-stone-900 text-amber-50 shadow-lg shadow-stone-950/30 ring-1 ring-amber-300/40',
  eyebrow: 'text-amber-200',
  bullet: 'text-amber-300',
  button: 'bg-amber-900 text-white shadow-stone-950/25 hover:bg-stone-900',
  link: 'text-amber-800 hover:text-amber-900 hover:underline underline-offset-4',
  outline: 'focus-visible:outline-amber-800',
  inputFocus: 'focus:ring-amber-800',
  sceneTint: 'from-[#221203]/80 via-amber-950/35 to-transparent',
};

const EXPERT: RoleLoginTheme = {
  canvas: 'bg-gradient-to-br from-[#FBF8F0] via-[#F6F1E3] to-[#F9EBEF]',
  iconTile: 'bg-gradient-to-br from-rose-700 to-rose-950 text-rose-50 shadow-lg shadow-rose-950/30 ring-1 ring-rose-300/40',
  eyebrow: 'text-rose-200',
  bullet: 'text-rose-300',
  button: 'bg-rose-700 text-white shadow-rose-950/25 hover:bg-rose-800',
  link: 'text-rose-800 hover:text-rose-900 hover:underline underline-offset-4',
  outline: 'focus-visible:outline-rose-700',
  inputFocus: 'focus:ring-rose-700',
  sceneTint: 'from-[#330713]/80 via-rose-950/35 to-transparent',
};

const TRADER: RoleLoginTheme = {
  canvas: 'bg-gradient-to-br from-[#FBF8F0] via-[#F6F1E3] to-[#EFEAF9]',
  iconTile: 'bg-gradient-to-br from-violet-700 to-violet-950 text-violet-50 shadow-lg shadow-violet-950/30 ring-1 ring-violet-300/40',
  eyebrow: 'text-violet-200',
  bullet: 'text-violet-300',
  button: 'bg-violet-800 text-white shadow-violet-950/25 hover:bg-violet-900',
  link: 'text-violet-800 hover:text-violet-900 hover:underline underline-offset-4',
  outline: 'focus-visible:outline-violet-700',
  inputFocus: 'focus:ring-violet-700',
  sceneTint: 'from-[#1E0B33]/80 via-violet-950/35 to-transparent',
};

const ADMIN: RoleLoginTheme = {
  canvas: 'bg-gradient-to-br from-[#FBF8F0] via-[#F6F1E3] to-[#E3E8F4]',
  iconTile: 'bg-gradient-to-br from-blue-800 to-[#0B1F3A] text-blue-50 shadow-lg shadow-blue-950/30 ring-1 ring-blue-300/40',
  eyebrow: 'text-blue-200',
  bullet: 'text-blue-300',
  button: 'bg-blue-900 text-white shadow-blue-950/25 hover:bg-[#0B1F3A]',
  link: 'text-blue-900 hover:text-blue-950 hover:underline underline-offset-4',
  outline: 'focus-visible:outline-blue-800',
  inputFocus: 'focus:ring-blue-800',
  sceneTint: 'from-[#050E22]/80 via-blue-950/35 to-transparent',
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
};
