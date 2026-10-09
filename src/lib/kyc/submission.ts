/**
 * Bridges the KYC panel to the KYC state this repo already persists, so the
 * dashboard layout and the escrow page don't each invent their own storage.
 *
 * Two records are involved, both in localStorage:
 *
 *   - `kyc_status`, a single legacy flag the dashboard guard reads. Nothing in
 *     the repo ever wrote `'pending'` to it, only `'verified'`, so on its own
 *     it could never make the panel open.
 *   - `kashroot:kyc:<role>`, the per-role `KycOnboardingState` from
 *     src/lib/kyc-onboarding.ts, whose `needsOnboarding()` is the signal that
 *     actually works. Its statuses are NOT_SUBMITTED | PENDING | VERIFIED |
 *     REJECTED.
 *
 * Both are honoured: the flag because the guard is written around it, the
 * per-role state because it is the one that reflects reality.
 */
import {
  needsOnboarding,
  readKycState,
  writeKycState,
  type KycRole,
} from '@/lib/kyc-onboarding';

/** Legacy single flag the dashboard guard reads. */
export const KYC_STATUS_KEY = 'kyc_status';

function canUseStorage(): boolean {
  try {
    return typeof window !== 'undefined' && !!window.localStorage;
  } catch {
    // Private-mode Safari and hardened profiles can throw on access.
    return false;
  }
}

/** True when this role still owes a KYC submission. */
export function kycNeedsOnboarding(role: KycRole): boolean {
  if (!canUseStorage()) return false;
  try {
    if (window.localStorage.getItem(KYC_STATUS_KEY) === 'pending') return true;
  } catch {
    return false;
  }
  return needsOnboarding(readKycState(role));
}

/**
 * Record that the panel was completed. The status is PENDING with
 * `submitted: true` — which `kycBannerTone` reads as "with a reviewer" — not
 * VERIFIED, because nothing has verified anything: the API has no KYC
 * endpoints yet, and the Aadhaar and DigiLocker steps are simulated.
 */
export function markKycSubmitted(role: KycRole): void {
  if (!canUseStorage()) return;
  const state = readKycState(role);
  writeKycState(role, {
    ...state,
    status: 'PENDING',
    submitted: true,
    updatedAt: new Date().toISOString(),
  });
  try {
    // Anything other than 'pending' stops the guard reopening the panel.
    window.localStorage.setItem(KYC_STATUS_KEY, 'submitted');
  } catch {
    // Quota exceeded or storage disabled — the per-role state still drives the UI.
  }
}

/** The KYC role for a stored session role, defaulting to FARMER. */
export function kycRoleFor(sessionRole: string | null | undefined): KycRole {
  return sessionRole === 'BUYER' || sessionRole === 'SELLER' ? sessionRole : 'FARMER';
}
