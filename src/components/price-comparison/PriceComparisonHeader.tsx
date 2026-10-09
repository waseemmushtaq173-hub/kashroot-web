/**
 * PriceComparisonHeader — the fix for the invisible "List your products" text.
 *
 * The old header was dark blue, so its "List your products" call to action
 * vanished into it. It is now a soft, light premium gradient with high-contrast
 * text, and the CTA is a solid button that stands on its own:
 *
 *   header  bg-gradient-to-r from-sky-50/90 via-white/80 to-amber-50/90
 *           border-b border-sky-100 backdrop-blur-xl
 *   title   text-slate-900                       ≈17:1 on sky-50
 *   body    text-slate-600                       ≈7:1
 *   CTA     bg-sky-700 text-white hover:bg-sky-800   ≈5.9:1 (AA)
 *
 * `actions` is passed in by the page because which button shows depends on who
 * is signed in (see ListProductsLink for the logged-out / non-seller one).
 */
import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';

import { ToolHeader } from '@/components/layout/ToolShell';
import { loginHref } from '@/lib/auth/roles';
import { TOOLS } from '@/lib/tools';

const { theme } = TOOLS.priceComparison;

export const PRICE_COMPARISON_BUTTON = `inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold no-underline shadow-md shadow-sky-700/20 transition hover:no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${theme.primaryButton}`;

/** "List your products" → seller sign-in, returning to this page afterwards. */
export function ListProductsLink() {
  return (
    <Link href={loginHref('seller', TOOLS.priceComparison.href)} className={PRICE_COMPARISON_BUTTON}>
      List your products
      <ArrowRight className="h-4 w-4" aria-hidden />
    </Link>
  );
}

export function PriceComparisonHeader({ actions }: { actions?: ReactNode }) {
  return (
    <ToolHeader
      tool="priceComparison"
      title="Price Comparison Hub"
      description="Compare real-time rates for farm essentials across authorized dealers. Direct home delivery guaranteed with Escrow protection."
      actions={actions}
    />
  );
}
