/**
 * The three Kashroot tools and their bright glass surfaces — the single source
 * of truth for the landing-page cards, the tool shell and its header.
 *
 *   escrow           Pay After Delivery
 *   mandi            Live Mandi Rates
 *   priceComparison  Price Comparison Engine
 *
 * All three wear the one KashRoot look (forest green, champagne gold, mist
 * page, tactile .kr-btn-* buttons and .kr-card cards from globals.css).
 *
 * Every class below is a complete literal string. Tailwind only generates
 * classes it can find verbatim in source, so never assemble these from
 * fragments (`'bg-' + colour`).
 *
 * Contrast: headings are slate-900 and body copy slate-600 on surfaces no
 * darker than *-50/white, and every solid button clears WCAG AA (4.5:1).
 *
 * NOTE: these are the *tools*. The role portals (farmer/buyer/seller dashboards)
 * share the same look through components/portal/kit.
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
    'bg-gradient-to-b from-white/95 to-[#F2F8F5]/95 backdrop-blur-xl [box-shadow:inset_0_1px_0_#fff,inset_0_0_0_1px_#CBD0F2,0_3px_0_#3730A3,0_14px_36px_-10px_rgba(30, 27, 75,0.3)]',
  /** Content card inside a tool — pair with text-slate-900 / text-slate-600. */
  card: 'kr-card kr-card-flat rounded-3xl bg-white/90 backdrop-blur-xl',
} as const;

/** The one KashRoot look (as the portals: components/portal/kit BRAND) — chinar green, saffron gold, ivory. */
const TOOL_BRAND: ToolTheme = {
  canvas: 'bg-mist',
  glowA: 'bg-forest-soft',
  glowB: 'bg-champagne/15',
  header: 'bg-[#F2F8F5]/90 border-b-2 border-champagne',
  eyebrow: 'bg-champagne-soft text-champagne-deep ring-1 ring-champagne/60',
  iconTile: 'kr-icon-badge',
  primaryButton: 'kr-btn-primary',
  secondaryButton: 'kr-btn-secondary',
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
