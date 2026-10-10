/**
 * POST multipart { file: Aadhaar Offline e-KYC ZIP, shareCode, mobile? } — free
 * verification against UIDAI's signature. Nothing is stored.
 */
import { NextResponse } from 'next/server';

import { OfflineKycError, verifyOfflineXmlZip } from '@/lib/server/aadhaar-offline';
import { requireUser } from '@/lib/server/auth';
import { rateLimited } from '@/lib/server/sign';
import { SIGN_IN_FIRST } from '../../notConfigured';

export async function POST(request: Request) {
  const user = await requireUser(request);
  if (!user) return SIGN_IN_FIRST();
  if (rateLimited(`offline-kyc:${user.id}`, 10, 60 * 60_000)) return NextResponse.json({ error: 'Too many attempts. Try again in an hour.' }, { status: 429 });
  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'Choose the Aadhaar ZIP file you downloaded.' }, { status: 400 });
  if (file.size > 2 * 1024 * 1024) return NextResponse.json({ error: 'That file is too large to be an Aadhaar Offline e-KYC ZIP.' }, { status: 400 });
  try {
    const result = verifyOfflineXmlZip(Buffer.from(await file.arrayBuffer()), String(form?.get('shareCode') ?? ''), String(form?.get('mobile') ?? '') || undefined);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof OfflineKycError) return NextResponse.json({ error: err.message }, { status: 400 });
    return NextResponse.json({ error: 'Could not check the file. Please try again.' }, { status: 500 });
  }
}
