/**
 * farmer.ts — Farmer dashboard API wrappers
 *
 * All endpoints verified against Modules 2-4 backend source:
 *   Module 2 (Listings):     src/modules/listings/
 *   Module 3 (Appointments): src/modules/appointments/
 *   Module 4 (Orders):       src/modules/orders/
 *
 * Payout ledger:
 *   NOTE: A dedicated /payouts endpoint is NOT present in Modules 1-6.
 *   The ledger entries are accessed via the Admin module's dispute/payout
 *   relationship, or from order completion events. The PayoutLedger section
 *   of the dashboard uses GET /orders?role=farmer&status=COMPLETED as a
 *   proxy until a dedicated payout module is built. This is explicitly
 *   marked in the UI with a "Payout data" label + refresh note.
 */

import { api } from './client';

// ---------------------------------------------------------------------------
// Listings (Module 2)
// ---------------------------------------------------------------------------

export type ListingStatus = 'DRAFT' | 'PUBLISHED' | 'SUSPENDED';

export interface FarmerListing {
  id: string;
  title: string;
  commodity: string;
  pricePerUnit: number;
  currency: string;
  unit: string;           // e.g. 'kg', 'tonne', 'box'
  status: ListingStatus;
  stockQuantity: number;
  originRegion: string;
  certifications: string[];
  images: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ListingsPage {
  data: FarmerListing[];
  total: number;
  page: number;
  limit: number;
}

export interface ListingsQuery {
  page?: number;
  limit?: number;
  status?: ListingStatus;
}

export const listingsApi = {
  /** GET /listings/mine — farmer's own listings */
  myListings: (params: ListingsQuery = {}): Promise<ListingsPage> =>
    api.get('/listings/mine', { params }),

  /** DELETE /listings/:id — soft-delete a listing */
  deleteListing: (id: string): Promise<void> =>
    api.delete(`/listings/${id}`),

  /** PATCH /listings/:id/publish — requires VERIFIED KYC (enforced by backend) */
  publishListing: (id: string): Promise<FarmerListing> =>
    api.patch(`/listings/${id}/publish`),

  /** PATCH /listings/:id/unpublish */
  unpublishListing: (id: string): Promise<FarmerListing> =>
    api.patch(`/listings/${id}/unpublish`),
};

// ---------------------------------------------------------------------------
// Appointments (Module 3)
// ---------------------------------------------------------------------------

export type AppointmentStatus =
  | 'REQUESTED'
  | 'CONFIRMED'
  | 'CANCELLED'
  | 'COMPLETED'
  | 'NO_SHOW';

export interface Appointment {
  id: string;
  listingId: string;
  listingTitle: string;
  buyerName: string;
  buyerEmail: string;
  scheduledAt: string;    // ISO-8601 UTC
  durationMinutes: number;
  status: AppointmentStatus;
  notes?: string;
  meetingUrl?: string;
}

export interface AppointmentsPage {
  data: Appointment[];
  total: number;
  page: number;
  limit: number;
}

export const appointmentsApi = {
  /** GET /appointments?role=farmer */
  myAppointments: (params: { page?: number; limit?: number; status?: AppointmentStatus } = {}): Promise<AppointmentsPage> =>
    api.get('/appointments', { params: { ...params, role: 'farmer' } }),

  /** PATCH /appointments/:id/confirm */
  confirmAppointment: (id: string): Promise<Appointment> =>
    api.patch(`/appointments/${id}/confirm`),

  /** PATCH /appointments/:id/cancel */
  cancelAppointment: (id: string, reason?: string): Promise<Appointment> =>
    api.patch(`/appointments/${id}/cancel`, { reason }),
};

// ---------------------------------------------------------------------------
// Orders (Module 4)
// ---------------------------------------------------------------------------

export type OrderStatus =
  | 'PLACED'
  | 'CONFIRMED'
  | 'PACKED'
  | 'SHIPPED'
  | 'CUSTOMS_CLEARANCE'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'DISPUTED';

export interface FarmerOrder {
  id: string;
  listingTitle: string;
  buyerName: string;
  quantity: number;
  unit: string;
  totalAmount: number;
  currency: string;
  status: OrderStatus;
  isCrossBorder: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface OrdersPage {
  data: FarmerOrder[];
  total: number;
  page: number;
  limit: number;
}

export const ordersApi = {
  /** GET /orders?role=farmer */
  myOrders: (params: { page?: number; limit?: number; status?: OrderStatus } = {}): Promise<OrdersPage> =>
    api.get('/orders', { params: { ...params, role: 'farmer' } }),
};

// ---------------------------------------------------------------------------
// Payout ledger (proxy via completed orders — no dedicated /payouts endpoint yet)
// ---------------------------------------------------------------------------

export interface PayoutEntry {
  orderId: string;
  listingTitle: string;
  grossAmount: number;
  platformFee: number;
  netAmount: number;
  currency: string;
  settledAt: string;   // completedAt from order
}

export const payoutsApi = {
  /**
   * Proxy: GET /orders?role=farmer&status=COMPLETED
   * Returns completed orders used to approximate the payout ledger.
   * A dedicated payout module is not implemented in Modules 1-6.
   * Replace this with GET /payouts once the module is built.
   */
  ledger: (params: { page?: number; limit?: number } = {}): Promise<OrdersPage> =>
    api.get('/orders', { params: { ...params, role: 'farmer', status: 'COMPLETED' } }),
};
