/**
 * The three Kashroot tools and their bright glass palettes — the single source
 * of truth for the landing-page cards, the tool shell and its header.
 *
 *   escrow           Emerald Trust   — teal/emerald, "money is safe"
 *   mandi            Saffron Gold    — amber/orange, warm as harvest
 *   priceComparison  Lake Azure      — sky/indigo, calm and analytical
 *
 * Every class below is a complete literal string. Tailwind only generates
 * classes it can find verbatim in source, so never assemble these from
 * fragments (`'bg-' + colour`).
 *
 * Contrast: headings are slate-900 and body copy slate-600 on surfaces no
 * darker than *-50/white, and every solid button clears WCAG AA (4.5:1).
 *
 * NOTE: these are the *tools*. The role portals (farmer/buyer/seller dashboards)
 * keep their own themes in src/app/(dashboards).
 */
import { Scale, ShieldCheck, TrendingUp, type LucideIcon } from 'lucide-react';

export type ToolId = 'escrow' | 'mandi' | 'priceComparison';

export interface ToolTheme {
  /** Full-page background behind the tool. */
  canvas: string;
  /** Two blurred colour fields floated behind the glass for depth. */
  glowA: string;
  glowB: string;
  /** Tool header surface. Light by design — see PriceComparisonHeader. */
  header: string;
  /** Small pill above the tool title. */
  eyebrow: string;
  /** Square tile holding the tool icon. */
  iconTile: string;
  /** Solid call-to-action. */
  primaryButton: string;
  /** Quiet call-to-action on glass. */
  secondaryButton: string;
}

export interface Tool {
  id: ToolId;
  title: string;
  eyebrow: string;
  description: string;
  /** Route of the tool in this app. */
  href: string;
  icon: LucideIcon;
  theme: ToolTheme;
}

/** Shared glass surfaces, so every tool's cards read as one system. */
export const GLASS = {
  /** Large frosted panel over a photograph or colour field. */
  panel:
    'bg-white/60 backdrop-blur-xl ring-1 ring-white/70 shadow-[0_8px_40px_rgba(15,23,42,0.10)]',
  /** Content card inside a tool — pair with text-slate-900 / text-slate-600. */
  card: 'rounded-3xl bg-white/70 backdrop-blur-xl ring-1 ring-slate-900/5 shadow-[0_8px_30px_rgba(15,23,42,0.06)]',
} as const;

/** The one KashRoot look (as the portals: components/portal/kit BRAND) — chinar green, saffron gold, ivory. */
const TOOL_BRAND: ToolTheme = {
  canvas: 'bg-gradient-to-br from-[#FBF8F0] via-[#F6F1E3] to-[#EAF3EE]',
  glowA: 'bg-emerald-300/30',
  glowB: 'bg-amber-200/40',
  header: 'bg-gradient-to-r from-[#FBF8F0]/95 via-white/85 to-emerald-50/90 border-b border-amber-200/70',
  eyebrow: 'bg-amber-50 text-amber-900 ring-1 ring-amber-300/70',
  iconTile: 'bg-gradient-to-br from-emerald-700 to-[#052E26] text-amber-200 shadow-lg shadow-emerald-950/25 ring-1 ring-amber-300/40',
  primaryButton: 'bg-emerald-800 text-white hover:bg-emerald-900 focus-visible:outline-emerald-700',
  secondaryButton: 'bg-white/85 text-emerald-900 ring-1 ring-amber-300/80 hover:bg-white focus-visible:outline-emerald-700',
};

export const TOOLS: Record<ToolId, Tool> = {
  escrow: {
    id: 'escrow',
    title: 'Pay After Delivery',
    eyebrow: 'Escrow payment',
    description:
      'Order now and pay the seller directly by UPI only after the goods reach you and you have checked them — no advance-payment risk.',
    href: '/escrow',
    icon: ShieldCheck,
    theme: TOOL_BRAND,
  },
  mandi: {
    id: 'mandi',
    title: 'Live Mandi Rates',
    eyebrow: 'Updated through the day',
    description:
      'Today’s rates from the mandis near you — so you know the price before you load the truck.',
    href: '/mandi-weather',
    icon: TrendingUp,
    theme: TOOL_BRAND,
  },
  priceComparison: {
    id: 'priceComparison',
    title: 'Price Comparison Engine',
    eyebrow: 'Buyers compare, sellers list',
    description:
      'Compare verified offers across growers and traders side by side, or list your own products to reach buyers across India.',
    href: '/compare-prices',
    icon: Scale,
    theme: TOOL_BRAND,
  },
};

/** Card order on the landing page. */
export const TOOL_ORDER: readonly ToolId[] = ['escrow', 'mandi', 'priceComparison'];
