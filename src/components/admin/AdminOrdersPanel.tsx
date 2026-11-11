'use client';

/**
 * Admin → Orders · GPS & Escrow: 100% of every platform order
 * (kr_admin_orders) with the full spec — quantities, grade, packing layers,
 * box capacity, payment and escrow state, seller and buyer identities,
 * the farmer's payout (bank / UPI) details, both live GPS pins and the
 * moving shipment — plus the mutual map and, for the Super Admin only
 * (kr_is_super_admin, checked again in the database), the escrow controls:
 * release to the farmer or refund to the buyer, both written to audit_log.
 */
import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { Package, Phone, ShieldCheck } from 'lucide-react';
import { toast } from '@/lib/client/toast';

import type { OrderPin } from '@/components/market/OrderLiveMap';
import { Badge, Btn, EmptyState, Panel, PORTAL_THEMES, Skeleton } from '@/components/portal/kit';
import { ago, dbMessage, inr, supabase } from '@/lib/db/client';
import { ORDER_STATUS, type OrderStatus } from '@/lib/db/market';
import { googleRoute, kmBetween, roadEstimate, type MapSpot } from '@/lib/maps';

const OrderLiveMap = dynamic(() => import('@/components/market/OrderLiveMap').then((m) => m.default), {
  ssr: false,
  loading: () => <div className="h-64 w-full animate-pulse rounded-xl bg-slate-100" aria-hidden />,
});

export interface AdminOrder {
  id: string;
  created_at: string;
  status: OrderStatus;
  product: string;
  quantity: number;
  unit: string;
  unit_price: number;
  amount: number;
  buyer_name: string;
  buyer_phone: string;
  buyer_note: string | null;
  seller_note: string | null;
  delivery_address: string;
  delivery_lat: number | null;
  delivery_lon: number | null;
  buyer_live_lat: number | null;
  buyer_live_lng: number | null;
  buyer_live_address: string | null;
  buyer_gps_updated_at: string | null;
  buyer_gps_accuracy: number | null;
  seller_name: string | null;
  seller_phone: string | null;
  seller_district: string | null;
  seller_live_lat: number | null;
  seller_live_lng: number | null;
  seller_live_address: string | null;
  seller_gps_updated_at: string | null;
  seller_gps_accuracy: number | null;
  last_lat: number | null;
  last_lon: number | null;
  last_accuracy: number | null;
  last_at: string | null;
  shipment_live_lat: number | null;
  shipment_live_lng: number | null;
  shipment_gps_updated_at: string | null;
  ship_vehicle: string | null;
  driver_name: string | null;
  driver_phone: string | null;
  shipped_at: string | null;
  pay_first: boolean | null;
  payment_state: string | null;
  payment_ref: string | null;
  escrow_status: 'locked' | 'released' | 'refunded' | null;
  escrow_locked_at: string | null;
  escrow_released_at: string | null;
  escrow_tx_ref: string | null;
  delivered_confirmed_at: string | null;
  category: string | null;
  grade: string | null;
  box_capacity_kg: number | null;
  packing_layers: string | null;
  apples_per_box: string | null;
  payee_name: string | null;
  payee_upi_id: string | null;
  payee_account_number: string | null;
  payee_ifsc: string | null;
  payee_bank_name: string | null;
}

export async function loadAdminOrders(): Promise<AdminOrder[]> {
  const { data, error } = await supabase.rpc('kr_admin_orders');
  if (error) throw new Error(dbMessage(error, 'Could not load the platform orders.'));
  return (data ?? []) as AdminOrder[];
}

const num = (v: number | string | null | undefined) => (v === null || v === undefined ? null : Number(v));
const pinOf = (lat: number | null, lng: number | null) =>
  (lat !== null && Number.isFinite(Number(lat)) && lng !== null && Number.isFinite(Number(lng)) ? { lat: Number(lat), lng: Number(lng) } : null);

const ESCROW_BADGE: Record<string, { label: string; tone: 'amber' | 'green' | 'red' }> = {
  locked: { label: '🔒 Locked in escrow', tone: 'amber' },
  released: { label: '✅ Released to farmer', tone: 'green' },
  refunded: { label: '↩ Refunded to buyer', tone: 'red' },
};

