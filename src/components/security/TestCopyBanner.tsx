'use client';

/**
 * A plain banner on a test copy of KashRoot (a Vercel preview, this computer):
 * the security check uses Cloudflare's test key there, so signing in with
 * Supabase's CAPTCHA on does not work — the real site is one tap away.
 * Nothing on the real site (components/security/HumanCheck checkMode()).
 */
import { useEffect, useState } from 'react';
import { FlaskConical } from 'lucide-react';

import { checkMode } from '@/components/security/HumanCheck';
import { SITE_URL } from '@/lib/site';

export function TestCopyBanner() {
  const [test, setTest] = useState(false);
  useEffect(() => {
    // The address is only known in the browser.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTest(checkMode().mode === 'test' && window.location.hostname !== 'localhost');
  }, []);
  if (!test) return null;
  const real = `${SITE_URL}${window.location.pathname}${window.location.search}`;
  return (
    <div role="note" data-test-copy className="relative z-50 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-amber-300 px-4 py-2 text-center text-sm font-semibold text-amber-950">
      <FlaskConical className="h-4 w-4 shrink-0" aria-hidden />
      <span>Test copy of KashRoot — signing in and real requests do not work here.</span>
      <a href={real} className="inline-flex min-h-11 items-center underline">
        Open the real site
      </a>
    </div>
  );
}
