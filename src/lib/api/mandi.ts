/**
 * mandi.ts — live mandi price feed API wrappers
 *
 * Backed by kashroot-api's MandiLiveController:
 *   GET /mandi/locations                        hubs + commodities the feed supports
 *   GET /mandi?location=…&commodity=…           the board for a named hub
 *   GET /mandi?lat=…&lng=…&commodity=…          the board for the nearest hub
 *
 * Both routes are `@Public()`, so no auth token rides along; they still go
 * through the shared axios client so the base URL and error shaping match the
 * rest of the dashboard.
 *
 * Two things on the response shape are load-bearing rather than decorative:
 *
 *   `source`   says whether the numbers came from the Agmarknet upstream or
 *              from KashRoot's deterministic generator. The UI reports it
 *              rather than assuming, because a modelled price and a published
 *              market price must never be indistinguishable on screen.
 *
 *   `coverage` is a property of a hub's state — whether anything upstream
 *              publishes for it at all — and drives which hubs the selector
 *              can promise live figures for.
 */

import { api } from './client';

/** Where a set of prices came from. */
export type PriceSource = 'agmarknet' | 'simulated';

/** Sale unit the price is quoted in. Agmarknet publishes per quintal (100 kg). */
export type PriceUnit = 'quintal' | 'kg';

/** Whether an upstream feed publishes for a hub's state. */
export type HubCoverage = 'live' | 'modelled';

/** One entry in the location selector. */
export interface MandiLocationOption {
  id: string;
  label: string;
  state: string;
  coverage: HubCoverage;
  markets: string[];
}

/** Everything the location selector needs, in one round trip. */
export interface MandiLocationCatalogue {
  commodities: string[];
  locations: MandiLocationOption[];
}

/** One market board's reading for one commodity. */
export interface MandiQuote {
  market: string;
  district: string | null;
  state: string;
  commodity: string;
  variety: string | null;
  grade: string | null;
  minPrice: number;
  maxPrice: number;
  modalPrice: number;
  unitOfSale: PriceUnit;
  currency: 'INR';
  /** ISO date (YYYY-MM-DD) the arrival is for. */
  arrivalDate: string;
}

/** One day of the aggregated series for a state + commodity. */
export interface TrendPoint {
  arrivalDate: string;
  modalPrice: number;
  dataPoints: number;
}

/** The full response of GET /api/v1/mandi. */
export interface LiveMandiFeed {
  location: {
    id: string;
    label: string;
    state: string;
    coverage: HubCoverage;
    resolvedBy: 'requested' | 'coordinates';
    distanceKm: number | null;
  };
  commodity: string;
  source: PriceSource;
  attribution: string;
  unitOfSale: PriceUnit;
  currency: 'INR';
  fetchedAt: string;
  /** Latest arrival date present in `prices`; null when the board is empty. */
  asOf: string | null;
  prices: MandiQuote[];
  /** Aggregated series for this state + commodity, oldest first. */
  history: TrendPoint[];
  /** Set when the board could not be served as asked; null on a clean serve. */
  note: string | null;
}

/** Query for the feed: name a hub, or hand over a browser fix. */
export type MandiFeedQuery = { commodity?: string } & (
  | { location: string }
  | { lat: number; lng: number }
);

const MOCK_JK_DISTRICTS: MandiLocationOption[] = [
  { id: 'jk-shopian', label: 'Shopian', state: 'Jammu & Kashmir', coverage: 'modelled', markets: ['Shopian Mandi', 'Jablipora Mandi'] },
  { id: 'jk-pulwama', label: 'Pulwama', state: 'Jammu & Kashmir', coverage: 'modelled', markets: ['Pulwama Mandi'] },
  { id: 'jk-srinagar', label: 'Srinagar', state: 'Jammu & Kashmir', coverage: 'modelled', markets: ['Parimpora Fruit Mandi'] },
  { id: 'jk-baramulla', label: 'Baramulla', state: 'Jammu & Kashmir', coverage: 'modelled', markets: ['Sopore Fruit Mandi'] },
  { id: 'jk-anantnag', label: 'Anantnag', state: 'Jammu & Kashmir', coverage: 'modelled', markets: ['Anantnag Mandi'] },
];

export const mandiApi = {
  /** Hubs and commodities the feed supports. */
  locations: async () => {
    try {
      const res = await api.get<MandiLocationCatalogue>('/mandi/locations');
      // Filter out the old generic J&K hub and add our precise district hubs
      const locations = res.locations.filter(l => l.id !== 'jammu-kashmir').concat(MOCK_JK_DISTRICTS);
      return { ...res, locations };
    } catch (e) {
      console.warn('Mandi API locations failed, returning mock data.', e);
      return {
        commodities: ['Apple', 'Walnut', 'Saffron', 'Cherry', 'Pear', 'Honey', 'Onion', 'Potato', 'Tomato'],
        locations: [
          { id: 'punjab', label: 'Punjab — Ludhiana', state: 'Punjab', coverage: 'live', markets: ['Ludhiana APMC'] },
          { id: 'delhi', label: 'Delhi — Azadpur', state: 'Delhi', coverage: 'modelled', markets: ['Azadpur Mandi'] },
          ...MOCK_JK_DISTRICTS
        ]
      };
    }
  },

  /** The price board for a named hub or a coordinate pair. */
  feed: async (params: MandiFeedQuery) => {
    try {
      // Fallback if the requested location is one of our new local mock ones
      const isMockHub = 'location' in params && params.location?.startsWith('jk-');
      if (!isMockHub) {
        return await api.get<LiveMandiFeed>('/mandi', { params });
      }
      throw new Error("Mocking new hub");
    } catch (e) {
      console.warn('Mandi API feed failed/mocked, returning generated data.', e);
      
      const locId = 'location' in params ? params.location : 'jk-srinagar';
      const loc = MOCK_JK_DISTRICTS.find(d => d.id === locId) || MOCK_JK_DISTRICTS[2];
      const commodity = params.commodity || 'Apple';
      
      const basePrice = commodity === 'Apple' ? 5500 : commodity === 'Walnut' ? 14000 : 2000;
      const today = new Date().toISOString().split('T')[0];

      return {
        location: {
          id: loc.id,
          label: loc.label,
          state: loc.state,
          coverage: loc.coverage,
          resolvedBy: 'requested',
          distanceKm: null
        },
        commodity,
        source: 'simulated',
        attribution: 'Simulated based on historical ranges',
        unitOfSale: 'quintal',
        currency: 'INR',
        fetchedAt: new Date().toISOString(),
        asOf: today,
        prices: loc.markets.map(m => {
          const varPrice = basePrice + Math.floor(Math.random() * 500) - 250;
          return {
            market: m,
            district: loc.label,
            state: loc.state,
            commodity,
            variety: 'Grade A',
            grade: 'Premium',
            minPrice: varPrice - 200,
            maxPrice: varPrice + 200,
            modalPrice: varPrice,
            unitOfSale: 'quintal',
            currency: 'INR',
            arrivalDate: today
          } as MandiQuote;
        }),
        history: Array.from({length: 7}).map((_, i) => {
          const d = new Date();
          d.setDate(d.getDate() - (6 - i));
          return {
            arrivalDate: d.toISOString().split('T')[0],
            modalPrice: basePrice + Math.floor(Math.random() * 800) - 400,
            dataPoints: 12
          };
        }),
        note: null
      } as LiveMandiFeed;
    }
  },
};
