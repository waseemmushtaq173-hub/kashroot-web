'use client';

/**
 * My work & pay — for Mandi Helpers and agronomists: every rate posted and
 * every farmer answered, whether it was accepted (confirmed rate, or the
 * farmer said it helped), what KashRoot pays per accepted contribution, what
 * is owed and what was paid, and where KashRoot should pay.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, CircleDashed, IndianRupee, ListChecks, Loader2, Wallet, XCircle } from 'lucide-react';

import { PortalShell } from '@/components/layout/PortalShell';
import { PayoutForm } from '@/components/payments/PayoutForm';
import { Badge, Btn, EmptyState, PORTAL_THEMES, Panel } from '@/components/portal/kit';
import { loginHref } from '@/lib/auth/roles';
import { ago, loadAccount, type Account } from '@/lib/db/client';
import { myContributions, payRates, STATUS_WORDS, WORK_LABEL, type Contribution, type PayRate } from '@/lib/db/contributions';
import { myPayout, type PayoutAccount } from '@/lib/db/rentals';

const theme = PORTAL_THEMES.expert;
const rupees = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const TONE = { accepted: 'green', pending: 'amber', rejected: 'red' } as const;
const ICON = { accepted: CheckCircle2, pending: CircleDashed, rejected: XCircle } as const;

export default function ContributionsPage() {
  const [account, setAccount] = useState<Account | null | undefined>(undefined);
  const [work, setWork] = useState<Contribution[] | null>(null);
  const [pay, setPay] = useState<PayRate[]>([]);
  const [payout, setPayout] = useState<PayoutAccount | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void loadAccount()
      .then(async (a) => {
        if (!live) return;
        setAccount(a);
        if (!a) return;
        const [w, p, o] = await Promise.allSettled([myContributions(a.id), payRates(), myPayout(a.id)]);
        if (!live) return;
        setWork(w.status === 'fulfilled' ? w.value : []);
        setPay(p.status === 'fulfilled' ? p.value : []);
        setPayout(o.status === 'fulfilled' ? o.value : null);
        if (w.status === 'rejected') setError(w.reason instanceof Error ? w.reason.message : 'Could not load your work.');
      })
      .catch(() => live && setAccount(null));
    return () => {
      live = false;
    };
  }, []);

  const amount = (kind: Contribution['kind']) => pay.find((p) => p.kind === kind)?.amount ?? 0;
  const list = work ?? [];
  const accepted = list.filter((c) => c.status === 'accepted');
  const owed = accepted.filter((c) => !c.paid_at).reduce((s, c) => s + amount(c.kind), 0);
  const paid = list.reduce((s, c) => s + Number(c.paid_amount ?? 0), 0);
  const waiting = list.filter((c) => c.status === 'pending').length;
  const payDecided = pay.some((p) => p.amount > 0);
  const isStaff = Boolean(account?.staff.some((r) => r === 'REPORTER' || r === 'EXPERT' || r === 'ADMIN'));

  return (
    <PortalShell
      title="My work & pay"
      description="Mandi rates you posted and farmers you answered, what was accepted, and your payments."
      eyebrow="Contributors"
      theme="expert"
      kpis={[
        { label: 'Accepted', value: work ? String(accepted.length) : '…', trend: 'Confirmed rates, helpful answers' },
        { label: 'Waiting for a check', value: work ? String(waiting) : '…', trend: 'Not yet confirmed' },
        { label: 'Paid to you', value: work ? rupees(paid) : '…', trend: owed > 0 ? `${rupees(owed)} owed now` : 'By KashRoot' },
      ]}
    >
      {account === undefined ? (
        <p className="flex items-center gap-2 p-6 text-slate-600"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…</p>
      ) : account === null ? (
        <Panel theme={theme}>
          <EmptyState theme={theme} icon={Wallet} title="Sign in to see your work" text="Mandi Helpers and agronomists see their contributions and payments here." action={<Btn theme={theme} href={loginHref('farmer', '/contributions')}>Sign in</Btn>} />
        </Panel>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <div className="space-y-6">
            {!isStaff && (
              <p className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">
                You are not a Mandi Helper or agronomist yet. Apply on <Link href="/mandi-weather" className="font-semibold underline">Mandi &amp; Weather</Link> (“Post rates for your mandi”) or in the <Link href="/expert?tab=library" className="font-semibold underline">Advisory portal</Link> (“Are you an agronomist?”).
              </p>
            )}
            <Panel theme={theme} title="My contributions" icon={ListChecks}>
              {error ? (
                <p role="alert" className="text-sm text-rose-800">{error}</p>
              ) : !work ? (
                <p className="flex items-center gap-2 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…</p>
              ) : list.length === 0 ? (
                <EmptyState theme={theme} icon={ListChecks} title="Nothing yet" text="Each mandi rate you post and each farmer you answer appears here." />
              ) : (
                <ul className="divide-y divide-slate-900/5">
                  {list.map((c) => {
                    const Icon = ICON[c.status];
                    return (
                      <li key={c.id} className="flex items-start justify-between gap-3 py-3">
                        <span className="min-w-0">
                          <span className="flex flex-wrap items-center gap-2 font-semibold text-slate-900">
                            <Icon className={`h-4 w-4 ${c.status === 'accepted' ? 'text-emerald-600' : c.status === 'rejected' ? 'text-rose-600' : 'text-amber-600'}`} aria-hidden />
                            {c.title ?? WORK_LABEL[c.kind]}
                          </span>
                          <span className="block text-xs text-slate-500">{WORK_LABEL[c.kind]} · {ago(c.created_at)}</span>
                        </span>
                        <span className="shrink-0 text-right">
                          {c.paid_at ? <Badge tone="blue">Paid {rupees(Number(c.paid_amount ?? 0))}</Badge> : <Badge tone={TONE[c.status]}>{STATUS_WORDS[c.status]}</Badge>}
                          {c.paid_ref && <span className="block text-[11px] text-slate-500">Ref {c.paid_ref}</span>}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Panel>
          </div>

          <div className="space-y-6">
            <Panel theme={theme} title="How you earn" icon={IndianRupee}>
              <ul className="space-y-2 text-sm text-slate-700">
                <li><strong>Mandi rates</strong> are accepted when another trader, a farmer or KashRoot confirms them. Rates found wrong are not paid.</li>
                <li><strong>Answers, soil tests and video calls</strong> are accepted when the farmer presses “Yes, it helped”, or when KashRoot checks them.</li>
              </ul>
              {payDecided ? (
                <ul className="mt-4 space-y-1 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900 ring-1 ring-emerald-100">
                  {pay.filter((p) => p.amount > 0).map((p) => <li key={p.kind}>{WORK_LABEL[p.kind]}: <strong>{rupees(p.amount)}</strong> each</li>)}
                </ul>
              ) : (
                <p className="mt-4 rounded-xl bg-sky-50 p-3 text-sm text-sky-900 ring-1 ring-sky-100">KashRoot has not set the payment amounts yet. Every accepted contribution is counted for you, and will be paid when payments start.</p>
              )}
              {owed > 0 && <p className="mt-3 text-sm font-semibold text-slate-900">Owed to you now: {rupees(owed)}</p>}
            </Panel>
            <PayoutForm theme={theme} payout={payout} onSaved={setPayout} title="Where KashRoot pays you" intro="KashRoot sends your payment here. These are your one set of KashRoot payment details — also used if you sell or rent out on KashRoot." />
          </div>
        </div>
      )}
    </PortalShell>
  );
}
