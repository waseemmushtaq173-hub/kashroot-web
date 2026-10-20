/**
 * GET ?session=&ticket= — has the user finished consenting in DigiLocker?
 * Answers { status, aadhaar, aadhaarLast4, pan, panLast4, panNote, recorded }:
 * pan is true only when the PAN card itself was read from DigiLocker.
 */
import { NextResponse } from 'next/server';

import { requireUser } from '@/lib/server/auth';
import { recordKyc } from '@/lib/server/kycRecord';
import { digilockerStatus, sandboxConfigured } from '@/lib/server/sandbox';
import { verifySignature } from '@/lib/server/sign';
import { KYC_NOT_CONFIGURED, providerFailure, SIGN_IN_FIRST } from '../../notConfigured';
import { ipLimited, tooMany } from '@/lib/server/sign';


// UIDAI can be slow to answer: give the check up to a minute.
export const maxDuration = 60;
export async function GET(request: Request) {
  if (ipLimited(request, 'kyc-digilocker-status', 30)) return tooMany();
  const user = await requireUser(request);
  if (!user) return SIGN_IN_FIRST();
  if (!sandboxConfigured()) return KYC_NOT_CONFIGURED();
  const q = new URL(request.url).searchParams;
  const session = q.get('session') ?? '';
  const ticket = q.get('ticket') ?? '';
  if (!session || !verifySignature(`${user.id}|${session}`, ticket)) return NextResponse.json({ error: 'Unknown DigiLocker session.' }, { status: 400 });
  try {
    const { panName, ...result } = await digilockerStatus(session);
    let recorded = false;
    if (result.status === 'succeeded') {
      if (result.aadhaar) recorded = await recordKyc(request, 'aadhaar', { last4: result.aadhaarLast4, method: 'DIGILOCKER' });
      // PAN only when its card really came from DigiLocker (its last four
      // characters read from it) — allowing PAN on the consent screen is not having one.
      if (result.pan && result.panLast4) recorded = (await recordKyc(request, 'pan', { last4: result.panLast4, name: panName, method: 'DIGILOCKER' })) || recorded;
    }
    return NextResponse.json({ ...result, recorded });
  } catch (err) {
    return providerFailure(err);
  }
}
