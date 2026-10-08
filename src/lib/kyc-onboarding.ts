/**
 * kyc-onboarding.ts — state, validation and persistence behind
 * <KYCOnboardingPanel /> (src/components/auth/KYCOnboardingPanel.tsx).
 *
 * WHY THIS IS A MODULE
 * --------------------
 * Three dashboards (seller / buyer / farmer) each need to answer the same
 * question before they render: "does this account still owe us a Full KYC
 * submission?". Keeping the answer — and the shape of a submission — in one
 * place means the panel, the dashboards and (later) the API all agree on what
 * "pending" means instead of re-deriving it per page.
 *
 * PERSISTENCE
 * -----------
 * There is deliberately NO backend call here yet. The platform exposes only
 * admin-side KYC review endpoints (GET /admin/kyc, POST /admin/kyc/:id/
 * approve|reject — see src/lib/api/admin.ts); no farmer/buyer/seller
 * self-service submit endpoint exists in kashroot-api. So the submission is
 * stored per role in localStorage, exactly like the other client-side mocks in
 * this repo (`kr_mock_*` keys, `tokenStore` in src/lib/api/auth.ts).
 *
 * When `POST /kyc/submissions` lands, only `readKycState` / `writeKycState`
 * need to change (or gain an optimistic `api.post` alongside) — the panel and
 * the dashboards only ever touch those two functions.
 *
 * STATUS SEMANTICS
 * ----------------
 * `status` is the canonical frontend union from src/lib/listing-options.ts.
 * `submitted` is the extra bit this module adds: it separates the two very
 * different situations that both report `PENDING`:
 *
 *   { status: 'PENDING', submitted: false } → waiting on the USER
 *                                             (this is what auto-opens the
 *                                             panel on the dashboards)
 *   { status: 'PENDING', submitted: true  } → waiting on a REVIEWER
 *                                             (dashboard shows the
 *                                             "under review" chip instead)
 */

import type { KycStatus } from './listing-options';

export type { KycStatus };

/** The three personas that must complete Full KYC to transact. */
export type KycRole = 'SELLER' | 'BUYER' | 'FARMER';

/** Step 1 — who you are and where you operate. */
export interface KycProfile {
  fullName: string;
  role: KycRole;
  /** Indian state / union territory — exact string from REGIONS. */
  state: string;
  /** District or village, free text. */
  district: string;
  /** 6-digit PIN. Optional, but it is how couriers find the farm/warehouse. */
  pincode: string;
}

/** Step 2 — prove you are you, either by document or by Aadhaar eKYC. */
export interface KycIdentity {
  /** 'UPLOAD' = attach a file, 'EKYC' = Aadhaar OTP round-trip. */
  mode: 'UPLOAD' | 'EKYC';
  docType: 'AADHAAR' | 'PAN';
  /** Stored as metadata only — File objects cannot be serialised. */
  documentName: string;
  documentSize: number;
  /** eKYC path: 12-digit Aadhaar, spaces included as typed. */
  aadhaar: string;
  /** eKYC path: 6-digit OTP the user received on the Aadhaar-linked mobile. */
  otp: string;
  consent: boolean;
}

/** Step 3 — where escrow money lands once a deal settles. */
export interface KycBank {
  accountHolderName: string;
  accountNumber: string;
  ifsc: string;
  /** Optional convenience rail; payouts still default to IMPS/NEFT. */
  upiId: string;
}

/** Everything the user typed across the three steps. */
export interface KycSubmission {
  profile: KycProfile;
  identity: KycIdentity;
  bank: KycBank;
}

export interface KycOnboardingState {
  status: KycStatus;
  /** True once the three steps have been submitted for review. */
  submitted: boolean;
  /** ISO timestamp of the last save, or null when nothing is stored. */
  updatedAt: string | null;
  submission: KycSubmission | null;
}

