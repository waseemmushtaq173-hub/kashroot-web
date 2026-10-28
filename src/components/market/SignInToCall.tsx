'use client';

/**
 * In place of a phone number for a signed-out visitor (numbers are for
 * signed-in people only — lib/db/phones): "Sign in to call", to that
 * portal's sign-in, which comes back to this page.
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Phone } from 'lucide-react';

import { loginHref, type PortalId } from '@/lib/auth/roles';

export function SignInToCall({ portal = 'buyer', compact = false }: { portal?: PortalId; compact?: boolean }) {
  const here = usePathname() ?? '/';
  return (
    <Link
      href={loginHref(portal, here)}
      className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl font-semibold text-sky-800 ${compact ? 'text-sm' : 'bg-slate-100 px-3 text-sm hover:bg-slate-200'}`}
    >
      <Phone className="h-4 w-4" aria-hidden /> Sign in to call
    </Link>
  );
}
