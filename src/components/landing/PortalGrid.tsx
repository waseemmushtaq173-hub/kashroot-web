'use client';

/**
 * Every portal as a coloured card, from lib/portalCardsConfig: the portal's
 * real purpose, its own rich gradient, accent badge and direct action route.
 * Each opens the portal; anyone not signed in to that portal lands on its
 * own sign-in. (Orchard Health and the Season Planner are part of the Farmer
 * portal.) Admin appears only on an admin's own device (see adminDevice).
 */
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';

import { Tilt3D } from '@/components/three/Tilt3D';
import { PORTALS } from '@/lib/auth/roles';
import { useShowAdmin } from '@/lib/client/adminDevice';
import { EIGHT_PORTALS_CONFIG } from '@/lib/portalCardsConfig';

const CARD =
  'group relative flex h-full min-h-[11.5rem] flex-col overflow-hidden rounded-3xl border-2 bg-gradient-to-br p-5 no-underline shadow-[0_18px_40px_-18px_rgba(15,23,42,0.35)] transition hover:-translate-y-0.5 hover:no-underline hover:shadow-[0_28px_60px_-20px_rgba(15,23,42,0.45)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2';

export function PortalGrid() {
  // Admin appears only on an admin's own phone or computer (see adminDevice).
  const showAdmin = useShowAdmin();
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {EIGHT_PORTALS_CONFIG.map((card) => {
        const Icon = card.icon;
        return (
          <li key={card.id}>
            <Tilt3D className="rounded-3xl">
              <Link href={card.href} className={`${CARD} ${card.gradientClass} ${card.borderClass}`}>
                <span aria-hidden className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
                <span className={`relative grid h-12 w-12 place-items-center rounded-2xl ${card.badgeBgClass}`}>
                  <Icon className="h-6 w-6" aria-hidden />
                </span>
                <span className="relative mt-4 block text-lg font-semibold tracking-tight">{card.name}</span>
                <span className="relative mt-1 block text-sm leading-relaxed text-white/85">{card.purpose}</span>
                <span className={`relative mt-auto inline-flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-semibold self-start ${card.buttonClass}`}>
                  {card.actionLabel}
                  <ArrowUpRight className="h-4 w-4 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden />
                </span>
              </Link>
            </Tilt3D>
          </li>
        );
      })}
      {showAdmin && <AdminCard />}
    </ul>
  );
}

/** The admin console, only on an admin's own device: same card language. */
function AdminCard() {
  const admin = PORTALS.admin;
  return (
    <li>
      <Tilt3D className="rounded-3xl">
        <Link href={admin.home} className={`${CARD} border-slate-600/40 from-slate-800 via-slate-700 to-slate-900 text-white`}>
          <span aria-hidden className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
          <span className="relative grid h-12 w-12 place-items-center rounded-2xl bg-slate-500/20 text-slate-200 border border-slate-400/30">
            <ArrowUpRight className="h-6 w-6 rotate-45" aria-hidden />
          </span>
          <span className="relative mt-4 block text-lg font-semibold tracking-tight">{admin.label}</span>
          <span className="relative mt-1 block text-sm leading-relaxed text-white/85">{admin.tagline}</span>
          <span className="relative mt-auto inline-flex items-center gap-1 rounded-xl bg-slate-300 px-3 py-2 text-sm font-semibold text-slate-950 self-start">
            Open Admin Console
            <ArrowUpRight className="h-4 w-4 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden />
          </span>
        </Link>
      </Tilt3D>
    </li>
  );
}
