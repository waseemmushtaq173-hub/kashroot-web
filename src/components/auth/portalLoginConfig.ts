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

/** Every portal's sign-in has the one KashRoot look (as the portals inside: components/portal/kit BRAND). */
const BRAND: RoleLoginTheme = {
  canvas: 'bg-gradient-to-br from-[#FBF8F0] via-[#F6F1E3] to-[#EAF3EE]',
  iconTile: 'bg-gradient-to-br from-emerald-700 to-[#052E26] text-amber-200 shadow-lg shadow-emerald-950/30 ring-1 ring-amber-300/40',
  eyebrow: 'text-amber-200',
  bullet: 'text-amber-500',
  button: 'bg-emerald-800 text-white shadow-emerald-900/25 hover:bg-emerald-900',
  link: 'text-emerald-800 hover:text-emerald-900 hover:underline underline-offset-4',
  outline: 'focus-visible:outline-emerald-700',
  inputFocus: 'focus:ring-emerald-600',
  sceneTint: 'from-[#052E26]/80 via-emerald-950/35 to-transparent',
};

export const PORTAL_LOGIN: Record<PortalId, PortalLoginCopy> = {
  farmer: {
    icon: Leaf,
    mood: 'spring',
    eyebrow: 'Farmer portal',
    headline: 'Manage your orchards',
    description: 'Track today’s mandi rates, list your harvest and get paid directly by UPI after delivery.',
    highlights: ['Live rates from your nearest mandi', 'List apples, saffron, walnuts and more', 'Payment released only on delivery'],
    theme: BRAND,
  },
  buyer: {
    icon: ShoppingBag,
    mood: 'summer',
    eyebrow: 'Buyer portal',
    headline: 'Source authentic produce',
    description: 'Buy saffron, premium apples and dry fruits direct from verified growers — pay only after the goods arrive.',
    highlights: ['Verified growers and traders', 'Compare offers side by side', 'Pay after delivery on every order'],
    theme: BRAND,
  },
  kissan: {
    icon: Tractor,
    mood: 'autumn',
    eyebrow: 'Kissan Tools',
    headline: 'Everything the orchard needs',
    description: 'Sprays, nutrients, packaging and tools from verified dealers, delivered to your village.',
    highlights: ['Genuine, batch-coded inputs', 'Cart and order tracking', 'Delivered to your village'],
    theme: BRAND,
  },
  rental: {
    icon: Warehouse,
    mood: 'dusk',
    eyebrow: 'Cold storage booking',
    headline: 'Your place in the cold store',
    description: 'See the whole cold store in 3D, choose the chamber and the exact place for your boxes, and pay the owner directly.',
    highlights: ['Whole-store plan and 3D view', 'Choose your own chamber and place', 'Pay the owner directly by UPI'],
    theme: BRAND,
  },
  tracking: {
    icon: MapPinned,
    mood: 'winter',
    eyebrow: 'Consignment tracking',
    headline: 'Know where your load is',
    description: 'Look up any registered vehicle carrying your produce and follow it to the market.',
    highlights: ['Vehicle registration lookup', 'Toll-plaza crossings on the route', 'Share status with buyers'],
    theme: BRAND,
  },
  dealer: {
    icon: FlaskConical,
    mood: 'autumn',
    eyebrow: 'Agro-dealer portal',
    headline: 'Sell inputs farmers can trust',
    description: 'Register every batch code, keep licences current and let farmers verify what they buy.',
    highlights: ['Batch registry farmers can scan', 'Licence and compliance checklist', 'Verified-dealer badge'],
    theme: BRAND,
  },
  expert: {
    icon: GraduationCap,
    mood: 'dusk',
    eyebrow: 'Advisory hub',
    headline: 'Answers from agronomists',
    description: 'Ask about pests, disease and nutrition, order soil tests, and follow trusted spray protocols.',
    highlights: ['Replies from verified experts', 'Disease protocols and SOPs', 'Soil test with a fertiliser plan'],
    theme: BRAND,
  },
  trader: {
    icon: Megaphone,
    mood: 'autumn',
    eyebrow: 'Mandi Helpers',
    headline: 'Post today’s mandi rates',
    description: 'Commission agents and traders post each day’s rates for farmers. KashRoot checks who you are, and accurate rates are counted as your paid work.',
    highlights: ['Post rates for your mandi in a minute', 'Rates checked by other traders and farmers', 'Accurate rates earn you payment'],
    theme: BRAND,
  },
  admin: {
    icon: ShieldCheck,
    mood: 'dawn',
    eyebrow: 'Governance console',
    headline: 'Keep every trade fair',
    description: 'Verify identities, settle disputes and watch regional trade health. Staff accounts only.',
    highlights: ['KYC review queue', 'Dispute recommendation and resolution', 'Regional trade analytics'],
    theme: BRAND,
  },
};
