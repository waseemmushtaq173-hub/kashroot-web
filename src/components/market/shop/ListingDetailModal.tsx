/**
 * The rich detail window over a produce listing: what it is, who sells it,
 * how much there is and how to buy it — or, when it is your own listing,
 * how to test buying it (the full Buyer Order & Escrow Checkout Form,
 * expanded by default) or manage it.
 */
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import React from 'react';
import dynamic from 'next/dynamic';
import { CheckCircle2, CreditCard, Crosshair, ExternalLink, MapPin, MessageCircle, Phone, ShoppingCart, ShieldCheck } from 'lucide-react';

import { Btn, Badge, Modal, type PortalTheme } from '@/components/portal/kit';
import { NEEDS_INTERNET, offlineNow } from '@/components/pwa/net';
import { toast } from '@/lib/client/toast';
import { capturePoint, type LiveFix } from '@/lib/client/liveGps';
import { inr, loadAccount } from '@/lib/db/client';
import { placeOrder, type MarketOrder } from '@/lib/db/market';
import { LISTINGS_CHANGED, UNIT_PLURAL as PLURAL, amountOf, type ShopListing } from '@/components/market/shop/useLiveListings';
import { SignInToCall } from '@/components/market/SignInToCall';

export interface ListingDetailModalProps {
  listing: ShopListing;
  verified: boolean;
  own: boolean;
  theme: PortalTheme;
  onClose: () => void;
  onOrder?: (listing: ShopListing) => void;
  onManageListing?: () => void;
}

const FarmMap = dynamic(() => import('@/components/market/shop/FarmMap'), {
  ssr: false,
  loading: () => <div className="h-56 w-full animate-pulse rounded-xl bg-slate-100" aria-hidden />,
});

// The native tile map for the buyer's delivery pin — no iframe, never blocked.
const LiveInteractiveMap = dynamic(() => import('@/components/common/LiveInteractiveMap'), {
  ssr: false,
  loading: () => <div className="h-56 w-full animate-pulse rounded-xl bg-slate-100" aria-hidden />,
});

/** Units sold whole: nobody orders half a box. */
const WHOLE_UNITS = ['box', 'piece', 'bag'];

/** Coordinates as words ("34.05500° N, 74.80000° E"): the pin when no place name was found. */
const coordsText = (fix: LiveFix) => `${fix.lat.toFixed(5)}° N, ${fix.lng.toFixed(5)}° E`;
/** The address is only the coordinates (the place lookup found nothing): never say them twice. */
const addressIsCoords = (a: string) => a.includes('° N,');

/** What is wrong with the checkout order, in words the buyer can act on; null when it can go. */
function checkoutProblem(l: Pick<ShopListing, 'unit' | 'quantity'>, f: { quantity: string; phone: string; address: string }): string | null {
  const qty = Number(f.quantity);
  const stock = Number(l.quantity);
  if (!f.quantity.trim() || !(qty > 0)) return `Choose how many ${PLURAL[l.unit]} you want (1 or more).`;
  if (WHOLE_UNITS.includes(l.unit) && !Number.isInteger(qty)) return `Write a whole number of ${PLURAL[l.unit]}, for example 10.`;
  if (qty > stock) return `This listing has only ${amountOf(stock, l.unit)}. Choose ${stock.toLocaleString('en-IN')} or less.`;
  if (!/^(\+?91)?[6-9]\d{9}$/.test(f.phone.replace(/[\s-]/g, ''))) return 'Write your 10-digit mobile number, for example 9876543210. The seller calls you on it.';
  if (f.address.trim().length < 5) return 'Write where to deliver: village, tehsil and district.';
  return null;
}

/**
 * The Buyer Order & Escrow Checkout Form, embedded right inside the detail
 * window — quantity selector, live total calculator, delivery address, the
 * buyer's live GPS lock and “Place Order in Escrow”. Expanded by default so
 * the listing's owner can test the full order flow without leaving the
 * listing (the same escrow lifecycle every real buyer goes through).
 */
