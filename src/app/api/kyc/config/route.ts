/**
 * GET — which verification paths are live. The KYC panel uses this to switch
 * itself from the free offline flow to online checks (Aadhaar OTP, DigiLocker,
 * PAN with Income Tax) as soon as the provider keys are added. No secrets here.
 */
import { NextResponse } from 'next/server';

import { kycRecordingConfigured } from '@/lib/server/kycRecord';
import { emailConfigured, smsConfigured, whatsappConfigured } from '@/lib/server/otp';
import { sandboxConfigured } from '@/lib/server/sandbox';
import { hasSigningSecret } from '@/lib/server/sign';

export const dynamic = 'force-dynamic';

export function GET() {
  const signing = hasSigningSecret();
  return NextResponse.json({
    online: sandboxConfigured(),
    offline: true,
    // Whether this server can record checks in the database (KYC_DB_SECRET set).
    recording: kycRecordingConfigured(),
    sms: signing && smsConfigured(),
    whatsapp: signing && whatsappConfigured(),
    email: signing && emailConfigured(),
  });
}
