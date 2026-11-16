/**
 * The pooled location, read from real orders only. A buyer's open produce orders that go through the same KashRoot hub are
 * one load: the boxes of several farmers brought together at that hub and sent on to the buyer in one go. Nothing is
 * invented: a step is shown only when the order's own fields say so, and an
 * order the farmer has not yet accepted or packed is "waiting for the farmer". The farmer's board is the same data, from
 * the other side: what needs them now, what is moving, and the latest thing that happened on each order.
 */
import { OPEN_ORDER_STATUSES, type MarketOrder, type PickupStage } from '@/lib/db/market';

/** The steps a box goes through, in order. */
export const POOL_STEPS = ['Ordered', 'Packed', 'Vehicle assigned', 'Picked up', 'At the hub', 'On the road', 'Delivered'] as const;
export type PoolStep = 0 | 1 | 2 | 3 | 4 | 5 | 6;

const STAGE_STEP: Record<PickupStage, PoolStep> = {
  AWAITING_HUB_VEHICLE: 1,
  PICKUP_VEHICLE_ASSIGNED: 2,
  PICKED_UP_FROM_ORCHARD_GATE: 3,
  CONSOLIDATED_AT_KASHROOT_HUB: 4,
  IN_TRANSIT_TO_BUYER: 5,
  DELIVERED: 6,
};

/** Which step this order is at. Orders that never went through the hub pickup stay at "Ordered" until they ship or arrive. */
export function stepOf(o: Pick<MarketOrder, 'status' | 'pickup_stage'>): PoolStep {
  if (o.pickup_stage) return STAGE_STEP[o.pickup_stage];
  if (o.status === 'completed' || o.status === 'delivered' || o.status === 'paid') return 6;
  if (o.status === 'shipped') return 5;
  return 0;
}

/** What each step means to the person reading it, in one short line. */
export const STEP_TEXT: Record<PoolStep, string> = {
  0: 'Waiting for the farmer to accept and pack',
  1: 'Packed: waiting for a KashRoot pickup vehicle',
  2: 'A pickup vehicle is on its way to the orchard',
  3: 'Picked up from the orchard gate, on the way to the hub',
  4: 'At the KashRoot Hub, waiting for the rest of the load',
  5: 'On the road to the buyer',
  6: 'Delivered',
};

/** Open produce orders that are part of a pool: not cancelled, not finished, not the Kissan Tools pay-first kind. */
export const inPool = (o: MarketOrder): boolean => !o.pay_first && OPEN_ORDER_STATUSES.includes(o.status) && o.status !== 'disputed' && o.status !== 'paid';

