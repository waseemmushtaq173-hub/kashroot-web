/**
 * /track — type the consignment code from the transporter to see the load's
 * live position (the driver's phone GPS). Replaces the old sample-data
 * "Traceability" page. Works without JavaScript: the form sends ?code=.
 */
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Search, Truck } from 'lucide-react';

import { SiteFooter, SiteHeader } from '@/components/layout/SiteHeader';

export const metadata: Metadata = { title: 'Track a load', description: 'Live position of a KashRoot consignment, from the driver’s phone.' };

export default async function TrackIndex({ searchParams }: { searchParams: Promise<{ code?: string | string[] }> }) {
  const raw = (await searchParams).code;
  const code = (typeof raw === 'string' ? raw : raw?.[0] ?? '').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 20);
  if (code) redirect(`/track/${code}`);
  return (
    <div className="kr-light flex min-h-screen flex-col bg-gradient-to-br from-cyan-50 via-white to-sky-50 text-slate-900">
      <SiteHeader tone="light" />
      <main className="mx-auto w-full max-w-xl flex-1 px-4 py-10 sm:px-6">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight"><Truck className="h-6 w-6 text-cyan-700" aria-hidden /> Track a load</h1>
        <p className="mt-2 text-slate-700">Type the code your transporter sent you (it looks like KR-3F9A1C7B). You will see where the truck is, from the driver’s phone GPS, and can call the driver.</p>
        <form action="/track" method="get" className="mt-6 flex gap-2">
          <label htmlFor="code" className="sr-only">Consignment code</label>
          <input id="code" name="code" required autoComplete="off" placeholder="Consignment code" className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base uppercase tracking-wider text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
          <button type="submit" className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-cyan-700 px-5 py-3 font-semibold text-white hover:bg-cyan-800">
            <Search className="h-4 w-4" aria-hidden /> Track
          </button>
        </form>
        <p className="mt-6 text-sm text-slate-600">Transporters: create a consignment in the Tracking portal to get a code and a driver link.</p>
      </main>
      <SiteFooter tone="light" />
    </div>
  );
}
