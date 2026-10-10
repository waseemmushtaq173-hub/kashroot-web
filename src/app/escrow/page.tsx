'use client';

/**
 * Escrow — how protected payment works, your verification status, and the
 * deals you have accepted in the Buyer portal. No invented balances: money
 * figures appear only for real deals.
 *
 * KYC (Aadhaar OTP / DigiLocker, PAN, SMS + email) runs through KYCPanel and
 * needs a signed-in account; signed-out visitors are sent to sign in first.
 */
import { useState, useSyncExternalStore } from 'react';
import { CheckCircle2, Handshake, IdCard, Lock, LogIn, ShieldCheck, Truck, type LucideIcon } from 'lucide-react';
import { toast } from 'sonner';

import { KYCPanel, type KycSubmission } from '@/components/auth/KYCPanel';
import { PortalShell } from '@/components/layout/PortalShell';
import { Badge, Btn, EmptyState, PORTAL_THEMES, Panel, inr } from '@/components/portal/kit';
import { Tilt3D } from '@/components/three/Tilt3D';
import { usePersistentState } from '@/lib/portal-store';

const theme = PORTAL_THEMES.provider;

const STEPS: { label: string; text: string; icon: LucideIcon }[] = [
  { label: 'Agree', text: 'Buyer accepts a seller’s quote for an exact lot, grade and price.', icon: Handshake },
  { label: 'Lock', text: 'Buyer pays into escrow. The seller sees the money is there — but cannot touch it yet.', icon: Lock },
  { label: 'Deliver', text: 'Seller dispatches; the truck can be followed on Tracking.', icon: Truck },
  { label: 'Confirm', text: 'Buyer checks grade and weight on arrival and confirms, or raises a dispute.', icon: CheckCircle2 },
  { label: 'Release', text: 'Money is released to the seller’s verified bank account.', icon: ShieldCheck },
];

interface KycRecord {
  submittedAt: string;
  role: string;
  method: string;
  aadhaarLast4: string;
  panVerifiedBy: string;
  bank: string;
}
interface Inquiry {
  id: string;
  crop: string;
  quantity: string;
  bestQuote: number | null;
  status: 'open' | 'accepted';
}

const NO_KYC: KycRecord | null = null;
/** Deal value = per-unit quote × the number at the start of "500 boxes". */
const dealValue = (d: Inquiry) => (d.bestQuote ?? 0) * (parseFloat(d.quantity) || 0);
const NO_INQUIRIES: Inquiry[] = [];

const subscribe = (cb: () => void) => {
  window.addEventListener('storage', cb);
  return () => window.removeEventListener('storage', cb);
};

