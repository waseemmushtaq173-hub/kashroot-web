/**
 * Landing page — the seasonal hero with exactly three tool cards.
 *
 * Bright by construction: no dark surfaces anywhere, and the photographs are
 * served from /public/seasons rather than fetched from a stock-photo host.
 * Content sits on frosted white glass over the HeroShowcase slideshow, so
 * slate-900 text stays legible whatever the photograph underneath.
 *
 * Every tool CTA goes straight to the matching role sign-in
 * (/login/{farmer|buyer|seller}) with `next` set to the tool, so the user lands
 * where they clicked. The old dark "Choose Your Portal" modal is gone; every
 * other portal is reachable from the "Portals" dropdown in SiteHeader.
 *
 * A server component: only HeroShowcase (the timer) and SiteHeader (the
 * dropdown) ship as client JS.
 */
import Link from 'next/link';

import { ArrowRight } from 'lucide-react';

import { HeroShowcase } from '@/components/layout/HeroShowcase';
import { SiteFooter, SiteHeader } from '@/components/layout/SiteHeader';
import { loginHref } from '@/lib/auth/roles';
import { GLASS, TOOL_ORDER, TOOLS, type ToolId } from '@/lib/tools';
import { seasonForDate } from '@/lib/seasons';

// Re-render hourly so the hero opens on the current season, not the build's.
export const revalidate = 3600;

interface ToolAction {
  label: string;
  href: string;
}

/** Primary + secondary CTA per card. Logins carry the tool as `next`. */
const TOOL_ACTIONS: Record<ToolId, { primary: ToolAction; secondary: ToolAction }> = {
  escrow: {
    primary: { label: 'Buy with escrow', href: loginHref('buyer', TOOLS.escrow.href) },
    secondary: { label: 'Sell with escrow', href: loginHref('seller', TOOLS.escrow.href) },
  },
  mandi: {
    primary: { label: 'Open farmer portal', href: loginHref('farmer', TOOLS.mandi.href) },
    // The mandi board is a public route — no sign-in needed to look.
    secondary: { label: 'Preview today’s rates', href: TOOLS.mandi.href },
  },
  priceComparison: {
    primary: { label: 'Compare prices', href: loginHref('buyer', TOOLS.priceComparison.href) },
    secondary: { label: 'List your products', href: loginHref('seller', TOOLS.priceComparison.href) },
  },
};

const FOCUS_RING = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2';

export default function Home() {
  return (
    <HeroShowcase initialSeason={seasonForDate(new Date())}>
      <SiteHeader />

      {/* Bottom padding leaves room for the season badge, which is sized to
          land on the first screen at common desktop heights (900px+). */}
      <main id="main-content" className="mx-auto max-w-7xl px-4 pb-32 pt-8 sm:px-6 sm:pt-12 lg:px-8">
        <section className={`max-w-2xl rounded-[2rem] p-6 sm:p-9 ${GLASS.panel}`}>
          <p className="inline-flex rounded-full bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-800 ring-1 ring-emerald-200">
            The agri-business ecosystem
          </p>
          <h1 className="mt-5 text-4xl font-semibold tracking-tight text-slate-900 [text-wrap:balance] sm:text-5xl lg:text-6xl">
            Every harvest,{' '}
            <span className="bg-gradient-to-r from-emerald-700 to-teal-700 bg-clip-text text-transparent">
              traded with trust.
            </span>
          </h1>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-slate-700 sm:text-lg">
            Escrow-protected payments, live mandi rates and transparent price comparison for growers, traders
            and buyers.
          </p>
        </section>

        <section aria-label="Kashroot tools" className="mt-6 grid gap-5 sm:mt-8 md:grid-cols-3">
          {TOOL_ORDER.map((id) => (
            <ToolCard key={id} id={id} />
          ))}
        </section>
      </main>

      <SiteFooter />
    </HeroShowcase>
  );
}

function ToolCard({ id }: { id: ToolId }) {
  const tool = TOOLS[id];
  const { theme } = tool;
  const { primary, secondary } = TOOL_ACTIONS[id];
  const Icon = tool.icon;

  return (
    <article
      className={`group relative flex flex-col overflow-hidden rounded-3xl p-6 ${GLASS.panel} transition duration-300 hover:-translate-y-1 hover:bg-white/80 hover:shadow-[0_24px_60px_rgba(15,23,42,0.18)] motion-reduce:transition-none motion-reduce:hover:translate-y-0`}
    >
      <div
        aria-hidden
        className={`pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full opacity-50 blur-3xl transition-opacity duration-300 group-hover:opacity-100 ${theme.glowA}`}
      />

      <div className="relative flex items-start justify-between gap-3">
        <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${theme.iconTile}`}>
          <Icon className="h-6 w-6" />
        </span>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${theme.eyebrow}`}>{tool.eyebrow}</span>
      </div>

      <h2 className="relative mt-5 text-xl font-semibold tracking-tight text-slate-900">{tool.title}</h2>
      <p className="relative mt-2 text-sm leading-relaxed text-slate-600">{tool.description}</p>

      <div className="relative mt-auto flex flex-wrap gap-2 pt-6">
        <Link
          href={primary.href}
          className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold shadow-sm transition ${FOCUS_RING} ${theme.primaryButton}`}
        >
          {primary.label}
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" />
        </Link>
        <Link
          href={secondary.href}
          className={`inline-flex items-center rounded-xl px-4 py-2.5 text-sm font-semibold transition ${FOCUS_RING} ${theme.secondaryButton}`}
        >
          {secondary.label}
        </Link>
      </div>
    </article>
  );
}
