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

export const mandiApi = {
  /** Hubs and commodities the feed supports. */
  locations: () =>
    api.get<MandiLocationCatalogue>('/mandi/locations'),

  /** The price board for a named hub or a coordinate pair. */
  feed: (params: MandiFeedQuery) =>
    api.get<LiveMandiFeed>('/mandi', { params }),
};