export function AdminOrdersPanel({ canRelease = false, onRefreshed }: { canRelease?: boolean; /** Notifies the console (badge counts). */ onRefreshed?: () => void }) {
  const [orders, setOrders] = useState<AdminOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setOrders(await loadAdminOrders());
      setError(null);
      onRefreshed?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the platform orders.');
      setOrders([]);
    }
  }, [onRefreshed]);

  useEffect(() => {
    let live = true;
    const run = async () => {
      if (live) await load();
    };
    void run();
    const id = window.setInterval(run, 30000);
    return () => {
      live = false;
      window.clearInterval(id);
    };
  }, [load]);

  const escrow = async (o: AdminOrder, action: 'release' | 'refund') => {
    const why = action === 'release' ? `Release ${inr(o.amount)} of the escrow to the farmer? Write why (goes in the audit log):` : `Refund the escrow of ${inr(o.amount)} to ${o.buyer_name}? Write why (goes in the audit log):`;
    const reason = window.prompt(why);
    if (reason === null) return;
    if (!reason.trim() || reason.trim().length < 5) return toast.error('Write why (at least 5 letters) — it is written in the audit log.');
    setBusy(true);
    try {
      await orderEscrow(o.id, action, reason.trim());
      toast.success(action === 'release' ? 'Escrow released to the farmer' : 'Escrow refunded to the buyer');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update the escrow.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel theme={PORTAL_THEMES.admin ?? PORTAL_THEMES.expert} title="📦 All Platform Orders · Live GPS Tracker &amp; Escrow Ledger" className="lg:col-span-2">
      {orders === null ? (
        <Skeleton label="Loading every order…" />
      ) : error ? (
        <p role="alert" className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-800 ring-1 ring-rose-200">{error}</p>
      ) : orders.length === 0 ? (
        <EmptyState theme={PORTAL_THEMES.admin ?? PORTAL_THEMES.expert} icon={Package} title="No orders yet" text="Every order placed across KashRoot appears here — with the seller origin, the buyer destination, both live GPS pins and the escrow ledger." />
      ) : (
        <>
          <p className="mb-3 text-sm text-slate-600">{orders.length} order{orders.length === 1 ? '' : 's'} on the platform — every one of them, newest first.</p>
          <ul className="space-y-4">
            {orders.map((o) => <AdminOrderCard key={o.id} o={o} canRelease={canRelease} busy={busy} onEscrow={escrow} />)}
          </ul>
        </>
      )}
    </Panel>
  );
}

/** The Super Admin's escrow control: release or refund, audited in the database. */
async function orderEscrow(id: string, action: 'release' | 'refund', reason: string): Promise<void> {
  const { error } = await supabase.rpc('kr_admin_escrow', { p_order: id, p_action: action, p_reason: reason });
  if (error) throw new Error(dbMessage(error, 'Could not update the escrow.'));
}

