/**
 * KYC service adapter for KYCPanel.
 *
 * IFSC lookup calls /api/ifsc (public Razorpay IFSC directory); set
 * NEXT_PUBLIC_IFSC_MOCK=true to answer from the bank-code table instead.
 *
 * Aadhaar OTP, PAN and DigiLocker are REAL: they call this app's /api/kyc/*
 * routes, which hold the KYC provider credentials server-side (Sandbox.co.in).
 * UIDAI texts the Aadhaar OTP to the mobile linked with that Aadhaar. When the
 * provider is not configured the routes answer 503 and the panel says so.
 */
import { authFetch } from '@/lib/auth-fetch';

import { isValidIfsc } from './validators';

export interface IfscDetails {
  ifsc: string;
  bank: string;
  branch: string;
  city?: string;
  state?: string;
  address?: string;
}

export interface IdentityVerification {
  /** Opaque reference from the verifier, stored instead of the Aadhaar number. */
  referenceId: string;
  aadhaarLast4: string;
}

export class IfscNotFoundError extends Error {
  constructor(ifsc: string) {
    super(`No bank branch found for IFSC ${ifsc}`);
    this.name = 'IfscNotFoundError';
  }
}

export class OtpRejectedError extends Error {
  constructor() {
    super('That OTP is incorrect or has expired.');
    this.name = 'OtpRejectedError';
  }
}

const USE_IFSC_MOCK = process.env.NEXT_PUBLIC_IFSC_MOCK === 'true';
const ifscCache = new Map<string, IfscDetails>();

export async function lookupIfsc(ifsc: string, signal?: AbortSignal): Promise<IfscDetails> {
  const cached = ifscCache.get(ifsc);
  if (cached) return cached;

  const details = USE_IFSC_MOCK ? await mockIfscLookup(ifsc, signal) : await fetchIfsc(ifsc, signal);
  ifscCache.set(ifsc, details);
  return details;
}

async function fetchIfsc(ifsc: string, signal?: AbortSignal): Promise<IfscDetails> {
  const res = await fetch(`/api/ifsc?code=${encodeURIComponent(ifsc)}`, { signal });
  if (res.status === 404) throw new IfscNotFoundError(ifsc);
  if (!res.ok) throw new Error(`IFSC lookup failed (${res.status})`);
  return (await res.json()) as IfscDetails;
}

/**
 * The first four letters of an IFSC identify the bank, so the mock names the
 * bank correctly and says plainly that the branch is a placeholder.
 */
const BANK_CODES: Record<string, string> = {
  JAKA: 'Jammu & Kashmir Bank',
  SBIN: 'State Bank of India',
  HDFC: 'HDFC Bank',
  ICIC: 'ICICI Bank',
  PUNB: 'Punjab National Bank',
  UTIB: 'Axis Bank',
  BARB: 'Bank of Baroda',
  CNRB: 'Canara Bank',
  UBIN: 'Union Bank of India',
  KKBK: 'Kotak Mahindra Bank',
};

async function mockIfscLookup(ifsc: string, signal?: AbortSignal): Promise<IfscDetails> {
  await delay(700, signal);
  const bank = BANK_CODES[ifsc.slice(0, 4)];
  if (!bank || !isValidIfsc(ifsc)) throw new IfscNotFoundError(ifsc);
  return { ifsc, bank, branch: `Branch ${ifsc.slice(5)} (mock lookup)` };
}

// ---------------------------------------------------------------------------
// Identity verification (real, via /api/kyc/*)
// ---------------------------------------------------------------------------

