'use client';

/**
 * Farmer portal → Pickups & updates: what needs the farmer now (new orders to accept, boxes to pack, the pickup vehicle that
 * is coming), what is on the way, and the latest thing that happened on each order, with "New" on what changed since the
 * farmer last looked. Read from the orders themselves (lib/pooledLoads); the buttons to act (accept, pack, read the
 * handover code to the driver) are on the order, one tap away under Orders. Refreshes with the farmer's orders every 30 seconds.
 */
import { useEffect, useState } from 'react';
import { MapPin, PackageCheck, Phone, Truck } from 'lucide-react';

import { Badge, Btn, EmptyState, PORTAL_THEMES, Panel } from '@/components/portal/kit';
import { ago, inr } from '@/lib/db/client';
import type { MarketListing, MarketOrder } from '@/lib/db/market';
import { CLUSTER_RADIUS_KM, hubOfListing, hubPlace } from '@/lib/hubs';
import { NEED_LABEL, STEP_TEXT, farmerBoard, latestUpdate, stepOf, type Need } from '@/lib/pooledLoads';

const theme = PORTAL_THEMES.farmer;
const KEY = 'kr_farmer_updates_seen';
const ORDER: Need[] = ['accept', 'pack', 'handover', 'moving', 'done'];
const TONE: Record<Need, 'amber' | 'violet' | 'blue' | 'green'> = { accept: 'amber', pack: 'amber', handover: 'violet', moving: 'blue', done: 'green' };
const HINT: Partial<Record<Need, string>> = {
  accept: 'Open the order to accept or decline it.',
  pack: 'Pack the boxes, then open the order and press that the boxes are packed: KashRoot sends a pickup vehicle.',
  handover: 'When the driver is at your gate and has loaded the boxes, open the order and read them your 6-digit handover code.',
};

