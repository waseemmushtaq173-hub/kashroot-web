/**
 * Look and copy of each portal's own sign-in page. Complete literal Tailwind
 * classes only (the compiler cannot see built strings).
 */
import {
  FlaskConical,
  GraduationCap,
  Leaf,
  MapPinned,
  ShieldCheck,
  ShoppingBag,
  Store,
  Tractor,
  Truck,
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

const T = (t: RoleLoginTheme) => t;

export const PORTAL_LOGIN: Record<PortalId, PortalLoginCopy> = {
  farmer: {
    icon: Leaf,
    mood: 'spring',
    eyebrow: 'Farmer portal',
    headline: 'Manage your orchards',
    description: 'Track today’s mandi rates, list your harvest and get paid safely through escrow.',
    highlights: ['Live rates from your nearest mandi', 'List apples, saffron, walnuts and more', 'Payment released only on delivery'],
    theme: T({
      canvas: 'bg-gradient-to-br from-lime-50 via-emerald-50 to-teal-50',
      iconTile: 'bg-gradient-to-br from-emerald-400 to-green-600 text-white shadow-lg shadow-emerald-600/30',
      eyebrow: 'text-emerald-100',
      bullet: 'text-emerald-600',
      button: 'bg-emerald-700 text-white shadow-emerald-700/25 hover:bg-emerald-800',
      link: 'text-emerald-800 hover:text-emerald-900 hover:underline underline-offset-4',
      outline: 'focus-visible:outline-emerald-700',
      inputFocus: 'focus:ring-emerald-500',
      sceneTint: 'from-emerald-950/75 via-emerald-900/30 to-transparent',
    }),
  },
  buyer: {
    icon: ShoppingBag,
    mood: 'summer',
    eyebrow: 'Buyer portal',
    headline: 'Source authentic produce',
    description: 'Buy saffron, premium apples and dry fruits direct from verified growers — your payment stays in escrow until the goods arrive.',
    highlights: ['Verified growers and traders', 'Compare offers side by side', 'Escrow protection on every order'],
    theme: T({
      canvas: 'bg-gradient-to-br from-sky-50 via-white to-indigo-50',
      iconTile: 'bg-gradient-to-br from-sky-400 to-indigo-500 text-white shadow-lg shadow-indigo-500/30',
      eyebrow: 'text-sky-100',
      bullet: 'text-sky-600',
      button: 'bg-sky-700 text-white shadow-sky-700/25 hover:bg-sky-800',
      link: 'text-sky-800 hover:text-sky-900 hover:underline underline-offset-4',
      outline: 'focus-visible:outline-sky-700',
      inputFocus: 'focus:ring-sky-500',
      sceneTint: 'from-sky-950/75 via-sky-900/30 to-transparent',
    }),
  },
  seller: {
    icon: Store,
    mood: 'autumn',
    eyebrow: 'Seller portal',
    headline: 'Grow your agri-business',
    description: 'List your products, reach buyers across India and follow every order from dispatch to payout.',
    highlights: ['Publish to Price Comparison', 'Orders from packing to delivery', 'Buyers pay to your UPI / bank'],
    theme: T({
      canvas: 'bg-gradient-to-br from-amber-50 via-orange-50 to-rose-50',
      iconTile: 'bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-lg shadow-orange-500/30',
      eyebrow: 'text-amber-100',
      bullet: 'text-amber-600',
      button: 'bg-amber-500 text-amber-950 shadow-amber-500/25 hover:bg-amber-400',
      link: 'text-amber-800 hover:text-amber-900 hover:underline underline-offset-4',
      outline: 'focus-visible:outline-amber-600',
      inputFocus: 'focus:ring-amber-500',
      sceneTint: 'from-amber-950/75 via-orange-900/30 to-transparent',
    }),
  },
  kissan: {
    icon: Tractor,
    mood: 'autumn',
    eyebrow: 'Kissan Tools',
    headline: 'Everything the orchard needs',
    description: 'Sprays, nutrients, packaging and tools from verified dealers, delivered to your village.',
    highlights: ['Genuine, batch-coded inputs', 'Cart and order tracking', 'Machinery rental one tap away'],
    theme: T({
      canvas: 'bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-50',
      iconTile: 'bg-gradient-to-br from-orange-400 to-amber-600 text-white shadow-lg shadow-orange-600/30',
      eyebrow: 'text-orange-100',
      bullet: 'text-orange-600',
      button: 'bg-orange-700 text-white shadow-orange-700/25 hover:bg-orange-800',
      link: 'text-orange-800 hover:text-orange-900 hover:underline underline-offset-4',
      outline: 'focus-visible:outline-orange-700',
      inputFocus: 'focus:ring-orange-500',
      sceneTint: 'from-orange-950/75 via-orange-900/30 to-transparent',
    }),
  },
  rental: {
    icon: Warehouse,
    mood: 'dusk',
    eyebrow: 'Rental marketplace',
    headline: 'Rent machinery & cold storage',
    description: 'Tractors, sprayers and cold-store space by the day — or earn from your own idle equipment.',
    highlights: ['Verified owners and operators', 'Pay the owner directly by UPI', 'Bookings from request to return'],
    theme: T({
      canvas: 'bg-gradient-to-br from-violet-50 via-white to-fuchsia-50',
      iconTile: 'bg-gradient-to-br from-violet-400 to-purple-700 text-white shadow-lg shadow-purple-700/30',
      eyebrow: 'text-violet-100',
      bullet: 'text-violet-600',
      button: 'bg-violet-700 text-white shadow-violet-700/25 hover:bg-violet-800',
      link: 'text-violet-800 hover:text-violet-900 hover:underline underline-offset-4',
      outline: 'focus-visible:outline-violet-700',
      inputFocus: 'focus:ring-violet-500',
      sceneTint: 'from-violet-950/75 via-violet-900/30 to-transparent',
    }),
  },
  logistics: {
    icon: Truck,
    mood: 'winter',
    eyebrow: 'Logistics portal',
    headline: 'Move the harvest on time',
    description: 'Accept transport jobs, run cold-chain shipments and get paid through escrow on delivery.',
    highlights: ['Transport requests near you', 'Cold-chain temperature logs', 'Payouts released on delivery'],
    theme: T({
      canvas: 'bg-gradient-to-br from-teal-50 via-cyan-50 to-white',
      iconTile: 'bg-gradient-to-br from-teal-400 to-cyan-700 text-white shadow-lg shadow-cyan-700/30',
      eyebrow: 'text-teal-100',
      bullet: 'text-teal-600',
      button: 'bg-teal-700 text-white shadow-teal-700/25 hover:bg-teal-800',
      link: 'text-teal-800 hover:text-teal-900 hover:underline underline-offset-4',
      outline: 'focus-visible:outline-teal-700',
      inputFocus: 'focus:ring-teal-500',
      sceneTint: 'from-teal-950/75 via-teal-900/30 to-transparent',
    }),
  },
  tracking: {
    icon: MapPinned,
    mood: 'winter',
    eyebrow: 'Consignment tracking',
    headline: 'Know where your load is',
    description: 'Look up any registered vehicle carrying your produce and follow it to the market.',
    highlights: ['Vehicle registration lookup', 'Toll-plaza crossings on the route', 'Share status with buyers'],
    theme: T({
      canvas: 'bg-gradient-to-br from-cyan-50 via-white to-sky-50',
      iconTile: 'bg-gradient-to-br from-cyan-400 to-sky-700 text-white shadow-lg shadow-sky-700/30',
      eyebrow: 'text-cyan-100',
      bullet: 'text-cyan-600',
      button: 'bg-cyan-700 text-white shadow-cyan-700/25 hover:bg-cyan-800',
      link: 'text-cyan-800 hover:text-cyan-900 hover:underline underline-offset-4',
      outline: 'focus-visible:outline-cyan-700',
      inputFocus: 'focus:ring-cyan-500',
      sceneTint: 'from-cyan-950/75 via-cyan-900/30 to-transparent',
    }),
  },
  dealer: {
    icon: FlaskConical,
    mood: 'autumn',
    eyebrow: 'Agro-dealer portal',
    headline: 'Sell inputs farmers can trust',
    description: 'Register every batch code, keep licences current and let farmers verify what they buy.',
    highlights: ['Batch registry farmers can scan', 'Licence and compliance checklist', 'Verified-dealer badge'],
    theme: T({
      canvas: 'bg-gradient-to-br from-rose-50 via-orange-50 to-amber-50',
      iconTile: 'bg-gradient-to-br from-rose-400 to-red-700 text-white shadow-lg shadow-red-700/30',
      eyebrow: 'text-rose-100',
      bullet: 'text-rose-600',
      button: 'bg-rose-700 text-white shadow-rose-700/25 hover:bg-rose-800',
      link: 'text-rose-800 hover:text-rose-900 hover:underline underline-offset-4',
      outline: 'focus-visible:outline-rose-700',
      inputFocus: 'focus:ring-rose-500',
      sceneTint: 'from-rose-950/75 via-rose-900/30 to-transparent',
    }),
  },
  expert: {
    icon: GraduationCap,
    mood: 'dusk',
    eyebrow: 'Advisory hub',
    headline: 'Answers from agronomists',
    description: 'Ask about pests, disease and nutrition, order soil tests, and follow trusted spray protocols.',
    highlights: ['Replies from verified experts', 'Disease protocols and SOPs', 'Soil test with a fertiliser plan'],
    theme: T({
      canvas: 'bg-gradient-to-br from-purple-50 via-white to-amber-50',
      iconTile: 'bg-gradient-to-br from-purple-400 to-fuchsia-700 text-white shadow-lg shadow-fuchsia-700/30',
      eyebrow: 'text-purple-100',
      bullet: 'text-purple-600',
      button: 'bg-purple-700 text-white shadow-purple-700/25 hover:bg-purple-800',
      link: 'text-purple-800 hover:text-purple-900 hover:underline underline-offset-4',
      outline: 'focus-visible:outline-purple-700',
      inputFocus: 'focus:ring-purple-500',
      sceneTint: 'from-purple-950/75 via-purple-900/30 to-transparent',
    }),
  },
  admin: {
    icon: ShieldCheck,
    mood: 'dawn',
    eyebrow: 'Governance console',
    headline: 'Keep every trade fair',
    description: 'Verify identities, settle disputes and watch regional trade health. Staff accounts only.',
    highlights: ['KYC review queue', 'Dispute recommendation and resolution', 'Regional trade analytics'],
    theme: T({
      canvas: 'bg-gradient-to-br from-slate-50 via-indigo-50 to-white',
      iconTile: 'bg-gradient-to-br from-indigo-400 to-slate-700 text-white shadow-lg shadow-indigo-700/30',
      eyebrow: 'text-indigo-100',
      bullet: 'text-indigo-600',
      button: 'bg-indigo-700 text-white shadow-indigo-700/25 hover:bg-indigo-800',
      link: 'text-indigo-800 hover:text-indigo-900 hover:underline underline-offset-4',
      outline: 'focus-visible:outline-indigo-700',
      inputFocus: 'focus:ring-indigo-500',
      sceneTint: 'from-indigo-950/75 via-indigo-900/30 to-transparent',
    }),
  },
};