export default function EscrowPage() {
  const signedIn = useSyncExternalStore(subscribe, () => Boolean(localStorage.getItem('auth_token')), () => false);
  // The signed-in account's role, so KYC doesn't ask for it again.
  const accountRole = useSyncExternalStore(subscribe, () => localStorage.getItem('user_role'), () => null);
  const kycRole = accountRole === 'FARMER' || accountRole === 'BUYER' || accountRole === 'SELLER' ? accountRole : accountRole === 'PROVIDER' ? 'SELLER' : undefined;
  const [kycOpen, setKycOpen] = useState(false);
  const [kyc, setKyc] = usePersistentState<KycRecord | null>('kr_kyc_record', NO_KYC);
  const [inquiries] = usePersistentState<Inquiry[]>('kr_buyer_inquiries', NO_INQUIRIES);
  const deals = inquiries.filter((i) => i.status === 'accepted');

  const onComplete = (s: KycSubmission) => {
    setKyc({
      submittedAt: new Date().toISOString(),
      role: s.role,
      method: { DIGILOCKER: 'DigiLocker', AADHAAR_OTP: 'Aadhaar OTP', AADHAAR_OFFLINE_XML: 'UIDAI offline e-KYC', AADHAAR_SECURE_QR: 'UIDAI secure QR' }[s.identity.method],
      aadhaarLast4: s.identity.aadhaarLast4,
      panVerifiedBy: { DIGILOCKER: 'DigiLocker', PAN_API: 'Income Tax database', FORMAT_ONLY: 'format check (online check pending)' }[s.identity.panVerifiedBy],
      bank: `${s.bank.bankName} ••••${s.bank.accountNumber.slice(-4)}`,
    });
    localStorage.setItem('kyc_status', 'submitted');
    toast.success('Verification complete');
  };

  const kycButton = signedIn ? (
    <Btn theme={theme} variant="white" icon={IdCard} onClick={() => setKycOpen(true)}>{kyc ? 'Update KYC' : 'Complete KYC'}</Btn>
  ) : (
    <Btn theme={theme} variant="white" icon={LogIn} href="/login?next=/escrow">Sign in to verify</Btn>
  );

  return (
    <PortalShell
      standalone
      theme="provider"
      eyebrow="Escrow protected trade"
      title="Your money moves only when the harvest does"
      description="Payments are held safely and released to the seller only after the buyer confirms delivery."
      actions={kycButton}
      kpis={[
        { label: 'Your verification', value: kyc ? 'Verified' : 'Not yet', trend: kyc ? `${kyc.method} · PAN: ${kyc.panVerifiedBy}` : 'Free with UIDAI’s offline e-KYC or Aadhaar QR' },
        { label: 'Accepted deals', value: String(deals.length), trend: deals.length ? 'Ready to fund' : 'Accept a quote in the Buyer portal' },
        { label: 'Value of deals', value: deals.length ? inr.format(deals.reduce((sum, d) => sum + dealValue(d), 0)) : '—', trend: 'From your accepted quotes' },
      ]}
    >
      <KYCPanel open={kycOpen} onClose={() => setKycOpen(false)} onComplete={onComplete} defaultRole={kycRole} />

      <Panel theme={theme} title="How escrow protects both sides" icon={ShieldCheck}>
        <ol className="grid gap-4 md:grid-cols-5">
          {STEPS.map(({ label, text, icon: Icon }, i) => (
            <li key={label}>
              <Tilt3D className="rounded-2xl" max={8}>
                <div className="h-full rounded-2xl bg-white/85 p-4 shadow-sm ring-1 ring-slate-900/5 [transform-style:preserve-3d]">
                  <span data-depth className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-teal-400 to-cyan-700 text-white shadow-lg shadow-cyan-700/25">
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-teal-700">Step {i + 1}</p>
                  <p className="font-semibold text-slate-900">{label}</p>
                  <p className="mt-1 text-sm text-slate-600">{text}</p>
                </div>
              </Tilt3D>
            </li>
          ))}
        </ol>
      </Panel>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <Panel theme={theme} title="Your verification" icon={IdCard}>
          {kyc ? (
            <dl className="grid gap-2.5 text-sm">
              {[
                ['Identity', `${kyc.method}${kyc.aadhaarLast4 ? ` · Aadhaar ••••${kyc.aadhaarLast4}` : ''}`],
                ['PAN', kyc.panVerifiedBy],
                ['Payout account', kyc.bank],
                ['Verified on', new Date(kyc.submittedAt).toLocaleDateString('en-IN')],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 border-b border-slate-900/5 pb-2">
                  <dt className="text-slate-500">{k}</dt>
                  <dd className="text-right font-medium text-slate-900">{v}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <EmptyState
              theme={theme}
              icon={IdCard}
              title="Verify once, trade safely"
              text="Aadhaar checked against UIDAI’s digital signature (free with the offline e-KYC file or Aadhaar QR), your PAN, and your contact details."
              action={kycButton}
            />
          )}
        </Panel>
        <Panel theme={theme} title="Your deals" icon={Handshake}>
          {deals.length === 0 ? (
            <EmptyState theme={theme} icon={Handshake} title="No accepted deals yet" text="Accept a seller’s quote in the Buyer portal and it will appear here, ready to fund." action={<Btn theme={theme} variant="soft" href="/buyer/dashboard">Open Buyer portal</Btn>} />
          ) : (
            <ul className="space-y-3">
              {deals.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white/70 p-4 ring-1 ring-slate-900/5">
                  <div>
                    <p className="text-xs text-slate-500">{d.id}</p>
                    <p className="font-semibold text-slate-900">{d.crop} · {d.quantity}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {d.bestQuote !== null && (
                      <span className="text-right">
                        <span className="block font-semibold tabular-nums text-slate-900">{inr.format(dealValue(d))}</span>
                        <span className="block text-xs text-slate-500">{inr.format(d.bestQuote)} per unit</span>
                      </span>
                    )}
                    <Badge tone="amber">Awaiting payment</Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 text-xs text-slate-500">Funding requires a payment-gateway escrow account (e.g. a bank nodal account) connected to the KashRoot API.</p>
        </Panel>
      </div>
    </PortalShell>
  );
}
