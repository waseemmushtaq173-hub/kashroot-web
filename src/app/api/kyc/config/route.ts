/**
 * GET — which verification paths are live. The KYC panel uses this to switch
 * itself from the free offline flow to online checks (Aadhaar OTP, DigiLocker,
 * PAN with Income Tax) as soon as the provider keys are added. No secrets here.
 */
import { NextResponse } from 'next/server';

import { emailConfigured, smsConfigured } from '@/lib/server/otp';
import { sandboxConfigured } from '@/lib/server/sandbox';
import { hasSigningSecret } from '@/lib/server/sign';

export const dynamic = 'force-dynamic';

export function GET() {
  const signing = hasSigningSecret();
  return NextResponse.json({
    online: sandboxConfigured(),
    offline: true,
    sms: signing && smsConfigured(),
    email: signing && emailConfigured(),
  });
}
