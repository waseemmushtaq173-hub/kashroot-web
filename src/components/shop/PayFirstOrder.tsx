'use client';

/**
 * One Kissan Tools order (pay first), the same card for both sides, with the
 * next step for whoever is looking:
 *   buyer:  cancel → pay the seller (bank / UPI, then the reference) → follow
 *           the vehicle on the map → I received it (or report a problem)
 *   seller: accept (stock check) / decline → money received / not received →
 *           ship (vehicle, driver) → share the location or send the driver link
 * The whole basket (every product in this order) moves together.
 */
import { useState } from 'react';
import { Check, CheckCircle2, Flag, MapPin, PackageCheck, Phone, XCircle } from 'lucide-react';
import { toast } from '@/lib/client/toast';

import { amountOf } from '@/components/market/shop/useLiveListings';
import { Badge, Btn, type PortalTheme } from '@/components/portal/kit';
import { LiveShare } from '@/components/shop/LiveShare';
import { ShipForm } from '@/components/shop/ShipForm';
import { ShopPay } from '@/components/shop/ShopPay';
import { TrackDelivery } from '@/components/shop/TrackDelivery';
import { ago, inr } from '@/lib/db/client';
import { orderAction, type MarketOrder, type OrderAction } from '@/lib/db/market';
import { basketTotal, SHOP_STEPS, shopStatus, shopStep, type ShopSeller } from '@/lib/db/shop';

const FINAL = ['cancelled', 'rejected', 'disputed'];

function Steps({ at }: { at: number }) {
  return (
    <ol className="grid grid-cols-3 gap-1.5 sm:grid-cols-6" aria-label="Order steps">
      {SHOP_STEPS.map((label, i) => (
        <li
          key={label}
          aria-current={i === at ? 'step' : undefined}
          className={`flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold ${i <= at ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200' : 'bg-slate-50 text-slate-500 ring-1 ring-slate-200'}`}
        >
          {i <= at ? <Check className="h-3.5 w-3.5 shrink-0" aria-hidden /> : <span className="w-3.5 shrink-0 text-center">{i + 1}</span>}
          {label}
        </li>
      ))}
    </ol>
  );
}

