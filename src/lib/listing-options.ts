/**
 * listing-options.ts — the option lists shared by the listing form and the
 * buyer's search filters.
 *
 * WHY THIS IS A MODULE
 * --------------------
 * These lists used to be declared separately in each page that needed them, and
 * they had already drifted: the farmer form offered 14 origin regions while the
 * buyer's discover filter offered 12, so two Indian states were filterable by
 * nobody and selectable by farmers only. A region a farmer can choose but a
 * buyer cannot filter on is a silently unsellable listing, which is exactly the
 * kind of gap that is invisible until someone reports "I can't find my own
 * listing". One declaration, imported everywhere, is what keeps the two ends of
 * the marketplace in agreement.
 *
 * REGIONS must also stay in step with the `regions` table, because
 * ListingsService.resolveRegionId matches a submitted region against
 * Region.name (case-insensitively, exact match) and silently stores null when
 * nothing matches. A name here with no row there is a listing with no origin.
 */

export const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SAR'] as const;

export const UNITS = [
  'kg',
  'tonne',
  'quintal',
  'box',
  'bag',
  'litre',
  'dozen',
  'piece',
] as const;

/**
 * Indian states and union territories the marketplace trades in.
 *
 * Values are the exact strings seeded into `regions.name` (see
 * kashroot-api/seed/seed.ts) and the exact strings submitted as `originRegion`,
 * so no normalisation step sits between the form and the database.
 */
export const REGIONS = [
  'Jammu & Kashmir',
  'Himachal Pradesh',
  'Punjab',
  'Uttarakhand',
  'Maharashtra',
  'Karnataka',
  'Kerala',
  'Tamil Nadu',
  'Andhra Pradesh',
  'West Bengal',
  'Rajasthan',
  'Gujarat',
  'Madhya Pradesh',
  'Uttar Pradesh',
] as const;

/**
 * The farmer's KYC state, as reported by /auth/login (Module 1) and rendered by
 * the listing form's gate banner.
 */
export type KycStatus = 'NOT_SUBMITTED' | 'PENDING' | 'VERIFIED' | 'REJECTED';
