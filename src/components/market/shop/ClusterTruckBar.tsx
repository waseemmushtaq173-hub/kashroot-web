'use client';

/**
 * The buyer's 2,000-box truck: what the buyer has chosen so far, counted only from real listings.
 * It starts at 0 / 2,000 and adds the boxes the buyer puts on it — each from a listing in
 * market_listings, never more than that listing has in stock. The first listing chosen is the
 * cluster's anchor; every other one shows its real distance from it (lib/clusterConsolidation,
 * from the GPS saved on each listing) or says the listing has no GPS. Nothing here is an order
 * yet: each line is ordered through the normal escrow order (its own Order button).
 */
import { Minus, Plus, ShoppingCart, Trash2, Truck } from 'lucide-react';

import type { ShopListing } from '@/components/market/shop/useLiveListings';
import { inr } from '@/lib/db/client';
import { CLUSTER_RADIUS_KM, TRUCK_CAPACITY_BOXES, computeRealDistanceKm, getNearestVerifiedHub } from '@/lib/clusterConsolidation';

export interface PoolLine {
  listing: ShopListing;
  boxes: number;
}

export function ClusterTruckBar({ lines, anchor, onBoxes, onRemove, onOrder, onClear }: {
  /** In the order the buyer chose them: the first is Order #1. */
  lines: PoolLine[];
  /** The 1st-order anchor (it may be set before anything is on the truck). */
  anchor: ShopListing | null;
  onBoxes: (id: string, boxes: number) => void;
  onRemove: (id: string) => void;
  onOrder: (listing: ShopListing, boxes: number) => void;
  onClear: () => void;
}) {
  const total = lines.reduce((n, l) => n + l.boxes, 0);
  const pct = Math.min(100, (total / TRUCK_CAPACITY_BOXES) * 100);
  const left = Math.max(0, TRUCK_CAPACITY_BOXES - total);
  const value = lines.reduce((n, l) => n + l.boxes * Number(l.listing.price), 0);
  // Where the load is brought together: the hub nearest the anchor's own GPS.
  const anchorHub = anchor ? getNearestVerifiedHub(anchor.captured_lat, anchor.captured_lng) : null;
  const step = 'grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-lg bg-white text-forest ring-1 ring-forest-line disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <section aria-label="2,000-box truck consolidation" data-testid="truck-bar" className="kr-card kr-card-flat rounded-2xl p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-display text-lg font-semibold text-forest">
          <Truck className="h-5 w-5" aria-hidden /> 2,000-Box Truck Consolidation
        </h3>
        {lines.length > 0 && (
          <button type="button" onClick={onClear} className="min-h-11 cursor-pointer rounded-xl px-3 text-sm font-semibold text-[#991B1B] hover:bg-[#FEE2E2]">Empty the truck</button>
        )}
      </div>
      <p className="mt-1 text-sm font-semibold text-[#1E2D28]" data-testid="truck-load">
        Current Truck Load: {total.toLocaleString('en-IN')} / {TRUCK_CAPACITY_BOXES.toLocaleString('en-IN')} Boxes ({pct.toFixed(pct > 0 && pct < 10 ? 1 : 0)}%)
      </p>
      <div className="mt-2 h-3 overflow-hidden rounded-full bg-forest-soft ring-1 ring-forest-line" aria-hidden>
        <span className="block h-full rounded-full bg-gradient-to-r from-forest-mid to-forest" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 text-xs text-[#52665E]">
        {total === 0
          ? 'The truck is empty. It counts only the boxes you add from real listings below (“Add boxes to truck” on a listing sold by the box).'
          : left > 0
            ? `${left.toLocaleString('en-IN')} more boxes fill a dedicated ${TRUCK_CAPACITY_BOXES.toLocaleString('en-IN')}-box highway truck. A part load can go on the hub’s consolidated truck instead.`
            : 'The truck is full: no more boxes can be added to this load.'}
      </p>

      {anchor && (
        <p className="mt-3 rounded-xl bg-forest-soft px-3 py-2 text-sm text-forest ring-1 ring-forest-line">
          <strong>1st Order Anchor:</strong> {anchor.product}{anchor.variety ? ` · ${anchor.variety}` : ''} from {anchor.seller_name}, {anchor.district}.{' '}
          {anchorHub
            ? <>Assigned Nearest KashRoot Hub: <strong>{anchorHub.hub.name}</strong> ({anchorHub.distanceKm.toFixed(1)} km from the anchor’s orchard GPS).</>
            : 'Orchard GPS not recorded on this listing, so no distance or hub can be worked out from it.'}
        </p>
      )}

      {lines.length > 0 && (
        <ol className="mt-3 space-y-2">
          {lines.map((l, i) => {
            const isAnchor = anchor?.id === l.listing.id;
            const km = anchor && !isAnchor ? computeRealDistanceKm(anchor.captured_lat, anchor.captured_lng, l.listing.captured_lat, l.listing.captured_lng) : null;
            const max = Math.max(1, Math.min(Number(l.listing.quantity), l.boxes + left));
            return (
              <li key={l.listing.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-white px-3 py-2 ring-1 ring-forest-line" data-kr-plain>
                <span className="min-w-0 flex-1 text-sm text-[#1E2D28]">
                  <strong>Order #{i + 1}</strong>
                  {' — '}
                  {isAnchor ? 'Anchor' : km !== null ? `${km.toFixed(1)} km from Order #1${km > CLUSTER_RADIUS_KM ? ` (outside the ${CLUSTER_RADIUS_KM} km cluster)` : ''}` : anchor ? 'Orchard GPS not recorded on this listing' : 'no anchor set'}
                  <span className="block text-xs text-[#52665E]">{l.listing.product}{l.listing.variety ? ` · ${l.listing.variety}` : ''} · {l.listing.seller_name}, {l.listing.district} · {inr(l.listing.price)} a box · {Number(l.listing.quantity).toLocaleString('en-IN')} in stock</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <button type="button" aria-label="One box fewer" className={step} disabled={l.boxes <= 1} onClick={() => onBoxes(l.listing.id, l.boxes - 1)}><Minus className="h-4 w-4" aria-hidden /></button>
                  <input
                    type="number"
                    inputMode="numeric"
                    aria-label={`Boxes from ${l.listing.seller_name}`}
                    min={1}
                    max={max}
                    value={l.boxes}
                    onChange={(e) => onBoxes(l.listing.id, Math.min(max, Math.max(1, Math.floor(Number(e.target.value)) || 1)))}
                    className="h-9 w-20 rounded-lg border-0 bg-white px-2 text-center text-sm font-bold tabular-nums text-[#1E2D28] ring-1 ring-inset ring-forest-line"
                  />
                  <button type="button" aria-label="One box more" className={step} disabled={l.boxes >= max} onClick={() => onBoxes(l.listing.id, l.boxes + 1)}><Plus className="h-4 w-4" aria-hidden /></button>
                </span>
                <span className="w-24 text-right text-sm font-bold tabular-nums text-forest">{inr(l.boxes * Number(l.listing.price))}</span>
                <button type="button" onClick={() => onOrder(l.listing, l.boxes)} className="kr-btn-primary kr-btn-sm min-h-9">
                  <ShoppingCart className="h-3.5 w-3.5" aria-hidden /> Order
                </button>
                <button type="button" aria-label={`Take ${l.listing.product} from ${l.listing.seller_name} off the truck`} onClick={() => onRemove(l.listing.id)} className="grid h-9 w-9 cursor-pointer place-items-center rounded-lg text-[#52665E] hover:bg-[#FEE2E2] hover:text-[#991B1B]">
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </li>
            );
          })}
        </ol>
      )}
      {lines.length > 0 && (
        <p className="mt-3 text-sm text-[#1E2D28]">
          Boxes subtotal on the truck: <strong>{inr(value)}</strong>. Each line is ordered on its own (its Order button), so each grower has their own escrow order.
        </p>
      )}
    </section>
  );
}
