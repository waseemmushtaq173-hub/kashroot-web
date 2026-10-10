'use client';

/**
 * PortalAuthFrame — the look shared by a portal's sign-in and create-account
 * pages: the portal's story over its live 3D valley on one side, the form on
 * the other. Colours, copy and scene mood come from portalLoginConfig.
 */
import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowLeft, Check, Leaf } from 'lucide-react';

import { PORTAL_LOGIN } from '@/components/auth/portalLoginConfig';
import { ValleyScene } from '@/components/three/ValleyScene';
import type { PortalId } from '@/lib/auth/roles';

export function PortalAuthFrame({ portal, labelledBy, children }: { portal: PortalId; labelledBy: string; children: ReactNode }) {
  const copy = PORTAL_LOGIN[portal];
  const { theme } = copy;
  const Icon = copy.icon;
  const focusRing = `focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${theme.outline}`;

  return (
    <div className={`relative isolate flex min-h-[100svh] items-center justify-center overflow-hidden px-4 py-10 ${theme.canvas}`}>
      <div className="grid w-full max-w-5xl overflow-hidden rounded-[2rem] bg-white/60 shadow-[0_30px_80px_rgba(15,23,42,0.18)] ring-1 ring-white/70 backdrop-blur-2xl lg:grid-cols-[1.05fr_1fr]">
        {/* Story over the live 3D valley. */}
        <section className="relative isolate min-h-[220px] overflow-hidden p-6 text-white sm:p-10 lg:flex lg:min-h-[620px] lg:flex-col lg:justify-between">
          <div aria-hidden className={`absolute inset-0 -z-20 bg-gradient-to-b ${theme.canvas}`} />
          <ValleyScene mood={copy.mood} className="-z-20" />
          <div aria-hidden className={`absolute inset-0 -z-10 bg-gradient-to-tr ${theme.sceneTint}`} />

          <div className="flex items-center justify-between gap-3">
            <Link href="/" className={`inline-flex items-center gap-2 rounded-xl text-white no-underline hover:no-underline ${focusRing}`}>
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/20 text-white ring-1 ring-white/40 backdrop-blur">
                <Leaf className="h-4 w-4" aria-hidden />
              </span>
              <span className="text-base font-semibold tracking-tight">KashRoot</span>
            </Link>
            <Link href="/" className={`inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1.5 text-sm font-semibold text-white no-underline ring-1 ring-white/40 backdrop-blur transition hover:bg-white/30 hover:no-underline ${focusRing}`}>
              <ArrowLeft className="h-4 w-4" aria-hidden /> Back to home
            </Link>
          </div>
          <div className="mt-8 lg:mt-0">
            <span data-depth className={`grid h-14 w-14 place-items-center rounded-2xl ${theme.iconTile}`}>
              <Icon className="h-6 w-6" aria-hidden />
            </span>
            <p className={`mt-5 text-xs font-semibold uppercase tracking-[0.18em] ${theme.eyebrow}`}>{copy.eyebrow}</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white drop-shadow-sm [text-wrap:balance] sm:text-4xl">{copy.headline}</h1>
            <p className="mt-3 max-w-md leading-relaxed text-white/90">{copy.description}</p>
            <ul className="mt-6 hidden space-y-2.5 sm:block">
              {copy.highlights.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm font-medium text-white">
                  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-white/90 shadow-sm">
                    <Check className={`h-3.5 w-3.5 ${theme.bullet}`} aria-hidden />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <p className="mt-8 hidden text-xs text-white/80 lg:block">Escrow-protected trade · Verified growers, traders and buyers</p>
        </section>

        <section aria-labelledby={labelledBy} className="bg-white/80 p-6 text-slate-900 sm:p-10">
          {children}
        </section>
      </div>
    </div>
  );
}
