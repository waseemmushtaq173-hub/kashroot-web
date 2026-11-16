/**
 * The hub's inbox: orders that are coming to a KashRoot hub and have not been picked up from the orchard yet, so the hub
 * knows what is ordered, where the orchard is, how far it is from the hub, and which ones are packed and need a vehicle
 * now. Read from the orders' own fields (kr_admin_orders) and the orchard's real GPS; an order with no GPS shows no
 * distance and no route, never a guess. Pure, so it is tested without a database.
 */
import type { PickupStage } from '@/lib/db/market';
import { directionsTo, hubByName, hubOfListing, kmFromHub, type Hub } from '@/lib/hubs';

export interface IncomingOrder {
  id: string;
  created_at: string;
  status: string;
  product: string;
  quantity: number | string;
  unit: string;
  pay_first?: boolean | null;
  pickup_stage?: PickupStage | null;
  assigned_hub_name?: string | null;
  boxes_packed_at?: string | null;
  seller_district?: string | null;
  seller_live_lat?: number | string | null;
  seller_live_lng?: number | string | null;
  seller_live_address?: string | null;
  pickup_vehicle_number?: string | null;
}

export type Phase = 'needs_vehicle' | 'vehicle_coming' | 'packing' | 'new';

export interface Incoming<T extends IncomingOrder = IncomingOrder> {
  order: T;
  code: string;
  phase: Phase;
  /** The hub the order is assigned to, or (when none is recorded) the hub nearest the orchard. */
  hub: Hub | null;
  /** True when the hub was worked out from the orchard's GPS because the order has none recorded. */
  hubGuessed: boolean;
  /** Real km from the hub to the orchard; null without the orchard's GPS. */
  km: number | null;
  /** Google Maps directions to the orchard; null without GPS. */
  navigate: string | null;
}

export const PHASE_TEXT: Record<Phase, string> = {
  needs_vehicle: 'Packed: send a vehicle',
  vehicle_coming: 'A vehicle is on its way',
  packing: 'Accepted: the farmer is packing',
  new: 'New: waiting for the farmer',
};
const PHASE_RANK: Record<Phase, number> = { needs_vehicle: 0, new: 1, packing: 2, vehicle_coming: 3 };

const num = (v: number | string | null | undefined) => (v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);
/** The first eight letters and digits of the order's id, in capitals: the code the emails use. */
export const orderCode = (id: string) => id.replace(/-/g, '').slice(0, 8).toUpperCase();

/** Where an order stands for the hub; null when it is not the hub's concern any more (picked up, finished, cancelled, or a Kissan Tools order). */
export function phaseOf(o: IncomingOrder): Phase | null {
  if (o.pay_first) return null;
  if (o.status === 'cancelled' || o.status === 'rejected' || o.status === 'completed' || o.status === 'delivered' || o.status === 'disputed') return null;
  if (o.pickup_stage === 'AWAITING_HUB_VEHICLE') return 'needs_vehicle';
  if (o.pickup_stage === 'PICKUP_VEHICLE_ASSIGNED') return 'vehicle_coming';
  if (o.pickup_stage) return null; // picked up, at the hub, on the road, delivered: the hub desk table below has these
  if (o.status === 'placed') return 'new';
  if (o.status === 'accepted') return o.boxes_packed_at ? 'needs_vehicle' : 'packing';
  return null;
}

export function incomingOrders<T extends IncomingOrder>(orders: T[]): Incoming<T>[] {
  const rows: Incoming<T>[] = [];
  for (const order of orders) {
    const phase = phaseOf(order);
    if (!phase) continue;
    const lat = num(order.seller_live_lat);
    const lng = num(order.seller_live_lng);
    const named = hubByName(order.assigned_hub_name);
    const near = named ? null : hubOfListing({ captured_lat: lat, captured_lng: lng });
    const hub = named ?? near?.hub ?? null;
    rows.push({
      order,
      code: orderCode(order.id),
      phase,
      hub,
      hubGuessed: !named && near !== null,
      km: hub ? kmFromHub(hub, lat, lng) : null,
      navigate: directionsTo(lat, lng),
    });
  }
  return rows.sort((a, b) => PHASE_RANK[a.phase] - PHASE_RANK[b.phase] || Date.parse(b.order.created_at) - Date.parse(a.order.created_at));
}

/** How many orders need the hub to act now (the number to put on the Hub's tab). */
export const needsVehicleCount = (orders: IncomingOrder[]): number => orders.filter((o) => phaseOf(o) === 'needs_vehicle').length;
