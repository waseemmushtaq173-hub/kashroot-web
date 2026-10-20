/**
 * Records a successful Aadhaar / PAN check in the database (identity_checks), as
 * the signed-in user, proving it is the KashRoot server with KYC_DB_SECRET
 * (made by `select public.kr_kyc_secret();` in the Supabase SQL Editor).
 * Without the secret nothing is recorded and false is returned — users can
 * never mark themselves verified. Server-only.
 */
import 'server-only';

import { supabaseAnonKey, supabaseOrigin } from '@/lib/supabase-config';

export const kycRecordingConfigured = () => Boolean(process.env.KYC_DB_SECRET?.trim());

export async function recordKyc(request: Request, kind: 'aadhaar' | 'pan', check: { last4?: string; name?: string; method: string }): Promise<boolean> {
  const secret = process.env.KYC_DB_SECRET?.trim();
  const origin = supabaseOrigin(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anon = supabaseAnonKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();
  if (!secret || !origin || !anon || !token) return false;
  // A PAN counts only with the last four characters read from the card or the Income Tax record.
  if (kind === 'pan' && !/^[A-Z0-9]{4}$/.test((check.last4 ?? '').toUpperCase())) return false;
  try {
    const res = await fetch(`${origin}/rest/v1/rpc/kr_record_kyc`, {
      method: 'POST',
      headers: { apikey: anon, authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ p_secret: secret, p_kind: kind, p_last4: check.last4 ?? '', p_name: check.name ?? '', p_method: check.method }),
      signal: AbortSignal.timeout(8_000),
      cache: 'no-store',
    });
    return res.ok && (await res.json()) === true;
  } catch {
    return false;
  }
}
