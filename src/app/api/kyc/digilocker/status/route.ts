/** GET ?session=&ticket= — has the user finished consenting in DigiLocker? */
import { NextResponse } from 'next/server';

import { requireUser } from '@/lib/server/auth';
import { recordKyc } from '@/lib/server/kycRecord';
import { digilockerStatus, sandboxConfigured } from '@/lib/server/sandbox';
import { verifySignature } from '@/lib/server/sign';
import { KYC_NOT_CONFIGURED, providerFailure, SIGN_IN_FIRST } from '../../notConfigured';

export async function GET(request: Request) {
  const user = await requireUser(request);
  if (!user) return SIGN_IN_FIRST();
  if (!sandboxConfigured()) return KYC_NOT_CONFIGURED();
  const q = new URL(request.url).searchParams;
  const session = q.get('session') ?? '';
  const ticket = q.get('ticket') ?? '';
  if (!session || !verifySignature(`${user.id}|${session}`, ticket)) return NextResponse.json({ error: 'Unknown DigiLocker session.' }, { status: 400 });
  try {
    const result = await digilockerStatus(session);
    let recorded = false;
    if (result.status === 'succeeded') {
      if (result.aadhaar) recorded = await recordKyc(request, 'aadhaar', { last4: result.aadhaarLast4, method: 'DIGILOCKER' });
      if (result.pan) recorded = (await recordKyc(request, 'pan', { method: 'DIGILOCKER' })) || recorded;
    }
    return NextResponse.json({ ...result, recorded });
  } catch (err) {
    return providerFailure(err);
  }
}
