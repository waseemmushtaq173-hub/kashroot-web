import { NextResponse } from 'next/server';

export const KYC_NOT_CONFIGURED = () =>
  NextResponse.json(
    { configured: false, error: 'Identity verification is not connected yet. The site owner needs a KYC provider account (Sandbox.co.in) and must add SANDBOX_API_KEY and SANDBOX_API_SECRET.' },
    { status: 503 },
  );

export const SIGN_IN_FIRST = () => NextResponse.json({ error: 'Please sign in again to verify your identity.' }, { status: 401 });

export function providerFailure(err: unknown) {
  const status = typeof err === 'object' && err && 'status' in err && typeof (err as { status: unknown }).status === 'number' ? (err as { status: number }).status : 502;
  const message = err instanceof Error ? err.message : 'The verification service did not respond.';
  return NextResponse.json({ error: message }, { status });
}
