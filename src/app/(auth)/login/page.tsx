/**
 * /login — no shared credential form any more: every portal has its own
 * sign-in. Old links that carry a role (/login?role=ADMIN&returnTo=…) go
 * straight to that portal's page; otherwise this is a chooser.
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowRight } from 'lucide-react';

import { PORTAL_LOGIN } from '@/components/auth/portalLoginConfig';
import { loginHref, PORTAL_IDS, PORTALS, portalForRole, safeNextPath, type PortalId } from '@/lib/auth/roles';

export const metadata: Metadata = { title: 'Choose your sign-in' };

const LEGACY_ROLE: Record<string, PortalId> = { KISSAN_PARTNER: 'kissan', RENTAL: 'rental', EXPERT: 'expert' };

function first(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : value?.[0];
}

export default async function LoginChooserPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const query = await searchParams;
  const role = first(query.role);
  const next = safeNextPath(first(query.returnTo) ?? first(query.next), '') || undefined;
  const portal = role ? (portalForRole(role) ?? LEGACY_ROLE[role]) : undefined;
  if (portal) redirect(loginHref(portal, next));

  return (
    <div className="w-full">
      <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Choose your portal</h1>
      <p className="mt-2 text-slate-600">Each portal has its own sign-in.</p>
      <ul className="mt-8 grid gap-3 sm:grid-cols-2">
        {PORTAL_IDS.map((id) => {
          const copy = PORTAL_LOGIN[id];
          const Icon = copy.icon;
          return (
            <li key={id}>
              <Link
                href={loginHref(id, next)}
                className="group flex items-center gap-3 rounded-2xl bg-white/90 p-3.5 text-slate-900 no-underline shadow-sm ring-1 ring-slate-900/5 transition hover:-translate-y-0.5 hover:no-underline hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
              >
                <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${copy.theme.iconTile}`}>
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{PORTALS[id].label}</span>
                  <span className="block truncate text-xs text-slate-500">{PORTALS[id].tagline}</span>
                </span>
                <ArrowRight className="h-4 w-4 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-slate-700" aria-hidden />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