function BuyerCheckoutForm({ listing: l, theme }: { listing: ShopListing; theme: PortalTheme }) {
  const max = Number(l.quantity);
  const [qty, setQty] = useState(1);
  const [form, setForm] = useState({ name: '', phone: '', address: '' });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [placed, setPlaced] = useState<MarketOrder | null>(null);
  /** The buyer's live GPS fix: captured at once, chance to capture again. */
  const [fix, setFix] = useState<LiveFix | null>(null);
  const [fixing, setFixing] = useState(false);
  const [fixError, setFixError] = useState<string | null>(null);

  // The signed-in account pre-fills name / mobile / address — deferred to a
  // timer so no state is set synchronously inside the effect.
  useEffect(() => {
    const id = window.setTimeout(() => {
      void loadAccount().then((a) => {
        if (!a) return;
        setForm((cur) => ({ name: cur.name || a.name, phone: cur.phone || a.phone, address: cur.address || [a.village, a.district].filter(Boolean).join(', ') }));
      }).catch(() => undefined);
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  // The locked address fills the Delivery address in — into an empty field,
  // or replacing what a previous lock put there — never over the buyer's own
  // typing made after the lock. Coordinates alone are not an address: nothing
  // fills then.
  const [autoAddr, setAutoAddr] = useState<string | null>(null);
  /** True once the buyer edits the address after the last lock: then their words win. */
  const [addrTouched, setAddrTouched] = useState(false);
  useEffect(() => {
    if (!fix) return;
    const a = fix.address;
    if (addressIsCoords(a) || a === autoAddr) return;
    setForm((cur) => (addrTouched && cur.address.trim() && cur.address !== autoAddr ? cur : { ...cur, address: a }));
    setAutoAddr(a);
  }, [fix, autoAddr, addrTouched]);

  /** High-accuracy live GPS, reverse-geocoded; locked before the order goes. */
  const takeFix = useCallback(async () => {
    setFixing(true);
    setFixError(null);
    try {
      setFix(await capturePoint());
      // A fresh lock clears any stale red order error and opens a new
      // "the buyer may override the address" window.
      setProblem(null);
      setAddrTouched(false);
    } catch (err) {
      setFix(null);
      setFixError(`We could not get your live GPS location (${err instanceof Error ? err.message : 'unknown error'}). Allow location access — it puts your exact delivery pin on the live map.`);
    } finally {
      setFixing(false);
    }
  }, []);

  // The first fix is taken just after the form opens — deferred to a timer
  // so no state is set synchronously inside the effect.
  useEffect(() => {
    const id = window.setTimeout(() => { void takeFix(); }, 0);
    return () => window.clearTimeout(id);
  }, [takeFix]);

  const total = useMemo(() => inr(Number(l.price) * qty), [l.price, qty]);
  const stockRange = useMemo(() => Array.from({ length: Math.min(max, 20) }, (_, i) => i + 1), [max]);

  const place = async () => {
    const wrong = checkoutProblem(l, { quantity: String(qty), phone: form.phone, address: form.address });
    if (wrong) return setProblem(wrong);
    // An order is money: never kept to send later.
    if (offlineNow()) return setProblem(NEEDS_INTERNET);
    // The live mutual GPS needs the buyer's exact destination: nothing goes
    // without it. If the lock is still in flight (the buyer pressed Place
    // Order right after Lock GPS), capture a fresh fix here instead of
    // failing with the red error.
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
        return setProblem('Your live GPS is not captured yet. Allow location access, then press “Lock Live Buyer GPS” and order again — it puts your exact delivery pin on the live map.');
      }
    }
    setBusy(true);
    try {
      const order = await placeOrder({
        listing_id: l.id,
        buyer_name: form.name.trim() || l.seller_name,
        buyer_phone: form.phone.replace(/[\s-]/g, ''),
        delivery_address: form.address.trim(),
        quantity: qty,
        // The buyer's live GPS, locked at checkout: the destination pin on the live mutual map.
        buyer_live_lat: live.lat,
        buyer_live_lng: live.lng,
        buyer_live_address: live.address,
      });
      setPlaced(order);
      toast.success(`Order sent — ${inr(order.amount)} locked in KashRoot escrow`);
      window.dispatchEvent(new Event(LISTINGS_CHANGED));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not send the order. Check your internet and try again.';
      setProblem(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  if (placed) {
    return (
      <div className="grid gap-2 rounded-2xl bg-emerald-50 p-4 ring-1 ring-emerald-200">
        <p className="flex items-center gap-2 text-sm font-bold text-emerald-900">
          <CheckCircle2 className="h-5 w-5 shrink-0" aria-hidden /> Order placed — {inr(placed.amount)} locked in KashRoot Escrow
        </p>
        <p className="text-sm text-emerald-950">The test order went through the real escrow: it is in the seller's orders and in the buyer's “My orders” now. You pay nothing yet — when the goods reach you, press “✅ Confirm Delivery Received” there and the escrow releases to the farmer.</p>
        <div className="flex flex-wrap gap-2">
          <Btn theme={theme} variant="soft" icon={ShoppingCart} className="min-h-10 text-sm" onClick={() => { window.location.href = '/buyer/dashboard?tab=orders'; }}>
            Open My orders in the Buyer portal
          </Btn>
          <Btn theme={theme} variant="ghost" className="min-h-10 text-sm" onClick={() => { setPlaced(null); setQty(1); setProblem(null); }}>
            Place another test order
          </Btn>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-3 rounded-2xl bg-sky-50/70 p-4 ring-1 ring-sky-200">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-bold text-slate-900">🛒 Buyer Order &amp; Escrow Checkout</p>
        <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-sky-800">Test the real order flow</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          Quantity ({l.unit})
          <select
            value={String(qty)}
            onChange={(e) => { setQty(Math.max(1, Math.min(max, Number(e.target.value)))); setProblem(null); }}
            className="rounded border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-sky-500"
          >
            {stockRange.map((n) => (
              <option key={n} value={String(n)}>{n}</option>
            ))}
          </select>
        </label>
        <div className="text-right">
          <p className="text-xs text-slate-500">Total</p>
          <p className="text-xl font-bold text-emerald-700">{total}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          Your mobile
          <input type="tel" inputMode="numeric" autoComplete="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="10-digit mobile number" className="min-h-11 w-full rounded-xl border-0 bg-white px-3 text-sm text-slate-900 ring-1 ring-inset ring-slate-200 placeholder:text-slate-400 focus:ring-2 focus:ring-sky-500" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          Your name
          <input autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Full name" className="min-h-11 w-full rounded-xl border-0 bg-white px-3 text-sm text-slate-900 ring-1 ring-inset ring-slate-200 placeholder:text-slate-400 focus:ring-2 focus:ring-sky-500" />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-xs text-slate-500">
        Delivery address
        <textarea rows={2} value={form.address} onChange={(e) => { setForm({ ...form, address: e.target.value }); setAddrTouched(true); }} placeholder="Village, tehsil, district, landmark" className="w-full rounded-xl border-0 bg-white px-3 py-2 text-sm text-slate-900 ring-1 ring-inset ring-slate-200 placeholder:text-slate-400 focus:ring-2 focus:ring-sky-500" />
      </label>
      <div className="grid gap-1.5">
        <button type="button" onClick={() => void takeFix()} disabled={fixing} className="inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 text-sm font-bold text-white hover:bg-sky-700 disabled:opacity-50">
          <Crosshair className="h-4 w-4" aria-hidden /> {fixing ? 'Locking your live GPS…' : 'Lock Live Buyer GPS'}
        </button>
        {fix && (
          <>
            <p className="rounded-xl bg-white p-2.5 text-xs font-semibold text-sky-900 ring-1 ring-sky-200">
              ✓ Live GPS Locked: {addressIsCoords(fix.address) ? fix.address : `${fix.address} · ${coordsText(fix)}`} (±{Math.round(fix.accuracy ?? 0)} m)
            </p>
            <LiveInteractiveMap lat={fix.lat} lng={fix.lng} accuracy={fix.accuracy} label="Your exact delivery pin" />
          </>
        )}
        {fixError && <p role="alert" className="rounded-xl bg-rose-50 p-2.5 text-xs font-medium text-rose-800 ring-1 ring-rose-200">{fixError}</p>}
      </div>
      {problem && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm font-medium text-rose-800 ring-1 ring-rose-200">{problem}</p>}
      <button type="button" onClick={() => void place()} disabled={busy || max <= 0} className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-50">
        <ShoppingCart className="h-4 w-4" aria-hidden /> {busy ? 'Placing…' : `Place Order in Escrow — ${total} locked`}
      </button>
      <p className="text-xs font-medium text-emerald-900">🔒 You pay nothing now. The total locks in KashRoot Escrow when the order is placed; it releases to the farmer only after the goods reach you and you press “✅ Confirm Delivery Received”.</p>
    </div>
  );
}

const ListingDetailModalInner = React.memo(function ListingDetailModalInner({ listing: l, verified, own, theme, onClose, onOrder, onManageListing }: ListingDetailModalProps) {
  const [qty, setQty] = useState(1);
  const max = Number(l.quantity);
  const stockText = amountOf(max, l.unit);

  // The Buyer Checkout form below the notice: expanded by default, forced
  // open (and scrolled to) by “Preview Buyer Checkout / Test Order Flow”.
  const [showCheckout, setShowCheckout] = useState(true);
  const checkoutRef = useRef<HTMLDivElement>(null);

  const stockRange = useMemo(() => {
    const n = Math.min(max, 20);
    return Array.from({ length: n }, (_, i) => i + 1);
  }, [max]);

  const total = useMemo(() => Number(l.price) * qty, [l.price, qty]);
  const totalWeightKg = useMemo(() => l.box_capacity_kg ? Number(l.quantity) * Number(l.box_capacity_kg) : null, [l.quantity, l.box_capacity_kg]);
  const pricePerKg = useMemo(() => l.box_capacity_kg && Number(l.price) > 0 ? Number(l.price) / Number(l.box_capacity_kg) : null, [l.price, l.box_capacity_kg]);

  const whatsapp = useMemo(() => `https://wa.me/${String(l.phone).replace(/[^\d+]/g, '')}?text=${encodeURIComponent(`Hi ${l.seller_name}, I want to buy ${qty} ${l.unit} of ${l.product} from KashRoot.`)}`, [l.phone, l.seller_name, l.unit, l.product, qty]);

  const call = useMemo(() => {
    return () => {
      if (!l.phone) return;
      if (typeof window !== 'undefined') window.location.href = `tel:${l.phone}`;
    };
  }, [l.phone]);

  const handleOrder = useMemo(() => {
    return () => {
      if (onOrder) onOrder(l);
      onClose();
    };
  }, [l, onOrder, onClose]);

  const handleManage = useMemo(() => {
    return () => {
      if (onManageListing) onManageListing();
      onClose();
    };
  }, [onManageListing, onClose]);

  const isProduce = l.category === 'produce';

  return (
    <Modal open onClose={onClose} title={l.product} wide>
      <div className="grid gap-4">
        {/* Photo row: main photo + a strip of the rest. */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-2xl bg-slate-100 overflow-hidden border border-slate-200 aspect-[4/5]">
            {l.photo ? (
              <img src={l.photo} alt={l.product} className="h-full w-full object-cover cursor-pointer" title="Tap to enlarge" loading="lazy" decoding="async" />
            ) : (
              <div className="h-full w-full flex flex-col items-center justify-center text-slate-400 text-sm">
                <span>No photo</span>
              </div>
            )}
          </div>
          {(l.photos ?? []).slice(1, 4).map((p, i) => (
            <div key={i} className="rounded-xl bg-slate-100 overflow-hidden border border-slate-200 aspect-[4/5] cursor-pointer" title="Tap to enlarge">
              <img src={p} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
            </div>
          ))}
        </div>

        {/* Identity + verified badge. */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-sky-700">{l.subcategory ?? l.category}</span>
          {verified && <BadgeCheck className="h-4 w-4 text-emerald-700" aria-hidden />}
          {verified && <Badge tone="green">Verified seller</Badge>}
          {l.is_live_camera_verified && <Badge tone="green">🛡️ Live Camera & GPS Verified at Orchard</Badge>}
          <span className="text-sm font-semibold text-slate-900">{l.seller_name}</span>
        </div>
        {l.is_live_camera_verified && l.captured_address && (
          <p className="text-xs text-slate-500"><MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden /> {l.captured_address} · ±{l.captured_accuracy_m?.toFixed(0)}m · {new Date(l.captured_at_iso ?? '').toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
        )}
        {/* The exact orchard spot the live photo/video was taken — the same map
            for farmer and buyer, with the GPS lock from the capture itself. */}
        {l.is_live_camera_verified && l.captured_lat != null && l.captured_lng != null && (
          <figure className="grid gap-1.5">
            <FarmMap lat={Number(l.captured_lat)} lng={Number(l.captured_lng)} label="Live camera capture point" />
            <figcaption className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
              <span>📍 Farm gate on the map — where the live photo was taken, shown the same to farmer and buyer.</span>
              <a href={`https://www.google.com/maps?q=${l.captured_lat},${l.captured_lng}`} target="_blank" rel="noopener noreferrer" className="font-semibold text-emerald-700 underline underline-offset-2">Open in Google Maps</a>
            </figcaption>
          </figure>
        )}
        <p className="text-sm text-slate-600"><MapPin className="h-4 w-4 shrink-0" aria-hidden /> {l.district}</p>

        {/* Crop / variety / grade. */}
        {(l.variety || l.grade || l.packing_layers) && (
          <p className="text-sm text-slate-600">{[l.variety, l.grade && `Grade ${l.grade}`, l.packing_layers].filter(Boolean).join(' · ')}</p>
        )}

        {/* Price + stock. */}
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-slate-900">{inr(l.price)}</span>
          <span className="text-sm font-normal text-slate-500">/ {l.unit}</span>{l.box_capacity_kg && <span className="text-xs text-emerald-600 font-semibold ml-2">({l.box_capacity_kg} kg / box)</span>}
        </div>
        <p className="text-sm text-slate-500">{stockText} in stock{l.box_capacity_kg ? ` · ${totalWeightKg!.toLocaleString('en-IN')} kg total` : ''}</p>
        {l.details && <p className="mt-2 line-clamp-3 text-sm text-slate-600">{l.details}</p>}

        {/* Packing specs for produce */}
        {(l.box_capacity_kg || l.packing_layers || l.apples_per_box) && (
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
            <p className="text-xs font-semibold text-slate-700 mb-1">Box specifications</p>
            <div className="grid grid-cols-2 gap-2 text-sm">
              {l.box_capacity_kg && (
                <div className="flex items-center gap-1">
                  <span className="text-slate-500">Box capacity:</span>
                  <span className="font-semibold text-slate-900">{l.box_capacity_kg} kg</span>
                </div>
              )}
              {l.packing_layers && (
                <div className="flex items-center gap-1">
                  <span className="text-slate-500">Packing:</span>
                  <span className="font-semibold text-slate-900">{l.packing_layers}</span>
                </div>
              )}
              {l.apples_per_box && (
                <div className="flex items-center gap-1">
                  <span className="text-slate-500">Apples per box:</span>
                  <span className="font-semibold text-slate-900">{l.apples_per_box}</span>
                </div>
              )}
              {l.box_capacity_kg && l.quantity > 0 && (
                <div className="flex items-center gap-1">
                  <span className="text-slate-500">Total weight:</span>
                  <span className="font-semibold text-slate-900">{totalWeightKg!.toLocaleString('en-IN')} kg</span>
                </div>
              )}
              {l.box_capacity_kg && Number(l.price) > 0 && (
                <div className="flex items-center gap-1">
                  <span className="text-slate-500">Rate per kg:</span>
                  <span className="font-semibold text-emerald-700">₹{pricePerKg!.toFixed(2)}</span>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="border-t border-slate-900/5 pt-4 mt-4 grid gap-3">
          {own ? (
            <>
              <p className="text-sm font-semibold text-slate-900">This is your active listing</p>
              <div className="flex flex-wrap gap-2">
                <Btn theme={theme} variant="soft" icon={CreditCard} className="min-h-10 text-sm" onClick={() => { setShowCheckout(true); window.setTimeout(() => checkoutRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50); }}>
                  Preview Buyer Checkout / Test Order Flow
                </Btn>
                <Btn theme={theme} variant="soft" icon={ExternalLink} className="min-h-10 text-sm" onClick={() => void handleManage()}>
                  Manage / Edit My Listing
                </Btn>
              </div>
              {/* The Buyer Order & Escrow Checkout Form sits right here,
                  expanded by default: even the listing's owner tests the full
                  order flow — quantity, total, delivery address, live GPS
                  lock, escrow order — without leaving the listing. */}
              <div ref={checkoutRef}>
                {showCheckout ? (
                  <BuyerCheckoutForm listing={l} theme={theme} />
                ) : (
                  <button type="button" onClick={() => setShowCheckout(true)} className="cursor-pointer text-sm font-semibold text-emerald-700 underline underline-offset-2">
                    Show the Buyer Checkout form
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-end gap-1">
                  <label className="text-xs text-slate-500">Quantity ({l.unit})</label>
                  <select
                    value={String(qty)}
                    onChange={(e) => setQty(Math.max(1, Math.min(max, Number(e.target.value))))}
                    className="bg-white border border-slate-200 rounded px-2 py-1.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    {stockRange.map((n) => (
                      <option key={n} value={String(n)}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-500">Total</p>
                  <p className="text-xl font-bold text-emerald-700">{inr(total)}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Btn theme={theme} icon={ShoppingCart} className="flex-1 min-h-11 text-sm" disabled={max <= 0} onClick={() => void handleOrder()}>
                  Buy Now with Escrow
                </Btn>
                {l.phone ? (
                  <Btn theme={theme} variant="soft" icon={Phone} className="min-h-10 text-sm" onClick={call}>
                    Call / WhatsApp Seller
                  </Btn>
                ) : (
                  <SignInToCall portal="buyer" />
                )}
                <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 min-h-10 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition">
                  <MessageCircle className="h-4 w-4 text-emerald-600" aria-hidden />
                  <span>Message on WhatsApp</span>
                </a>
              </div>
              <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-950">
                You pay nothing now. When the goods reach you and you have checked them, press “I received the goods” and pay the seller by UPI.
              </p>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
});

export function ListingDetailModal({ listing: l, verified, own, theme, onClose, onOrder, onManageListing }: ListingDetailModalProps) {
  return <ListingDetailModalInner listing={l} verified={verified} own={own} theme={theme} onClose={onClose} onOrder={onOrder} onManageListing={onManageListing} />;
}

function BadgeCheck({ className }: { className?: string }) {
  return <ShieldCheck className={className} aria-hidden />;
}
