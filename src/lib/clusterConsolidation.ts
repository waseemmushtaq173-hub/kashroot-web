// src/lib/clusterConsolidation.ts

export interface VerifiedHorticultureHub {
  id: string;
  name: string;
  locationName: string;
  district: string;
  lat: number;
  lng: number;
}

/**
 * Real geographic coordinates of established J&K horticulture & cold-chain hubs.
 */
export const VERIFIED_JK_HUBS: readonly VerifiedHorticultureHub[] = [
  {
    id: 'HUB-SHP-AGLAR',
    name: 'KashRoot Shopian Consolidation Hub (Aglar Fruit Mandi)',
    locationName: 'Aglar, Shopian',
    district: 'Shopian',
    lat: 33.7431,
    lng: 74.8722,
  },
  {
    id: 'HUB-PUL-LASSIPORA',
    name: 'KashRoot IGC Lassipora Cold-Chain Hub',
    locationName: 'Lassipora Industrial Estate, Pulwama',
    district: 'Pulwama',
    lat: 33.7782,
    lng: 74.9125,
  },
  {
    id: 'HUB-BAR-SOPORE',
    name: 'KashRoot Sopore Terminal Mandi Hub',
    locationName: 'Apple Town, Sopore',
    district: 'Baramulla',
    lat: 34.2889,
    lng: 74.4667,
  },
  {
    id: 'HUB-KUL-MANDI',
    name: 'KashRoot Kulgam NH-44 Transit Hub',
    locationName: 'Kulgam Fruit Mandi',
    district: 'Kulgam',
    lat: 33.6450,
    lng: 75.0185,
  },
] as const;

export const TRUCK_CAPACITY_BOXES = 2000;
export const CLUSTER_RADIUS_KM = 10;
export const BUYER_CONSOLIDATION_FEE_RATE = 0.01; // 1% charged to Buyer
export const FARMER_COMMISSION_RATE = 0; // 0% (₹0) charged to Grower

export function isValidCoordinate(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180 &&
    !(lat === 0 && lng === 0)
  );
}

/**
 * Computes real Haversine distance in km between two verified GPS points.
 * Returns null if either coordinate is missing (never fabricates a number).
 */
export function computeRealDistanceKm(
  lat1: number | null | undefined,
  lng1: number | null | undefined,
  lat2: number | null | undefined,
  lng2: number | null | undefined
): number | null {
  if (!isValidCoordinate(lat1, lng1) || !isValidCoordinate(lat2, lng2)) {
    return null;
  }
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad((lat2 as number) - (lat1 as number));
  const dLng = toRad((lng2 as number) - (lng1 as number));
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1 as number)) *
      Math.cos(toRad(lat2 as number)) *
      Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

/**
 * Finds the nearest verified J&K hub ONLY when real GPS coordinates exist.
 */
export function getNearestVerifiedHub(
  orchardLat: number | null | undefined,
  orchardLng: number | null | undefined
): { hub: VerifiedHorticultureHub; distanceKm: number } | null {
  if (!isValidCoordinate(orchardLat, orchardLng)) {
    return null;
  }
  let nearest = VERIFIED_JK_HUBS[0];
  let minDistance = computeRealDistanceKm(
    orchardLat,
    orchardLng,
    nearest.lat,
    nearest.lng
  )!;

  for (const hub of VERIFIED_JK_HUBS.slice(1)) {
    const d = computeRealDistanceKm(orchardLat, orchardLng, hub.lat, hub.lng);
    if (d !== null && d < minDistance) {
      minDistance = d;
      nearest = hub;
    }
  }
  return { hub: nearest, distanceKm: minDistance };
}

export function calculateClusterSettlement(params: {
  produceSubtotalInr: number;
  totalBoxes: number;
  freightPerBoxInr: number;
}) {
  const produceSubtotalInr = Math.round(params.produceSubtotalInr);
  const freightTotalInr = Math.round(params.totalBoxes * params.freightPerBoxInr);
  const buyerConsolidationFeeInr = Math.round(
    produceSubtotalInr * BUYER_CONSOLIDATION_FEE_RATE
  ); // 1% from Buyer
  const farmerFeeInr = 0; // ₹0 from Grower
  const farmerNetPayoutInr = produceSubtotalInr;
  const buyerTotalPayableInr =
    produceSubtotalInr + freightTotalInr + buyerConsolidationFeeInr;

  return {
    produceSubtotalInr,
    freightTotalInr,
    buyerConsolidationFeeInr,
    farmerFeeInr,
    farmerNetPayoutInr,
    buyerTotalPayableInr,
  };
}