/** When the farmer last looked at this page (null the first time). */
const readSeen = (): number | null => {
  try {
    const v = Number(localStorage.getItem(KEY));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
};

/** How many orders need the farmer now (the number on the tab). */
export function needsYouCount(orders: MarketOrder[]): number {
  const b = farmerBoard(orders);
  return b.accept.length + b.pack.length + b.handover.length;
}

/**
 * "A KashRoot hub is near you": for each of the farmer's listings that has the orchard's GPS, the nearest hub and the real
 * distance to it. A listing with no GPS gets no number: it says what to do to get one.
 */
export function HubNearby({ products, limit, onMore }: { products: MarketListing[]; /** Show only this many listings (the overview is short); the rest are on the Pickups tab. */ limit?: number; onMore?: () => void }) {
  const live = products.filter((p) => p.active && Number(p.quantity) > 0);
  if (live.length === 0) return null;
  const rows = live.map((p) => ({ p, near: hubOfListing(p) }));
  const located = rows.filter((r) => r.near);
  const without = rows.length - located.length;
  const shown = limit ? located.slice(0, limit) : located;
  return (
    <Panel theme={theme} title="KashRoot hub near your orchard" icon={MapPin}>
      {located.length > 0 ? (
        <ul className="!list-none space-y-2 !pl-0" aria-label="Distance from your orchard to the nearest KashRoot hub">
          {shown.map(({ p, near }) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white p-3 ring-1 ring-slate-900/10">
              <div className="min-w-0">
                <p className="font-semibold text-slate-900">{p.product}{p.variety ? ` · ${p.variety}` : ''}</p>
                <p className="text-sm text-slate-700">
                  {near!.within
                    ? `The KashRoot hub at ${hubPlace(near!.hub)} is ${near!.km} km from your orchard. A KashRoot vehicle collects from your gate (pickup area: ${CLUSTER_RADIUS_KM} km).`
                    : `The nearest KashRoot hub, ${hubPlace(near!.hub)}, is ${near!.km} km away: outside its ${CLUSTER_RADIUS_KM} km pickup area, so ask the KashRoot team about a pickup.`}
                </p>
              </div>
              <Badge tone={near!.within ? 'green' : 'amber'}>{near!.within ? 'Hub nearby' : 'Far from a hub'}</Badge>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-700">Your listings have no orchard location yet, so KashRoot cannot say how far a hub is. Edit a listing and take the photo at the orchard with location switched on: the distance appears here.</p>
      )}
      {located.length > shown.length && onMore && (
        <p className="mt-2 text-sm"><button type="button" onClick={onMore} className="min-h-11 cursor-pointer font-semibold text-forest-deep underline underline-offset-2">See the other {located.length - shown.length} listing{located.length - shown.length === 1 ? '' : 's'}</button></p>
      )}
      {located.length > 0 && without > 0 && <p className="mt-2 text-xs text-slate-600">{without} of your listings have no orchard location, so no distance is shown for them.</p>}
      <p className="mt-2 text-xs text-slate-600">When a buyer orders, the KashRoot hub is told at once and a vehicle is sent to your orchard’s location after you pack the boxes.</p>
    </Panel>
  );
}

export function FarmerUpdates({ orders, products = [], onOpenOrders }: { orders: MarketOrder[] | null; products?: MarketListing[]; onOpenOrders: () => void }) {
  // What "new" means during this visit: anything after the last visit. The time is saved when the page is left.
  const [seen] = useState<number | null>(() => readSeen());
  useEffect(
    () => () => {
      try {
        localStorage.setItem(KEY, String(Date.now()));
      } catch {
        /* a private window: nothing is remembered */
      }
    },
    [],
  );
  if (orders === null) return <div className="h-40 animate-pulse rounded-2xl bg-slate-100" aria-hidden />;
  const board = farmerBoard(orders);
  const total = ORDER.reduce((n, k) => n + board[k].length, 0);
  if (total === 0) {
    return (
      <div className="space-y-4">
        <HubNearby products={products} />
        <Panel theme={theme} title="Pickups & updates" icon={Truck}>
          <EmptyState theme={theme} icon={Truck} title="No orders yet" text="When a buyer orders your boxes, it appears here." />
        </Panel>
      </div>
    );
  }
  const isNew = (o: MarketOrder) => {
    const at = Date.parse(latestUpdate(o)?.at ?? '');
    return seen !== null && Number.isFinite(at) && at > seen;
  };

  return (
    <div className="space-y-4">
      <HubNearby products={products} />
      <Panel theme={theme} title="Pickups & updates" icon={Truck}>
        <ul className="grid !list-none grid-cols-2 gap-2 !pl-0 sm:grid-cols-4" aria-label="Orders by what they need">
          {(['accept', 'pack', 'handover', 'moving'] as Need[]).map((k) => (
            <li key={k} className={`rounded-xl p-3 ring-1 ${board[k].length && k !== 'moving' ? 'bg-amber-50 ring-amber-200' : 'bg-white ring-slate-200'}`}>
              <span className="block text-2xl font-extrabold tabular-nums text-slate-900">{board[k].length}</span>
              <span className="text-xs font-semibold text-slate-700">{NEED_LABEL[k]}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-slate-600">The page refreshes by itself every 30 seconds. Accepting, packing and the handover code are on each order: tap “Open the order”.</p>
      </Panel>

      {ORDER.filter((k) => board[k].length > 0).map((k) => (
        <Panel key={k} theme={theme} title={`${NEED_LABEL[k]} (${board[k].length})`} icon={k === 'moving' || k === 'done' ? Truck : PackageCheck}>
          {HINT[k] && <p className="mb-2 text-sm text-slate-700">{HINT[k]}</p>}
          <ul className="!list-none space-y-2 !pl-0">
            {board[k].map((o) => {
              const u = latestUpdate(o);
              return (
                <li key={o.id} className="rounded-xl bg-white p-3 ring-1 ring-slate-900/10">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900">{o.quantity} {o.unit} · {o.product} · {inr(o.amount)}</p>
                      <p className="text-sm text-slate-600">For {o.buyer_name}{o.assigned_hub_name ? ` · via ${o.assigned_hub_name}` : ''}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {isNew(o) && <Badge tone="red">New</Badge>}
                      <Badge tone={TONE[k]}>{k === 'done' ? 'Finished' : STEP_TEXT[stepOf(o)].split(':')[0].split(',')[0]}</Badge>
                    </div>
                  </div>
                  {u && <p className="mt-1 text-sm text-slate-800">{u.text} · <span className="text-slate-600">{ago(u.at)}</span></p>}
                  {k === 'handover' && o.pickup_vehicle_number && (
                    <p className="mt-1 text-sm text-slate-700">
                      Pickup vehicle <strong className="font-mono">{o.pickup_vehicle_number}</strong>{o.pickup_driver_name ? ` · driver ${o.pickup_driver_name}` : ''}
                      {o.pickup_driver_phone && <> · <a href={`tel:${o.pickup_driver_phone}`} className="inline-flex min-h-11 items-center gap-1 font-semibold text-forest-deep underline underline-offset-2"><Phone className="h-3.5 w-3.5" aria-hidden /> {o.pickup_driver_phone}</a></>}
                    </p>
                  )}
                  {k !== 'done' && <div className="mt-2"><Btn theme={theme} variant={k === 'moving' ? 'ghost' : 'soft'} onClick={onOpenOrders}>Open the order</Btn></div>}
                </li>
              );
            })}
          </ul>
        </Panel>
      ))}
    </div>
  );
}
