'use client';

/**
 * Escrow payment (pay after delivery) for the Farmer and Buyer
 * portals — the only two portals where money changes hands between people.
 *
 *   1. Identity check: Aadhaar (and PAN when Admin requires it), recorded by
 *      the KashRoot server only. Until it is done the database itself refuses
 *      selling, ordering and payout details (when Admin has switched it on).
 *   2. How the money moves: the buyer pays nothing up front; the goods are
 *      checked on arrival, then the buyer pays the farmer directly by UPI /
 *      bank and both confirm. Problems are reported before paying.
 *   3. Farmer: where buyers pay you (UPI / bank). Buyer: orders waiting for
 *      your payment.
 * KashRoot never holds the money.
 */
import { useCallback, useEffect, useState } from 'react';
import { BadgeCheck, CircleAlert, IdCard, ShieldCheck } from 'lucide-react';

import { KYCPanel } from '@/components/auth/KYCPanel';
import { Badge, Btn, Panel, type PortalTheme } from '@/components/portal/kit';
import type { Account } from '@/lib/db/client';
import { KYC_CHANGED, kycMissing, kycRules, myKyc, type KycRules, type KycStatus } from '@/lib/db/security';

const STEPS = {
  buyer: [
    'Order in Buy apples & produce (or on Price Comparison). You pay nothing now.',
    'The farmer accepts and sends the goods.',
    'When they arrive, check them. Something wrong? Press “Report a problem” — before paying.',
    'All good: press “I received the goods”, pay the farmer from your UPI app and type the payment number.',
    'The farmer confirms the money arrived. Done.',
  ],
  farmer: [
    'A buyer orders your produce or farm inputs. They pay nothing up front.',
    'Accept the order and send the goods (Mark shipped).',
    'The buyer checks the goods on arrival and pays you directly by UPI / bank.',
    'Check the money in your bank or UPI app, then press “Money received”.',
    'If the buyer reports a problem, KashRoot sees it and helps settle it.',
  ],
};

export function SafePayment({ as, account, theme, children }: { as: 'buyer' | 'farmer'; account: Account; theme: PortalTheme; children?: React.ReactNode }) {
  const [rules, setRules] = useState<KycRules | null>(null);
  const [status, setStatus] = useState<KycStatus | null | undefined>(undefined);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    const [r, s] = await Promise.all([kycRules(), myKyc(account.id)]);
    setRules(r);
    setStatus(s);
  }, [account.id]);
  useEffect(() => {
    let live = true;
    void (async () => {
      if (live) await load();
    })();
    return () => {
      live = false;
    };
  }, [load]);

  const missing = kycMissing(rules, status ?? null);
  const aadhaar = Boolean(status?.aadhaar_verified_at);
  const pan = Boolean(status?.pan_verified_at);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Panel theme={theme} title="Identity check (KYC)" icon={IdCard}>
        {status === undefined ? (
          <p className="text-sm text-slate-600">Checking…</p>
        ) : (
          <div className="space-y-3 text-sm text-slate-700">
            <p>Everyone who pays or gets paid on KashRoot verifies their identity once, so both sides know who they are dealing with. KashRoot keeps only the last 4 digits — never your full Aadhaar.</p>
            <ul className="space-y-2">
              <li className="flex items-center justify-between gap-2 rounded-xl bg-white/80 p-3 ring-1 ring-slate-900/5">
                <span className="flex items-center gap-2 font-semibold text-slate-900">Aadhaar {aadhaar && status?.aadhaar_last4 ? <span className="font-mono text-slate-500">•••• {status.aadhaar_last4}</span> : null}</span>
                {aadhaar ? <Badge tone="green">Verified</Badge> : <Badge tone={rules?.kyc_required ? 'red' : 'amber'}>{rules?.kyc_required ? 'Required' : 'Not yet'}</Badge>}
              </li>
              <li className="flex items-center justify-between gap-2 rounded-xl bg-white/80 p-3 ring-1 ring-slate-900/5">
                <span className="font-semibold text-slate-900">PAN {pan && status?.pan_last4 ? <span className="font-mono text-slate-500">•••• {status.pan_last4}</span> : null}</span>
                {pan ? <Badge tone="green">Verified</Badge> : <Badge tone={rules?.pan_required ? 'red' : 'slate'}>{rules?.pan_required ? 'Required' : 'Optional'}</Badge>}
              </li>
            </ul>
            {missing ? (
              <p className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-amber-950 ring-1 ring-amber-200">
                <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> Verify your {missing === 'pan' ? 'PAN' : 'Aadhaar'} before you {as === 'buyer' ? 'order or pay' : 'sell or add payment details'}. KashRoot does not allow it until then.
              </p>
            ) : aadhaar ? (
              <p className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-emerald-900 ring-1 ring-emerald-200"><BadgeCheck className="h-4 w-4" aria-hidden /> You are verified. Buyers and farmers see that you are a verified person.</p>
            ) : null}
            {(!aadhaar || (rules?.pan_required && !pan)) && (
              <Btn theme={theme} icon={ShieldCheck} onClick={() => setOpen(true)}>Verify now</Btn>
            )}
          </div>
        )}
      </Panel>

      <Panel theme={theme} title="How escrow payment works" icon={ShieldCheck}>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-700">
          {STEPS[as].map((s) => <li key={s}>{s}</li>)}
        </ol>
        <p className="mt-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-600 ring-1 ring-slate-900/5">The buyer pays only after delivery: the money stays with the buyer until the goods arrive and are checked, then goes straight from the buyer’s UPI / bank to the farmer’s. KashRoot never holds or releases it. Every payment number is recorded on the order, so either side can prove what was paid.</p>
      </Panel>

      {children && <div className="lg:col-span-2">{children}</div>}

      <KYCPanel
        open={open}
        onClose={() => setOpen(false)}
        defaultRole={as === 'buyer' ? 'BUYER' : 'FARMER'}
        onComplete={async () => {
          try {
            localStorage.setItem('kyc_status', 'submitted');
          } catch {
            /* private mode */
          }
          await load();
          // The portal frame's reminder banner refreshes too.
          window.dispatchEvent(new Event(KYC_CHANGED));
        }}
      />
    </div>
  );
}