export interface PooledLoad {
  hub: string;
  lines: MarketOrder[];
  /** Boxes in the load (orders sold by the box); other units are listed but not counted against the truck. */
  boxes: number;
  /** Orders at each step. */
  counts: Record<PoolStep, number>;
  /** The step the whole load is at: the slowest order's. */
  slowest: PoolStep;
  headline: string;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** One plain sentence on where the load stands. */
export function headlineOf(counts: Record<PoolStep, number>, total: number): string {
  if (total === 0) return '';
  if (counts[6] === total) return 'Everything in this load has arrived.';
  const hubbed = counts[4] + counts[5] + counts[6];
  if (counts[5] > 0 && counts[0] + counts[1] + counts[2] + counts[3] === 0) return 'Your boxes are on the road to you.';
  if (hubbed === total) return 'All your boxes are at the hub: they leave for you next.';
  const rest: string[] = [];
  if (counts[0]) rest.push(`${plural(counts[0], 'order')} waiting for the farmer`);
  if (counts[1]) rest.push(`${counts[1]} waiting for a vehicle`);
  if (counts[2]) rest.push(`${counts[2]} with a vehicle on its way to the orchard`);
  if (counts[3]) rest.push(`${counts[3]} on the way to the hub`);
  return `${hubbed} of ${plural(total, 'order')} at the hub or beyond${rest.length ? `; ${rest.join(', ')}` : ''}.`;
}

export const NO_HUB = 'KashRoot hub (not chosen yet)';

/** A buyer's open orders grouped into loads, one per hub; the load with the most still to do first. */
export function pooledLoads(orders: MarketOrder[]): PooledLoad[] {
  const byHub = new Map<string, MarketOrder[]>();
  for (const o of orders) {
    if (!inPool(o)) continue;
    const hub = (o.assigned_hub_name ?? '').trim() || NO_HUB;
    byHub.set(hub, [...(byHub.get(hub) ?? []), o]);
  }
  const loads = [...byHub].map(([hub, lines]): PooledLoad => {
    const counts: Record<PoolStep, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
    for (const l of lines) counts[stepOf(l)] += 1;
    const slowest = (Object.keys(counts) as unknown as PoolStep[]).map(Number).filter((s) => counts[s as PoolStep] > 0).sort((a, b) => a - b)[0] as PoolStep;
    const sorted = [...lines].sort((a, b) => stepOf(a) - stepOf(b) || Date.parse(b.created_at) - Date.parse(a.created_at));
    return {
      hub,
      lines: sorted,
      boxes: lines.filter((l) => l.unit === 'box').reduce((n, l) => n + Number(l.quantity || 0), 0),
      counts,
      slowest,
      headline: headlineOf(counts, lines.length),
    };
  });
  return loads.sort((a, b) => a.slowest - b.slowest || b.lines.length - a.lines.length);
}

// ── the farmer's side ──
export type Need = 'accept' | 'pack' | 'handover' | 'moving' | 'done';

/** What this order needs from the farmer right now. */
export function needOf(o: MarketOrder): Need | null {
  if (o.status === 'cancelled' || o.status === 'rejected') return null;
  if (o.status === 'placed') return 'accept';
  if (o.status === 'accepted' && !o.pickup_stage && !o.boxes_packed_at) return 'pack';
  if (o.pickup_stage === 'AWAITING_HUB_VEHICLE' || o.pickup_stage === 'PICKUP_VEHICLE_ASSIGNED') return 'handover';
  if (o.status === 'completed' || o.pickup_stage === 'DELIVERED') return 'done';
  return 'moving';
}

export const NEED_LABEL: Record<Need, string> = {
  accept: 'New orders: accept or decline',
  pack: 'Accepted: pack the boxes',
  handover: 'Packed: the pickup vehicle is coming',
  moving: 'On the way',
  done: 'Finished',
};

export interface Update {
  at: string;
  text: string;
}

/** The latest thing the order's own timestamps say happened (null when none is recorded). */
export function latestUpdate(o: MarketOrder): Update | null {
  const events: Update[] = [{ at: o.created_at, text: `New order from ${o.buyer_name}: ${o.quantity} ${o.unit}` }];
  if (o.accepted_at) events.push({ at: o.accepted_at, text: 'You accepted the order' });
  if (o.boxes_packed_at) events.push({ at: o.boxes_packed_at, text: 'You marked the boxes packed' });
  if (o.shipped_at) events.push({ at: o.shipped_at, text: 'The load left for the buyer' });
  if (o.delivered_at) events.push({ at: o.delivered_at, text: 'The load reached the buyer' });
  if (o.delivered_confirmed_at) events.push({ at: o.delivered_confirmed_at, text: 'The buyer confirmed the delivery' });
  if (o.escrow_released_at) events.push({ at: o.escrow_released_at, text: 'The escrow was released to you' });
  const valid = events.filter((e) => Number.isFinite(Date.parse(e.at)));
  return valid.sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0] ?? null;
}

/** The farmer's orders grouped by what they need, newest update first inside each group. */
export function farmerBoard(orders: MarketOrder[]): Record<Need, MarketOrder[]> {
  const out: Record<Need, MarketOrder[]> = { accept: [], pack: [], handover: [], moving: [], done: [] };
  for (const o of orders) {
    if (o.pay_first) continue;
    const n = needOf(o);
    if (n) out[n].push(o);
  }
  const at = (o: MarketOrder) => Date.parse(latestUpdate(o)?.at ?? o.created_at) || 0;
  for (const k of Object.keys(out) as Need[]) out[k].sort((a, b) => at(b) - at(a));
  return out;
}