/** Field → message. An empty object means "this step is valid". */
export type KycErrors = Partial<
  Record<
    | 'fullName'
    | 'state'
    | 'district'
    | 'pincode'
    | 'document'
    | 'aadhaar'
    | 'otp'
    | 'consent'
    | 'accountHolderName'
    | 'accountNumber'
    | 'ifsc'
    | 'upiId',
    string
  >
>;

// ── Validation patterns ───────────────────────────────────────────────────

/** IFSC = 4 bank letters, a zero, then 6 alphanumerics (e.g. SBIN0001234). */
export const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
export const AADHAAR_RE = /^\d{12}$/;
export const PAN_RE = /^[A-Z]{5}\d{4}[A-Z]$/;
export const PIN_RE = /^\d{6}$/;
/** Indian savings/current accounts run 9–18 digits depending on the bank. */
export const ACCOUNT_RE = /^\d{9,18}$/;

export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024; // 5 MB
export const ACCEPTED_DOCUMENT_TYPES = '.pdf,.jpg,.jpeg,.png';

// ── Formatting helpers ────────────────────────────────────────────────────

/** 123456789012 → "1234 5678 9012" as the user types. */
export function formatAadhaar(raw: string): string {
  return raw
    .replace(/\D/g, '')
    .slice(0, 12)
    .replace(/(\d{4})(?=\d)/g, '$1 ');
}

/** "HDFC0001234" → "HDFC0001234" upper-cased without whitespace. */
export function formatIfsc(raw: string): string {
  return raw.replace(/\s+/g, '').toUpperCase().slice(0, 11);
}

/** Byte count → "412 KB" style label for the upload chip. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Defaults ──────────────────────────────────────────────────────────────

export function emptyProfile(role: KycRole): KycProfile {
  return { fullName: '', role, state: '', district: '', pincode: '' };
}

export function emptyIdentity(): KycIdentity {
  return {
    mode: 'UPLOAD',
    docType: 'AADHAAR',
    documentName: '',
    documentSize: 0,
    aadhaar: '',
    otp: '',
    consent: false,
  };
}

export function emptyBank(): KycBank {
  return { accountHolderName: '', accountNumber: '', ifsc: '', upiId: '' };
}

/**
 * Default state for an account that has never saved anything.
 *
 * The status is PENDING (not NOT_SUBMITTED) so the dashboards surface the
 * panel for a fresh account — that is the trigger condition the product asks
 * for: "show KYC onboarding when kycStatus is pending". `submitted: false` is
 * what keeps it distinct from an account genuinely sitting in the reviewer's
 * queue.
 */
export function defaultKycState(): KycOnboardingState {
  return { status: 'PENDING', submitted: false, updatedAt: null, submission: null };
}

// ── Validation ────────────────────────────────────────────────────────────

