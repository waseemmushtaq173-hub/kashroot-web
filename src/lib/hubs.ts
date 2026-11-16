/**
 * Pooled locations: a KashRoot hub and the orchards within CLUSTER_RADIUS_KM of it. Every distance here is the straight-line
 * distance between two real GPS points (the orchard's, saved on its listing; the hub's; the buyer's, when they share it):
 * a point that is missing gives no number, never a guessed one. The buyer reads how far the hub is from the produce before
 * buying; the farmer reads how far the hub is from their orchard; the hub's vehicle gets the orchard's location to drive to.
 */
import { CLUSTER_RADIUS_KM, VERIFIED_JK_HUBS, computeRealDistanceKm, getNearestVerifiedHub, isValidCoordinate, type VerifiedHorticultureHub } from '@/lib/clusterConsolidation';

export { CLUSTER_RADIUS_KM, VERIFIED_JK_HUBS, isValidCoordinate };
export type Hub = VerifiedHorticultureHub;

export interface Located {
  captured_lat?: number | null;
  captured_lng?: number | null;
}
export interface Stocked extends Located {
  seller_id: string;
  quantity: number | string;
  unit: string;
}

export const hubByName = (name: string | null | undefined): Hub | null => VERIFIED_JK_HUBS.find((h) => h.name === (name ?? '').trim()) ?? null;
export const hubById = (id: string | null | undefined): Hub | null => VERIFIED_JK_HUBS.find((h) => h.id === id) ?? null;
/** "Aglar, Shopian" — where the hub is, without its long name. */
export const hubPlace = (h: Hub) => h.locationName;

/** Real km from a hub to a point; null when the point has no GPS. */
export const kmFromHub = (hub: Hub, lat: number | null | undefined, lng: number | null | undefined): number | null => computeRealDistanceKm(hub.lat, hub.lng, lat, lng);

/** The hub nearest a listing's orchard, how far it is, and whether the orchard is inside its pickup area. Null without GPS. */
export function hubOfListing(l: Located): { hub: Hub; km: number; within: boolean } | null {
  const near = getNearestVerifiedHub(l.captured_lat, l.captured_lng);
  return near ? { hub: near.hub, km: near.distanceKm, within: near.distanceKm <= CLUSTER_RADIUS_KM } : null;
}

export interface HubReach {
  hub: Hub;
  /** Different farmers with produce inside this hub's pickup area. */
  farmers: number;
  /** Listings inside the area, and the boxes among them (a listing sold by the kilo is not counted as boxes). */
  listings: number;
  boxes: number;
}

/** For every hub: who sells within its pickup area. A listing counts for the hub nearest to it, when that hub is within the radius. */
export function hubReach(listings: Stocked[]): HubReach[] {
  const rows = new Map<string, { sellers: Set<string>; listings: number; boxes: number }>(VERIFIED_JK_HUBS.map((h) => [h.id, { sellers: new Set(), listings: 0, boxes: 0 }]));
  for (const l of listings) {
    const near = hubOfListing(l);
    if (!near?.within) continue;
    const r = rows.get(near.hub.id)!;
    r.sellers.add(l.seller_id);
    r.listings += 1;
    if (l.unit === 'box') r.boxes += Math.max(0, Number(l.quantity) || 0);
  }
  return VERIFIED_JK_HUBS.map((hub) => {
    const r = rows.get(hub.id)!;
    return { hub, farmers: r.sellers.size, listings: r.listings, boxes: r.boxes };
  });
}

/** Is this orchard inside the pickup area of this hub? Returns the km when it is, else null. */
export function kmIfInArea(hub: Hub, l: Located): number | null {
  const km = kmFromHub(hub, l.captured_lat, l.captured_lng);
  return km !== null && km <= CLUSTER_RADIUS_KM ? km : null;
}

/** A plain sentence on how far a hub is from an orchard, for the buyer and the farmer. */
export function hubDistanceText(l: Located): string | null {
  const h = hubOfListing(l);
  if (!h) return null;
  return h.within
    ? `${h.hub.locationName} hub is ${h.km} km from this orchard: inside its ${CLUSTER_RADIUS_KM} km pickup area.`
    : `The nearest hub (${h.hub.locationName}) is ${h.km} km from this orchard: outside its ${CLUSTER_RADIUS_KM} km pickup area.`;
}

/** Google Maps directions to a point (the driver's "Navigate"). Null without a valid point. */
export function directionsTo(lat: number | null | undefined, lng: number | null | undefined): string | null {
  return isValidCoordinate(lat, lng) ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}` : null;
}
