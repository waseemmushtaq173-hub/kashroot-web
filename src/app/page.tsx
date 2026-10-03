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
import { ChinarLeaf } from '@/components/brand/ChinarLeaf';
import { SiteFooter, SiteHeader } from '@/components/layout/SiteHeader';

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
        {/* ── Hero ─────────────────────────────────────────────────────────────
            The Chinar carries the identity here rather than a large slogan:
            the mark says "Kashmir" faster than the word does, and the copy is
            kept to a single factual sentence. */}
        <section className="kr-container py-12 md:py-20">
          <div className="grid items-stretch gap-8 lg:grid-cols-2">
            <div className="flex flex-col justify-center">
              <p className="text-overline uppercase text-kr-text-brand">
                Verified Kashmiri horticulture
              </p>
              <h1 className="mt-3 font-heading text-h1 leading-tight text-kr-text-primary">
                Kashmir&rsquo;s harvest, traded direct.
              </h1>
              <p className="mt-4 max-w-xl text-body-lg text-kr-text-secondary">
                Sell produce straight to buyers with no middleman taking the
                margin — and source the packaging, machinery and inputs that get
                it to market.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link href="/register" className="kr-btn-primary kr-btn-lg">
                  <Store className="h-4 w-4" aria-hidden="true" />
                  Create buyer account
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                <Link href="/farmer/dashboard" className="kr-btn-secondary kr-btn-lg">
                  <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
                  Sell as a farmer
                </Link>
              </div>
            </div>

            {/* Brand panel — a sharp rectangle, the leaf filling it. */}
            <div className="relative flex min-h-[300px] items-center justify-center border border-kr-border-default bg-kr-primary-500 p-10">
              <ChinarLeaf className="h-56 w-56 text-white md:h-64 md:w-64" />
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-between border-t border-white/25 px-6 py-3">
                <span className="text-caption font-semibold uppercase tracking-wide text-white/90">
                  Produce
                </span>
                <span className="text-caption font-semibold uppercase tracking-wide text-white/90">
                  Supplies
                </span>
              </div>
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
