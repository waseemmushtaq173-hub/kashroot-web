import type { ReactNode } from 'react';

import { SiteFooter, SiteHeader } from '@/components/layout/SiteHeader';
import { LATTICE_BG } from '@/components/portal/lattice';

/** Plain bright page for policy and help content. */
export function InfoPage({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  return (
    <div className="kr-light relative isolate min-h-screen bg-gradient-to-br from-amber-50 via-white to-emerald-50 text-slate-900">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10" style={LATTICE_BG} />
      <SiteHeader tone="light" />
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <h1 className="font-serif text-4xl font-semibold tracking-tight text-slate-900">{title}</h1>
        <p className="mt-3 text-lg text-slate-600">{intro}</p>
        <div className="mt-8 space-y-6 rounded-3xl bg-white/80 p-6 text-[15px] leading-relaxed text-slate-700 shadow-sm ring-1 ring-slate-900/5 backdrop-blur sm:p-8 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-slate-900 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">
          {children}
        </div>
      </main>
      <SiteFooter tone="light" />
    </div>
  );
}
