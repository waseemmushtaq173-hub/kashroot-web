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
  /** What the small phone tile says instead (the tile is about a third of the screen wide). */
  short: string;
  href: string;
}

/** Primary + secondary CTA per card. Logins carry where to land as `next`. */
const TOOL_ACTIONS: Record<ToolId, { primary: ToolAction; secondary: ToolAction }> = {
  escrow: {
    // Public: how paying works (UPI after delivery, identity checks) — no sign-in.
    primary: { label: 'How escrow payment works', short: 'How it works', href: TOOLS.escrow.href },
    // Buying with pay-after-delivery happens in the Buyer portal's shop.
    secondary: { label: 'Buy produce', short: 'Buy produce', href: loginHref('buyer', '/buyer/dashboard?tab=shop') },
  },
  mandi: {
    // The mandi board is public — no sign-in needed to read it.
    primary: { label: 'View today’s rates', short: 'Today’s rates', href: TOOLS.mandi.href },
    // Posting a mandi's rates is the Mandi Helpers portal's job (its own sign-in).
    secondary: { label: 'Post your mandi’s rates', short: 'Post rates', href: loginHref('trader', '/trader/dashboard') },
  },
  priceComparison: {
    primary: { label: 'Compare prices', short: 'Compare', href: TOOLS.priceComparison.href },
    // Selling on Price Comparison: its Sell here tab (sign-in happens there, no portal).
    secondary: { label: 'List your products', short: 'List yours', href: `${TOOLS.priceComparison.href}?tab=sell` },
  },
};

const BUTTON_LINK = 'no-underline hover:no-underline';

