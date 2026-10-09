'use client';

/**
 * Every portal as a coloured 3D card. Each opens the portal; signed-out
 * visitors land on that portal's own sign-in.
 */
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';

import { PORTAL_LOGIN } from '@/components/auth/portalLoginConfig';
import { PORTAL_THEMES, type PortalThemeId } from '@/components/portal/kit';
import { Tilt3D } from '@/components/three/Tilt3D';
import { PORTAL_IDS, PORTALS, type PortalId } from '@/lib/auth/roles';

const KIT_THEME: Record<PortalId, PortalThemeId> = {
  farmer: 'farmer',
  buyer: 'buyer',
  seller: 'seller',
  kissan: 'kissan',
  rental: 'rental',
  logistics: 'provider',
  tracking: 'tracking',
  dealer: 'dealer',
  expert: 'expert',
  admin: 'admin',
};

export function PortalGrid() {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      {PORTAL_IDS.map((id) => {
        const copy = PORTAL_LOGIN[id];
        const theme = PORTAL_THEMES[KIT_THEME[id]];
        const Icon = copy.icon;
        return (
          <li key={id}>
            <Tilt3D className="rounded-3xl">
              <Link
                href={PORTALS[id].home}
                className={`group relative flex h-full min-h-[11.5rem] flex-col overflow-hidden rounded-3xl p-5 text-slate-900 no-underline shadow-[0_18px_40px_-18px_rgba(15,23,42,0.35)] ring-1 ring-white/80 transition [transform-style:preserve-3d] hover:no-underline hover:shadow-[0_28px_60px_-20px_rgba(15,23,42,0.45)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${theme.canvas} ${theme.outline}`}
              >
                <span aria-hidden className={`pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full opacity-40 blur-2xl ${theme.tile}`} />
                <span data-depth className={`relative grid h-12 w-12 place-items-center rounded-2xl ${copy.theme.iconTile}`}>
                  <Icon className="h-6 w-6" aria-hidden />
                </span>
                <span className="relative mt-4 block text-lg font-semibold tracking-tight">{PORTALS[id].label}</span>
                <span className="relative mt-1 block text-sm text-slate-600">{PORTALS[id].tagline}</span>
                <span className={`relative mt-auto inline-flex items-center gap-1 pt-4 text-sm font-semibold ${theme.accent}`}>
                  {PORTALS[id].requiredRole ? `${PORTALS[id].label} sign-in` : 'Open'}
                  <ArrowUpRight className="h-4 w-4 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden />
                </span>
              </Link>
            </Tilt3D>
          </li>
        );
      })}
    </ul>
  );
}