export class KycUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KycUnavailableError';
  }
}

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await authFetch(url, { method: 'POST', body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (res.status === 503 || res.status === 401) throw new KycUnavailableError(data.error ?? 'Verification is unavailable.');
  if (!res.ok) throw new Error(data.error ?? 'Verification failed. Please try again.');
  return data as T;
}

/** Asks UIDAI (through the KYC provider) to text an OTP to the Aadhaar-linked mobile. */
export async function requestAadhaarOtp(aadhaarDigits: string): Promise<{ txnId: string }> {
  const { referenceId } = await post<{ referenceId: string }>('/api/kyc/aadhaar/otp', { aadhaar: aadhaarDigits });
  return { txnId: referenceId };
}

export interface AadhaarPerson {
  name: string;
  /** DD-MM-YYYY as UIDAI returns it. */
  dateOfBirth: string;
}

export async function verifyAadhaarOtp(txnId: string, otp: string, last4: string): Promise<IdentityVerification & { person: AadhaarPerson }> {
  try {
    const r = await post<{ referenceId: string; aadhaarLast4: string; name: string; dateOfBirth: string }>('/api/kyc/aadhaar/verify', { referenceId: txnId, otp, last4 });
    return { referenceId: r.referenceId, aadhaarLast4: r.aadhaarLast4 || last4, person: { name: r.name, dateOfBirth: r.dateOfBirth } };
  } catch (err) {
    if (err instanceof KycUnavailableError) throw err;
    throw new OtpRejectedError();
  }
}

export interface PanCheck {
  valid: boolean;
  nameMatch: boolean;
  dobMatch: boolean;
  category: string;
}

/** dob as YYYY-MM-DD (date input) — sent as DD/MM/YYYY. */
export async function verifyPan(pan: string, name: string, dobIso: string): Promise<PanCheck> {
  const [y, m, d] = dobIso.split('-');
  return post<PanCheck>('/api/kyc/pan', { pan, name, dob: `${d}/${m}/${y}` });
}

/**
 * DigiLocker: opens the consent screen in a popup (so the panel keeps its
 * state) and polls until the user finishes. `popup` must be opened by the
 * click handler itself, or browsers block it.
 */
export async function verifyWithDigiLocker(popup: Window | null): Promise<IdentityVerification & { panShared: boolean }> {
  let start: { sessionId: string; authorizationUrl: string; ticket: string };
  try {
    start = await post('/api/kyc/digilocker/start', {});
  } catch (err) {
    popup?.close();
    throw err;
  }
  if (popup && !popup.closed) popup.location.href = start.authorizationUrl;
  else window.location.assign(start.authorizationUrl);

  const deadline = Date.now() + 10 * 60_000;
  while (Date.now() < deadline) {
    await delay(2500);
    const res = await authFetch(`/api/kyc/digilocker/status?session=${encodeURIComponent(start.sessionId)}&ticket=${encodeURIComponent(start.ticket)}`);
    const s = (await res.json().catch(() => ({}))) as { status?: string; aadhaar?: boolean; pan?: boolean; aadhaarLast4?: string; error?: string };
    if (!res.ok) throw new Error(s.error ?? 'DigiLocker did not respond.');
    if (s.status === 'succeeded') {
      if (!s.aadhaar) throw new Error('Aadhaar was not shared from DigiLocker. Please allow Aadhaar on the consent screen.');
      return { referenceId: start.sessionId, aadhaarLast4: s.aadhaarLast4 ?? '', panShared: Boolean(s.pan) };
    }
    if (s.status === 'failed' || s.status === 'expired') throw new Error(`DigiLocker consent ${s.status}. Please try again.`);
    if (popup?.closed && s.status === 'created') {
      // Closed before consenting — give the provider one more poll, then stop.
      await delay(2500);
    }
  }
  throw new Error('DigiLocker timed out. Please try again.');
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
  });
}

// ---------------------------------------------------------------------------
// Free offline Aadhaar (UIDAI-signed Offline e-KYC ZIP or Secure QR)
// ---------------------------------------------------------------------------

export interface KycConfig {
  /** Paid online checks (Aadhaar OTP, DigiLocker, PAN) are connected. */
  online: boolean;
  offline: boolean;
  sms: boolean;
  email: boolean;
}

const OFFLINE_ONLY: KycConfig = { online: false, offline: true, sms: false, email: false };

export async function getKycConfig(): Promise<KycConfig> {
  try {
    const res = await fetch('/api/kyc/config', { cache: 'no-store' });
    return res.ok ? ((await res.json()) as KycConfig) : OFFLINE_ONLY;
  } catch {
    return OFFLINE_ONLY;
  }
}

export interface OfflineAadhaarResult extends IdentityVerification {
  method: 'AADHAAR_OFFLINE_XML' | 'AADHAAR_SECURE_QR';
  name: string;
  dateOfBirth: string;
  state: string;
  generatedAt: string | null;
  mobileMatches: boolean | null;
}

async function offlineResult(res: Response): Promise<OfflineAadhaarResult> {
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) throw new KycUnavailableError(data.error ?? 'Please sign in again.');
  if (!res.ok) throw new Error(data.error ?? 'Verification failed. Please try again.');
  return { ...data, referenceId: data.documentId } as OfflineAadhaarResult;
}

export async function verifyOfflineZip(file: File, shareCode: string, mobile: string): Promise<OfflineAadhaarResult> {
  const form = new FormData();
  form.set('file', file);
  form.set('shareCode', shareCode);
  if (mobile) form.set('mobile', mobile);
  return offlineResult(await authFetch('/api/kyc/aadhaar/offline', { method: 'POST', body: form }));
}

export async function verifyAadhaarQr(qr: string, mobile: string): Promise<OfflineAadhaarResult> {
  return offlineResult(await authFetch('/api/kyc/aadhaar/qr', { method: 'POST', body: JSON.stringify({ qr, mobile }) }));
}
