/**
 * Landing page — the photo slideshow hero with exactly three tool cards.
 *
 * Bright by construction: no dark surfaces. Content sits on frosted white glass
 * over the HeroShowcase slideshow, so slate-900 text stays legible whatever the
 * photograph underneath.
 *
 * A card's buttons lead where they say: "Buy produce" opens buying inside
 * the Buyer portal (its own sign-in first, with `next` set to the shop),
 * both Price Comparison buttons stay on Price Comparison, which asks to sign
 * in right there only when someone orders or sells, and the mandi card opens
 * the rates (posting them is the Mandi Helpers portal) — no card leads into
 * a portal it does not name.
 * Below the hero: the voice assistant, Orchard Health, KashRoot TrueScan
 * (is this fertiliser or pesticide genuine?) and every portal as a white card
 * (each with its own sign-in). The whole page wears the one KashRoot look:
 * forest green, champagne gold, tactile .kr-btn-* buttons and .kr-card cards.
 *
 * A server component; the interactive sections are client islands.
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import { FertilizerChecker } from '@/components/fertilizer/FertilizerChecker';
import { HeroShowcase } from '@/components/layout/HeroShowcase';
import { PortalGrid } from '@/components/landing/PortalGrid';
import { LATTICE_BG } from '@/components/portal/lattice';
import { Tilt3D } from '@/components/three/Tilt3D';
import { VoiceConcierge } from '@/components/voice/VoiceConcierge';
import { SiteFooter, SiteHeader } from '@/components/layout/SiteHeader';
import { loginHref } from '@/lib/auth/roles';
import { supabase } from '@/lib/supabase';
import { seasonForDate } from '@/lib/seasons';
import { SITE_URL, SOCIAL_LINKS } from '@/lib/site';
import { GLASS, TOOL_ORDER, TOOLS, type ToolId } from '@/lib/tools';


// Only the home page is canonical to "/"; other pages keep their own address.
export const metadata: Metadata = { alternates: { canonical: '/' } };

/** Tells search engines the site's name and logo, so a search for "KashRoot" shows it by name. */
const BRAND_JSON_LD = JSON.stringify([
  { '@context': 'https://schema.org', '@type': 'WebSite', name: 'KashRoot', alternateName: ['Kash Root', 'Kashroot', 'kashroot', 'KashRoot India'], url: `${SITE_URL}/` },
  { '@context': 'https://schema.org', '@type': 'Organization', name: 'KashRoot', alternateName: 'Kashroot', url: `${SITE_URL}/`, logo: `${SITE_URL}/icons/icon-512.png`, description: 'KashRoot: pay-after-delivery trade, live mandi rates and price comparison for growers, traders and buyers.', sameAs: SOCIAL_LINKS.map((l) => l.href) },
]);

// Re-render hourly so the hero opens on the current season, not the build's.
export const revalidate = 3600;

interface ToolAction {
  label: string;
  href: string;
}

/** Primary + secondary CTA per card. Logins carry where to land as `next`. */
const TOOL_ACTIONS: Record<ToolId, { primary: ToolAction; secondary: ToolAction }> = {
  escrow: {
    // Public: how paying works (UPI after delivery, identity checks) — no sign-in.
    primary: { label: 'How escrow payment works', href: TOOLS.escrow.href },
    // Buying with pay-after-delivery happens in the Buyer portal's shop.
    secondary: { label: 'Buy produce', href: loginHref('buyer', '/buyer/dashboard?tab=shop') },
  },
  mandi: {
    // The mandi board is public — no sign-in needed to read it.
    primary: { label: 'View today’s rates', href: TOOLS.mandi.href },
    // Posting a mandi's rates is the Mandi Helpers portal's job (its own sign-in).
    secondary: { label: 'Post your mandi’s rates', href: loginHref('trader', '/trader/dashboard') },
  },
  priceComparison: {
    primary: { label: 'Compare prices', href: TOOLS.priceComparison.href },
    // Selling on Price Comparison: its Sell here tab (sign-in happens there, no portal).
    secondary: { label: 'List your products', href: `${TOOLS.priceComparison.href}?tab=sell` },
  },
};

const BUTTON_LINK = 'no-underline hover:no-underline';

