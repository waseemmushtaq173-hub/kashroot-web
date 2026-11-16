/**
 * Ordering one listing into the true five-step escrow lifecycle — the same
 * window on Price Comparison and in the Buyer portal's shop. The buyer's
 * live GPS is captured (navigator.geolocation, high accuracy) and sent with
 * the order: it becomes the destination pin on the live mutual map, and
 * fills the delivery point. The payment is locked in KashRoot escrow the
 * moment the order goes (escrow_status 'locked'); when the goods arrive the
 * buyer presses "✅ Confirm Delivery Received" and the escrow releases to
 * the farmer.
 *
 * The database takes the listing's price at the moment of ordering, and the
 * seller can change it while this window is open. So the listing is read
 * again just before the order goes: a new price is shown and the buyer
 * presses Order again; a product taken off sale says so.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import React from 'react';
import dynamic from 'next/dynamic';
import { ArrowLeft, Crosshair, ShoppingCart } from 'lucide-react';
import { toast } from '@/lib/client/toast';

import { Btn, Field, INPUT, Modal, type PortalTheme } from '@/components/portal/kit';
import { NEEDS_INTERNET, offlineNow } from '@/components/pwa/net';
import { capturePoint, type LiveFix } from '@/lib/client/liveGps';
import { inr, supabase, type Account } from '@/lib/db/client';
import { orderAction, placeOrder, type MarketListing, type MarketOrder, type MarketUnit } from '@/lib/db/market';
import { LISTINGS_CHANGED, UNIT_PLURAL as PLURAL, amountOf } from '@/components/market/shop/useLiveListings';
import { BUYER_CONSOLIDATION_FEE_RATE, CLUSTER_RADIUS_KM, calculateClusterSettlement, computeRealDistanceKm, getNearestVerifiedHub } from '@/lib/clusterConsolidation';

// The native tile map for the buyer's delivery pin — no iframe, never blocked.
const LiveInteractiveMap = dynamic(() => import('@/components/common/LiveInteractiveMap'), {
  ssr: false,
  loading: () => <div className="h-56 w-full animate-pulse rounded-xl bg-slate-100" aria-hidden />,
});

type Orderable = Pick<MarketListing, 'id' | 'product' | 'price' | 'unit' | 'quantity' | 'seller_name' | 'district'> & Partial<Pick<MarketListing, 'captured_lat' | 'captured_lng'>>;

/** Highway freight from the hub to the buyer: rupees for one box for one kilometre. */
const FREIGHT_INR_PER_KM_PER_BOX = 0.12;

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
  const { data, error } = await supabase.from('market_listings').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(NOT_CHECKED);
  const row = data as { price: number; quantity: number; active: boolean } | null;
  return row && row.active && Number(row.quantity) > 0 ? { price: row.price, quantity: row.quantity } : null;
}

