'use client';

/**
 * Safe payments (/escrow) — how paying works on KashRoot, your
 * verification status, and your open orders.
 *
 * KashRoot does not hold money. Marketplace orders are pay-after-delivery:
 * the buyer pays the seller directly by UPI / bank once the goods arrive and
 * are checked. Cold-store bookings are paid straight to the owner.
 *
 * KYC (Aadhaar OTP / DigiLocker, PAN, SMS + email) runs through KYCPanel and
 * needs a signed-in account; signed-out visitors are sent to sign in first.
 */
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { BadgeIndianRupee, CheckCircle2, IdCard, LogIn, PackageCheck, ShieldCheck, ShoppingCart, Truck, type LucideIcon } from 'lucide-react';
import { toast } from 'sonner';

import { KYCPanel, type KycSubmission } from '@/components/auth/KYCPanel';
import { PortalShell } from '@/components/layout/PortalShell';
import { OrderCard } from '@/components/market/OrderCard';
import { Btn, EmptyState, PORTAL_THEMES, Panel } from '@/components/portal/kit';
import { Tilt3D } from '@/components/three/Tilt3D';
import { loadAccount } from '@/lib/db/client';
import { buyerOrders, type MarketOrder } from '@/lib/db/market';
import { usePersistentState } from '@/lib/portal-store';

const theme = PORTAL_THEMES.provider;

const STEPS: { label: string; text: string; icon: LucideIcon }[] = [
  { label: 'Order', text: 'Order on Price Comparison at the seller’s listed price. You pay nothing now.', icon: ShoppingCart },
  { label: 'Dispatch', text: 'The seller accepts and sends it; a truck can be followed on Tracking with its KashRoot code.', icon: Truck },
  { label: 'Check', text: 'When it arrives, check grade and weight. Something wrong? Report a problem before paying.', icon: PackageCheck },
  { label: 'Pay', text: 'Pay the seller directly from your UPI app and type the payment number.', icon: BadgeIndianRupee },
  { label: 'Confirm', text: 'The seller confirms the money reached them and the order is complete.', icon: CheckCircle2 },
];

interface KycRecord {
  submittedAt: string;
  role: string;
  method: string;
  aadhaarLast4: string;
  panVerifiedBy: string;
  bank: string;
}

const NO_KYC: KycRecord | null = null;

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
  const [orders, setOrders] = useState<MarketOrder[] | null>(null);
  const loadOrders = useCallback(async () => {
    const a = await loadAccount().catch(() => null);
    setOrders(a ? await buyerOrders(a.id).catch(() => []) : []);
  }, []);
  useEffect(() => {
    let live = true;
    const run = async () => {
      if (live) await loadOrders();
    };
    void run();
    return () => {
      live = false;
    };
  }, [loadOrders]);
  const open = (orders ?? []).filter((o) => !['completed', 'cancelled', 'rejected'].includes(o.status));

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
      eyebrow="Safe payments"
      title="Pay only after the goods reach you"
      description="KashRoot does not hold your money. You pay the seller directly by UPI once you have received and checked the goods."
      actions={kycButton}
      kpis={[
        { label: 'Your verification', value: kyc ? 'Verified' : 'Not yet', trend: kyc ? `${kyc.method} · PAN: ${kyc.panVerifiedBy}` : 'Free with UIDAI’s offline e-KYC or Aadhaar QR' },
        { label: 'Open orders', value: String(open.length), trend: 'Ordered, on the way or to pay' },
        { label: 'To pay now', value: String(open.filter((o) => o.status === 'delivered').length), trend: 'Received — pay the seller' },
      ]}
    >
      <KYCPanel open={kycOpen} onClose={() => setKycOpen(false)} onComplete={onComplete} defaultRole={kycRole} />

      <Panel theme={theme} title="How paying works" icon={ShieldCheck}>
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
        <p className="mt-4 text-sm text-slate-600">Cold-store bookings are paid straight to the cold-store owner’s UPI, and the owner confirms your space.</p>
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
        <Panel theme={theme} title="Your open orders" icon={ShoppingCart}>
          {orders === null ? (
            <p className="text-sm text-slate-600">Loading…</p>
          ) : open.length === 0 ? (
            <EmptyState theme={theme} icon={ShoppingCart} title="No open orders" text="Order on Price Comparison — you pay the seller only after the goods reach you." action={<Btn theme={theme} variant="soft" href="/compare-prices">Open Price Comparison</Btn>} />
          ) : (
            <ul className="space-y-3">{open.map((o) => <OrderCard key={o.id} order={o} as="buyer" theme={theme} onChange={() => void loadOrders()} />)}</ul>
          )}
        </Panel>
      </div>
    </PortalShell>
  );
}
