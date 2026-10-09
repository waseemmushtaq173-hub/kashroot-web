/** POST { aadhaar } — UIDAI texts an OTP to the Aadhaar-linked mobile. */
import { NextResponse } from 'next/server';

import { isValidAadhaar } from '@/lib/kyc/validators';
import { requireUser } from '@/lib/server/auth';
import { aadhaarSendOtp, sandboxConfigured } from '@/lib/server/sandbox';
import { rateLimited } from '@/lib/server/sign';
import { KYC_NOT_CONFIGURED, providerFailure, SIGN_IN_FIRST } from '../../notConfigured';

export async function POST(request: Request) {
  const user = await requireUser(request);
  if (!user) return SIGN_IN_FIRST();
  if (!sandboxConfigured()) return KYC_NOT_CONFIGURED();
  const { aadhaar } = (await request.json().catch(() => ({}))) as { aadhaar?: string };
  const digits = String(aadhaar ?? '').replace(/\D/g, '');
  if (!isValidAadhaar(digits)) return NextResponse.json({ error: 'Enter a valid 12-digit Aadhaar number.' }, { status: 400 });
  if (rateLimited(`aadhaar:${user.id}`, 5, 60 * 60_000)) return NextResponse.json({ error: 'Too many OTP requests. Try again in an hour.' }, { status: 429 });
  try {
    const { referenceId } = await aadhaarSendOtp(digits);
    return NextResponse.json({ referenceId, last4: digits.slice(-4) });
  } catch (err) {
    return providerFailure(err);
  }
}
