/** POST { qr, mobile? } — free verification of an Aadhaar Secure QR against UIDAI's signature. */
import { NextResponse } from 'next/server';

import { OfflineKycError, verifySecureQr } from '@/lib/server/aadhaar-offline';
import { requireUser } from '@/lib/server/auth';
import { rateLimited } from '@/lib/server/sign';
import { SIGN_IN_FIRST } from '../../notConfigured';

export async function POST(request: Request) {
  const user = await requireUser(request);
  if (!user) return SIGN_IN_FIRST();
  if (rateLimited(`offline-qr:${user.id}`, 15, 60 * 60_000)) return NextResponse.json({ error: 'Too many attempts. Try again in an hour.' }, { status: 429 });
  const { qr, mobile } = (await request.json().catch(() => ({}))) as { qr?: string; mobile?: string };
  if (!qr || qr.length > 20_000) return NextResponse.json({ error: 'Scan the QR code on your Aadhaar.' }, { status: 400 });
  try {
    return NextResponse.json(verifySecureQr(qr, mobile || undefined));
  } catch (err) {
    if (err instanceof OfflineKycError) return NextResponse.json({ error: err.message }, { status: 400 });
    return NextResponse.json({ error: 'Could not check the QR. Please try again.' }, { status: 500 });
  }
}
