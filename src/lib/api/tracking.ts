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

import { api, ApiError } from './client';

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
  lookup: async (vehicleNumber: string, vehicleClass?: string) => {
    // 1. RTO-based Map Centering for Non-Commercial
    const isCommercial = vehicleClass === 'HCV' || vehicleClass === 'LCV';

    // RTO Prefix mapping for dynamic centering
    const rtoMap: Record<string, GeoPoint> = {
      'JK-05': { lat: 34.2023, lng: 74.3486 }, // Baramulla
      'JK-10': { lat: 34.2965, lng: 74.4727 }, // Sopore
      'UP-32': { lat: 26.8467, lng: 80.9462 }, // Lucknow
      'MH-01': { lat: 18.9220, lng: 72.8347 }, // Mumbai
      'DL-01': { lat: 28.6139, lng: 77.2090 }, // Delhi
      'KA-01': { lat: 12.9716, lng: 77.5946 }, // Bangalore
    };

    let prefix = vehicleNumber.substring(0, 5).toUpperCase();
    if (vehicleNumber.substring(2, 3) !== '-') {
       prefix = vehicleNumber.substring(0,2) + '-' + vehicleNumber.substring(2,4);
    }
    const rtoCoords = rtoMap[prefix] || { lat: 34.0837, lng: 74.7973 }; // Default: valley centre

    // 2. Mock Guard: Reject mismatch
    if (isCommercial && (vehicleNumber.toLowerCase().includes('maruti') || vehicleNumber.toLowerCase().includes('car'))) {
      throw new ApiError(400, ['This number belongs to a car, not a goods vehicle. Choose another vehicle.'], 'Bad Request');
    }

    try {
      const response = await api.get<LiveVehicleTracking>(`/tracking/${encodeURIComponent(vehicleNumber)}`);
      const data = response;

      // 3. Strip Private Details globally
      data.driver.name = 'Driver (Protected)';
      data.driver.contact = null;
      data.owner.name = 'Owner (Protected)';
      data.owner.contact = null;

      // 4. Overhaul non-commercial response (no freight)
      if (!isCommercial) {
         data.position.lat = rtoCoords.lat;
         data.position.lng = rtoCoords.lng;
         data.route.origin = { name: 'Origin', district: '', state: '', lat: rtoCoords.lat, lng: rtoCoords.lng };
         data.route.destination = { name: 'Destination', district: '', state: '', lat: rtoCoords.lat, lng: rtoCoords.lng };
         data.route.path = [];
         data.events = [];
         data.shipment = {
           id: 'N/A',
           commodity: 'N/A',
           quantity: { value: 0, unit: 'N/A' }
         };
      }

      return data;
    } catch (e: unknown) {
      if (!isCommercial) {
         // Even if backend fails (e.g. invalid format), generate a mock non-commercial response
         return {
           vehicle: {
             registrationNumber: vehicleNumber,
             displayNumber: vehicleNumber.toUpperCase(),
             type: vehicleClass === 'BIKE' ? 'Two-Wheeler' : 'Personal Car',
             capacityTonnes: 0,
           },
           shipment: { id: 'N/A', commodity: 'N/A', quantity: { value: 0, unit: 'N/A' } },
           driver: { name: 'Protected', contact: null },
           owner: { name: 'Protected', contact: null },
           route: { origin: { name: 'N/A', district: '', state: '', lat: rtoCoords.lat, lng: rtoCoords.lng }, destination: { name: 'N/A', district: '', state: '', lat: rtoCoords.lat, lng: rtoCoords.lng }, totalDistanceKm: 0, path: [] },
           status: 'delivered',
           progress: { percent: 0, coveredKm: 0, remainingKm: 0 },
           position: { lat: rtoCoords.lat, lng: rtoCoords.lng, speedKmph: 0, headingDeg: 0, nearestLandmark: prefix + ' RTO Zone', distanceFromOriginKm: 0, distanceToDestinationKm: 0, recordedAt: new Date().toISOString() },
           departureAt: new Date().toISOString(),
           etaAt: new Date().toISOString(),
           events: [],
           source: 'simulated',
           attribution: 'Local simulated lookup',
           fetchedAt: new Date().toISOString(),
         } as LiveVehicleTracking;
      }
      // Backend unreachable (not deployed, module not mounted, or down): fall
      // back to a local simulation so the screen still works. A 4xx other than
      // 404 is a real validation answer and is shown as-is.
      // (Network failures arrive as ApiError with statusCode 0.)
      const unreachable = !(e instanceof ApiError) || e.statusCode === 0 || e.statusCode === 404 || e.statusCode >= 500;
      if (unreachable) return simulateCommercial(vehicleNumber, vehicleClass, rtoCoords);
      throw e;
    }
  },
};

