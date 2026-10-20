'use client';

/**
 * Escrow payment (/escrow) — how paying works on KashRoot. The verification
 * (KYC) and the orders to pay live in the two portals where money changes
 * hands: Farmer → Escrow payment and Buyer → Escrow payment. Buyers order in
 * the Buyer portal's shop or on Price Comparison.
 *
 * KashRoot does not hold money. Orders are pay-after-delivery: the buyer pays
 * the farmer directly by UPI / bank once the goods arrive and are checked.
 */
import Link from 'next/link';
import { BadgeIndianRupee, CheckCircle2, IdCard, PackageCheck, ShieldCheck, ShoppingCart, Truck, type LucideIcon } from 'lucide-react';

import { PortalShell } from '@/components/layout/PortalShell';
import { PORTAL_THEMES, Panel } from '@/components/portal/kit';
import { Tilt3D } from '@/components/three/Tilt3D';

const theme = PORTAL_THEMES.provider;

const STEPS: { label: string; text: string; icon: LucideIcon }[] = [
  { label: 'Verify', text: 'Farmer and buyer each verify their identity once (Aadhaar; PAN when required) in their portal’s Escrow payment tab.', icon: IdCard },
  { label: 'Order', text: 'The buyer orders at the farmer’s price, in the Buyer portal (Buy apples & produce) or on Price Comparison. Nothing is paid now.', icon: ShoppingCart },
  { label: 'Dispatch', text: 'The farmer accepts and sends it; a truck can be followed on Tracking with its KashRoot code.', icon: Truck },
  { label: 'Check', text: 'When it arrives the buyer checks grade and weight. Something wrong? Report a problem before paying.', icon: PackageCheck },
  { label: 'Pay', text: 'The buyer pays the farmer directly from a UPI app and types the payment number.', icon: BadgeIndianRupee },
  { label: 'Confirm', text: 'The farmer confirms the money arrived and the order is complete.', icon: CheckCircle2 },
];

const OPEN = 'inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold no-underline shadow-sm transition hover:no-underline';

export default function SafePaymentPage() {
  return (
    <PortalShell
      standalone
      title="Pay after delivery"
      description="Nobody pays for goods they have not received, and nobody sends goods to someone unverified. KashRoot never holds your money."
      eyebrow="Escrow payment"
      theme="provider"
    >
      <div className="space-y-6">
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.label}>
              <Tilt3D className="h-full rounded-3xl" max={5}>
                <div className="h-full rounded-3xl bg-white/85 p-5 shadow-sm ring-1 ring-slate-900/5">
                  <span className={`grid h-11 w-11 place-items-center rounded-2xl ${theme.tile}`}><s.icon className="h-5 w-5" aria-hidden /></span>
                  <p className="mt-3 font-semibold text-slate-900">{i + 1}. {s.label}</p>
                  <p className="mt-1 text-sm text-slate-600">{s.text}</p>
                </div>
              </Tilt3D>
            </li>
          ))}
        </ol>
        <Panel theme={theme} title="Verify and pay in your portal" icon={ShieldCheck}>
          <p className="text-sm text-slate-700">The identity check and your payments are in the Escrow payment tab of your portal. Buyers buy produce in their Buyer portal.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href="/farmer/dashboard?tab=payouts" className={`${OPEN} bg-emerald-700 text-white hover:bg-emerald-800`}>Farmer: Escrow payment</Link>
            <Link href="/buyer/dashboard?tab=payment" className={`${OPEN} bg-sky-700 text-white hover:bg-sky-800`}>Buyer: Escrow payment</Link>
            <Link href="/buyer/dashboard?tab=shop" className={`${OPEN} bg-white text-sky-800 ring-1 ring-sky-200 hover:bg-sky-50`}>Buyer: Buy apples & produce</Link>
          </div>
        </Panel>
      </div>
    </PortalShell>
  );
}
