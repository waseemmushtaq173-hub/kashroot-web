'use client';

/**
 * Ordering one listing with pay after delivery — the same window on Price
 * Comparison and in the Buyer portal's shop. Nothing is paid now: the order
 * goes to the seller (market_orders); when the goods arrive and are checked,
 * the buyer pays the seller directly by UPI / bank. KashRoot never holds it.
 */
import { useState } from 'react';
import { ShoppingCart } from 'lucide-react';
import { toast } from '@/lib/client/toast';

import { Btn, Field, INPUT, Modal, type PortalTheme } from '@/components/portal/kit';
import { inr, type Account } from '@/lib/db/client';
import { placeOrder, type MarketListing, type MarketOrder, type MarketUnit } from '@/lib/db/market';
import { UNIT_PLURAL as PLURAL, amountOf } from '@/components/market/shop/useLiveListings';

type Orderable = Pick<MarketListing, 'id' | 'product' | 'price' | 'unit' | 'quantity' | 'seller_name' | 'district'>;

/** Units sold whole: nobody orders half a box. */
const WHOLE: MarketUnit[] = ['box', 'piece', 'bag'];

/** What is wrong with the order, in words the buyer can act on; null when it can go. */
function orderProblem(l: Orderable, f: { quantity: string; phone: string; address: string }): string | null {
  const qty = Number(f.quantity);
  const stock = Number(l.quantity);
  if (!f.quantity.trim() || !(qty > 0)) return `Write how many ${PLURAL[l.unit]} you want (1 or more).`;
  if (WHOLE.includes(l.unit) && !Number.isInteger(qty)) return `Write a whole number of ${PLURAL[l.unit]}, for example 10.`;
  if (qty > stock) return `The seller has only ${amountOf(stock, l.unit)}. Write ${stock.toLocaleString('en-IN')} or less.`;
  if (!/^(\+?91)?[6-9]\d{9}$/.test(f.phone.replace(/[\s-]/g, ''))) return 'Write your 10-digit mobile number, for example 9876543210. The seller calls you on it.';
  if (f.address.trim().length < 5) return 'Write where to deliver: village, tehsil and district.';
  return null;
}

export function OrderModal({ listing: l, account, theme, onClose, onPlaced }: { listing: Orderable; account: Account; theme: PortalTheme; onClose: () => void; onPlaced: (order: MarketOrder) => void }) {
  const [form, setForm] = useState({ quantity: '1', name: account.name, phone: account.phone, address: [account.village, account.district].filter(Boolean).join(', ') });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const qty = Number(form.quantity) || 0;
  const set = (patch: Partial<typeof form>) => {
    setForm({ ...form, ...patch });
    setProblem(null);
  };

  const place = async () => {
    const wrong = orderProblem(l, form);
    if (wrong) return setProblem(wrong);
    setBusy(true);
    try {
      const order = await placeOrder({ listing_id: l.id, buyer_name: form.name.trim() || account.name, buyer_phone: form.phone.replace(/[\s-]/g, ''), delivery_address: form.address.trim(), quantity: qty });
      toast.success('Order sent to the seller — pay only after delivery');
      onPlaced(order);
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
      onClose={onClose}
      title={`Order ${l.product}`}
      footer={
        <>
          <Btn theme={theme} variant="ghost" className="min-h-11" onClick={onClose}>Cancel</Btn>
          <Btn theme={theme} icon={ShoppingCart} className="min-h-11" disabled={busy} onClick={() => void place()}>{busy ? 'Sending…' : `Order for ${inr(qty * Number(l.price))}`}</Btn>
        </>
      }
    >
      <div className="grid gap-4">
        <p className="text-sm text-slate-600">{inr(l.price)} per {l.unit} from {l.seller_name}, {l.district}</p>
        <div className="grid grid-cols-2 gap-4">
          <Field label={`How many (${l.unit})`} hint={`${Number(l.quantity).toLocaleString('en-IN')} in stock`}>
            <input type="number" inputMode={WHOLE.includes(l.unit) ? 'numeric' : 'decimal'} min={1} max={Number(l.quantity)} step={WHOLE.includes(l.unit) ? 1 : 'any'} className={`${INPUT} min-h-11`} value={form.quantity} onChange={(e) => set({ quantity: e.target.value })} />
          </Field>
          <Field label="Your mobile">
            <input type="tel" inputMode="numeric" autoComplete="tel" className={`${INPUT} min-h-11`} value={form.phone} onChange={(e) => set({ phone: e.target.value })} />
          </Field>
        </div>
        <Field label="Your name">
          <input autoComplete="name" className={`${INPUT} min-h-11`} value={form.name} onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <Field label="Deliver to">
          <textarea rows={2} className={INPUT} value={form.address} onChange={(e) => set({ address: e.target.value })} placeholder="Village, tehsil, district, landmark" />
        </Field>
        {problem && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm font-medium text-rose-800 ring-1 ring-rose-200">{problem}</p>}
        <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-950">You pay nothing now. When the goods reach you and you have checked them, press “I received the goods” and pay the seller by UPI.</p>
      </div>
    </Modal>
  );
}
