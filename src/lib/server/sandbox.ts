/**
 * Sandbox.co.in KYC APIs (developer.sandbox.co.in) — server-only.
 *   - Aadhaar Offline e-KYC by OTP: UIDAI texts the OTP to the mobile number
 *     linked with the Aadhaar.
 *   - PAN verification against the Income Tax database.
 *   - DigiLocker: the user consents in DigiLocker and shares Aadhaar / PAN;
 *     KashRoot then fetches the documents themselves (consenting to share a
 *     PAN is not having one).
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
  }).catch(() => null);
  if (!res) throw new ProviderError('Could not reach the identity-check service. Please try again.', 504);
  const json = await res.json().catch(() => ({}));
  const token = json?.data?.access_token ?? json?.access_token;
  if (!res.ok || !token) throw providerProblem('/authenticate', res.ok ? 502 : res.status, String(json?.message ?? ''));
  cached = { token, at: Date.now() };
  return token;
}

export class ProviderError extends Error {
  constructor(message: string, public status = 502) {
    super(message);
  }
}

/**
 * The provider's answer as a plain reason for the person (never "wrong OTP"
 * when the real problem is the account, the keys or a slow UIDAI). Logged for
 * the site owner (Vercel → Logs) without any Aadhaar number.
 */
function providerProblem(path: string, status: number, message: string): ProviderError {
  console.error(`[kyc] ${path} → ${status}: ${message}`);
  if (/credit|balance|quota|insufficient|billing|subscription|plan|wallet|recharge/i.test(message) || status === 402)
    return new ProviderError('The KashRoot identity-check account has run out of credit. The site owner must add billing in the Sandbox console — please try again later.', 503);
  if (status === 401 || status === 403) return new ProviderError('The identity-check service did not accept KashRoot’s keys. The site owner must check SANDBOX_API_KEY and SANDBOX_API_SECRET in Vercel.', 503);
  if (status === 429) return new ProviderError('Too many checks right now — please wait a minute and try again.', 429);
  if (status >= 500) return new ProviderError(`UIDAI / the identity-check service is not answering properly right now (${message || status}). Please try again in a few minutes.`, 502);
  return new ProviderError(message || `The identity-check service answered ${status}.`, 400);
}

async function call<T = Record<string, unknown>>(path: string, init: { method?: 'GET' | 'POST'; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: init.method ?? 'POST',
      headers: {
        Authorization: await accessToken(),
        'x-api-key': process.env.SANDBOX_API_KEY!,
        'x-api-version': VERSION,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      // UIDAI can take a long while; the route allows 60 s in all.
      signal: AbortSignal.timeout(45_000),
      cache: 'no-store',
    });
  } catch (err) {
    if (err instanceof ProviderError) throw err;
    const slow = err instanceof Error && /timeout|abort/i.test(`${err.name} ${err.message}`);
    console.error(`[kyc] ${path} → ${slow ? 'timed out' : 'network error'}`);
    throw new ProviderError(slow ? 'UIDAI took too long to answer. Please wait a minute and try again (if the OTP does not work again, tap Resend OTP).' : 'Could not reach the identity-check service. Please try again.', 504);
  }
  const json = await res.json().catch(() => ({}));
  if (res.status === 401 || res.status === 403) cached = null;
  if (!res.ok) throw providerProblem(path, res.status, String(json?.message || json?.data?.message || json?.error || ''));
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
  if (String(d.status).toUpperCase() !== 'VALID') {
    const why = String(d.message ?? json.message ?? '');
    console.error(`[kyc] okyc verify → status ${d.status}: ${why}`);
    if (/expire/i.test(why)) throw new ProviderError('This OTP has expired (UIDAI keeps it for about 10 minutes). Tap Resend OTP and enter the new one.', 400);
    if (/invalid|incorrect|wrong|mismatch/i.test(why)) throw new ProviderError('UIDAI says this OTP does not match. Use the latest SMS — each Resend OTP replaces the old code.', 400);
    throw new ProviderError(why ? `UIDAI could not confirm the OTP: ${why}` : 'UIDAI could not confirm the OTP. Tap Resend OTP and try again.', 400);
  }
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

/** PAN numbers look like ABCDE1234F: five letters, four digits, one letter. */
const PAN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

const xmlText = (s: string) =>
  s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

