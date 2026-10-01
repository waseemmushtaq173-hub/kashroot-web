import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight,
  Sprout,
  LayoutDashboard,
  LogIn,
  Mic, 
  CloudSun, 
  Microscope, 
  Lock, 
  Store
} from 'lucide-react';

export const metadata: Metadata = {
  title: "KashRoot — Kashmir's global agri-trade platform",
  description:
    'Connect directly with verified Kashmiri farmers. Secure Escrow payments, AI accessibility, and zero middlemen.',
};

const FEATURES = [
  {
    icon: Lock,
    title: 'Secure Escrow Payments',
    body: 'Funds are held securely and only released when produce quality is verified, eliminating middleman fraud.',
    href: '/farmer/dashboard',
  },
  {
    icon: Mic,
    title: 'AI Voice Assistant',
    body: 'Designed for accessibility. Get transaction receipts and critical alerts spoken live in Kashmiri and Urdu.',
    href: '/farmer/assistant',
  },
  {
    icon: CloudSun,
    title: 'Live Mandi & Weather',
    body: 'Real-time pricing for high-value crops (Parimpora, Sopore) combined with local harvest weather tracking.',
    href: '/farmer/mandi',
  },
  {
    icon: Microscope,
    title: 'Input Verification',
    body: 'Scan QR codes to stop fake pesticide usage, and book direct soil testing with certified agronomists.',
    href: '/farmer/tester',
  }
];

const STATS = [
  { value: '2,400+', label: 'Verified farmers' },
  { value: '48', label: 'Export regions' },
  { value: '₹0', label: 'Middleman fee' },
];

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col bg-kr-bg-page">
      {/* Nav */}
      <header className="border-b border-kr-border-default bg-kr-bg-surface">
        <nav className="kr-container flex items-center justify-between py-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-kr-primary-500 flex items-center justify-center">
              <span className="text-white font-heading font-bold text-lg">K</span>
            </div>
            <span className="font-heading font-bold text-xl text-kr-text-primary">KashRoot</span>
          </div>
          <Link href="/login" className="kr-btn-ghost kr-btn-sm">
            <LogIn className="w-4 h-4" aria-hidden="true" /> Sign in
          </Link>
        </nav>
      </header>

      <main id="main-content" className="flex-1">
        {/* Hero */}
        <section className="kr-container py-16 md:py-24 text-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-kr-fill-brand-subtle px-3 py-1 text-caption font-medium text-kr-text-brand mb-6">
            <Sprout className="w-3.5 h-3.5" aria-hidden="true" /> Farm-to-world marketplace
          </span>
          <h1 className="font-heading text-h1 text-kr-text-primary leading-tight max-w-3xl mx-auto">
            Kashmir&rsquo;s produce,{' '}
            <span className="text-kr-primary-500">the world&rsquo;s table.</span>
          </h1>
          <p className="text-body-lg text-kr-text-secondary max-w-xl mx-auto mt-5">
            Connect directly with verified Kashmiri farmers. Transparent pricing, secure Escrow integration, 
            and zero middlemen.
          </p>

          {/* Primary CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-9">
            <Link href="/register" className="kr-btn-primary kr-btn-lg w-full sm:w-auto">
              <Store className="w-4 h-4" aria-hidden="true" /> Create Buyer Account
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </Link>
            <Link href="/farmer/dashboard" className="kr-btn-secondary kr-btn-lg w-full sm:w-auto">
              <LayoutDashboard className="w-4 h-4" aria-hidden="true" /> Sell as a farmer
            </Link>
            <Link href="/login" className="kr-btn-ghost kr-btn-lg w-full sm:w-auto">
              <LogIn className="w-4 h-4" aria-hidden="true" /> Sign in
            </Link>
          </div>

          {/* Stats */}
          <dl className="grid grid-cols-3 gap-6 max-w-lg mx-auto mt-16 pt-8 border-t border-kr-border-default">
            {STATS.map((s) => (
              <div key={s.label}>
                <dt className="sr-only">{s.label}</dt>
                <dd className="font-heading text-h3 text-kr-primary-500">{s.value}</dd>
                <p className="text-caption text-kr-text-secondary mt-1">{s.label}</p>
              </div>
            ))}
          </dl>
        </section>

        {/* Features - Clickable Feature Cards */}
        <section className="kr-container pb-20 md:pb-28" aria-labelledby="features-heading">
          <h2 id="features-heading" className="sr-only">Why KashRoot</h2>
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <Link
                key={f.title}
                href={f.href}
                className="kr-card space-y-3 block hover:border-kr-primary-500 transition-colors group cursor-pointer"
              >
                <div className="w-10 h-10 rounded-lg bg-kr-fill-brand-subtle flex items-center justify-center group-hover:bg-kr-primary-500 group-hover:text-white transition-colors">
                  <f.icon className="w-5 h-5 text-kr-primary-600 group-hover:text-white transition-colors" aria-hidden="true" />
                </div>
                <h3 className="font-heading text-h4 text-kr-text-primary group-hover:text-kr-primary-600 transition-colors">
                  {f.title}
                </h3>
                <p className="text-body-sm text-kr-text-secondary">{f.body}</p>
              </Link>
            ))}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-kr-border-default bg-kr-bg-surface">
        <div className="kr-container flex flex-col sm:flex-row items-center justify-between gap-3 py-6">
          <p className="text-caption text-kr-text-secondary">
            &copy; {new Date().getFullYear()} KashRoot Technologies Pvt. Ltd.
          </p>
          <div className="flex items-center gap-4 text-caption">
            <Link href="/register" className="text-kr-text-secondary hover:text-kr-text-brand">Marketplace</Link>
            <Link href="/farmer/dashboard" className="text-kr-text-secondary hover:text-kr-text-brand">For farmers</Link>
            <Link href="/login" className="text-kr-text-secondary hover:text-kr-text-brand">Sign in</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}