/**
 * admin.ts — Admin console API wrappers
 *
 * All endpoints verified against Module 5 backend source:
 *   Module 5 (Admin): src/modules/admin/ + src/modules/disputes/
 *
 * RBAC
 *   REGIONAL_ADMIN : can review KYC, RECOMMEND dispute outcomes, view region analytics
 *   PLATFORM_ADMIN : all of the above + RESOLVE disputes, view all-region analytics
 *
 * Dispute permissions (Module 5 verified):
 *   POST /disputes/:id/recommend  → REGIONAL_ADMIN or PLATFORM_ADMIN
 *   POST /disputes/:id/resolve    → PLATFORM_ADMIN only
 *   The UI hides the Resolve button for REGIONAL_ADMIN.
 *
 *   SECURITY:
 *   <!-- UI visibility is UX only. Backend DisputeGuard enforces role check. -->
 *
 * KYC endpoints (Module 5 verified):
 *   GET  /admin/kyc                          → KycQueuePage
 *   GET  /admin/kyc/:userId                  → KycSubmission
 *   POST /admin/kyc/:userId/approve           → { message }
 *   POST /admin/kyc/:userId/reject { reason } → { message }
 *
 * Analytics (Module 5 verified):
 *   GET /admin/analytics
 *     ?regionId=...&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 *     → AnalyticsSummary
 */

import { api } from './client';

// ---------------------------------------------------------------------------
// KYC
// ---------------------------------------------------------------------------

export type KycStatus = 'PENDING' | 'VERIFIED' | 'REJECTED';

export interface KycSubmission {
  userId: string;
  fullName: string;
  email: string;
  role: 'FARMER' | 'BUYER';
  kycStatus: KycStatus;
  submittedAt: string;
  documents: Array<{
    type: string;     // e.g. 'AADHAAR_FRONT', 'LAND_DEED', 'PHOTO'
    url: string;
    uploadedAt: string;
  }>;
  rejectionReason?: string;
}

export interface KycQueuePage {
  data: KycSubmission[];
  total: number;
  page: number;
  limit: number;
}

export const kycApi = {
  /** GET /admin/kyc?status=PENDING&page=1&limit=20 */
  getQueue: (params: { status?: KycStatus; page?: number; limit?: number } = {}) =>
    api.get<KycQueuePage>('/admin/kyc', { params }),

  /** GET /admin/kyc/:userId */
  getOne: (userId: string) =>
    api.get<KycSubmission>(`/admin/kyc/${userId}`),

  /** POST /admin/kyc/:userId/approve */
  approve: (userId: string) =>
    api.post<{ message: string }>(`/admin/kyc/${userId}/approve`),

  /** POST /admin/kyc/:userId/reject { reason } */
  reject: (userId: string, reason: string) =>
    api.post<{ message: string }>(`/admin/kyc/${userId}/reject`, { reason }),
};

// ---------------------------------------------------------------------------
// Disputes (Module 5 verified against src/modules/disputes/)
// ---------------------------------------------------------------------------

export type DisputeStatus = 'OPENED' | 'UNDER_REVIEW' | 'RECOMMENDED' | 'RESOLVED' | 'CLOSED';

export interface Dispute {
  id: string;
  orderId: string;
  listingTitle: string;
  farmerName: string;
  buyerName: string;
  reason: string;
  description: string;
  status: DisputeStatus;
  recommendation?: string;  // set by REGIONAL_ADMIN
  resolution?: string;      // set by PLATFORM_ADMIN
  openedAt: string;
  updatedAt: string;
}

export interface DisputesPage {
  data: Dispute[];
  total: number;
  page: number;
  limit: number;
}

export const disputesApi = {
  /** GET /admin/disputes?status=...&page=1 */
  list: (params: { status?: DisputeStatus; page?: number; limit?: number } = {}) =>
    api.get<DisputesPage>('/admin/disputes', { params }),

  /**
   * POST /disputes/:id/recommend { recommendation }
   * Available to: REGIONAL_ADMIN, PLATFORM_ADMIN
   */
  recommend: (id: string, recommendation: string) =>
    api.post<Dispute>(`/disputes/${id}/recommend`, { recommendation }),

  /**
   * POST /disputes/:id/resolve { resolution }
   * Available to: PLATFORM_ADMIN ONLY
   * SECURITY: Backend DisputeGuard enforces this — UI hides the button for REGIONAL_ADMIN (UX only).
   */
  resolve: (id: string, resolution: string) =>
    api.post<Dispute>(`/disputes/${id}/resolve`, { resolution }),
};

// ---------------------------------------------------------------------------
// Analytics (Module 5 verified)
// ---------------------------------------------------------------------------

export interface AnalyticsSummary {
  regionId: string;
  regionName: string;
  period: { start: string; end: string };
  totalOrders: number;
  completedOrders: number;
  cancelledOrders: number;
  disputedOrders: number;
  grossRevenue: number;
  currency: string;
  exportOrders: number;     // farmer → international buyer
  importOrders: number;     // domestic buyer → international farmer
  importExportRatio: number; // exportOrders / importOrders (key KPI)
  kycPending: number;
  kycApproved: number;
  kycRejected: number;
  activeListings: number;
  newFarmers: number;
  newBuyers: number;
}

export const analyticsApi = {
  /** GET /admin/analytics?regionId=...&startDate=...&endDate=... */
  getSummary: (params: {
    regionId?: string;
    startDate: string;
    endDate: string;
  }) => api.get<AnalyticsSummary>('/admin/analytics', { params }),

  /** GET /admin/regions — list available regions for REGIONAL_ADMIN scope */
  listRegions: () =>
    api.get<Array<{ id: string; name: string }>>('/admin/regions'),
};
