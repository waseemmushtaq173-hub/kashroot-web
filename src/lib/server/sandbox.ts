/**
 * Sandbox.co.in KYC APIs (developer.sandbox.co.in) — server-only.
 *   - Aadhaar Offline e-KYC by OTP: UIDAI texts the OTP to the mobile number
 *     linked with the Aadhaar.
 *   - PAN verification against the Income Tax database.
 *   - DigiLocker: the user consents in DigiLocker and shares Aadhaar / PAN.
 *
 * Env: SANDBOX_API_KEY, SANDBOX_API_SECRET (live or test pair),
 *      optional SANDBOX_BASE_URL (default https://api.sandbox.co.in) and
 *      SANDBOX_API_VERSION (default 1.0.0).
 *
 * Never logs or returns the full Aadhaar number, the photo or the address.
 */
import 'server-only';

const BASE = (process.env.SANDBOX_BASE_URL?.trim() || 'https://api.sandbox.co.in').replace(/\/$/, '');
const VERSION = process.env.SANDBOX_API_VERSION?.trim() || '1.0.0';

export const sandboxConfigured = () => Boolean(process.env.SANDBOX_API_KEY && process.env.SANDBOX_API_SECRET);

let cached: { token: string; at: number } | null = null;

async function accessToken(): Promise<string> {
  if (cached && Date.now() - cached.at < 20 * 3_600_000) return cached.token;
  const res = await fetch(`${BASE}/authenticate`, {
    method: 'POST',
    headers: {
      'x-api-key': process.env.SANDBOX_API_KEY!,
      'x-api-secret': process.env.SANDBOX_API_SECRET!,
      'x-api-version': VERSION,
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(15_000),
    cache: 'no-store',
  });
  const json = await res.json().catch(() => ({}));
  const token = json?.data?.access_token ?? json?.access_token;
  if (!res.ok || !token) throw new Error(`KYC provider authentication failed (${res.status})`);
  cached = { token, at: Date.now() };
  return token;
}

export class ProviderError extends Error {
  constructor(message: string, public status = 502) {
    super(message);
  }
}

async function call<T = Record<string, unknown>>(path: string, init: { method?: 'GET' | 'POST'; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: init.method ?? 'POST',
    headers: {
      Authorization: await accessToken(),
      'x-api-key': process.env.SANDBOX_API_KEY!,
      'x-api-version': VERSION,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(25_000),
    cache: 'no-store',
  });
  const json = await res.json().catch(() => ({}));
  if (res.status === 401 || res.status === 403) cached = null;
  if (!res.ok) throw new ProviderError(json?.message || json?.data?.message || `KYC provider answered ${res.status}`, res.status >= 500 ? 502 : 400);
  return json as T;
}

type Data<T> = { data?: T; message?: string };

export async function aadhaarSendOtp(aadhaar: string) {
  const json = await call<Data<{ reference_id?: number | string; message?: string }>>('/kyc/aadhaar/okyc/otp', {
    body: {
      '@entity': 'in.co.sandbox.kyc.aadhaar.okyc.otp.request',
      aadhaar_number: aadhaar,
      consent: 'Y',
      reason: 'KYC verification for escrow-protected agricultural trade',
    },
  });
  const ref = json.data?.reference_id;
  if (!ref) throw new ProviderError(json.data?.message || 'UIDAI could not send an OTP for this Aadhaar.', 400);
  return { referenceId: String(ref), message: json.data?.message ?? 'OTP sent' };
}

export async function aadhaarVerifyOtp(referenceId: string, otp: string) {
  const json = await call<
    Data<{ status?: string; message?: string; name?: string; gender?: string; date_of_birth?: string; year_of_birth?: string; address?: { district?: string; state?: string } }>
  >('/kyc/aadhaar/okyc/otp/verify', {
    body: { '@entity': 'in.co.sandbox.kyc.aadhaar.okyc.request', reference_id: referenceId, otp },
  });
  const d = json.data ?? {};
  if (String(d.status).toUpperCase() !== 'VALID') throw new ProviderError(d.message || 'That OTP is incorrect or has expired.', 400);
  return {
    name: d.name ?? '',
    gender: d.gender ?? '',
    dateOfBirth: d.date_of_birth ?? '',
    yearOfBirth: d.year_of_birth ?? '',
    district: d.address?.district ?? '',
    state: d.address?.state ?? '',
  };
}

export async function panVerify(pan: string, name: string, dobDdMmYyyy: string) {
  const json = await call<
    Data<{ status?: string; category?: string; remarks?: string | null; name_as_per_pan_match?: boolean; date_of_birth_match?: boolean; aadhaar_seeding_status?: string }>
  >('/kyc/pan/verify', {
    body: {
      '@entity': 'in.co.sandbox.kyc.pan_verification.request',
      pan,
      name_as_per_pan: name,
      date_of_birth: dobDdMmYyyy,
      consent: 'Y',
      reason: 'KYC verification for escrow-protected agricultural trade',
    },
  });
  const d = json.data ?? {};
  return {
    valid: String(d.status).toLowerCase() === 'valid',
    category: d.category ?? '',
    nameMatch: d.name_as_per_pan_match === true,
    dobMatch: d.date_of_birth_match === true,
    aadhaarSeeded: d.aadhaar_seeding_status === 'y',
    remarks: d.remarks ?? '',
  };
}

export async function digilockerStart(redirectUrl: string) {
  const json = await call<Data<{ session_id?: string; authorization_url?: string }>>('/kyc/digilocker/sessions/init', {
    body: { '@entity': 'in.co.sandbox.kyc.digilocker.session.request', flow: 'signin', doc_types: ['aadhaar', 'pan'], redirect_url: redirectUrl },
  });
  if (!json.data?.session_id || !json.data.authorization_url) throw new ProviderError('DigiLocker did not start a session.');
  return { sessionId: json.data.session_id, authorizationUrl: json.data.authorization_url };
}

export async function digilockerStatus(sessionId: string) {
  const json = await call<Data<{ status?: string; documents_consented?: string[] }>>(`/kyc/digilocker/sessions/${encodeURIComponent(sessionId)}/status`, { method: 'GET' });
  const status = (json.data?.status ?? 'created').toLowerCase();
  const docs = (json.data?.documents_consented ?? []).map((d) => d.toLowerCase());
  let aadhaarLast4 = '';
  if (status === 'succeeded' && docs.includes('aadhaar')) {
    // The DigiLocker Aadhaar is UIDAI's XML with a masked uid (xxxxxxxx1234).
    try {
      const doc = await call<Data<{ files?: { url?: string }[] }>>(`/kyc/digilocker/sessions/${encodeURIComponent(sessionId)}/documents/aadhaar`, { method: 'GET' });
      const url = doc.data?.files?.[0]?.url;
      if (url) {
        const xml = await (await fetch(url, { signal: AbortSignal.timeout(15_000), cache: 'no-store' })).text();
        aadhaarLast4 = /uid="[xX*]*(\d{4})"/.exec(xml)?.[1] ?? '';
      }
    } catch {
      /* last four digits are a nicety, not a requirement */
    }
  }
  return { status, aadhaar: docs.includes('aadhaar'), pan: docs.includes('pan'), aadhaarLast4 };
}