/**
 * The PAN card's number and name from DigiLocker's PAN record (the XML the
 * Income Tax Department issues: <Certificate … number="ABCDE1234F"> with
 * <Person name="…">). Only the last four characters of the number are kept.
 * Null when the document has no PAN number in it.
 */
export function panFromXml(xml: string): { last4: string; name: string } | null {
  const attr = /\bnumber\s*=\s*"([A-Za-z0-9]{10})"/.exec(xml)?.[1]?.toUpperCase();
  let pan = attr && PAN.test(attr) ? attr : '';
  if (!pan) {
    // Another layout: the one PAN-shaped value in the document (never a guess
    // between two), leaving out the digital signature's random letters.
    const body = xml.replace(/<(\w+:)?Signature\b[\s\S]*?<\/(\w+:)?Signature>/gi, '');
    const found = [...new Set(body.match(/\b[A-Z]{5}[0-9]{4}[A-Z]\b/g) ?? [])];
    if (found.length === 1) pan = found[0];
  }
  if (!pan) return null;
  const name = /<Person\b[^>]*\bname\s*=\s*"([^"]*)"/i.exec(xml)?.[1] ?? '';
  return { last4: pan.slice(-4), name: xmlText(name).slice(0, 120) };
}

/**
 * The files of a document shared from DigiLocker (aadhaar or pan) as text —
 * the issuer's XML, skipping PDFs and pictures; [] when DigiLocker has none.
 */
async function digilockerFiles(sessionId: string, doc: 'aadhaar' | 'pan'): Promise<string[]> {
  const json = await call<Data<{ files?: { url?: string }[] }>>(`/kyc/digilocker/sessions/${encodeURIComponent(sessionId)}/documents/${doc}`, { method: 'GET' });
  const texts: string[] = [];
  let failure: unknown = null;
  for (const file of (json.data?.files ?? []).slice(0, 4)) {
    if (!file.url) continue;
    try {
      const res = await fetch(file.url, { signal: AbortSignal.timeout(15_000), cache: 'no-store' });
      if (!res.ok || /pdf|image\//i.test(res.headers.get('content-type') ?? '')) continue;
      texts.push(await res.text());
    } catch (err) {
      failure ??= err;
    }
  }
  if (!texts.length && failure) throw failure;
  return texts;
}

export async function digilockerStatus(sessionId: string) {
  const json = await call<Data<{ status?: string; documents_consented?: string[] }>>(`/kyc/digilocker/sessions/${encodeURIComponent(sessionId)}/status`, { method: 'GET' });
  const status = (json.data?.status ?? 'created').toLowerCase();
  const docs = (json.data?.documents_consented ?? []).map((d) => d.toLowerCase());
  let aadhaarLast4 = '';
  if (status === 'succeeded' && docs.includes('aadhaar')) {
    // The DigiLocker Aadhaar is UIDAI's XML with a masked uid (xxxxxxxx1234).
    try {
      for (const xml of await digilockerFiles(sessionId, 'aadhaar')) {
        aadhaarLast4 = /uid="[xX*]*(\d{4})"/.exec(xml)?.[1] ?? '';
        if (aadhaarLast4) break;
      }
    } catch {
      /* last four digits are a nicety, not a requirement */
    }
  }
  // Allowing PAN on the consent screen is not having a PAN card: it counts
  // only when DigiLocker really sends the PAN record and its number is read.
  let pan: { last4: string; name: string } | null = null;
  let panNote = '';
  if (status === 'succeeded' && docs.some((d) => d === 'pan' || d === 'pancr')) {
    try {
      pan = (await digilockerFiles(sessionId, 'pan')).map(panFromXml).find((p) => p !== null) ?? null;
      if (!pan) panNote = 'DigiLocker did not send a PAN card for this account, so PAN is not verified. Add your PAN with the Income Tax check instead.';
    } catch (err) {
      panNote =
        err instanceof ProviderError && err.status === 400
          ? 'DigiLocker has no PAN card for this account, so PAN is not verified. Add your PAN with the Income Tax check instead.'
          : 'Your PAN card could not be read from DigiLocker just now, so PAN is not verified. Try DigiLocker again later, or use the Income Tax check.';
    }
  }
  return { status, aadhaar: docs.includes('aadhaar'), aadhaarLast4, pan: Boolean(pan), panLast4: pan?.last4 ?? '', panName: pan?.name ?? '', panNote };
}