/** Deterministic simulated consignment for a plate, used only as a fallback. */
function simulateCommercial(vehicleNumber: string, vehicleClass: string | undefined, origin: GeoPoint): LiveVehicleTracking {
  let hash = 0;
  for (const ch of vehicleNumber.toUpperCase()) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;

  const destination: GeoPoint = Math.abs(origin.lat - 28.61) > 1.5 ? { lat: 28.6139, lng: 77.209 } : { lat: origin.lat + 2.4, lng: origin.lng + 1.6 };
  const toRad = (d: number) => (d * Math.PI) / 180;
  const straightKm =
    6371 * 2 * Math.asin(Math.sqrt(Math.sin(toRad(destination.lat - origin.lat) / 2) ** 2 + Math.cos(toRad(origin.lat)) * Math.cos(toRad(destination.lat)) * Math.sin(toRad(destination.lng - origin.lng) / 2) ** 2));
  const totalKm = Math.round(straightKm * 1.3);
  const percent = 15 + (hash % 70);
  const coveredKm = Math.round((totalKm * percent) / 100);

  const steps = 12;
  const path = Array.from({ length: steps + 1 }, (_, i) => ({
    lat: origin.lat + ((destination.lat - origin.lat) * i) / steps + Math.sin(i) * 0.05,
    lng: origin.lng + ((destination.lng - origin.lng) * i) / steps,
    distanceFromOriginKm: Math.round((totalKm * i) / steps),
  }));
  const at = percent / 100;
  const now = Date.now();
  const hours = (km: number) => (km / 45) * 3_600_000;
  const departureAt = new Date(now - hours(coveredKm)).toISOString();
  const etaAt = new Date(now + hours(totalKm - coveredKm)).toISOString();
  const commercial = vehicleClass === 'LCV' ? { type: 'Light goods vehicle', capacityTonnes: 3.5 } : { type: 'Refrigerated truck', capacityTonnes: 12 };

  return {
    vehicle: { registrationNumber: vehicleNumber, displayNumber: vehicleNumber.toUpperCase(), ...commercial },
    shipment: { id: `SHP-${(hash % 90000) + 10000}`, commodity: ['Apples', 'Walnuts', 'Cherries', 'Pears'][hash % 4], quantity: { value: 400 + (hash % 600), unit: 'boxes' } },
    driver: { name: 'Driver (Protected)', contact: null },
    owner: { name: 'Owner (Protected)', contact: null },
    route: {
      origin: { name: 'Origin packhouse', district: '', state: '', ...origin },
      destination: { name: 'Wholesale fruit market', district: '', state: '', ...destination },
      totalDistanceKm: totalKm,
      path,
    },
    status: 'in_transit',
    progress: { percent, coveredKm, remainingKm: totalKm - coveredKm },
    position: {
      lat: origin.lat + (destination.lat - origin.lat) * at,
      lng: origin.lng + (destination.lng - origin.lng) * at,
      speedKmph: 38 + (hash % 25),
      headingDeg: 160,
      nearestLandmark: 'National highway checkpoint',
      distanceFromOriginKm: coveredKm,
      distanceToDestinationKm: totalKm - coveredKm,
      recordedAt: new Date(now).toISOString(),
    },
    departureAt,
    etaAt,
    events: [
      { at: new Date(Date.parse(departureAt) - 3_600_000).toISOString(), label: 'Loaded and sealed', place: 'Origin packhouse', occurred: true },
      { at: departureAt, label: 'Departed', place: 'Origin packhouse', occurred: true },
      { at: new Date(now - hours(coveredKm) / 2).toISOString(), label: 'Crossed highway toll', place: 'Toll plaza', occurred: true },
      { at: etaAt, label: 'Arrival at market', place: 'Wholesale fruit market', occurred: false },
    ],
    source: 'simulated',
    attribution: 'Local simulated lookup — tracking service unreachable',
    fetchedAt: new Date(now).toISOString(),
  };
}