const NAME_RE = /^[A-Za-z][A-Za-z .'-]{2,}$/;

export function validateProfile(profile: KycProfile): KycErrors {
  const errors: KycErrors = {};
  const name = profile.fullName.trim();

  if (!name) errors.fullName = 'Enter your full name as it appears on your ID.';
  else if (!NAME_RE.test(name)) errors.fullName = 'Use letters only (2+ characters).';

  if (!profile.state) errors.state = 'Select the state you operate in.';
  if (!profile.district.trim()) errors.district = 'Enter your district or village.';
  else if (profile.district.trim().length < 2) errors.district = 'That looks too short.';

  if (profile.pincode && !PIN_RE.test(profile.pincode))
    errors.pincode = 'PIN code must be 6 digits.';

  return errors;
}

export function validateIdentity(identity: KycIdentity): KycErrors {
  const errors: KycErrors = {};

  if (identity.mode === 'UPLOAD') {
    if (!identity.documentName) {
      errors.document = 'Attach a clear scan or photo of your document.';
    } else if (identity.documentSize > MAX_DOCUMENT_BYTES) {
      errors.document = 'File is larger than 5 MB — please upload a smaller one.';
    }
    return errors;
  }

  // eKYC path
  if (!AADHAAR_RE.test(identity.aadhaar.replace(/\s/g, '')))
    errors.aadhaar = 'Aadhaar must be exactly 12 digits.';
  if (!/^\d{6}$/.test(identity.otp)) errors.otp = 'Enter the 6-digit OTP.';
  if (!identity.consent)
    errors.consent = 'Consent is required to fetch your KYC record via UIDAI.';

  return errors;
}

export function validateBank(bank: KycBank): KycErrors {
  const errors: KycErrors = {};
  const holder = bank.accountHolderName.trim();

  if (!holder) errors.accountHolderName = 'Enter the name exactly as per bank records.';
  else if (!NAME_RE.test(holder)) errors.accountHolderName = 'Use letters only (2+ characters).';

  if (!bank.accountNumber.trim()) errors.accountNumber = 'Enter your account number.';
  else if (!ACCOUNT_RE.test(bank.accountNumber.trim()))
    errors.accountNumber = 'Account number must be 9–18 digits.';

  if (!bank.ifsc.trim()) errors.ifsc = 'Enter the IFSC printed on your passbook.';
  else if (!IFSC_RE.test(bank.ifsc)) errors.ifsc = 'Invalid IFSC — e.g. SBIN0001234.';

  if (bank.upiId.trim() && !/^[\w.\-]{2,}@[a-zA-Z]{2,}$/.test(bank.upiId.trim()))
    errors.upiId = 'UPI IDs look like name@bank.';

  return errors;
}

// ── Persistence ───────────────────────────────────────────────────────────

const STORAGE_PREFIX = 'kashroot:kyc:';

export function kycStorageKey(role: KycRole): string {
  return `${STORAGE_PREFIX}${role.toLowerCase()}`;
}

function canUseStorage(): boolean {
  try {
    return typeof window !== 'undefined' && !!window.localStorage;
  } catch {
    // Private-mode Safari and hardened browser profiles can throw on access.
    return false;
  }
}

/** Read this role's KYC state. Never throws — falls back to the default. */
export function readKycState(role: KycRole): KycOnboardingState {
  if (!canUseStorage()) return defaultKycState();
  try {
    const raw = window.localStorage.getItem(kycStorageKey(role));
    if (!raw) return defaultKycState();
    const parsed = JSON.parse(raw) as Partial<KycOnboardingState>;
    return {
      ...defaultKycState(),
      ...parsed,
      submission: parsed.submission ?? null,
    };
  } catch {
    return defaultKycState();
  }
}

/** Persist this role's KYC state and return what was written. */
export function writeKycState(
  role: KycRole,
  state: KycOnboardingState,
): KycOnboardingState {
  if (!canUseStorage()) return state;
  try {
    window.localStorage.setItem(kycStorageKey(role), JSON.stringify(state));
  } catch {
    // Quota exceeded / storage disabled — the in-memory state still drives the UI.
  }
  return state;
}

/** Wipe a role's record (sign-out, support tooling, tests). */
export function clearKycState(role: KycRole): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.removeItem(kycStorageKey(role));
  } catch {
    /* no-op */
  }
}

// ── Derived display helpers ───────────────────────────────────────────────

export const KYC_ROLE_LABEL: Record<KycRole, string> = {
  SELLER: 'Seller',
  BUYER: 'Buyer',
  FARMER: 'Farmer',
};

/** What the dashboard should surface for a given state. */
export type KycBannerTone =
  | 'action' // user still owes a submission → open the panel
  | 'review' // submitted, sitting with a reviewer
  | 'rejected' // came back rejected → re-submit
  | 'verified'
  | 'none';

export function kycBannerTone(state: KycOnboardingState): KycBannerTone {
  if (state.status === 'VERIFIED') return 'verified';
  if (state.status === 'REJECTED') return 'rejected';
  if (state.submitted) return 'review';
  if (state.status === 'PENDING' || state.status === 'NOT_SUBMITTED') return 'action';
  return 'none';
}

/** True when the panel should auto-open on mount for this state. */
export function needsOnboarding(state: KycOnboardingState): boolean {
  return !state.submitted && state.status !== 'VERIFIED';
}
