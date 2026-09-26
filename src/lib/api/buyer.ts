/**
 * buyer.ts — Buyer-facing API wrappers
 *
 * All endpoints verified against Modules 2-3 backend source:
 *   Module 2 (Listings):     src/modules/listings/
 *   Module 3 (Appointments): src/modules/appointments/
 *
 * Trust-gate:
 *   GET /listings/:id returns a `trustGate` field from the backend
 *   (src/modules/listings/listings.service.ts) that indicates whether
 *   a buyer can place a direct order ("buy_now") or must first book
 *   an appointment ("request_appointment").
 *   The UI renders the correct CTA based on this field — never guesses.
 *
 * Region-pair enablement:
 *   POST /orders will 422 if the buyer's region ↔ farmer's region pair
 *   is disabled. The checkout flow surfaces this as a named error;
 *   this API layer propagates the backend message directly.
 */

import { api } from './client';

// ---------------------------------------------------------------------------
// Listings search / browse (Module 2)
// ---------------------------------------------------------------------------

export type TrustGate = 'buy_now' | 'request_appointment';

export interface PublicListing {
  id: string;
  title: string;
  commodity: string;
  description: string;
  pricePerUnit: number;
  currency: string;
  unit: string;
  stockQuantity: number;
  originRegion: string;
  certifications: string[];
  isOrganic: boolean;
  images: string[];
  farmerName: string;
  farmerRating: number | null;
  trustGate: TrustGate;   // backend-computed; drives CTA rendering
  createdAt: string;
}

export interface ListingSearchParams {
  q?: string;
  commodity?: string;
  originRegion?: string;
  minPrice?: number;
  maxPrice?: number;
  currency?: string;
  isOrganic?: boolean;
  certifications?: string[];  // comma-separated on wire
  trustGate?: TrustGate;
  page?: number;
  limit?: number;
}

export interface ListingSearchResult {
  data: PublicListing[];
  total: number;
  page: number;
  limit: number;
}

export const buyerListingsApi = {
  /** GET /listings — public search with filters */
  search: (params: ListingSearchParams = {}): Promise<ListingSearchResult> => {
    const query: Record<string, string | number | boolean | undefined> = { ...params };
    if (params.certifications?.length) {
      query.certifications = params.certifications.join(',');
    }
    return api.get('/listings', { params: query });
  },

  /** GET /listings/:id — single listing detail */
  getOne: (id: string): Promise<PublicListing> =>
    api.get(`/listings/${id}`),
};

// ---------------------------------------------------------------------------
// Appointments (Module 3)
// ---------------------------------------------------------------------------

export interface RequestAppointmentDto {
  listingId: string;
  requestedSlot: string;   // ISO-8601 UTC
  durationMinutes?: number;
  notes?: string;
  timezone: string;        // IANA tz, e.g. 'Asia/Calcutta'
}

export interface AvailableSlot {
  start: string;   // ISO-8601 UTC
  end: string;     // ISO-8601 UTC
}

export const buyerAppointmentsApi = {
  /** GET /appointments/slots?listingId=...&timezone=... */
  getSlots: (listingId: string, timezone: string): Promise<AvailableSlot[]> =>
    api.get('/appointments/slots', { params: { listingId, timezone } }),

  /** POST /appointments */
  request: (dto: RequestAppointmentDto): Promise<{ id: string; message: string }> =>
    api.post('/appointments', dto),
};
