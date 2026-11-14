'use client';

/**
 * Every portal as a card, from lib/portalCardsConfig: the portal's real
 * purpose, a gold badge word, and its direct action route. All cards wear the
 * one KashRoot look (white tactile card, soft green icon tile, champagne gold
 * accents, forest green button); a portal's own identity is its icon and
 * badge word. Each opens the portal; anyone not signed in to that portal lands
 * on its own sign-in. (Orchard Health and the Season Planner are part of the
 * Farmer portal.) Admin appears only on an admin's own device (see adminDevice).
 */
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';

import { Tilt3D } from '@/components/three/Tilt3D';
import { PORTALS } from '@/lib/auth/roles';
import { useShowAdmin } from '@/lib/client/adminDevice';
import { EIGHT_PORTALS_CONFIG } from '@/lib/portalCardsConfig';

const CARD =
  'kr-card kr-card-interactive group relative flex h-full min-h-[11.5rem] flex-col overflow-hidden rounded-3xl p-5 text-ink no-underline hover:no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest';
const ICON = 'relative grid h-12 w-12 place-items-center rounded-2xl bg-forest-soft text-forest ring-1 ring-forest-line shadow-[inset_0_1px_0_#fff,0_1px_2px_rgba(18,56,46,0.08)]';
const BADGE = 'relative rounded-full border border-champagne/60 bg-champagne-soft px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-champagne-deep';
// The button inside a card lifts and sinks with the card (the card is the link).
const CTA = 'kr-btn-primary relative mt-auto self-start group-hover:[transform:translateY(-1px)] group-hover:[box-shadow:var(--kr-btn-primary-hover-shadow)] group-active:[transform:translateY(1.5px)] group-active:[box-shadow:var(--kr-btn-primary-active-shadow)] motion-reduce:group-hover:[transform:none] motion-reduce:group-active:[transform:none]';

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
              <Link href={card.href} className={CARD}>
                <span aria-hidden className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-champagne to-transparent" />
                <span className="flex items-start justify-between gap-3">
                  <span className={ICON}>
                    <Icon className="h-6 w-6" aria-hidden />
                  </span>
                  <span aria-hidden className={BADGE}>{card.tag}</span>
                </span>
                <span className="relative mt-4 block text-lg font-semibold tracking-tight text-ink">{card.name}</span>
                <span className="relative mb-4 mt-1 block text-sm leading-relaxed text-ink-soft">{card.purpose}</span>
                <span className={CTA}>
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
        <Link href={admin.home} className={CARD}>
          <span aria-hidden className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-champagne to-transparent" />
          <span className="flex items-start justify-between gap-3">
            <span className={ICON}>
              <ArrowUpRight className="h-6 w-6 rotate-45" aria-hidden />
            </span>
            <span aria-hidden className={BADGE}>Staff</span>
          </span>
          <span className="relative mt-4 block text-lg font-semibold tracking-tight text-ink">{admin.label}</span>
          <span className="relative mb-4 mt-1 block text-sm leading-relaxed text-ink-soft">{admin.tagline}</span>
          <span className={CTA}>
            Open Admin Console
            <ArrowUpRight className="h-4 w-4 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden />
          </span>
        </Link>
      </Tilt3D>
    </li>
  );
}
