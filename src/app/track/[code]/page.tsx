/**
 * /track/<code> — public live tracking for a buyer or farmer who got the
 * code from the transporter. No sign-in.
 */
import type { Metadata } from 'next';

import { LiveTrack } from '@/components/tracking/LiveTrack';
import { SiteFooter, SiteHeader } from '@/components/layout/SiteHeader';

export const metadata: Metadata = { title: 'Track a consignment', robots: { index: false } };

export default async function TrackPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return (
    <div className="kr-light flex min-h-screen flex-col bg-gradient-to-br from-cyan-50 via-white to-sky-50 text-slate-900">
      <SiteHeader tone="light" />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6">
        <h1 className="mb-4 text-2xl font-semibold tracking-tight">Where is my load?</h1>
        <LiveTrack code={decodeURIComponent(code).slice(0, 20)} />
      </main>
      <SiteFooter tone="light" />
    </div>
  );
}
