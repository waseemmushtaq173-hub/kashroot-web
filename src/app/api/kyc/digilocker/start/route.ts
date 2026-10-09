/** POST — starts a DigiLocker consent session; returns the URL to open. */
import { NextResponse } from 'next/server';

import { requireUser } from '@/lib/server/auth';
import { digilockerStart, sandboxConfigured } from '@/lib/server/sandbox';
import { sign } from '@/lib/server/sign';
import { KYC_NOT_CONFIGURED, providerFailure, SIGN_IN_FIRST } from '../../notConfigured';

export async function POST(request: Request) {
  const user = await requireUser(request);
  if (!user) return SIGN_IN_FIRST();
  if (!sandboxConfigured()) return KYC_NOT_CONFIGURED();
  const origin = new URL(request.url).origin;
  if (!origin.startsWith('https://')) return NextResponse.json({ error: 'DigiLocker needs the site to run on HTTPS.' }, { status: 400 });
  try {
    const { sessionId, authorizationUrl } = await digilockerStart(`${origin}/kyc/digilocker/done`);
    // Binds the session to this user, so nobody else can claim its result.
    return NextResponse.json({ sessionId, authorizationUrl, ticket: sign(`${user.id}|${sessionId}`) });
  } catch (err) {
    return providerFailure(err);
  }
}
