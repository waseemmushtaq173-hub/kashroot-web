import { NextResponse } from 'next/server';

import { ProviderError } from '@/lib/server/sandbox';

export const KYC_NOT_CONFIGURED = () =>
  NextResponse.json(
    { configured: false, error: 'Identity verification is not connected yet. The site owner needs a KYC provider account (Sandbox.co.in) and must add SANDBOX_API_KEY and SANDBOX_API_SECRET.' },
    { status: 503 },
  );

export const SIGN_IN_FIRST = () => NextResponse.json({ error: 'Please sign in again to verify your identity.' }, { status: 401 });

/**
 * A failed identity check in plain words. Only messages written for people
 * (lib/server/sandbox ProviderError: "UIDAI says this OTP does not match…")
 * are shown; anything else stays in the server's log.
 */
export function providerFailure(err: unknown) {
  if (err instanceof ProviderError) return NextResponse.json({ error: err.message }, { status: err.status });
  console.error('Identity check failed:', err);
  return NextResponse.json({ error: 'The verification service did not respond. Please try again in a minute.' }, { status: 502 });
}
