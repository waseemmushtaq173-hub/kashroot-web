import type { Metadata } from 'next';
import Link from 'next/link';

import { Emblem } from '@/components/brand/Emblem';

export const metadata: Metadata = { title: 'Page not found', robots: { index: false } };

/**
 * Every "page not found": the KashRoot look (ivory page, white card, dark
 * text, green link), with its own colours set here so it stays readable over
 * the site's dark body and when a phone forces dark mode.
 */
export default function NotFound() {
  return (
    <main className="kr-light flex min-h-screen items-center justify-center bg-ivory px-4 py-10 text-slate-900 [color-scheme:light]">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 text-center shadow-[0_12px_40px_rgba(15,23,42,0.10)] ring-1 ring-[#E8A317]/30">
        <Emblem className="mx-auto h-12 w-12" />
        <h1 className="mt-4 font-display text-3xl font-semibold text-slate-900">Page not found</h1>
        <p className="mt-2 text-slate-700">This page could not be found. It may have moved, or the address has a typo.</p>
        <Link href="/" className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-chinar px-5 font-semibold text-white no-underline hover:bg-chinar-hover hover:no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700">
          Go to KashRoot home
        </Link>
      </div>
    </main>
  );
}