function AdminOrderCard({ o, canRelease, busy, onEscrow }: { o: AdminOrder; canRelease: boolean; busy: boolean; onEscrow: (o: AdminOrder, action: 'release' | 'refund') => void }) {
  const theme = PORTAL_THEMES.admin ?? PORTAL_THEMES.expert;
  const s = ORDER_STATUS[o.status] ?? { label: o.status, tone: 'slate' as const };
  const pin: OrderPin | null = (() => {
    const c = pinOf(num(o.seller_live_lat), num(o.seller_live_lng));
    return c ? { ...c, label: `🟢 Origin · ${o.seller_name ?? 'Farmer'}`, sub: o.seller_live_address ?? o.seller_district ?? null, live: o.seller_gps_updated_at != null && Date.now() - Date.parse(o.seller_gps_updated_at) < 120_000 } : null;
  })();
  const pinCash: OrderPin | null = (() => {
    const c = pinOf(num(o.buyer_live_lat), num(o.buyer_live_lng)) ?? pinOf(num(o.delivery_lat), num(o.delivery_lon));
    return c ? { ...c, label: `🔵 Destination · ${o.buyer_name}`, sub: o.buyer_live_address ?? o.delivery_address, live: o.buyer_gps_updated_at != null && Date.now() - Date.parse(o.buyer_gps_updated_at) < 120_000 } : null;
  })();
  const pinTruck: OrderPin | null = (() => {
    // The moving shipment: shipment_live_* first (kr_order_location writes it
    // next to the legacy last_* columns), last_* as the fallback.
    const c = pinOf(num(o.shipment_live_lat), num(o.shipment_live_lng)) ?? pinOf(num(o.last_lat), num(o.last_lon));
    const at = o.shipment_gps_updated_at ?? o.last_at;
    return c ? { ...c, label: '🚚 Shipment', sub: o.ship_vehicle ?? null, live: at != null && Date.now() - Date.parse(at) < 120_000 } : null;
  })();
  const est = pin && pinCash ? roadEstimate(pin, pinCash) : null;
  const toGo = pinTruck && pinCash ? kmBetween(pinTruck, pinCash) : null;
  const sellerSpot: MapSpot = { name: `${o.seller_name ?? 'Farmer'}${o.seller_district ? `, ${o.seller_district}` : ''}`, lat: pin?.lat ?? null, lng: pin?.lng ?? null };
  const buyerSpot: MapSpot = { name: o.buyer_live_address ?? o.delivery_address, lat: pinCash?.lat ?? null, lng: pinCash?.lng ?? null };
  const esc = o.escrow_status ? ESCROW_BADGE[o.escrow_status] : null;

  return (
    <li className="rounded-2xl bg-white/90 p-4 ring-1 ring-slate-900/10">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-slate-900">{o.quantity} {o.unit} · {o.product}</p>
          <p className="text-sm text-slate-600">
            <strong>{inr(o.amount)}</strong> ({inr(o.unit_price)} per {o.unit}) · {ago(o.created_at)}
            {o.grade ? ` · Grade ${o.grade}` : ''}
            {o.box_capacity_kg ? ` · ${o.box_capacity_kg} kg box` : ''}
            {o.packing_layers ? ` · ${o.packing_layers}` : ''}
            {o.apples_per_box ? ` · ${o.apples_per_box} apples` : ''}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">Order #{o.id.slice(0, 8)} · {o.pay_first ? 'Kissan Tools (pay first)' : 'Escrow order'}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge tone={s.tone}>{s.label}</Badge>
          {esc && <Badge tone={esc.tone}>{esc.label}</Badge>}
        </div>
      </div>

      {/* From where — the seller / origin, with payout details and live GPS. */}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl bg-emerald-50/70 p-3 ring-1 ring-emerald-100">
          <p className="text-xs font-bold uppercase tracking-wide text-emerald-800">From where · Seller / Origin</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">{o.seller_name ?? '—'} {o.seller_district ? <span className="font-normal text-slate-600">· {o.seller_district}</span> : null}</p>
          <p className="text-sm text-slate-700"><a href={`tel:${o.seller_phone ?? ''}`} className="inline-flex items-center gap-1 font-semibold text-sky-800"><Phone className="h-3.5 w-3.5" aria-hidden /> {o.seller_phone ?? '—'}</a></p>
          <p className="mt-1 text-xs text-slate-700">📍 {o.seller_live_address ?? o.seller_district ?? 'No origin GPS yet'}
            {o.seller_live_lat != null && <span className="block font-mono">{Number(o.seller_live_lat).toFixed(5)}, {Number(o.seller_live_lng).toFixed(5)}{o.seller_gps_accuracy ? ` (±${Math.round(Number(o.seller_gps_accuracy))} m)` : ''}</span>}
            {o.seller_gps_updated_at && <span className="block">GPS {ago(o.seller_gps_updated_at)}</span>}
          </p>
          {o.payee_name ? (
            <p className="mt-2 text-xs text-slate-700">🏦 <strong>Payout account:</strong> {o.payee_name} · UPI {o.payee_upi_id ?? '—'} · Bank {o.payee_bank_name ?? '—'} · Acct {o.payee_account_number ?? '—'} · IFSC {o.payee_ifsc ?? '—'}</p>
          ) : (
            <p className="mt-2 text-xs text-slate-500">🏦 No payout account saved yet.</p>
          )}
        </div>

        {/* To whom — the buyer / destination, with live GPS. */}
        <div className="rounded-xl bg-sky-50/70 p-3 ring-1 ring-sky-100">
          <p className="text-xs font-bold uppercase tracking-wide text-sky-800">To whom · Buyer / Destination</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">{o.buyer_name}</p>
          <p className="text-sm text-slate-700"><a href={`tel:${o.buyer_phone}`} className="inline-flex items-center gap-1 font-semibold text-sky-800"><Phone className="h-3.5 w-3.5" aria-hidden /> {o.buyer_phone}</a></p>
          <p className="mt-1 text-xs text-slate-700">📍 {(o.buyer_live_address ?? o.delivery_address) || '—'}
            {o.buyer_live_lat != null && <span className="block font-mono">{Number(o.buyer_live_lat).toFixed(5)}, {Number(o.buyer_live_lng).toFixed(5)}{o.buyer_gps_accuracy ? ` (±${Math.round(Number(o.buyer_gps_accuracy))} m)` : ''}</span>}
            {o.buyer_gps_updated_at && <span className="block">GPS {ago(o.buyer_gps_updated_at)}</span>}
          </p>
          {o.ship_vehicle && <p className="mt-1 text-xs text-slate-700">🚚 {o.ship_vehicle}{o.driver_name ? ` · ${o.driver_name}` : ''}{o.driver_phone ? ` · ${o.driver_phone}` : ''}{o.shipped_at ? ` · shipped ${ago(o.shipped_at)}` : ''}</p>}
        </div>
      </div>

      {(pin || pinCash || pinTruck) && (
        <div className="mt-3 grid gap-1.5">
          <OrderLiveMap seller={pin} transit={pinTruck} buyer={pinCash} />
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
            {est && <span className="font-semibold text-slate-800">🛣 ~{est.km.toFixed(1)} km · ETA ~{Math.max(1, Math.round(est.hours * 60))} min <span className="font-normal text-slate-500">(road estimate)</span></span>}
            {toGo !== null && <span>🚚 {toGo.toFixed(1)} km to go</span>}
            <a href={googleRoute(sellerSpot, buyerSpot)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-bold text-emerald-700 underline underline-offset-2">Open Live Turn-by-Turn Route in Google Maps ↗</a>
          </div>
        </div>
      )}

      {/* The escrow ledger — locked / released / refunded, with the Super Admin's controls. */}
      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
        <ShieldCheck className="h-4 w-4 text-emerald-700" aria-hidden />
        <span className="text-sm text-slate-700">
          {o.escrow_status === 'locked' && <span><strong>🔒 {inr(o.amount)} locked</strong> since {o.escrow_locked_at ? ago(o.escrow_locked_at) : 'the order'}</span>}
          {o.escrow_status === 'released' && <span><strong>✅ Released to farmer</strong>{o.escrow_released_at ? ` · ${ago(o.escrow_released_at)}` : ''}{o.escrow_tx_ref ? ` · UTR ${o.escrow_tx_ref}` : ''}</span>}
          {o.escrow_status === 'refunded' && <span><strong>↩ Refunded to buyer</strong>{o.escrow_released_at ? ` · ${ago(o.escrow_released_at)}` : ''}</span>}
          {!o.escrow_status && <span>No escrow ledger on this order (Kissan Tools orders are paid directly; very old orders predate the ledger)</span>}
          {o.payment_ref && <span className="block text-xs text-slate-500">Payment reference: {o.payment_ref}</span>}
        </span>
        {canRelease && o.escrow_status === 'locked' && (
          <span className="ms-auto flex flex-wrap gap-2">
            <Btn theme={theme} size="sm" disabled={busy} onClick={() => void onEscrow(o, 'release')}>Release to farmer</Btn>
            <Btn theme={theme} size="sm" variant="danger" disabled={busy} onClick={() => void onEscrow(o, 'refund')}>Refund buyer</Btn>
          </span>
        )}
        {!canRelease && o.escrow_status === 'locked' && <span className="ms-auto text-xs text-slate-500">Release / refund: Super Admin only</span>}
      </div>
      {(o.buyer_note || o.seller_note) && (
        <p className="mt-2 text-xs text-slate-600">{o.buyer_note ? `Buyer: ${o.buyer_note}` : ''}{o.buyer_note && o.seller_note ? ' · ' : ''}{o.seller_note ? `Seller: ${o.seller_note}` : ''}</p>
      )}
    </li>
  );
}
