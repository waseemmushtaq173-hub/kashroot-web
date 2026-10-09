/** POST { referenceId, otp, last4 } — confirms the Aadhaar OTP. */
import { NextResponse } from 'next/server';

import { requireUser } from '@/lib/server/auth';
import { aadhaarVerifyOtp, sandboxConfigured } from '@/lib/server/sandbox';
import { rateLimited } from '@/lib/server/sign';
import { KYC_NOT_CONFIGURED, providerFailure, SIGN_IN_FIRST } from '../../notConfigured';

export async function POST(request: Request) {
  const user = await requireUser(request);
  if (!user) return SIGN_IN_FIRST();
  if (!sandboxConfigured()) return KYC_NOT_CONFIGURED();
  const { referenceId, otp, last4 } = (await request.json().catch(() => ({}))) as { referenceId?: string; otp?: string; last4?: string };
  if (!referenceId || !/^\d{6}$/.test(String(otp))) return NextResponse.json({ error: 'Enter the 6-digit OTP.' }, { status: 400 });
  if (rateLimited(`aadhaar-verify:${user.id}`, 10, 30 * 60_000)) return NextResponse.json({ error: 'Too many attempts. Request a new OTP later.' }, { status: 429 });
  try {
    const person = await aadhaarVerifyOtp(String(referenceId), String(otp));
    return NextResponse.json({
      referenceId: String(referenceId),
      aadhaarLast4: /^\d{4}$/.test(String(last4)) ? String(last4) : '',
      name: person.name,
      dateOfBirth: person.dateOfBirth,
      yearOfBirth: person.yearOfBirth,
      state: person.state,
    });
  } catch (err) {
    return providerFailure(err);
  }
}
