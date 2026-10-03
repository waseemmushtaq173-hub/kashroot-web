import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight,
  Cog,
  CloudSun,
  FlaskConical,
  LayoutDashboard,
  Lock,
  Mic,
  Microscope,
  Package,
  Store,
} from 'lucide-react';
import { SiteFooter, SiteHeader } from '@/components/layout/SiteHeader';

/**
 * Hero background — a shikara on Dal Lake, hot-linked from Unsplash.
 *
 * PLACEHOLDER. This is a stock photograph at a third-party URL, not an asset we
 * host. Before launch it should be replaced with a licensed or commissioned
 * image served from our own CDN, so the landing page cannot break on someone
 * else's URL change and so the licence is ours. `w=2400` is the widest the
 * banner is ever asked to render; `auto=format` lets the CDN pick webp/avif.
 *
 * Other frames from the same search, if this one is ever swapped out:
 *   photo-1564329494258-3f72215ba175  single shikara, calmer and emptier —
 *                                     the easier background for centred text
 *   photo-1685716271205-83a5ac2ba63b  moored shikaras at a ghat, busier
 */
const HERO_IMAGE =
  'https://images.unsplash.com/photo-1715457573748-8e8a70b2c1be?auto=format&fit=crop&w=2400&q=80';

export const metadata: Metadata = {
  title: "KashRoot — Kashmir's horticulture trade platform",
  description:
    'Trade produce direct from verified Kashmiri growers, and source the packaging, machinery and inputs to get it to market.',
};

/**
 * The two halves of the platform. Kept as data so the hero's structure and the
 * section below it cannot describe the verticals differently.
 */
const VERTICALS = [
  {
    name: 'Produce',
    href: '/buyer/discover',
    body: 'Saffron, apples, walnuts and more, listed directly by verified growers with origin and harvest date on every lot.',
    cta: 'Browse the marketplace',
  },
  {
    name: 'Supplies',
    href: '/supplies',
    body: 'Packaging, machinery and inputs from competing suppliers, priced side by side so the cheapest option is visible.',
    cta: 'Compare suppliers',
  },
];

const CAPABILITIES = [
  {
    icon: Lock,
    title: 'Secure escrow',
    body: 'Funds are held until the buyer confirms the consignment, so neither side carries the other’s risk.',
    href: '/farmer/dashboard',
  },
  {
    icon: Mic,
    title: 'Voice assistant',
    body: 'Receipts and advisories spoken aloud in Kashmiri and Urdu, for growers who would rather not read a screen.',
    href: '/farmer/assistant',
  },
  {
    icon: CloudSun,
    title: 'Mandi & weather',
    body: 'Daily rates from Parimpora and Sopore alongside harvest-window weather for the districts that supply them.',
    href: '/farmer/mandi',
  },
  {
    icon: Microscope,
    title: 'Input verification',
    body: 'Scan a QR code to check a pesticide or fertiliser is genuine before it reaches the orchard.',
    href: '/farmer/tester',
  },
];

