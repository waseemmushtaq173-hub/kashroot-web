'use client';

/**
 * Ordering one listing with pay after delivery — the same window on Price
 * Comparison and in the Buyer portal's shop. Nothing is paid now: the order
 * goes to the seller (market_orders); when the goods arrive and are checked,
 * the buyer pays the seller directly by UPI / bank. KashRoot never holds it.
 *
 * The database takes the listing's price at the moment of ordering, and the
 * seller can change it while this window is open. So the listing is read
 * again just before the order goes: a new price is shown and the buyer
 * presses Order again; a product taken off sale says so.
 */
import { useState } from 'react';
import { ArrowLeft, ShoppingCart } from 'lucide-react';
import { toast } from '@/lib/client/toast';

import { Btn, Field, INPUT, Modal, type PortalTheme } from '@/components/portal/kit';
import { NEEDS_INTERNET, offlineNow } from '@/components/pwa/net';
import { inr, supabase, type Account } from '@/lib/db/client';
import { orderAction, placeOrder, type MarketListing, type MarketOrder, type MarketUnit } from '@/lib/db/market';
import { LISTINGS_CHANGED, UNIT_PLURAL as PLURAL, amountOf } from '@/components/market/shop/useLiveListings';

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

const GONE = 'This product is no longer on sale. Press “Choose another product” to go back to the list.';
const NOT_CHECKED = 'Could not check the price just now. Check your internet and press Order again.';

/** The listing as it is now, or null when it is no longer on sale. */
async function latest(id: string): Promise<Pick<MarketListing, 'price' | 'quantity'> | null> {
  const { data, error } = await supabase.from('market_listings').select('price, quantity, active').eq('id', id).maybeSingle();
  if (error) throw new Error(NOT_CHECKED);
  const row = data as { price: number; quantity: number; active: boolean } | null;
  return row && row.active && Number(row.quantity) > 0 ? { price: row.price, quantity: row.quantity } : null;
}

export function OrderModal({ listing, account, theme, onClose, onPlaced }: { listing: Orderable; account: Account; theme: PortalTheme; onClose: () => void; onPlaced: (order: MarketOrder) => void }) {
  // Price and stock as last read: they change here when the seller changes them.
  const [now, setNow] = useState({ price: listing.price, quantity: listing.quantity });
  const l = { ...listing, ...now };
  const [form, setForm] = useState({ quantity: '1', name: account.name, phone: account.phone, address: [account.village, account.district].filter(Boolean).join(', ') });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  const qty = Number(form.quantity) || 0;
  const set = (patch: Partial<typeof form>) => {
    setForm({ ...form, ...patch });
    setProblem(null);
  };

  const place = async () => {
    const wrong = orderProblem(l, form);
    if (wrong) return setProblem(wrong);
    // An order is money: never kept to send later.
    if (offlineNow()) return setProblem(NEEDS_INTERNET);
    setBusy(true);
    try {
      const fresh = await latest(l.id);
      if (!fresh) {
        setGone(true);
        setProblem(GONE);
        // The shop drops it from the list now, not at the next refresh.
        window.dispatchEvent(new Event(LISTINGS_CHANGED));
        return;
      }
      if (Number(fresh.price) !== Number(l.price) || Number(fresh.quantity) !== Number(l.quantity)) {
        setNow(fresh);
        window.dispatchEvent(new Event(LISTINGS_CHANGED));
        if (Number(fresh.price) !== Number(l.price)) {
          return setProblem(`The seller changed the price to ${inr(fresh.price)} per ${l.unit}. Your total is now ${inr(qty * Number(fresh.price))}. Press Order again if you agree.`);
        }
        // Less in stock than before: say how many are left, if that is now too many.
        const short = orderProblem({ ...l, ...fresh }, form);
        if (short) return setProblem(short);
      }
      const order = await placeOrder({ listing_id: l.id, buyer_name: form.name.trim() || account.name, buyer_phone: form.phone.replace(/[\s-]/g, ''), delivery_address: form.address.trim(), quantity: qty });
      // The price changed in the same moment: take the order back and ask again.
      if (Number(order.unit_price) !== Number(fresh.price)) {
        setNow({ price: order.unit_price, quantity: fresh.quantity });
        window.dispatchEvent(new Event(LISTINGS_CHANGED));
        try {
          await orderAction(order.id, 'cancel');
        } catch {
          return setProblem(`The seller changed the price to ${inr(order.unit_price)} per ${l.unit} just as you ordered. Open My orders and cancel the order if you do not agree.`);
        }
        return setProblem(`The seller changed the price to ${inr(order.unit_price)} per ${l.unit} as you ordered, so that order was cancelled. Your total is now ${inr(order.amount)}. Press Order again if you agree.`);
      }
      toast.success('Order sent to the seller — pay only after delivery');
      onPlaced(order);
    } catch (err) {
      let message = err instanceof Error ? err.message : 'Could not send the order. Check your internet and try again.';
      // Taken off sale between the check and the order.
      if (/no longer listed/i.test(message)) {
        message = GONE;
        setGone(true);
        window.dispatchEvent(new Event(LISTINGS_CHANGED));
      }
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
          {gone ? (
            <Btn theme={theme} icon={ArrowLeft} className="min-h-11" onClick={onClose}>Choose another product</Btn>
          ) : (
            <>
              <Btn theme={theme} variant="ghost" className="min-h-11" onClick={onClose}>Cancel</Btn>
              <Btn theme={theme} icon={ShoppingCart} className="min-h-11" disabled={busy} onClick={() => void place()}>{busy ? 'Sending…' : `Order for ${inr(qty * Number(l.price))}`}</Btn>
            </>
          )}
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
        {(gone || problem) && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm font-medium text-rose-800 ring-1 ring-rose-200">{gone ? GONE : problem}</p>}
        <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-950">You pay nothing now. When the goods reach you and you have checked them, press “I received the goods” and pay the seller by UPI.</p>
      </div>
    </Modal>
  );
}