/**
 * Real live platform counts for the hero, straight from the database (the
 * public, signed-out tables). Each count stands on its own: when one cannot
 * be read it is simply not shown — no invented numbers, ever.
 */
async function liveMetrics(): Promise<{ stores: number | null; lots: number | null; rates: number | null }> {
  const count = async (table: string, match: Record<string, string | boolean>): Promise<number | null> => {
    try {
      // Count on id, not *: the anon SELECT grant is column-scoped, so
      // select=* is denied (401) while an exact count on id is allowed.
      const { count, error } = await supabase.from(table).select('id', { count: 'exact', head: true }).match(match);
      if (error) console.error('[liveMetrics]', table, JSON.stringify(error));
      return error ? null : count ?? null;
    } catch (e) {
      console.error('[liveMetrics]', table, 'threw:', e instanceof Error ? e.message : String(e));
      return null;
    }
  };
  // Today in India (the database dates a rate in IST), as outboxSend does.
  const indiaDay = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
  const [stores, lots, rates] = await Promise.all([
    count('rental_listings', { kind: 'cold_store', active: true }),
    count('market_listings', { active: true }),
    count('mandi_rates', { rate_date: indiaDay }),
  ]);
  return { stores, lots, rates };
}

export default async function HomePage() {
  const metrics = await liveMetrics();
  const fmt = (n: number) => n.toLocaleString('en-IN');
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: BRAND_JSON_LD }} />
      <HeroShowcase initialSeason={seasonForDate(new Date())}>
        <SiteHeader tone="light" showRoleSignIn />

        {/* Bottom padding leaves room for the season badge (no more). */}
        <main id="main-content" className="mx-auto max-w-7xl px-4 pb-16 pt-8 sm:px-6 sm:pt-12 lg:px-8">
          <section className={`max-w-2xl rounded-[2rem] p-6 sm:p-9 ${GLASS.panel}`}>
            <p className="inline-flex rounded-full bg-forest-soft px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-forest ring-1 ring-champagne/60">
              KashRoot · The agri-business ecosystem
            </p>
            <h1 className="font-display mt-5 text-4xl font-semibold tracking-tight text-ink [text-wrap:balance] sm:text-5xl lg:text-6xl">
              Every harvest,{' '}
              <span className="bg-gradient-to-r from-forest to-forest-mid bg-clip-text text-transparent">
                traded with trust.
              </span>
            </h1>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-ink-soft sm:text-lg">
              <strong className="font-semibold text-ink">KashRoot</strong> brings pay-after-delivery trade, live mandi rates and
              transparent price comparison to growers, traders and buyers.
            </p>
            {/* The KashRoot identity: forest greens, soft green and champagne gold. */}
            <p aria-hidden className="mt-5 flex items-center gap-1.5">
              {['#12382E', '#174C3C', '#286B54', '#EAF3EE', '#C6A45B'].map((c) => (
                <span key={c} className="h-2.5 w-8 rounded-full ring-1 ring-forest-line" style={{ backgroundColor: c }} />
              ))}
            </p>
            {/* Real live platform counts — each shown only when its table answered. */}
            {(metrics.stores != null || metrics.lots != null || metrics.rates != null) && (
              <p className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm font-medium text-ink-soft">
                {metrics.stores != null && <span><strong className="font-semibold text-ink">{fmt(metrics.stores)}</strong> cold stores listed</span>}
                {metrics.lots != null && <span><strong className="font-semibold text-ink">{fmt(metrics.lots)}</strong> produce lots on sale</span>}
                {metrics.rates != null && <span><strong className="font-semibold text-ink">{fmt(metrics.rates)}</strong> mandi rates today</span>}
              </p>
            )}
          </section>

          <section aria-label="KashRoot tools" className="mt-6 grid gap-5 sm:mt-8 md:grid-cols-3">
            {TOOL_ORDER.map((id) => (
              <Tilt3D key={id} className="rounded-3xl" max={6}>
                <ToolCard id={id} />
              </Tilt3D>
            ))}
          </section>
        </main>
      </HeroShowcase>

      <div className="relative isolate overflow-hidden bg-gradient-to-b from-mist via-white to-forest-soft/60">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10" style={LATTICE_BG} />
        <div className="mx-auto max-w-7xl space-y-10 px-4 pb-14 pt-8 sm:px-6 lg:px-8">
          <section aria-label="Voice assistant">
            <VoiceConcierge />
          </section>

          <section aria-labelledby="fertilizer-heading" className="grid gap-6 lg:grid-cols-[1fr_1.6fr] lg:items-start">
            <div className="pt-2 lg:sticky lg:top-24">
              <p className="inline-flex rounded-full bg-champagne-soft px-3 py-1 text-xs font-semibold text-champagne-deep ring-1 ring-champagne/60">Fertilisers and pesticides</p>
              <h2 id="fertilizer-heading" className="font-display mt-3 text-3xl font-semibold tracking-tight text-ink">KashRoot TrueScan — is it genuine?</h2>
              <p className="mt-3 leading-relaxed text-ink-soft">
                Type the registration number or the name from the label: it is checked against the Government list of registered
                products. Or photograph the label, or compare a lab report with the official Fertiliser (Control) Order standards.
              </p>
              <Link href="/supplies/tester" className="kr-btn-secondary mt-4 min-h-11 gap-1.5 no-underline hover:no-underline">
                Open TrueScan <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
            <FertilizerChecker />
          </section>

          <section aria-labelledby="portals-heading">
            <div className="relative isolate mb-6 overflow-hidden rounded-[2rem] border border-forest-deep p-8 text-white [box-shadow:inset_0_1px_0_rgba(255,255,255,0.14),0_2px_0_#0C2A22,0_18px_40px_-14px_rgba(18,56,46,0.45)] sm:p-10">
              <div aria-hidden className="absolute inset-0 -z-20 bg-gradient-to-br from-forest-deep via-forest to-forest" />
              <div aria-hidden className="absolute inset-x-8 top-0 -z-10 h-px bg-gradient-to-r from-transparent via-champagne to-transparent" />
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-champagne">Every portal</p>
              <h2 id="portals-heading" className="font-display mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">One valley, every trade</h2>
              <p className="mt-2 max-w-xl text-white/90">Each portal has its own sign-in. Pick yours.</p>
            </div>
            <PortalGrid />
          </section>
        </div>
      </div>
      <SiteFooter tone="light" />
    </>
  );
}

