/**
 * tracking.ts — live vehicle tracking API wrappers
 *
 * Backed by kashroot-api's TrackingController:
 *   GET /tracking/:vehicleNumber       position + consignment detail
 *
 * Unlike the mandi feed, this route is NOT public — the JwtAuthGuard covers it.
 * The response carries a named driver and a contact number, and the shape of
 * that is personal data even while every value in it is generated. Adding a
 * token costs nothing here: every caller is on the authenticated farmer
 * dashboard already, and the shared axios client attaches the bearer and
 * handles the refresh. See the controller's docblock for the full reasoning.
 *
 * `source` and `attribution` are on the response for the same reason they are
 * on the mandi feed: the position is generated, not reported by a telematics
 * unit, and a tracking screen is exactly where a reader would otherwise believe
 * it. The UI must render `attribution` rather than assume.
 */

import { api } from './client';

/** Where a tracking record came from. One value today — the gateway is not built. */
export type TrackingSource = 'simulated';

/** How far along the run the vehicle is. */
export type ShipmentStatus = 'loading' | 'in_transit' | 'delivered';

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface TrackingPlace extends GeoPoint {
  name: string;
  district: string;
  state: string;
}

export interface VehicleIdentity {
  registrationNumber: string;
  displayNumber: string;
  type: string;
  capacityTonnes: number;
}

export interface TrackingParty {
  name: string;
  /** Null where no number is invented for that party. */
  contact: string | null;
}

export interface RoutePathPoint extends GeoPoint {
  distanceFromOriginKm: number;
}

export interface VehiclePosition extends GeoPoint {
  speedKmph: number;
  headingDeg: number;
  nearestLandmark: string;
  distanceFromOriginKm: number;
  distanceToDestinationKm: number;
  recordedAt: string;
}

export interface TrackingEvent {
  at: string;
  label: string;
  place: string | null;
  /** False while the event is still a projection rather than something that happened. */
  occurred: boolean;
}

/** The full response of GET /api/v1/tracking/:vehicleNumber. */
export interface LiveVehicleTracking {
  vehicle: VehicleIdentity;
  shipment: {
    id: string;
    commodity: string;
    quantity: { value: number; unit: string };
  };
  driver: TrackingParty;
  owner: TrackingParty;
  route: {
    origin: TrackingPlace;
    destination: TrackingPlace;
    totalDistanceKm: number;
    path: RoutePathPoint[];
  };
  status: ShipmentStatus;
  progress: {
    percent: number;
    coveredKm: number;
    remainingKm: number;
  };
  position: VehiclePosition;
  departureAt: string;
  etaAt: string;
  events: TrackingEvent[];
  source: TrackingSource;
  attribution: string;
  fetchedAt: string;
}

export const trackingApi = {
  /**
   * Look a vehicle up.
   *
   * The plate is sent as typed and validated server-side. Deliberately not
   * re-validated here: a second copy of the registration pattern in the client
   * would drift from the server's the first time one of them changed, and the
   * 400 it returns already carries a message written to be shown to a user.
   */
  lookup: (vehicleNumber: string) =>
    api.get<LiveVehicleTracking>(`/tracking/${encodeURIComponent(vehicleNumber)}`),
};
