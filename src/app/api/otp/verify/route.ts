/** POST { token, code } → { verified: true, proof } */
import { NextResponse } from 'next/server';

import { checkCode, proofFor } from '@/lib/server/otp';
import { hasSigningSecret, rateLimited } from '@/lib/server/sign';

export async function POST(request: Request) {
  if (!hasSigningSecret()) return NextResponse.json({ error: 'Verification is not configured.' }, { status: 503 });
  const { token, code } = (await request.json().catch(() => ({}))) as { token?: string; code?: string };
  const id = String(token ?? '').split('.')[0]?.slice(0, 64) ?? '';
  if (rateLimited(`otp-verify:${id}`, 5, 15 * 60_000)) return NextResponse.json({ error: 'Too many wrong codes. Request a new one.' }, { status: 429 });
  const result = checkCode(String(token ?? ''), String(code ?? ''));
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 400 });
  return NextResponse.json({ verified: true, channel: result.channel, to: result.to, proof: proofFor(result.channel, result.to) });
}
