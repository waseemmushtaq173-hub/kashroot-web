'use client';

/**
 * Buyer portal → Pooled location: the buyer's open produce orders brought together at each KashRoot hub. For each hub: how far
 * it is from the buyer, where every farmer's boxes are (ordered, packed, vehicle assigned, picked up, at the hub, on the
 * road, delivered) and how far each orchard is from the hub, the pickup vehicle and its driver, and the boxes on a map once
 * they are moving. Read from the orders themselves (lib/pooledLoads) and their GPS: nothing is estimated. The list refreshes
 * with the buyer's orders every 30 seconds.
 */
import dynamic from 'next/dynamic';
import { Phone, Truck } from 'lucide-react';

import type { OrderPin } from '@/components/market/OrderLiveMap';
import { Badge, Btn, EmptyState, PORTAL_THEMES, Panel } from '@/components/portal/kit';
import { ago, inr } from '@/lib/db/client';
import type { MarketOrder } from '@/lib/db/market';
import { hubByName, kmFromHub } from '@/lib/hubs';
import { POOL_STEPS, STEP_TEXT, pooledLoads, stepOf, type PoolStep, type PooledLoad } from '@/lib/pooledLoads';

const theme = PORTAL_THEMES.buyer;
const OrderLiveMap = dynamic(() => import('@/components/market/OrderLiveMap').then((m) => m.default), {
  ssr: false,
  loading: () => <div className="h-64 w-full animate-pulse rounded-xl bg-slate-100" aria-hidden />,
});

const coord = (lat?: number | null, lng?: number | null) =>
  typeof lat === 'number' && Number.isFinite(lat) && typeof lng === 'number' && Number.isFinite(lng) ? { lat, lng } : null;
const nowish = (at?: string | null) => Boolean(at) && Date.now() - Date.parse(at as string) < 120_000;
const TONE = (s: PoolStep): 'amber' | 'blue' | 'violet' | 'green' => (s === 6 ? 'green' : s >= 4 ? 'violet' : s >= 1 ? 'blue' : 'amber');

/** The boxes' position, from whichever order of the load is on the road and has reported one. */
function truckPin(load: PooledLoad): OrderPin | null {
  const o = load.lines.find((l) => stepOf(l) === 5 && coord(l.shipment_live_lat ?? l.last_lat, l.shipment_live_lng ?? l.last_lon));
  if (!o) return null;
  const c = coord(o.shipment_live_lat ?? o.last_lat, o.shipment_live_lng ?? o.last_lon)!;
  const at = o.shipment_gps_updated_at ?? o.last_at;
  return { ...c, label: '🚚 Your boxes', sub: [o.pickup_vehicle_number ?? o.ship_vehicle, at ? (nowish(at) ? 'Live now' : `Last seen ${ago(at)}`) : null].filter(Boolean).join(' · ') || null, live: nowish(at) };
}
function buyerPin(load: PooledLoad): OrderPin | null {
  const o = load.lines[0];
  const c = coord(o.buyer_live_lat, o.buyer_live_lng) ?? coord(o.delivery_lat, o.delivery_lon);
  return c ? { ...c, label: '🔵 Your place', sub: o.buyer_live_address ?? o.delivery_address } : null;
}

export function PooledLocation({ orders, onOpenOrders, onShop }: { orders: MarketOrder[] | null; onOpenOrders: () => void; onShop: () => void }) {
  if (orders === null) return <div className="h-40 animate-pulse rounded-2xl bg-slate-100" aria-hidden />;
  const loads = pooledLoads(orders);
  if (loads.length === 0) {
    return (
      <Panel theme={theme} title="Pooled location" icon={Truck}>
        <EmptyState
          theme={theme}
          icon={Truck}
          title="No order at a pooled location yet"
          text="Choose a hub in Buy apples & produce and buy from farmers near it. You follow their boxes here."
          action={<Btn theme={theme} onClick={onShop}>Buy apples &amp; produce</Btn>}
        />
      </Panel>
    );
  }
  return (
    <div className="space-y-4">
      {loads.map((load) => <Load key={load.hub} load={load} onOpenOrders={onOpenOrders} />)}
    </div>
  );
}