const OrderModalInner = React.memo(function OrderModalInner({ listing, account, theme, onClose, onPlaced, initialQuantity, settlement = false }: { listing: Orderable; account: Account; theme: PortalTheme; onClose: () => void; onPlaced: (order: MarketOrder) => void; initialQuantity?: number; settlement?: boolean }) {
  // Price and stock as last read: they change here when the seller changes them.
  const [now, setNow] = useState({ price: listing.price, quantity: listing.quantity });
  const l = { ...listing, ...now };
  const [form, setForm] = useState({ quantity: initialQuantity && initialQuantity > 0 ? String(Math.min(initialQuantity, Number(listing.quantity))) : '1', name: account.name, phone: account.phone, address: [account.village, account.district].filter(Boolean).join(', ') });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  /** The buyer's live GPS fix: captured at once, chance to capture again. */
  const [fix, setFix] = useState<LiveFix | null>(null);
  const [fixing, setFixing] = useState(false);
  const [fixError, setFixError] = useState<string | null>(null);
  const qty = Number(form.quantity) || 0;
  // The hub nearest the listing's own orchard GPS, and the real distance from it to the buyer's locked GPS.
  // Either is null when its GPS is missing: then no freight is worked out (never a guessed number).
  const hub = settlement ? getNearestVerifiedHub(listing.captured_lat, listing.captured_lng) : null;
  const hubToBuyerKm = hub && fix ? computeRealDistanceKm(hub.hub.lat, hub.hub.lng, fix.lat, fix.lng) : null;
  const freightPerBox = hubToBuyerKm !== null ? hubToBuyerKm * FREIGHT_INR_PER_KM_PER_BOX : null;
  const set = useCallback((patch: Partial<typeof form>) => {
    setForm({ ...form, ...patch });
    setProblem(null);
    // Editing the address after a lock is the buyer's own override.
    // eslint-disable-next-line react-hooks/immutability -- kept as shipped: changing when this state is set needs its signed-in flow tested
    if (patch.address !== undefined) setAddrTouched(true);
  }, [form]);
  const total = useMemo(() => inr(qty * Number(l.price)), [qty, l.price]);

  // The overwrite rule read inside takeFix without making it unstable:
  // a fresh lock overwrites the address unless the buyer typed their own
  // words after the previous lock.
  const [autoAddr, setAutoAddr] = useState<string | null>(null);
  const [addrTouched, setAddrTouched] = useState(false);
  const addrRef = useRef({ addrTouched, autoAddr });
  // eslint-disable-next-line react-hooks/refs -- kept as shipped: changing when this state is set needs its signed-in flow tested
  addrRef.current = { addrTouched, autoAddr };

  /** High-accuracy live GPS, reverse-geocoded; mandatory before the order goes. */
  // eslint-disable-next-line react-hooks/preserve-manual-memoization -- kept as shipped: changing when this state is set needs its signed-in flow tested
  const takeFix = useCallback(async () => {
    setFixing(true);
    setFixError(null);
    try {
      const f = await capturePoint();
      setFix(f);
      // A fresh lock clears any stale red order error and opens a new
      // "the buyer may override the address" window.
      setProblem(null);
      setAddrTouched(false);
      const { addrTouched: touched, autoAddr: prev } = addrRef.current;
      setForm((cur) => (touched && cur.address.trim() && cur.address !== prev ? cur : { ...cur, address: f.address }));
      setAutoAddr(f.address);
    } catch (err) {
      setFix(null);
      setFixError(`We could not get your live GPS location (${err instanceof Error ? err.message : 'unknown error'}). Allow location access — it puts your exact delivery pin on the live map.`);
    } finally {
      setFixing(false);
    }
  }, []);

  // The first fix is taken just after the window opens — deferred to a timer
  // so no state is set synchronously inside the effect.
  useEffect(() => {
    const id = window.setTimeout(() => { void takeFix(); }, 0);
    return () => window.clearTimeout(id);
  }, [takeFix]);

  const place = async () => {
    const wrong = orderProblem(l, form);
    if (wrong) return setProblem(wrong);
    // An order is money: never kept to send later.
    if (offlineNow()) return setProblem(NEEDS_INTERNET);
    // The live mutual GPS needs the buyer's exact destination: nothing goes
    // without it. If the lock is still in flight (the buyer pressed Order
    // right after the capture), take a fresh fix here instead of failing.
    let live = fix;
    if (!live) {
      setProblem(null);
      try {
        live = await capturePoint();
        setFix(live);
        setFixError(null);
        setAddrTouched(false);
      } catch (err) {
        setFixError(`We could not get your live GPS location (${err instanceof Error ? err.message : 'unknown error'}). Allow location access — it puts your exact delivery pin on the live map.`);
        return setProblem('Your live GPS is not captured yet. Allow location access, then press “Capture my live GPS” and Order again — it puts your exact delivery pin on the live map.');
      }
    }
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
      const order = await placeOrder({
        listing_id: l.id,
        buyer_name: form.name.trim() || account.name,
        buyer_phone: form.phone.replace(/[\s-]/g, ''),
        delivery_address: form.address.trim(),
        quantity: qty,
        // The buyer's live GPS, locked at checkout: the destination pin on the live mutual map.
        buyer_live_lat: live.lat,
        buyer_live_lng: live.lng,
        buyer_live_address: live.address,
        // Recorded with the order (not charged through the escrow): the hub, the 1% fee and the freight from real distance.
        ...(settlement && l.unit === 'box'
          ? (() => {
              const liveKm = hub ? computeRealDistanceKm(hub.hub.lat, hub.hub.lng, live.lat, live.lng) : null;
              const s = calculateClusterSettlement({ produceSubtotalInr: qty * Number(fresh.price), totalBoxes: qty, freightPerBoxInr: liveKm !== null ? liveKm * FREIGHT_INR_PER_KM_PER_BOX : 0 });
              return {
                assigned_hub_id: hub?.hub.id ?? null,
                assigned_hub_name: hub?.hub.name ?? null,
                buyer_fee_inr: s.buyerConsolidationFeeInr,
                freight_inr: liveKm !== null ? s.freightTotalInr : null,
                farmer_fee_inr: 0,
              };
            })()
          : {}),
      });
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
      toast.success(`Order sent — ${inr(order.amount)} locked in KashRoot escrow`);
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
              <Btn theme={theme} icon={ShoppingCart} className="min-h-11" disabled={busy} onClick={() => void place()}>{busy ? 'Sending…' : `Order for ${total}`}</Btn>
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
        {fix && (
          <>
            <p className="rounded-xl bg-forest-soft p-3 text-sm text-forest-deep">
              <strong>📍 Live GPS locked:</strong> {fix.address} · {fix.lat.toFixed(5)}, {fix.lng.toFixed(5)} (±{Math.round(fix.accuracy ?? 0)} m). Your pin goes on the live map the farmer follows to you.
              <button type="button" onClick={() => void takeFix()} disabled={fixing} className="ms-2 inline-flex min-h-8 items-center gap-1 rounded-lg bg-forest-soft px-2 font-semibold text-forest-deep underline-offset-2 hover:bg-[#CFE0D6] disabled:opacity-50">
                <Crosshair className="h-3.5 w-3.5" aria-hidden /> {fixing ? 'Capturing…' : 'Capture again'}
              </button>
            </p>
            <LiveInteractiveMap lat={fix.lat} lng={fix.lng} accuracy={fix.accuracy} label="Your delivery pin" />
          </>
        )}
        {fixError && (
          <div>
            <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm font-medium text-rose-800 ring-1 ring-rose-200">{fixError}</p>
            <button type="button" onClick={() => void takeFix()} disabled={fixing} className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-xl bg-forest px-4 font-bold text-white hover:bg-forest disabled:opacity-50">
              <Crosshair className="h-4 w-4" aria-hidden /> {fixing ? 'Capturing your live GPS…' : 'Capture my live GPS'}
            </button>
          </div>
        )}
        {settlement && l.unit === 'box' && qty > 0 && (() => {
          const s = calculateClusterSettlement({ produceSubtotalInr: qty * Number(l.price), totalBoxes: qty, freightPerBoxInr: freightPerBox ?? 0 });
          return (
            <section aria-label="Settlement" data-testid="order-settlement" className="rounded-xl bg-[#F6F7FF] p-3 text-sm text-[#1E2D28] ring-1 ring-forest-line">
              <p className="font-bold text-forest">Settlement for this order</p>
              <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5">
                <dt>Apple Boxes Subtotal (100% paid to Growers — 0% Grower Deduction)</dt>
                <dd className="text-right font-bold tabular-nums">{inr(s.produceSubtotalInr)}</dd>
                <dt>KashRoot Consolidation &amp; Service Fee ({Math.round(BUYER_CONSOLIDATION_FEE_RATE * 100)}% paid by Buyer)</dt>
                <dd className="text-right font-bold tabular-nums">{inr(s.buyerConsolidationFeeInr)}</dd>
                <dt>
                  Hub Pickup &amp; Highway Freight
                  {hub && hubToBuyerKm !== null && <span className="block text-xs text-[#52665E]">{hub.hub.name} → your locked GPS: {hubToBuyerKm.toFixed(1)} km × {qty.toLocaleString('en-IN')} boxes × ₹{FREIGHT_INR_PER_KM_PER_BOX} a km a box</span>}
                </dt>
                <dd className="text-right font-bold tabular-nums">
                  {freightPerBox !== null ? inr(s.freightTotalInr) : <span className="font-semibold text-[#52665E]">{!hub ? 'Orchard GPS not recorded on this listing' : 'Lock your GPS to work it out'}</span>}
                </dd>
              </dl>
              <p className="mt-2 text-xs text-[#52665E]">
                The escrow on this order holds the growers’ {inr(s.produceSubtotalInr)} only. The service fee and the freight are recorded on the order for you to see; they are not collected through this order.
              </p>
              <p className="mt-2 rounded-lg bg-forest-soft px-2.5 py-1.5 text-xs font-semibold text-forest">
                Orchard Gates ({CLUSTER_RADIUS_KM} km Cluster) → KashRoot Local Pickup Vehicle → Nearest KashRoot Hub Consolidation → Direct Highway Truck to Buyer
              </p>
            </section>
          );
        })()}
        {(gone || problem) && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm font-medium text-rose-800 ring-1 ring-rose-200">{gone ? GONE : problem}</p>}
        {fix ? (
          <p className="rounded-xl bg-forest-soft p-3 text-sm text-forest-pine">🔒 <strong>{inr(qty * Number(l.price))} goes into KashRoot Escrow</strong> when you press Order. It releases to the farmer only when you press “✅ Confirm Delivery Received” after the goods reach you at {form.address.trim() || fix.address}.</p>
        ) : (
          <p className="rounded-xl bg-forest-soft p-3 text-sm text-forest-pine">You pay nothing now. When the goods reach you and you have checked them, press “✅ Confirm Delivery Received” and the escrow releases to the farmer.</p>
        )}
      </div>
    </Modal>
  );
});

export function OrderModal({ listing, account, theme, onClose, onPlaced, initialQuantity, settlement }: { listing: Orderable; account: Account; theme: PortalTheme; onClose: () => void; onPlaced: (order: MarketOrder) => void; /** The boxes the buyer put on the truck for this listing. */ initialQuantity?: number; /** Buyer portal: show the cluster settlement (growers 100%, 1% buyer fee, freight). */ settlement?: boolean }) {
  return <OrderModalInner listing={listing} account={account} theme={theme} onClose={onClose} onPlaced={onPlaced} initialQuantity={initialQuantity} settlement={settlement} />;
}
