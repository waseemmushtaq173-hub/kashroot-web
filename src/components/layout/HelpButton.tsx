import Link from 'next/link';
import { LifeBuoy } from 'lucide-react';

/**
 * "Help & support" in every top bar (the site header, a portal's header and
 * the portal shell): common problems, Ask KashRoot, Check my request / My
 * requests and the official contacts (app/support). 44 px or more; on a
 * phone the words shorten to "Help" (its name for screen readers stays
 * "Help & support").
 */
export function HelpButton({ size = 'md', className = '' }: { size?: 'md' | 'lg'; className?: string }) {
  return (
    <Link
      href="/support"
      aria-label="Help & support"
      data-help-button
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl bg-white/90 px-3 font-semibold text-slate-800 no-underline shadow-sm ring-1 ring-slate-900/10 transition hover:bg-white hover:text-slate-900 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${size === 'lg' ? 'h-12 text-base lg:h-11 lg:text-sm' : 'min-h-11 text-sm'} ${className}`}
    >
      <LifeBuoy className="h-5 w-5 shrink-0 text-emerald-700" aria-hidden />
      <span className="sm:hidden">Help</span>
      <span className="hidden sm:inline">Help &amp; support</span>
    </Link>
  );
}
