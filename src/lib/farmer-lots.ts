/**
 * Lots a farmer lists in the farmer portal. Shared with Traceability so a lot
 * code shown on the dashboard can be traced. Stored in the browser until a
 * listings API backs the dashboard.
 */
export const FARMER_LOTS_KEY = 'kr_farmer_lots';

export interface Lot {
  id: string;
  crop: string;
  grade: string;
  quantity: string;
  price: number;
  unit: string;
  status: 'live' | 'paused';
  interest: number;
}

export const SEED_LOTS: Lot[] = [
  { id: 'LOT-101', crop: 'Delicious Apples', grade: 'A', quantity: '200 boxes', price: 1450, unit: 'box', status: 'live', interest: 6 },
  { id: 'LOT-102', crop: 'Premium Walnuts', grade: 'Light', quantity: '80 kg', price: 950, unit: 'kg', status: 'live', interest: 3 },
  { id: 'LOT-103', crop: 'Saffron (Mongra)', grade: 'ISO 3632-I', quantity: '250 g', price: 310, unit: 'g', status: 'paused', interest: 1 },
];
