'use client';

/**
 * Where the assistant, KashRoot's voice or a photo check is used: when this
 * browser has no "human pass" yet (lib/client/humanPass) — or a request was
 * just refused for want of one — shows the "I am human" check once, hands its
 * token to the server for an hour's pass, and then hides again. Usually
 * Cloudflare decides without a click. Renders nothing when the check is off.
 */
import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';

import { HumanCheck, humanCheckOn } from '@/components/security/HumanCheck';
import { claimHumanPass, humanPassReady } from '@/lib/client/humanPass';

export function HumanGate({ className = '' }: { className?: string }) {
  const [needed, setNeeded] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!humanCheckOn) return;
    let live = true;
    void humanPassReady().then((ok) => live && !ok && setNeeded(true));
    const need = () => setNeeded(true);
    const given = () => setNeeded(false);
    window.addEventListener('kr-need-human', need);
    window.addEventListener('kr-human-pass', given);
    return () => {
      live = false;
      window.removeEventListener('kr-need-human', need);
      window.removeEventListener('kr-human-pass', given);
    };
  }, []);

  if (!humanCheckOn || !needed) return null;
  return (
    <div className={`rounded-2xl bg-sky-50 p-3 ring-1 ring-sky-200 ${className}`} data-human-gate>
      <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-sky-950">
        <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden /> One quick check, so KashRoot’s answers and voice serve people, not machines.
      </p>
      <HumanCheck
        action="pass"
        onToken={(t) => {
          if (!t) return;
          void claimHumanPass(t).then((ok) => {
            setFailed(!ok);
            if (ok) setNeeded(false);
          });
        }}
      />
      {failed && <p className="mt-2 text-sm text-rose-800">The check did not pass. Please try again.</p>}
    </div>
  );
}