function Load({ load, onOpenOrders }: { load: PooledLoad; onOpenOrders: () => void }) {
  const hub = hubByName(load.hub);
  const first = load.lines[0];
  const hubToYou = hub ? kmFromHub(hub, first.buyer_live_lat ?? first.delivery_lat, first.buyer_live_lng ?? first.delivery_lon) : null;
  const truck = truckPin(load);
  const you = buyerPin(load);
  return (
    <Panel theme={theme} title={`Pooled location: ${load.hub}`} icon={Truck}>
      <p className="font-semibold text-slate-900">{load.headline}</p>
      <p className="mt-1 text-sm text-slate-700">
        <strong>{load.boxes.toLocaleString('en-IN')}</strong> boxes at this location{hub ? ` · ${hub.locationName}, ${hub.district}` : ''}
        {hubToYou !== null ? <> · the hub is <strong>{hubToYou} km</strong> from you</> : ''}
      </p>

      <ol className="mt-3 grid grid-cols-2 gap-1.5 text-center sm:grid-cols-7" aria-label="Orders at each step">
        {POOL_STEPS.map((name, i) => (
          <li key={name} className={`rounded-lg px-1.5 py-1.5 text-xs ring-1 ${load.counts[i as PoolStep] > 0 ? 'bg-forest-soft font-semibold text-forest-deep ring-forest-line' : 'bg-white text-slate-500 ring-slate-200'}`}>
            <span className="block text-base font-extrabold tabular-nums">{load.counts[i as PoolStep]}</span>
            {name}
          </li>
        ))}
      </ol>

      <ul className="mt-4 !list-none space-y-2 !pl-0">
        {load.lines.map((o) => {
          const step = stepOf(o);
          const orchardKm = hub ? kmFromHub(hub, o.seller_live_lat, o.seller_live_lng) : null;
          return (
            <li key={o.id} className="rounded-xl bg-white p-3 ring-1 ring-slate-900/10">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900">{o.quantity} {o.unit} · {o.product}</p>
                  <p className="text-sm text-slate-600">{o.seller_name ?? 'The farmer'}{o.seller_district ? `, ${o.seller_district}` : ''} · {inr(o.amount)} · ordered {ago(o.created_at)}{orchardKm !== null ? ` · orchard ${orchardKm} km from the hub` : ''}</p>
                </div>
                <Badge tone={TONE(step)}>{POOL_STEPS[step]}</Badge>
              </div>
              <p className="mt-1 text-sm text-slate-800">{STEP_TEXT[step]}.</p>
              {(o.pickup_vehicle_number || o.pickup_driver_name) && step >= 2 && step <= 3 && (
                <p className="mt-1 text-sm text-slate-700">
                  Pickup vehicle {o.pickup_vehicle_number ? <strong className="font-mono">{o.pickup_vehicle_number}</strong> : ''}{o.pickup_driver_name ? ` · driver ${o.pickup_driver_name}` : ''}
                  {o.pickup_driver_phone && <> · <a href={`tel:${o.pickup_driver_phone}`} className="inline-flex min-h-11 items-center gap-1 font-semibold text-forest-deep underline underline-offset-2"><Phone className="h-3.5 w-3.5" aria-hidden /> {o.pickup_driver_phone}</a></>}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      {truck ? (
        <div className="mt-4">
          <p className="mb-1 text-sm font-semibold text-slate-900">Where your boxes are</p>
          <OrderLiveMap seller={null} transit={truck} buyer={you} />
        </div>
      ) : (
        load.slowest <= 4 && <p className="mt-3 text-xs text-slate-600">The map appears here once your boxes leave the hub and the driver’s phone shares its position.</p>
      )}
      <div className="mt-3">
        <Btn theme={theme} variant="soft" onClick={onOpenOrders}>Open my orders (to confirm delivery and pay)</Btn>
      </div>
    </Panel>
  );
}
