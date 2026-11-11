'use client';

/**
 * One marketplace order with the true five-step lifecycle, the mutual live
 * GPS map and the escrow ledger:
 *   buyer:  cancel (before acceptance) → live GPS on → ✅ Confirm Delivery
 *           Received (the escrow releases to the farmer)
 *   seller: Accept Order & Share Live GPS → Dispatch Shipment & Stream Live
 *           GPS → Arrived at Buyer Location
 * The farmer pins the dispatch origin (kr_order_seller_gps) and streams the
 * shipment while it is on the way (kr_order_location); the buyer streams
 * their live destination (kr_order_buyer_gps). Payment is locked in KashRoot
 * escrow the moment the order is placed; the buyer's confirmation releases
 * it (20261122000000_order_live_gps_escrow.sql).
 *
 * Kissan Tools orders are pay first and may hold several products from one
 * seller (a basket): those show as one card (PayFirstOrder) with payment
 * before shipping and the delivery map. Pass all the basket's rows as
 * `lines`.
 */
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { CheckCircle2, Flag, Navigation, PackageCheck, Phone, ShieldCheck, Truck, XCircle } from 'lucide-react';
import { toast } from '@/lib/client/toast';

import type { OrderPin } from '@/components/market/OrderLiveMap';
import { PayDirect } from '@/components/payments/PayDirect';
import { Badge, Btn, type PortalTheme } from '@/components/portal/kit';
import { PayFirstOrder } from '@/components/shop/PayFirstOrder';
import { ago, inr } from '@/lib/db/client';
import { ORDER_STATUS, orderAction, orderArrive, orderBuyerGps, orderRelease, orderSellerGps, type MarketOrder, type OrderAction } from '@/lib/db/market';
import { googleRoute, kmBetween, roadEstimate, type MapSpot } from '@/lib/maps';
import { myPayout, paymentDetails, type PayoutAccount } from '@/lib/db/rentals';
import { sendLocation, type OrgDriver, type ShopSeller } from '@/lib/db/shop';
import { capturePoint, useLiveGps } from '@/lib/client/liveGps';

const OrderLiveMap = dynamic(() => import('@/components/market/OrderLiveMap').then((m) => m.default), {
  ssr: false,
  loading: () => <div className="h-64 w-full animate-pulse rounded-xl bg-slate-100" aria-hidden />,
});

const coord = (lat?: number | null, lng?: number | null) =>
  typeof lat === 'number' && Number.isFinite(lat) && typeof lng === 'number' && Number.isFinite(lng) ? { lat, lng } : null;
const maskAcct = (n?: string | null) => (n ? `${n.slice(0, 4)}…${n.slice(-3)}` : null);
/** "Live Now": a fix pushed in the last two minutes. */
const nowish = (at?: string | null) => Boolean(at) && Date.now() - Date.parse(at as string) < 120_000;

export function OrderCard({ order, as, theme, onChange, lines, seller, drivers }: {
  order: MarketOrder;
  as: 'buyer' | 'seller';
  theme: PortalTheme;
  onChange: () => void;
  /** Pay-first orders: every row of the basket (defaults to this order alone). */
  lines?: MarketOrder[];
  /** Pay-first orders, buyer side: who sells it. */
  seller?: ShopSeller | null;
  /** Pay-first orders, seller side in My business: the business's drivers to give it to. */
  drivers?: OrgDriver[];
}) {
  if (order.pay_first) return <PayFirstOrder lines={lines?.length ? lines : [order]} as={as} theme={theme} seller={seller} onChange={onChange} drivers={drivers} />;
  return <PayAfterDeliveryOrder order={order} as={as} theme={theme} onChange={onChange} />;
}

