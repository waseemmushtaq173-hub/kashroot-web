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

/** Each portal card wears its portal's own hue (the same colours it has inside), so the grid is a spectrum, not one indigo. */
const HUE: Record<string, string> = {
  farmer: 'farmer',
  buyer: 'buyer',
  'kissan-tools': 'kissan',
  'cold-storage': 'rental',
  tracking: 'tracking',
  'agro-dealer': 'dealer',
  advisory: 'expert',
  'mandi-helpers': 'trader',
};

const CARD =
  'kr-card kr-card-interactive group relative flex h-full flex-col overflow-hidden rounded-2xl p-3 text-ink sm:min-h-[9rem] sm:rounded-3xl sm:p-4 no-underline hover:no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest';
// A forest and gold badge standing on its own ledge (globals.css .kr-icon-badge).
const ICON = 'kr-icon-badge relative grid h-9 w-9 place-items-center rounded-xl sm:h-10 sm:w-10';
const BADGE = 'relative rounded-full border border-champagne/60 bg-champagne-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-champagne-deep sm:px-2.5 sm:text-[11px] sm:tracking-[0.14em]';
// The button inside a card lifts and sinks with the card (the card is the link).
const CTA = 'kr-btn-primary relative mt-auto min-h-11 w-full justify-between !px-3 !py-1.5 !text-[12px] sm:min-h-11 sm:!px-5 sm:!py-2.5 sm:!text-sm group-hover:[transform:translateY(-1px)] group-hover:[box-shadow:var(--kr-btn-primary-hover-shadow)] group-active:[transform:translateY(1.5px)] group-active:[box-shadow:var(--kr-btn-primary-active-shadow)] motion-reduce:group-hover:[transform:none] motion-reduce:group-active:[transform:none]';

export function PortalGrid() {
  // Admin appears only on an admin's own phone or computer (see adminDevice).
  const showAdmin = useShowAdmin();
  // A phone: two small tiles across (name, a short line, one button) instead of one big card per row.
  return (
    <ul className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
      {EIGHT_PORTALS_CONFIG.map((card) => {
        const Icon = card.icon;
        return (
          <li key={card.id} data-portal={HUE[card.id]}>
            <Tilt3D className="rounded-3xl">
              <Link href={card.href} className={CARD}>
                <span aria-hidden className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-champagne to-transparent" />
                <span className="flex items-start justify-between gap-3">
                  <span className={ICON}>
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <span aria-hidden className={BADGE}>{card.tag}</span>
                </span>
                <span className="relative mt-2 block text-[15px] font-semibold leading-tight tracking-tight text-ink sm:mt-3 sm:text-base">{card.name}</span>
                <span className="relative mb-2.5 mt-1 line-clamp-3 block text-xs leading-snug text-ink-soft sm:mb-3 sm:line-clamp-none sm:text-sm">{card.purpose}</span>
                <span className={CTA}>
                  {card.actionLabel}
                  <ArrowUpRight className="h-4 w-4 text-champagne transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden />
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
              <ArrowUpRight className="h-5 w-5 rotate-45" aria-hidden />
            </span>
            <span aria-hidden className={BADGE}>Staff</span>
          </span>
          <span className="relative mt-2 block text-[15px] font-semibold leading-tight tracking-tight text-ink sm:mt-3 sm:text-base">{admin.label}</span>
          <span className="relative mb-2.5 mt-1 line-clamp-3 block text-xs leading-snug text-ink-soft sm:mb-3 sm:line-clamp-none sm:text-sm">{admin.tagline}</span>
          <span className={CTA}>
            Open Admin Console
            <ArrowUpRight className="h-4 w-4 text-champagne transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden />
          </span>
        </Link>
      </Tilt3D>
    </li>
  );
}