const SUPPLY_CATEGORIES = [
  { icon: Package, name: 'Packaging', body: 'Jute sacks, CFB cartons, trays and pallet wrap.' },
  { icon: Cog, name: 'Machinery', body: 'Secateurs, sprayers, grading tables and small tools.' },
  { icon: FlaskConical, name: 'Inputs', body: 'Foliar micronutrients, neem oil and compost.' },
];

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-kr-bg-page">
      <SiteHeader />

      <main id="main-content" className="flex-1">
        {/*
          The hero image is a CSS background, so the browser does not discover
          it until the stylesheet is parsed — late enough to hurt Largest
          Contentful Paint on the page's biggest element. React 19 hoists this
          to <head>, starting the fetch alongside the HTML.
        */}
        <link rel="preload" as="image" href={HERO_IMAGE} fetchPriority="high" />

        {/* ── Hero ─────────────────────────────────────────────────────────────
            A full-bleed photograph rather than a slogan. The lake carries the
            "Kashmir" signal on its own, so the copy sits centred on a darkened
            overlay and is kept to a single factual sentence. */}
        <section className="relative isolate flex min-h-[30rem] items-center overflow-hidden md:min-h-[38rem]">
          {/*
            The photograph. Decorative — the heading carries the meaning, so
            this is hidden from assistive tech. `bg-kr-primary-900` is the
            fallback colour: it shows while the file loads and keeps the hero
            dark and readable rather than flashing white if the URL ever fails.
          */}
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-kr-primary-900 bg-cover bg-center"
            style={{ backgroundImage: `url('${HERO_IMAGE}')` }}
          />

          {/*
            Legibility overlay. One gradient instead of a flat wash: darker at
            the top and bottom, where the photograph is brightest (sky and
            water), and lighter across the middle so the lake still reads.
            Worst case anywhere is 60% black, which holds white body text at
            well past WCAG AA.
          */}
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-b from-black/75 via-black/60 to-black/85"
          />

          {/* No z-index needed: the positioned layers above come first in the
              DOM, and this is positioned too, so it paints on top of them. */}
          <div className="kr-container relative w-full py-24 text-center md:py-32">
            <p className="text-overline uppercase tracking-[0.2em] text-white/80">
              Verified Kashmiri horticulture
            </p>
            <h1 className="mx-auto mt-5 max-w-4xl font-heading text-display-lg text-white md:text-display-xl">
              Kashmir&rsquo;s harvest, traded direct.
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-body-lg text-white/85">
              Sell produce straight to buyers with no middleman taking the
              margin — and source the packaging, machinery and inputs that get
              it to market.
            </p>

            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href="/register" className="kr-btn-primary kr-btn-lg">
                <Store className="h-4 w-4" aria-hidden="true" />
                Create buyer account
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              {/* kr-btn-inverse, not kr-btn-secondary: the secondary button
                  colours its label with --kr-fill-brand, a dark green that
                  vanishes against a photograph. */}
              <Link
                href="/farmer/dashboard"
                className="kr-btn-inverse kr-btn-lg"
              >
                <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
                Sell as a farmer
              </Link>
            </div>
          </div>
        </section>

        {/* ── The two verticals ─────────────────────────────────────────────── */}
        <section className="kr-container pb-14" aria-labelledby="verticals-heading">
          <h2 id="verticals-heading" className="kr-sr-only">
            What you can do on KashRoot
          </h2>
          <div className="grid border border-kr-border-default md:grid-cols-2">
            {VERTICALS.map((v, i) => (
              <Link
                key={v.name}
                href={v.href}
                className={`group flex flex-col justify-between gap-6 bg-kr-bg-surface p-6 transition-colors hover:bg-kr-bg-sunken md:p-8 ${
                  i > 0 ? 'border-t border-kr-border-default md:border-l md:border-t-0' : ''
                }`}
              >
                <div>
                  <p className="text-overline uppercase text-kr-text-brand">{v.name}</p>
                  <p className="mt-3 max-w-md text-body text-kr-text-secondary">{v.body}</p>
                </div>
                <span className="inline-flex items-center gap-2 text-label font-medium text-kr-text-primary group-hover:text-kr-text-brand">
                  {v.cta}
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </span>
              </Link>
            ))}
          </div>
        </section>

        {/* ── Capabilities ──────────────────────────────────────────────────── */}
        <section className="kr-container pb-14" aria-labelledby="capabilities-heading">
          <h2
            id="capabilities-heading"
            className="font-heading text-h2 text-kr-text-primary"
          >
            Built for the trade
          </h2>
          <p className="mt-2 max-w-2xl text-body text-kr-text-secondary">
            Four things that decide whether a grower gets paid fairly and on
            time.
          </p>

          {/* Hairline grid: gap-px over a border-coloured background draws the rules. */}
          <div className="mt-6 grid gap-px border border-kr-border-default bg-kr-border-default sm:grid-cols-2 lg:grid-cols-4">
            {CAPABILITIES.map((c) => (
              <Link
                key={c.title}
                href={c.href}
                className="group flex flex-col gap-3 bg-kr-bg-surface p-6 transition-colors hover:bg-kr-bg-sunken"
              >
                <c.icon className="h-5 w-5 text-kr-primary-600" aria-hidden="true" />
                <h3 className="font-heading text-h4 text-kr-text-primary">{c.title}</h3>
                <p className="text-body-sm text-kr-text-secondary">{c.body}</p>
              </Link>
            ))}
          </div>
        </section>

        {/* ── Supplies highlight ────────────────────────────────────────────────
            The new vertical gets its own band on the landing page, since it is
            a section of the product rather than a footnote to produce. */}
        <section className="border-y border-kr-border-default bg-kr-bg-surface" aria-labelledby="supplies-heading">
          <div className="kr-container py-14">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-overline uppercase text-kr-text-brand">
                  New vertical
                </p>
                <h2
                  id="supplies-heading"
                  className="mt-3 font-heading text-h2 text-kr-text-primary"
                >
                  Horticulture supplies
                </h2>
                <p className="mt-2 max-w-2xl text-body text-kr-text-secondary">
                  Everything the harvest needs before it leaves the orchard —
                  with every supplier&rsquo;s price for the same item on one
                  screen.
                </p>
              </div>
              <Link href="/supplies" className="kr-btn-primary">
                Compare prices
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>

            <div className="mt-8 grid gap-px border border-kr-border-default bg-kr-border-default sm:grid-cols-3">
              {SUPPLY_CATEGORIES.map((c) => (
                <Link
                  key={c.name}
                  href="/supplies"
                  className="group flex flex-col gap-3 bg-kr-bg-page p-6 transition-colors hover:bg-kr-bg-sunken"
                >
                  <c.icon className="h-5 w-5 text-kr-primary-600" aria-hidden="true" />
                  <h3 className="font-heading text-h4 text-kr-text-primary">{c.name}</h3>
                  <p className="text-body-sm text-kr-text-secondary">{c.body}</p>
                </Link>
              ))}
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
