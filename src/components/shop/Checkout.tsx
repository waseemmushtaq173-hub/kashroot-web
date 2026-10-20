'use client';

/**
 * Sending one order to one seller from the cart, in two steps:
 *   1. Where to deliver: name, mobile, address and a pin on the map.
 *   2. Check and send: what, how much, and how paying works — the seller
 *      accepts first, then the buyer pays the seller directly by UPI or bank
 *      (KashRoot does not hold the money), then the seller ships.
 */
import { useState } from 'react';
import { ArrowLeft, ArrowRight, Send } from 'lucide-react';
import { toast } from '@/lib/client/toast';

import { amountOf, type ShopListing } from '@/components/market/shop/useLiveListings';
import { Btn, Field, INPUT, Modal, type PortalTheme } from '@/components/portal/kit';
import { PlacePicker, type DeliveryPin } from '@/components/shop/PlacePicker';
import { qtyProblem } from '@/components/shop/cart';
import { inr, type Account } from '@/lib/db/client';
import type { MarketOrder } from '@/lib/db/market';
import { placeShopOrder } from '@/lib/db/shop';

export interface CheckoutLine {
  listing: ShopListing;
  qty: number;
}

export function Checkout({ lines, account, theme, onClose, onPlaced }: { lines: CheckoutLine[]; account: Account; theme: PortalTheme; onClose: () => void; onPlaced: (orders: MarketOrder[]) => void }) {
  const seller = lines[0].listing;
  const [step, setStep] = useState<'where' | 'check'>('where');
  const [form, setForm] = useState({ name: account.name, phone: account.phone.replace(/^\+?91(?=\d{10}$)/, ''), address: [account.village, account.district].filter(Boolean).join(', ') });
  const [pin, setPin] = useState<DeliveryPin | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const total = lines.reduce((s, l) => s + l.qty * Number(l.listing.price), 0);
  const set = (patch: Partial<typeof form>) => {
    setForm({ ...form, ...patch });
    setProblem(null);
  };

  const whereProblem = (): string | null => {
    if (form.name.trim().length < 2) return 'Write your name, so the seller knows who ordered.';
    if (!/^(\+?91)?[6-9]\d{9}$/.test(form.phone.replace(/[\s-]/g, ''))) return 'Write your 10-digit mobile number, for example 9876543210. The seller and the driver call you on it.';
    if (form.address.trim().length < 5) return 'Write where to deliver: village, tehsil and district, and a landmark.';
    if (!pin) return 'Set the delivery pin: press “Use my location”, or type your village and pick it from the list.';
    return null;
  };

  const next = () => {
    const wrong = whereProblem();
    if (wrong) return setProblem(wrong);
    setProblem(null);
    setStep('check');
  };

  const send = async () => {
    const wrong = whereProblem() ?? lines.map((l) => qtyProblem(l.listing, l.qty)).find(Boolean) ?? null;
    if (wrong) return setProblem(wrong);
    if (!pin) return;
    setBusy(true);
    try {
      const orders = await placeShopOrder({
        lines: lines.map((l) => ({ listing_id: l.listing.id, quantity: l.qty })),
        buyer_name: form.name.trim(),
        buyer_phone: form.phone.replace(/[\s-]/g, '').replace(/^\+?91(?=\d{10}$)/, ''),
        delivery_address: form.address.trim().slice(0, 300),
        delivery_lat: pin.lat,
        delivery_lon: pin.lng,
      });
      toast.success(`Order sent to ${seller.seller_name}. Pay when the seller accepts.`);
      onPlaced(orders);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not send the order. Check your internet and try again.';
      setProblem(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={step === 'where' ? 'Where to deliver' : `Order from ${seller.seller_name}`}
      footer={
        step === 'where' ? (
          <>
            <Btn theme={theme} variant="ghost" className="min-h-11" onClick={onClose}>Cancel</Btn>
            <Btn theme={theme} icon={ArrowRight} className="min-h-11" onClick={next}>Next</Btn>
          </>
        ) : (
          <>
            <Btn theme={theme} variant="ghost" icon={ArrowLeft} className="min-h-11" onClick={() => setStep('where')}>Back</Btn>
            <Btn theme={theme} icon={Send} className="min-h-11" disabled={busy} onClick={() => void send()}>{busy ? 'Sending…' : `Send order · ${inr(total)}`}</Btn>
          </>
        )
      }
    >
      {step === 'where' ? (
        <div className="grid gap-4">
          <p className="text-sm font-semibold text-slate-500">Step 1 of 2</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Your name">
              <input autoComplete="name" className={`${INPUT} min-h-11`} value={form.name} onChange={(e) => set({ name: e.target.value })} />
            </Field>
            <Field label="Your mobile">
              <input type="tel" inputMode="numeric" autoComplete="tel" className={`${INPUT} min-h-11`} value={form.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="e.g. 9876543210" />
            </Field>
          </div>
          <Field label="Address">
            <textarea rows={2} className={INPUT} value={form.address} onChange={(e) => set({ address: e.target.value })} placeholder="Village, tehsil, district, landmark" />
          </Field>
          <div>
            <p className="mb-2 text-sm font-medium text-slate-800">Delivery pin on the map</p>
            <PlacePicker value={pin} onChange={(p) => { setPin(p); setProblem(null); }} theme={theme} />
          </div>
          {problem && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm font-medium text-rose-800 ring-1 ring-rose-200">{problem}</p>}
        </div>
      ) : (
        <div className="grid gap-4">
          <p className="text-sm font-semibold text-slate-500">Step 2 of 2</p>
          <ul className="divide-y divide-slate-900/5 rounded-xl bg-slate-50/70 px-3 ring-1 ring-slate-200">
            {lines.map((l) => (
              <li key={l.listing.id} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                <span><strong>{amountOf(l.qty, l.listing.unit)}</strong> · {l.listing.product}</span>
                <span className="font-semibold tabular-nums">{inr(l.qty * Number(l.listing.price))}</span>
              </li>
            ))}
          </ul>
          <p className="text-right text-lg">Total <strong>{inr(total)}</strong></p>
          <p className="text-sm text-slate-700">Deliver to: {form.address.trim()} <span className="text-slate-500">(pin: {pin?.label})</span></p>
          <ol className="list-decimal space-y-1 rounded-xl bg-orange-50 p-4 pl-8 text-sm text-orange-950 ring-1 ring-orange-200">
            <li>{seller.seller_name} checks the stock and accepts your order.</li>
            <li>Then you pay {seller.seller_name} directly, by UPI or bank. KashRoot does not hold the money.</li>
            <li>The seller ships it. You see the vehicle on the map until it reaches you.</li>
          </ol>
          {problem && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm font-medium text-rose-800 ring-1 ring-rose-200">{problem}</p>}
        </div>
      )}
    </Modal>
  );
}
