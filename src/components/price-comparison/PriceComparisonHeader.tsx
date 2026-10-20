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
 * `actions` is passed in by the page. "List your products" stays on Price
 * Comparison: it opens the Sell here tab, and signing in happens right there
 * (no portal sign-in page).
 */
import type { ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';

import { ToolHeader } from '@/components/layout/ToolShell';
import { TOOLS } from '@/lib/tools';

const { theme } = TOOLS.priceComparison;

export const PRICE_COMPARISON_BUTTON = `inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold no-underline shadow-md shadow-sky-700/20 transition hover:no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${theme.primaryButton}`;

/** "List your products": opens selling on this page. */
export function ListProductsButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={PRICE_COMPARISON_BUTTON}>
      List your products
      <ArrowRight className="h-4 w-4" aria-hidden />
    </button>
  );
}

export function PriceComparisonHeader({ actions }: { actions?: ReactNode }) {
  return (
    <ToolHeader
      tool="priceComparison"
      title="Price Comparison Hub"
      description="Compare prices from sellers and dealers, order to your door, and pay the seller only after the goods reach you."
      actions={actions}
    />
  );
}