export function PayFirstOrder({ lines, as, theme, seller, onChange }: { lines: MarketOrder[]; as: 'buyer' | 'seller'; theme: PortalTheme; seller?: ShopSeller | null; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const o = lines[0];
  const total = basketTotal(lines);
  const s = shopStatus(o, as);
  const buyer = as === 'buyer';
  const unpaid = o.status === 'accepted' && (o.payment_state ?? 'unpaid') === 'unpaid';
  const notReceived = unpaid && Boolean(o.payment_ref);

  const act = async (action: OrderAction, ok: string, ref?: string, note?: string) => {
    setBusy(true);
    try {
      await orderAction(o.id, action, ref, note);
      toast.success(ok);
      onChange();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update the order.');
    } finally {
      setBusy(false);
    }
  };
  const ask = (q: string) => window.prompt(q)?.trim() ?? null;
  const pinLink = o.delivery_lat != null && o.delivery_lon != null ? `https://www.google.com/maps/search/?api=1&query=${o.delivery_lat},${o.delivery_lon}` : null;
  const sellerPhone = (seller?.phone ?? '').replace(/\D/g, '').slice(-10);

  return (
    <li className="space-y-3 rounded-2xl bg-white/85 p-4 ring-1 ring-slate-900/5" data-order={o.basket ?? o.id}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-0.5">
          <p className="text-xs text-slate-500">Kissan Tools order · {ago(o.created_at)}</p>
          {buyer ? (
            seller && (
              <p className="text-sm text-slate-700">
                From <strong>{seller.seller_name}</strong>, {seller.district}
                {/^[6-9]\d{9}$/.test(sellerPhone) && (
                  <> · <a href={`tel:+91${sellerPhone}`} className="inline-flex items-center gap-1 font-semibold text-orange-800"><Phone className="h-3.5 w-3.5" aria-hidden /> Call the seller</a></>
                )}
              </p>
            )
          ) : (
            <div className="text-sm text-slate-700">
              <p>
                {o.buyer_name} · <a href={`tel:${o.buyer_phone}`} className="inline-flex items-center gap-1 font-semibold text-sky-800"><Phone className="h-3.5 w-3.5" aria-hidden /> {o.buyer_phone}</a>
              </p>
              <p className="text-slate-600">Deliver to: {o.delivery_address}</p>
              {pinLink && (
                <a href={pinLink} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1 font-semibold text-orange-800">
                  <MapPin className="h-4 w-4" aria-hidden /> Open the delivery pin in Maps
                </a>
              )}
            </div>
          )}
        </div>
        <Badge tone={s.tone}>{s.label}</Badge>
      </div>

      <ul className="divide-y divide-slate-900/5 rounded-xl bg-slate-50/70 px-3 ring-1 ring-slate-200">
        {lines.map((l) => (
          <li key={l.id} className="flex items-baseline justify-between gap-3 py-2 text-sm">
            <span className="min-w-0 text-slate-800">
              <strong>{amountOf(Number(l.quantity), l.unit)}</strong> · {l.product}
              <span className="block text-xs text-slate-500">{inr(l.unit_price)} per {l.unit}</span>
            </span>
            <span className="shrink-0 font-semibold tabular-nums">{inr(l.amount)}</span>
          </li>
        ))}
      </ul>
      <p className="text-right text-base">Total <strong className="tabular-nums">{inr(total)}</strong></p>

      {!FINAL.includes(o.status) && <Steps at={shopStep(o)} />}

      {o.seller_note && <p className={`rounded-xl p-3 text-sm ring-1 ${notReceived ? 'bg-amber-50 text-amber-950 ring-amber-200' : 'bg-slate-50 text-slate-700 ring-slate-200'}`}>Seller: {o.seller_note}</p>}
      {o.buyer_note && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800 ring-1 ring-rose-200">Buyer: {o.buyer_note}</p>}
      {o.payment_ref && <p className="text-sm text-slate-700">Payment reference: <span className="font-mono font-semibold">{o.payment_ref}</span></p>}
      {o.status === 'shipped' && !buyer && (
        <p className="text-sm text-slate-700">Shipped in <strong>{o.ship_vehicle}</strong>{o.driver_name ? `, driver ${o.driver_name}` : ''}{o.driver_phone ? ` (${o.driver_phone})` : ''}.</p>
      )}

      {/* ── The buyer's next step ── */}
      {buyer && o.status === 'placed' && <p className="text-sm text-slate-700">The seller checks the stock and accepts. Then you pay the seller, and they ship.</p>}
      {buyer && unpaid && <ShopPay orderId={o.id} amount={total} note={`KashRoot order ${(o.basket ?? o.id).slice(0, 8)}`} theme={theme} paidRef={o.payment_ref} onPaid={async (ref) => { await orderAction(o.id, 'pay', ref); onChange(); }} />}
      {buyer && o.status === 'accepted' && o.payment_state === 'paid' && <p className="rounded-xl bg-sky-50 p-3 text-sm text-sky-950 ring-1 ring-sky-200">You paid. The seller is checking that the money reached them. Then they ship your order.</p>}
      {buyer && o.status === 'accepted' && o.payment_state === 'received' && <p className="rounded-xl bg-violet-50 p-3 text-sm text-violet-950 ring-1 ring-violet-200">The seller got your money and is packing your order.</p>}
      {buyer && o.status === 'shipped' && <TrackDelivery order={o} />}
      {o.status === 'completed' && <p className="flex items-center gap-2 text-sm font-medium text-emerald-800"><CheckCircle2 className="h-4 w-4" aria-hidden /> {buyer ? 'You received this order.' : 'The buyer received this order.'}{o.delivered_at ? ` ${new Date(o.delivered_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}.` : ''}</p>}

      {/* ── The seller's next step ── */}
      {!buyer && o.status === 'placed' && <p className="text-sm text-slate-700">Accept only if you have it in stock. The buyer then pays you, and you ship after the money arrives.</p>}
      {!buyer && unpaid && <p className="text-sm text-slate-700">Waiting for the buyer to pay you <strong>{inr(total)}</strong>. You get a message here when they do.</p>}
      {!buyer && o.status === 'accepted' && o.payment_state === 'paid' && (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-950 ring-1 ring-amber-200">The buyer says they paid <strong>{inr(total)}</strong>. Open your bank or UPI app and check the money is there before you press “Money received”.</p>
      )}
      {!buyer && o.status === 'accepted' && o.payment_state === 'received' && <ShipForm orderId={o.id} theme={theme} onShipped={onChange} />}
      {!buyer && o.status === 'shipped' && (
        <>
          <LiveShare orderId={o.id} driverPhone={o.driver_phone} lastAt={o.last_at} theme={theme} />
          <p className="text-sm text-slate-600">When the goods reach the buyer, the buyer presses “I received it”.</p>
        </>
      )}

      <div className="flex flex-wrap gap-2">
        {!buyer && o.status === 'placed' && (
          <>
            <Btn theme={theme} icon={CheckCircle2} className="min-h-11" disabled={busy} onClick={() => void act('accept', 'Order accepted. The stock is kept aside. The buyer can pay you now.')}>Accept</Btn>
            <Btn theme={theme} variant="danger" icon={XCircle} className="min-h-11" disabled={busy} onClick={() => { const n = ask('Why can’t you take this order? (the buyer sees this)'); if (n !== null) void act('reject', 'Order declined', undefined, n); }}>Decline</Btn>
          </>
        )}
        {!buyer && o.status === 'accepted' && o.payment_state === 'paid' && (
          <>
            <Btn theme={theme} icon={CheckCircle2} className="min-h-11" disabled={busy} onClick={() => { if (window.confirm(`Has ${inr(total)} reached your bank or UPI? Press OK only if you can see the money.`)) void act('confirm_payment', 'Money received. Now ship the order.'); }}>Money received</Btn>
            <Btn theme={theme} variant="danger" icon={XCircle} className="min-h-11" disabled={busy} onClick={() => { const n = ask('The money is not there? Tell the buyer (optional):'); if (n !== null) void act('not_received', 'The buyer is told the money has not arrived', undefined, n || undefined); }}>Money not received</Btn>
          </>
        )}
        {!buyer && unpaid && (
          <Btn theme={theme} variant="ghost" icon={XCircle} className="min-h-11" disabled={busy} onClick={() => { const n = ask('Cancel this order because the buyer did not pay? Tell the buyer why (optional):'); if (n !== null) void act('seller_cancel', 'Order cancelled. The stock is back on sale.', undefined, n || undefined); }}>Cancel — not paid</Btn>
        )}
        {buyer && (o.status === 'placed' || unpaid) && (
          <Btn theme={theme} variant="ghost" icon={XCircle} className="min-h-11" disabled={busy} onClick={() => { if (window.confirm('Cancel this order?')) void act('cancel', 'Order cancelled'); }}>Cancel order</Btn>
        )}
        {buyer && o.status === 'shipped' && (
          <Btn theme={theme} icon={PackageCheck} className="min-h-11" disabled={busy} onClick={() => { if (window.confirm('Has the order reached you, and have you checked it?')) void act('delivered', 'Thank you. The order is complete.'); }}>I received it</Btn>
        )}
        {buyer && (o.status === 'shipped' || (o.status === 'accepted' && !unpaid)) && (
          <Btn theme={theme} variant="ghost" icon={Flag} className="min-h-11" disabled={busy} onClick={() => { const n = ask('What went wrong? (wrong item, damaged, not delivered…)'); if (n) void act('dispute', 'Problem reported to the seller and KashRoot', undefined, n); }}>Report a problem</Btn>
        )}
      </div>
    </li>
  );
}
