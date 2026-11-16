/**
 * Hub desk: what is waiting at, or heading to, each KashRoot hub, counted from real orders that have an orchard-gate
 * pickup (market_orders.pickup_stage). A load is the order's boxes; "open" means not yet delivered. Nothing is estimated:
 * an order with no hub recorded is listed under "Hub not recorded" so it is never lost, and quantities are summed per unit
 * (a box is never added to a kilo). Pure, so it can be tested without a database.
 */
import type { PickupStage } from '@/lib/db/market';

export const NO_HUB = 'Hub not recorded';

export interface LoadOrder {
  pickup_stage?: PickupStage | null;
  assigned_hub_name?: string | null;
  quantity: number | string;
  unit: string;
}

export interface HubLoad {
  hub: string;
  /** Every order with a pickup at this hub, delivered or not. */
  orders: number;
  /** Not yet delivered. */
  open: number;
  /** Quantity of the open orders, per unit ("box": 640). */
  quantity: Record<string, number>;
  /** Orders per pickup step. */
  byStage: Partial<Record<PickupStage, number>>;
}

export function hubLoads(orders: LoadOrder[]): HubLoad[] {
  const byHub = new Map<string, HubLoad>();
  for (const o of orders) {
    if (!o.pickup_stage) continue;
    const hub = (o.assigned_hub_name ?? '').trim() || NO_HUB;
    const row = byHub.get(hub) ?? { hub, orders: 0, open: 0, quantity: {}, byStage: {} };
    row.orders += 1;
    row.byStage[o.pickup_stage] = (row.byStage[o.pickup_stage] ?? 0) + 1;
    if (o.pickup_stage !== 'DELIVERED') {
      row.open += 1;
      const q = Number(o.quantity);
      const unit = (o.unit ?? '').trim() || 'units';
      if (Number.isFinite(q) && q > 0) row.quantity[unit] = (row.quantity[unit] ?? 0) + q;
    }
    byHub.set(hub, row);
  }
  return [...byHub.values()].sort((a, b) => b.open - a.open || a.hub.localeCompare(b.hub));
}
