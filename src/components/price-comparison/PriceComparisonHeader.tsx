'use client';

/**
 * PriceComparisonHeader — the fix for the invisible "List your products" text.
 *
 * The old header put the CTA on a dark blue surface as a pale ghost button, so
 * it vanished into the background. It is now a soft, light premium gradient
 * with high-contrast text, and the CTA is a solid button that stands on its own:
 *
 *   header  bg-gradient-to-r from-sky-50/90 via-white/80 to-amber-50/90
 *           border-b border-sky-100 backdrop-blur-xl
 *   title   text-slate-900                           ≈17:1 on sky-50
 *   body    text-slate-600                           ≈7:1
 *   CTA     bg-sky-700 text-white hover:bg-sky-800   ≈5.9:1 (AA)
 *
 * The surface and button classes come from TOOLS.priceComparison.theme, so this
 * header and the tool's cards stay one palette.
 *
 * Which CTA shows depends on who is looking:
 *   - a signed-in SELLER or DEALER gets "Add New Product", which opens the
 *     page's own add-listing modal;
 *   - a signed-out visitor gets "List your products", a link to the seller
 *     sign-in that returns here afterwards;
 *   - anyone else (a signed-in farmer or buyer) gets no CTA, because listing
 *     is not theirs to do.
 */
import Link from 'next/link';

import { ArrowRight, Plus } from 'lucide-react';

import { ToolHeader } from '@/components/layout/ToolShell';
import { loginHref } from '@/lib/auth/roles';
import { TOOLS } from '@/lib/tools';

const { theme, href } = TOOLS.priceComparison;

const CTA_CLASS = `inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold shadow-md shadow-sky-700/20 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${theme.primaryButton}`;

interface PriceComparisonHeaderProps {
  /** True for a signed-in SELLER or DEALER. */
  canAddProduct: boolean;
  /** True when a session exists at all. */
  isAuth: boolean;
  onAddProduct: () => void;
}

export function PriceComparisonHeader({ canAddProduct, isAuth, onAddProduct }: PriceComparisonHeaderProps) {
  return (
    <ToolHeader
      tool="priceComparison"
      description="Compare verified offers side by side — or list your own produce for buyers across India."
      actions={
        canAddProduct ? (
          <button type="button" onClick={onAddProduct} className={CTA_CLASS}>
            <Plus className="h-4 w-4" />
            Add New Product
          </button>
        ) : !isAuth ? (
          <Link href={loginHref('seller', href)} className={CTA_CLASS}>
            List your products
            <ArrowRight className="h-4 w-4" />
          </Link>
        ) : null
      }
    />
  );
}
