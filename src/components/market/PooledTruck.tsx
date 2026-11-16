'use client';

/**
 * Buyer portal → Pooled truck: the buyer's open produce orders brought together by KashRoot hub, as the load that will be
 * sent to them in one truck. For each load: how many boxes of the 2,000 the truck holds, where every farmer's boxes are
 * (ordered, packed, vehicle assigned, picked up, at the hub, on the road, delivered), the pickup vehicle and driver, and the
 * truck on a map once it is moving. Read from the orders themselves (lib/pooledLoads): nothing is estimated. The list
 * refreshes with the buyer's orders every 30 seconds.
 */
import dynamic from 'next/dynamic';
import { Phone, Truck } from 'lucide-react';

import type { OrderPin } from '@/components/market/OrderLiveMap';
import { Badge, Btn, EmptyState, PORTAL_THEMES, Panel } from '@/components/portal/kit';
import { ago, inr } from '@/lib/db/client';
import type { MarketOrder } from '@/lib/db/market';
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

/** The truck's position, from whichever order of the load is on the road and has reported one. */
function truckPin(load: PooledLoad): OrderPin | null {
  const o = load.lines.find((l) => stepOf(l) === 5 && coord(l.shipment_live_lat ?? l.last_lat, l.shipment_live_lng ?? l.last_lon));
  if (!o) return null;
  const c = coord(o.shipment_live_lat ?? o.last_lat, o.shipment_live_lng ?? o.last_lon)!;
  const at = o.shipment_gps_updated_at ?? o.last_at;
  return { ...c, label: '🚚 The truck', sub: [o.pickup_vehicle_number ?? o.ship_vehicle, at ? (nowish(at) ? 'Live now' : `Last seen ${ago(at)}`) : null].filter(Boolean).join(' · ') || null, live: nowish(at) };
}
function buyerPin(load: PooledLoad): OrderPin | null {
  const o = load.lines[0];
  const c = coord(o.buyer_live_lat, o.buyer_live_lng) ?? coord(o.delivery_lat, o.delivery_lon);
  return c ? { ...c, label: '🔵 Your place', sub: o.buyer_live_address ?? o.delivery_address } : null;
}

export function PooledTruck({ orders, onOpenOrders, onShop }: { orders: MarketOrder[] | null; onOpenOrders: () => void; onShop: () => void }) {
  if (orders === null) return <div className="h-40 animate-pulse rounded-2xl bg-slate-100" aria-hidden />;
  const loads = pooledLoads(orders);
  if (loads.length === 0) {
    return (
      <Panel theme={theme} title="Pooled truck" icon={Truck}>
        <EmptyState
          theme={theme}
          icon={Truck}
          title="No pooled load yet"
          text="Add boxes from several farmers on the truck in Buy apples & produce, and order each one. KashRoot brings them to a hub and sends you one truck: you follow every farmer's boxes here."
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
  const pct = Math.min(100, Math.round((load.boxes / load.capacity) * 100));
  const truck = truckPin(load);
  const you = buyerPin(load);
  return (
    <Panel theme={theme} title={`Load via ${load.hub}`} icon={Truck}>
      <p className="font-semibold text-slate-900">{load.headline}</p>
      <div className="mt-2">
        <p className="flex justify-between text-sm"><span><strong>{load.boxes.toLocaleString('en-IN')}</strong> boxes in this load</span><span className="text-slate-500">truck holds {load.capacity.toLocaleString('en-IN')}</span></p>
        <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-slate-100" role="meter" aria-valuenow={load.boxes} aria-valuemin={0} aria-valuemax={load.capacity} aria-label="Boxes in the truck">
          <div className="h-full rounded-full bg-forest-deep" style={{ width: `${pct}%` }} />
        </div>
      </div>

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
          return (
            <li key={o.id} className="rounded-xl bg-white p-3 ring-1 ring-slate-900/10">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900">{o.quantity} {o.unit} · {o.product}</p>
                  <p className="text-sm text-slate-600">{o.seller_name ?? 'The farmer'}{o.seller_district ? `, ${o.seller_district}` : ''} · {inr(o.amount)} · ordered {ago(o.created_at)}</p>
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
          <p className="mb-1 text-sm font-semibold text-slate-900">Where the truck is</p>
          <OrderLiveMap seller={null} transit={truck} buyer={you} />
        </div>
      ) : (
        load.slowest <= 4 && <p className="mt-3 text-xs text-slate-600">The map appears here once the truck leaves the hub and its driver’s phone shares the position.</p>
      )}
      <div className="mt-3">
        <Btn theme={theme} variant="soft" onClick={onOpenOrders}>Open my orders (to confirm delivery and pay)</Btn>
      </div>
    </Panel>
  );
}
