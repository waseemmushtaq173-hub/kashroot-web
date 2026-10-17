'use client';

/**
 * The identity check (KYC) inside any portal: whether Aadhaar (and PAN, when
 * Admin requires it) is verified, and "Verify now", which opens the check
 * right here (lib/client/identityCheck) — nobody has to go to another portal.
 */
import { useCallback, useEffect, useState } from 'react';
import { BadgeCheck, CircleAlert, ShieldCheck } from 'lucide-react';

import { Btn, type PortalTheme } from '@/components/portal/kit';
import { openIdentityCheck } from '@/lib/client/identityCheck';
import type { Account } from '@/lib/db/client';
import { KYC_CHANGED, kycMissing, kycRules, myKyc, type KycRules, type KycStatus } from '@/lib/db/security';

export function IdentityStatus({ account, theme, purpose }: { account: Account; theme: PortalTheme; purpose: string }) {
  const [rules, setRules] = useState<KycRules | null>(null);
  const [status, setStatus] = useState<KycStatus | null | undefined>(undefined);

  const load = useCallback(async () => {
    const [r, s] = await Promise.all([kycRules(), myKyc(account.id)]);
    setRules(r);
    setStatus(s);
  }, [account.id]);
  useEffect(() => {
    let live = true;
    const run = async () => {
      if (live) await load();
    };
    void run();
    window.addEventListener(KYC_CHANGED, run);
    return () => {
      live = false;
      window.removeEventListener(KYC_CHANGED, run);
    };
  }, [load]);

  if (status === undefined) return null;
  const missing = kycMissing(rules, status);
  const aadhaar = Boolean(status?.aadhaar_verified_at);

  if (!missing && aadhaar) {
    return (
      <p className="flex items-center gap-2 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900 ring-1 ring-emerald-200">
        <BadgeCheck className="h-4 w-4 shrink-0" aria-hidden /> Identity verified{status?.aadhaar_last4 ? <> (Aadhaar <span className="font-mono">•••• {status.aadhaar_last4}</span>)</> : null} — you can {purpose}.
      </p>
    );
  }
  const required = Boolean(missing);
  return (
    <section aria-label="Identity check" className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3 text-sm ring-1 ${required ? 'bg-amber-50 text-amber-950 ring-amber-200' : 'bg-white/80 text-slate-700 ring-slate-900/10'}`}>
      <p className="flex min-w-0 flex-1 items-start gap-2">
        {required ? <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden /> : <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" aria-hidden />}
        <span>
          {required
            ? `Verify your ${missing === 'pan' ? 'PAN' : 'Aadhaar'} to ${purpose}. KashRoot does not allow it until then.`
            : `Verify your identity so farmers and owners can trust you.`}{' '}
          It takes about a minute, right here — once for every portal. KashRoot keeps only the last 4 digits.
        </span>
      </p>
      <Btn theme={theme} size="sm" variant={required ? 'solid' : 'soft'} icon={ShieldCheck} onClick={openIdentityCheck}>Verify now</Btn>
    </section>
  );
}
