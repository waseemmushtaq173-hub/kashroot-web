'use client';

/**
 * Mandi traders portal — for commission agents, traders and mandi staff who
 * post each day's rates for farmers.
 *   Not yet approved: apply with mandi, work, licence number and an ID photo
 *   (an admin phones them and approves in Admin → Approvals).
 *   Approved (staff role REPORTER): post today's rate, see every mandi's
 *   rates and how theirs were checked, and open My work & pay.
 */
import { useEffect, useState } from 'react';
import { CheckCircle2, ClipboardCheck, Loader2, Megaphone, PhoneCall, Wallet } from 'lucide-react';

import { PortalShell } from '@/components/layout/PortalShell';
import { PostedRates } from '@/components/mandi/PostedRates';
import { Btn, PORTAL_THEMES, Panel } from '@/components/portal/kit';
import { RoleApplicationForm } from '@/components/staff/RoleApplicationForm';
import { myRoleRequest } from '@/lib/db/advisory';
import { loadAccount, type Account } from '@/lib/db/client';
import { myContributions, type Contribution } from '@/lib/db/contributions';

const theme = PORTAL_THEMES.trader;

export default function TraderDashboardPage() {
  const [account, setAccount] = useState<Account | null | undefined>(undefined);
  const [request, setRequest] = useState<string | null | undefined>(undefined);
  const [work, setWork] = useState<Contribution[]>([]);

  useEffect(() => {
    let live = true;
    void loadAccount()
      .then(async (a) => {
        if (!live) return;
        setAccount(a);
        if (!a) return;
        const [r, w] = await Promise.allSettled([myRoleRequest('REPORTER', a.id), myContributions(a.id)]);
        if (!live) return;
        setRequest(r.status === 'fulfilled' ? (r.value?.status ?? null) : null);
        setWork(w.status === 'fulfilled' ? w.value.filter((c) => c.kind === 'mandi_rate') : []);
      })
      .catch(() => live && setAccount(null));
    return () => {
      live = false;
    };
  }, []);

  const approved = Boolean(account?.staff.includes('REPORTER') || account?.staff.includes('ADMIN'));
  const status = account === undefined || (!approved && request === undefined) ? '…' : approved ? 'Approved' : request === 'pending' ? 'Waiting' : request === 'rejected' ? 'Not approved' : 'Not applied';
  const confirmed = work.filter((c) => c.status === 'accepted').length;

  return (
    <PortalShell
      title={account?.name ? `Welcome, ${account.name.split(' ')[0]}` : 'Mandi traders'}
      description="Post each day’s rates from your mandi for farmers. Accurate rates are counted as your paid work."
      eyebrow="Mandi traders"
      theme="trader"
      kpis={[
        { label: 'Your status', value: status, trend: approved ? 'You can post rates' : 'KashRoot checks every reporter' },
        { label: 'Rates posted', value: String(work.length), trend: 'All time' },
        { label: 'Confirmed', value: String(confirmed), trend: 'Counted for payment' },
      ]}
      actions={approved ? <Btn theme={theme} variant="white" icon={Wallet} href="/contributions">My work &amp; pay</Btn> : undefined}
    >
      {account === undefined ? (
        <p className="flex items-center gap-2 p-6 text-slate-600"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…</p>
      ) : account === null ? (
        <p role="alert" className="rounded-2xl bg-amber-50 p-4 text-amber-900 ring-1 ring-amber-200">Sign in again to continue.</p>
      ) : (
        <div className="space-y-6">
          {!approved && (
            <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
              <Panel theme={theme} title={request === 'pending' ? 'Your application' : 'Become a mandi reporter'} icon={ClipboardCheck}>
                {request === undefined ? (
                  <p className="flex items-center gap-2 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…</p>
                ) : request === 'pending' ? (
                  <p className="text-sm text-slate-700">
                    Your application is with KashRoot. We will <strong>phone you</strong> on the number you gave to check your details. Once approved, the <strong>Post today’s rate</strong> button appears here.
                  </p>
                ) : (
                  <>
                    {request === 'rejected' && <p className="mb-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-800">Your last application was not approved. You can apply again with clearer details and photo.</p>}
                    <RoleApplicationForm role="REPORTER" account={account} theme={theme} onSent={() => setRequest('pending')} />
                  </>
                )}
              </Panel>
              <Panel theme={theme} title="How it works" icon={CheckCircle2}>
                <ol className="space-y-3 text-sm text-slate-700">
                  <li className="flex gap-2"><ClipboardCheck className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" aria-hidden /> Apply with your mandi, your work and a photo of your licence or ID card.</li>
                  <li className="flex gap-2"><PhoneCall className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" aria-hidden /> KashRoot phones you and approves you.</li>
                  <li className="flex gap-2"><Megaphone className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" aria-hidden /> Every morning, post the rates from your mandi — it takes a minute.</li>
                  <li className="flex gap-2"><Wallet className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" aria-hidden /> Rates confirmed by other traders, farmers or KashRoot count as your paid work.</li>
                </ol>
              </Panel>
            </div>
          )}
          <PostedRates theme={theme} />
        </div>
      )}
    </PortalShell>
  );
}
