'use client';

/**
 * One marketplace order, with the next step for whoever is looking:
 *   buyer:  cancel (before acceptance) → I received it → pay the seller → report a problem
 *   seller: accept / decline → shipped → money received (completes it)
 * Payment happens only after delivery, straight to the seller (PayDirect).
 */
import { useState } from 'react';
import { CheckCircle2, Flag, PackageCheck, Phone, Truck, XCircle } from 'lucide-react';
import { toast } from 'sonner';

import { PayDirect } from '@/components/payments/PayDirect';
import { Badge, Btn, type PortalTheme } from '@/components/portal/kit';
import { ago, inr } from '@/lib/db/client';
import { ORDER_STATUS, orderAction, type MarketOrder, type OrderAction } from '@/lib/db/market';

export function OrderCard({ order: o, as, theme, onChange }: { order: MarketOrder; as: 'buyer' | 'seller'; theme: PortalTheme; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const s = ORDER_STATUS[o.status];

  const act = async (action: OrderAction, ok: string, note?: string) => {
    setBusy(true);
    try {
      await orderAction(o.id, action, undefined, note);
      toast.success(ok);
      onChange();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update the order.');
    } finally {
      setBusy(false);
    }
  };
  const ask = (q: string) => window.prompt(q)?.trim() ?? null;

  return (
    <li className="rounded-2xl bg-white/85 p-4 ring-1 ring-slate-900/5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-slate-900">{o.quantity} {o.unit} · {o.product}</p>
          <p className="text-sm text-slate-600"><strong>{inr(o.amount)}</strong> ({inr(o.unit_price)} per {o.unit}) · {ago(o.created_at)}</p>
          {as === 'seller' && (
            <p className="mt-1 text-sm text-slate-700">
              {o.buyer_name} · <a href={`tel:${o.buyer_phone}`} className="inline-flex items-center gap-1 font-semibold text-sky-800"><Phone className="h-3.5 w-3.5" aria-hidden /> {o.buyer_phone}</a>
              <span className="block text-slate-600">Deliver to: {o.delivery_address}</span>
            </p>
          )}
        </div>
        <Badge tone={s.tone}>{s.label}</Badge>
      </div>
      {o.seller_note && <p className="mt-2 text-sm text-slate-700">Seller: {o.seller_note}</p>}
      {o.buyer_note && <p className="mt-2 text-sm text-rose-800">Buyer: {o.buyer_note}</p>}
      {o.payment_ref && <p className="mt-2 text-sm text-slate-700">Payment reference: <span className="font-mono font-semibold">{o.payment_ref}</span>{as === 'seller' && o.status === 'paid' ? ' — check it in your bank / UPI app before confirming.' : ''}</p>}

      <div className="mt-3 flex flex-wrap gap-2">
        {as === 'seller' && o.status === 'placed' && (
          <>
            <Btn theme={theme} size="sm" icon={CheckCircle2} disabled={busy} onClick={() => void act('accept', 'Order accepted — stock reserved')}>Accept</Btn>
            <Btn theme={theme} size="sm" variant="danger" icon={XCircle} disabled={busy} onClick={() => { const n = ask('Why can’t you take this order? (the buyer sees this)'); if (n !== null) void act('reject', 'Order declined', n); }}>Decline</Btn>
          </>
        )}
        {as === 'seller' && o.status === 'accepted' && (
          <Btn theme={theme} size="sm" icon={Truck} disabled={busy} onClick={() => { const n = ask('Dispatch note for the buyer (vehicle, tracking code, expected date) — optional') ?? ''; void act('ship', 'Marked as shipped', n || undefined); }}>Mark shipped</Btn>
        )}
        {as === 'seller' && o.status === 'paid' && (
          <Btn theme={theme} size="sm" icon={CheckCircle2} disabled={busy} onClick={() => void act('confirm_payment', 'Payment confirmed — order complete')}>Money received</Btn>
        )}
        {as === 'buyer' && o.status === 'placed' && (
          <Btn theme={theme} size="sm" variant="ghost" icon={XCircle} disabled={busy} onClick={() => void act('cancel', 'Order cancelled')}>Cancel order</Btn>
        )}
        {as === 'buyer' && (o.status === 'accepted' || o.status === 'shipped') && (
          <Btn theme={theme} size="sm" icon={PackageCheck} disabled={busy} onClick={() => { if (window.confirm('Have the goods reached you, and have you checked them?')) void act('delivered', 'Thanks — now pay the seller'); }}>I received the goods</Btn>
        )}
        {as === 'buyer' && !['completed', 'cancelled', 'rejected', 'disputed'].includes(o.status) && o.status !== 'placed' && (
          <Btn theme={theme} size="sm" variant="ghost" icon={Flag} disabled={busy} onClick={() => { const n = ask('What went wrong? (wrong item, damaged, not delivered…)'); if (n) void act('dispute', 'Problem reported to the seller and KashRoot', n); }}>Report a problem</Btn>
        )}
      </div>

      {as === 'buyer' && o.status === 'delivered' && (
        <div className="mt-3">
          <PayDirect kind="order" id={o.id} amount={o.amount} note={`KashRoot order ${o.id.slice(0, 8)}`} theme={theme} onPaid={async (ref) => { await orderAction(o.id, 'pay', ref); onChange(); }} />
        </div>
      )}
    </li>
  );
}