/** Each tool card wears a different hue of the spectrum (a portal's palette: its buttons, icon tile and edges follow). */
const TOOL_HUE: Record<ToolId, string> = { escrow: 'farmer', mandi: 'trader', priceComparison: 'rental' };

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
        <main id="main-content" className="mx-auto max-w-7xl px-4 pb-24 pt-4 sm:px-6 sm:pt-6 lg:px-8">
          <section className={`max-w-xl rounded-3xl p-3.5 sm:p-6 ${GLASS.panel}`}>
            <p className="inline-flex items-center gap-2 rounded-full bg-white/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink ring-1 ring-slate-900/10">
              <span aria-hidden className="kr-spectrum h-1.5 w-8 rounded-full" />
              <span className="sm:hidden">KashRoot ecosystem</span>
              <span className="hidden sm:inline">KashRoot · The agri-business ecosystem</span>
            </p>
            <h1 className="font-display mt-2.5 text-[1.7rem] leading-tight font-semibold tracking-tight text-ink [text-wrap:balance] sm:text-4xl lg:text-5xl">
              Every harvest,{' '}
              <span className="kr-spectrum-text">
                traded with trust.
              </span>
            </h1>
            <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-ink-soft sm:text-base">
              <strong className="font-semibold text-ink">KashRoot</strong> brings pay-after-delivery trade, live mandi rates and
              transparent price comparison to growers, traders and buyers.
            </p>
            {/* The KashRoot identity: the whole spectrum, not one hue. */}
            <p aria-hidden className="mt-3 flex items-center gap-1.5">
              {['#E11D48', '#F97316', '#FACC15', '#22C55E', '#06B6D4', '#3B82F6', '#8B5CF6'].map((c) => (
                <span key={c} className="h-2 w-6 rounded-full ring-1 ring-slate-900/10" style={{ backgroundColor: c }} />
              ))}
            </p>
            {/* Real live platform counts — each shown only when its table answered and has something: a zero says nothing to a visitor. */}
            {[metrics.stores, metrics.lots, metrics.rates].some((n) => n != null && n > 0) && (
              <p className="mt-2.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] font-medium text-ink-soft sm:gap-x-4 sm:text-sm">
                {metrics.stores != null && metrics.stores > 0 && <span><strong className="font-semibold text-ink">{fmt(metrics.stores)}</strong> cold stores listed</span>}
                {metrics.lots != null && metrics.lots > 0 && <span><strong className="font-semibold text-ink">{fmt(metrics.lots)}</strong> produce lots on sale</span>}
                {metrics.rates != null && metrics.rates > 0 && <span><strong className="font-semibold text-ink">{fmt(metrics.rates)}</strong> mandi rates posted today</span>}
              </p>
            )}
          </section>

          <section aria-label="KashRoot tools" className="mt-3 grid grid-cols-3 gap-2 sm:mt-4 sm:grid-cols-1 sm:gap-4 md:grid-cols-3">
            {/* A phone: the three side by side as small tiles (icon, name, one button). From 640 px one full card per row, from 768 px three across. */}
            {TOOL_ORDER.map((id) => (
              <div key={id} data-portal={TOOL_HUE[id]}>
                <Tilt3D className="rounded-3xl" max={6}>
                  <ToolCard id={id} />
                </Tilt3D>
              </div>
            ))}
          </section>
        </main>
      </HeroShowcase>

      <div className="relative isolate overflow-hidden bg-gradient-to-b from-mist via-white to-white">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10" style={LATTICE_BG} />
        {/* A faint glow of the spectrum behind the page, so it is not one tint from top to bottom. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10"
          style={{ backgroundImage: 'radial-gradient(38rem 24rem at 0% 8%, rgba(225,29,72,0.08), transparent 60%), radial-gradient(38rem 24rem at 100% 28%, rgba(249,115,22,0.09), transparent 60%), radial-gradient(40rem 26rem at 0% 62%, rgba(6,182,212,0.08), transparent 60%), radial-gradient(40rem 26rem at 100% 92%, rgba(139,92,246,0.09), transparent 60%)' }}
        />
        <div className="mx-auto max-w-7xl space-y-8 px-4 pb-12 pt-6 sm:px-6 lg:px-8">
          <section aria-label="Voice assistant" data-portal="kissan">
            <VoiceConcierge />
          </section>

          <section aria-labelledby="fertilizer-heading" data-portal="expert" className="grid gap-6 lg:grid-cols-[1fr_1.6fr] lg:items-start">
            <div className="pt-2 lg:sticky lg:top-24">
              <p className="inline-flex rounded-full bg-champagne-soft px-3 py-1 text-xs font-semibold text-champagne-deep ring-1 ring-champagne/60">Fertilisers and pesticides</p>
              <h2 id="fertilizer-heading" className="font-display mt-3 text-2xl font-semibold tracking-tight text-ink">KashRoot TrueScan — is it genuine?</h2>
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
            <div className="relative isolate mb-4 overflow-hidden rounded-3xl border border-white/30 p-5 text-white [box-shadow:inset_0_1px_0_rgba(255,255,255,0.22),0_2px_0_#2A1B3D,0_18px_40px_-14px_rgba(60,20,80,0.45)] sm:p-6">
              <div aria-hidden className="kr-spectrum-deep absolute inset-0 -z-20" />
              <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-b from-black/0 to-black/25" />
              <div aria-hidden className="kr-spectrum absolute inset-x-0 top-0 -z-10 h-1" />
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white">Every portal</p>
              <h2 id="portals-heading" className="font-display mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">One valley, every trade</h2>
              <p className="mt-1 max-w-xl text-sm text-white/90">Each portal has its own sign-in. Pick yours.</p>
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
      className={`group relative flex h-full flex-col overflow-hidden rounded-2xl p-3 sm:rounded-3xl sm:p-5 ${GLASS.panel} transition duration-300 [transform-style:preserve-3d] hover:-translate-y-1 hover:bg-white hover:[box-shadow:var(--kr-card-hover-shadow),0_24px_48px_-12px_rgba(30,27,75,0.25)] motion-reduce:transition-none motion-reduce:hover:translate-y-0`}
    >
      <div
        aria-hidden
        className={`pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full opacity-70 blur-3xl transition-opacity duration-300 group-hover:opacity-100 ${theme.glowA}`}
      />

      <div className="relative flex items-start justify-between gap-3">
        <span data-depth className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl sm:h-10 sm:w-10 ${theme.iconTile}`}>
          <Icon className="h-[18px] w-[18px] sm:h-5 sm:w-5" aria-hidden />
        </span>
        {/* On a phone the tile is a third of the screen: the tag and the long text are left out. */}
        <span className={`hidden rounded-full px-2.5 py-0.5 text-[11px] font-semibold sm:inline ${theme.eyebrow}`}>{tool.eyebrow}</span>
      </div>

      <h2 className="relative mt-2 font-display text-[13px] font-semibold leading-tight tracking-tight text-ink sm:mt-3 sm:text-xl">{tool.title}</h2>
      <p className="relative mt-1.5 hidden text-sm leading-snug text-ink-soft sm:block">{tool.description}</p>

      {/* A phone: one small button and a small link under it. From 640 px the two buttons share the row equally and a long label wraps instead of running past the card. */}
      <div className="relative mt-auto flex flex-col gap-1 pt-2.5 sm:flex-row sm:flex-wrap sm:gap-2 sm:pt-3">
        <Link
          href={primary.href}
          className={`min-h-11 min-w-0 flex-none gap-1.5 whitespace-normal !px-1.5 !py-1.5 text-center !text-[12px] !leading-tight sm:min-h-11 sm:flex-1 sm:basis-32 sm:!px-5 sm:!py-2.5 sm:!text-sm ${BUTTON_LINK} ${theme.primaryButton}`}
        >
          <span className="sm:hidden">{primary.short}</span>
          <span className="hidden sm:inline">{primary.label}</span>
          <ArrowRight
            className="hidden h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none sm:block"
            aria-hidden
          />
        </Link>
        <Link
          href={secondary.href}
          className={`min-h-11 min-w-0 flex-none whitespace-normal !px-1 !py-1.5 text-center !text-[11px] !leading-tight sm:min-h-11 sm:flex-1 sm:basis-32 sm:!px-5 sm:!py-2.5 sm:!text-sm ${BUTTON_LINK} ${theme.secondaryButton}`}
        >
          <span className="sm:hidden">{secondary.short}</span>
          <span className="hidden sm:inline">{secondary.label}</span>
        </Link>
      </div>
    </article>
  );
}