function PayAfterDeliveryOrder({ order: o, as, theme, onChange }: { order: MarketOrder; as: 'buyer' | 'seller'; theme: PortalTheme; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const [payee, setPayee] = useState<PayoutAccount | null | undefined>(undefined);
  const sellerSide = as === 'seller';
  const s = ORDER_STATUS[o.status];
  const open = !['completed', 'cancelled', 'rejected'].includes(o.status);
  /** Escrowed: locked now (an order from before the migration keeps the legacy flow). */
  const escrowed = open && o.escrow_status === 'locked';

  // The escrow line names the farmer's payout account: the buyer reads it
  // through the order (kr_payment_details), the farmer their own account.
  // Fetched only while it is locked; the render below shows it only then too.
  useEffect(() => {
    if (!escrowed) return;
    let live = true;
    void (sellerSide ? myPayout(o.seller_id) : paymentDetails('order', o.id).catch(() => null))
      .catch(() => undefined)
      .then((p) => { if (live) setPayee(p); });
    return () => { live = false; };
  }, [escrowed, sellerSide, o.seller_id, o.id]);

  // Live GPS, enforced with high accuracy. While the shipment is on the way
  // the seller's phone streams the whole trip; while the order is open the
  // buyer's phone streams their live destination. Both stop when it closes.
  const wantTransit = sellerSide && o.status === 'shipped';
  const wantBuyerLive = !sellerSide && open;
  const transit = useLiveGps(wantTransit, (fix) => { void sendLocation(o.id, fix.lat, fix.lng, fix.accuracy).catch(() => undefined); });
  const buyers = useLiveGps(wantBuyerLive, (fix) => { void orderBuyerGps(o.id, fix).catch(() => undefined); });

  const sellerPoint: OrderPin | null = (() => {
    const c = coord(o.seller_live_lat, o.seller_live_lng);
    return c ? { ...c, label: `🟢 Origin · ${o.seller_name ?? 'Farmer'}`, sub: (o.seller_live_address ?? o.seller_district ?? null) ?? null, live: nowish(o.seller_gps_updated_at) } : null;
  })();
  const buyerLive = coord(o.buyer_live_lat, o.buyer_live_lng);
  const buyerPoint: OrderPin | null = buyerLive
    ? { ...buyerLive, label: `🔵 Destination · ${o.buyer_name}`, sub: o.buyer_live_address ?? o.delivery_address, live: nowish(o.buyer_gps_updated_at) }
    : coord(o.delivery_lat, o.delivery_lon)
      ? { ...coord(o.delivery_lat, o.delivery_lon)!, label: `🔵 Destination · ${o.buyer_name}`, sub: o.delivery_address ?? null }
      : null;
  const transitPoint: OrderPin | null = (() => {
    // The moving shipment's live pin: shipment_live_* first (kr_order_location
    // writes it next to the legacy last_* columns), last_* as the fallback.
    const c = coord(o.shipment_live_lat, o.shipment_live_lng) ?? coord(o.last_lat, o.last_lon);
    return c ? { ...c, label: '🚚 Shipment', sub: o.ship_vehicle ? String(o.ship_vehicle) : null, live: nowish(o.shipment_gps_updated_at ?? o.last_at) } : null;
  })();
  const mapShown = Boolean(sellerPoint || buyerPoint || transitPoint) && !['cancelled', 'rejected'].includes(o.status);

  const est = sellerPoint && buyerPoint ? roadEstimate(sellerPoint, buyerPoint) : null;
  const toGo = transitPoint && buyerPoint ? kmBetween(transitPoint, buyerPoint) : null;
  const sellerSpot: MapSpot = { name: `${o.seller_name ?? 'Farmer'}${o.seller_district ? `, ${o.seller_district}` : ''}`, lat: sellerPoint?.lat ?? null, lng: sellerPoint?.lng ?? null };
  const buyerSpot: MapSpot = { name: o.buyer_live_address ?? o.delivery_address, lat: buyerPoint?.lat ?? null, lng: buyerPoint?.lng ?? null };

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
  /** An order step that needs GPS first (or the release): one busy flag, honest errors. */
  const step = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok, { duration: 8000 });
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
          <p className="mt-1 text-sm text-slate-700">
            {sellerSide ? `${o.buyer_name} · ` : `Sold by ${o.seller_name ?? 'the farmer'}${o.seller_district ? `, ${o.seller_district}` : ''} · `}
            <a href={`tel:${sellerSide ? o.buyer_phone : o.seller_phone || o.buyer_phone}`} className="inline-flex items-center gap-1 font-semibold text-sky-800"><Phone className="h-3.5 w-3.5" aria-hidden /> {sellerSide ? o.buyer_phone : o.seller_phone || o.buyer_phone}</a>
            <span className="block text-slate-600">Deliver to: {o.buyer_live_address ?? o.delivery_address} · {o.buyer_name} 📞 {o.buyer_phone}</span>
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge tone={s.tone}>{s.label}</Badge>
          {escrowed && <Badge tone="green">🔒 In escrow</Badge>}
        </div>
      </div>
      {o.seller_note && <p className="mt-2 text-sm text-slate-700">Seller: {o.seller_note}</p>}
      {o.buyer_note && <p className="mt-2 text-sm text-rose-800">Buyer: {o.buyer_note}</p>}
      {o.payment_ref && <p className="mt-2 text-sm text-slate-700">Payment reference: <span className="font-mono font-semibold">{o.payment_ref}</span>{sellerSide && o.status === 'paid' ? ' — check it in your bank / UPI app before confirming.' : ''}</p>}

      {escrowed && (
        <p className="mt-2 flex items-start gap-2 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-950">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" aria-hidden />
          <span>
            <strong>🔒 {inr(o.amount)} Locked in KashRoot Escrow</strong>
            {' · '}Releases to the farmer{payee ? ` (${payee.upi_id ?? o.seller_phone} / Acct ${maskAcct(payee.account_number) ?? payee.account_name})` : ''} automatically once the goods reach <strong>{o.buyer_name}</strong> at {o.buyer_live_address || o.delivery_address}.
          </span>
        </p>
      )}
      {o.escrow_status === 'released' && (
        <p className="mt-2 flex items-start gap-2 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-950">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" aria-hidden />
          <span>✅ <strong>Escrow Released to Farmer</strong>{o.escrow_released_at ? ` · ${ago(o.escrow_released_at)}` : ''}{o.escrow_tx_ref ? ` · UTR ${o.escrow_tx_ref}` : ''}</span>
        </p>
      )}

      {/* The live mutual GPS trip: farmer origin, the moving shipment, the buyer destination. */}
      {mapShown && (
        <div className="mt-3 grid gap-1.5">
          <OrderLiveMap seller={sellerPoint} transit={transitPoint} buyer={buyerPoint} />
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
            {est && <span className="font-semibold text-slate-800">🛣 ~{est.km.toFixed(1)} km · ETA ~{Math.max(1, Math.round(est.hours * 60))} min <span className="font-normal text-slate-500">(road estimate)</span></span>}
            {toGo !== null && <span>🚚 {toGo.toFixed(1)} km to go</span>}
            {sellerPoint && <span>Origin: {o.seller_live_address ?? o.seller_district ?? '—'} · {o.seller_live_lat!.toFixed(5)}, {o.seller_live_lng!.toFixed(5)}{o.seller_gps_updated_at ? ` · GPS ${ago(o.seller_gps_updated_at)}` : ''}</span>}
            {buyerPoint && o.buyer_live_lat != null && <span>Destination: {o.buyer_live_address ?? o.delivery_address} · {o.buyer_live_lat!.toFixed(5)}, {o.buyer_live_lng!.toFixed(5)}{o.buyer_gps_updated_at ? ` · GPS ${ago(o.buyer_gps_updated_at)}` : ''}{o.buyer_gps_accuracy ? ` (±${Math.round(o.buyer_gps_accuracy)} m)` : ''}</span>}
            <a href={googleRoute(sellerSpot, buyerSpot)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-bold text-emerald-700 underline underline-offset-2">
              <Navigation className="h-3.5 w-3.5" aria-hidden /> Open Live Turn-by-Turn Route in Google Maps ↗
            </a>
          </div>
        </div>
      )}
      {!mapShown && open && (
        <p className="mt-2 text-xs text-slate-500">{sellerSide ? 'Your live origin GPS appears here when you accept the order.' : 'The live mutual map appears here: your GPS as the destination, the farmer’s origin, and the shipment while it travels.'}</p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {/* ── seller: the five steps in order ── */}
        {sellerSide && o.status === 'placed' && (
          <>
            <Btn theme={theme} size="sm" icon={CheckCircle2} disabled={busy} onClick={() => void step(async () => {
              const fix = await capturePoint().catch(() => { throw new Error('Location is off. Allow location access (GPS) to share your live origin, then press again.'); });
              await orderSellerGps(o.id, fix);
              await orderAction(o.id, 'accept');
            }, 'Order accepted · Packing — your live origin GPS is shared')}>
              Accept Order &amp; Share Live GPS
            </Btn>
            <Btn theme={theme} size="sm" variant="danger" icon={XCircle} disabled={busy} onClick={() => { const n = ask('Why can’t you take this order? (the buyer sees this)'); if (n !== null) void act('reject', 'Order declined', n); }}>Decline</Btn>
          </>
        )}
        {sellerSide && o.status === 'accepted' && (
          <Btn theme={theme} size="sm" icon={Truck} disabled={busy} onClick={() => { const note = window.prompt('Dispatch note for the buyer (vehicle, tracking code, expected date) — optional'); if (note === null) return; void step(async () => {
            const fix = await capturePoint().catch(() => { throw new Error('Location is off. Allow location access (GPS) so the buyer can follow the shipment, then press again.'); });
            await orderSellerGps(o.id, fix);
            await orderAction(o.id, 'ship', undefined, note.trim() || undefined);
          }, 'Dispatched — live GPS tracking is now active'); }}>
            Dispatch Shipment &amp; Stream Live GPS
          </Btn>
        )}
        {sellerSide && o.status === 'shipped' && (
          <>
            <Btn theme={theme} size="sm" icon={PackageCheck} disabled={busy} onClick={() => { if (window.confirm('Has the shipment reached the buyer’s location?')) void step(() => orderArrive(o.id), 'Arrived at Buyer Location — waiting for their escrow confirmation'); }}>
              Arrived at Buyer Location
            </Btn>
            {transit.live && <span className="self-center text-xs font-bold text-blue-700">📡 Streaming live GPS…{transit.error ? '' : ' route visible to the buyer'}</span>}
          </>
        )}
        {sellerSide && o.status === 'delivered' && (
          <span className="self-center text-sm text-slate-600">Waiting for {o.buyer_name} to confirm delivery received — {inr(o.amount)} then releases from escrow to you.</span>
        )}

        {/* ── buyer ── */}
        {!sellerSide && o.status === 'placed' && (
          <Btn theme={theme} size="sm" variant="ghost" icon={XCircle} disabled={busy} onClick={() => void act('cancel', 'Order cancelled')}>Cancel order</Btn>
        )}
        {!sellerSide && escrowed && (o.status === 'shipped' || o.status === 'delivered') && (
          <Btn theme={theme} size="sm" icon={PackageCheck} disabled={busy} onClick={() => { if (window.confirm(`Confirm you received the goods and checked them? ${inr(o.amount)} then releases from escrow to the farmer.`)) void step(() => orderRelease(o.id), 'Delivered · Escrow released to the farmer'); }}>
            ✅ Confirm Delivery Received
          </Btn>
        )}
        {!sellerSide && !escrowed && (o.status === 'accepted' || o.status === 'shipped') && (
          <Btn theme={theme} size="sm" icon={PackageCheck} disabled={busy} onClick={() => { if (window.confirm('Have the goods reached you, and have you checked them?')) void act('delivered', 'Thanks — now pay the seller'); }}>I received the goods</Btn>
        )}
        {wantBuyerLive && <span className="self-center text-xs font-bold text-sky-700">📡 Your live GPS is shared with the farmer{buyers.error ? '' : ' — tracking active'}</span>}
        {!sellerSide && !['completed', 'cancelled', 'rejected', 'disputed', 'placed'].includes(o.status) && (
          <Btn theme={theme} size="sm" variant="ghost" icon={Flag} disabled={busy} onClick={() => { const n = ask('What went wrong? (wrong item, damaged, not delivered…)'); if (n === null) return; if (!n) return toast.error('Write what went wrong, for example: wrong item, broken, not delivered. Then press OK.'); void act('dispute', 'Problem reported to the farmer and KashRoot', n); }}>Report a problem</Btn>
        )}
      </div>

      {as === 'buyer' && o.status === 'delivered' && (
        <div className="mt-3">
          <PayDirect kind="order" id={o.id} amount={o.amount} note={`KashRoot order ${o.id.slice(0, 8)} (escrow ${o.id.slice(0, 8)})`} theme={theme} onPaid={async (ref) => { await orderAction(o.id, 'pay', ref); onChange(); }} />
        </div>
      )}
    </li>
  );
}