function ToolCard({ id }: { id: ToolId }) {
  const tool = TOOLS[id];
  const { theme } = tool;
  const { primary, secondary } = TOOL_ACTIONS[id];
  const Icon = tool.icon;

  return (
    <article
      className={`group relative flex h-full flex-col overflow-hidden rounded-3xl p-6 ${GLASS.panel} transition duration-300 [transform-style:preserve-3d] hover:-translate-y-1 hover:bg-white hover:[box-shadow:var(--kr-card-hover-shadow),0_24px_48px_-12px_rgba(18,56,46,0.25)] motion-reduce:transition-none motion-reduce:hover:translate-y-0`}
    >
      <div
        aria-hidden
        className={`pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full opacity-70 blur-3xl transition-opacity duration-300 group-hover:opacity-100 ${theme.glowA}`}
      />

      <div className="relative flex items-start justify-between gap-3">
        <span data-depth className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${theme.iconTile}`}>
          <Icon className="h-6 w-6" aria-hidden />
        </span>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${theme.eyebrow}`}>{tool.eyebrow}</span>
      </div>

      <h2 className="relative mt-5 font-display text-2xl font-semibold tracking-tight text-ink">{tool.title}</h2>
      <p className="relative mt-2 text-sm leading-relaxed text-ink-soft">{tool.description}</p>

      <div className="relative mt-auto flex flex-wrap gap-2 pt-6">
        <Link
          href={primary.href}
          className={`min-h-11 gap-1.5 ${BUTTON_LINK} ${theme.primaryButton}`}
        >
          {primary.label}
          <ArrowRight
            className="h-4 w-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
            aria-hidden
          />
        </Link>
        <Link
          href={secondary.href}
          className={`min-h-11 ${BUTTON_LINK} ${theme.secondaryButton}`}
        >
          {secondary.label}
        </Link>
      </div>
    </article>
  );
}
