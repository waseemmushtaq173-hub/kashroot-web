/** POST { pan, name, dob: 'DD/MM/YYYY' } — checks the PAN with the Income Tax database. */
import { NextResponse } from 'next/server';

import { isValidPan } from '@/lib/kyc/validators';
import { requireUser } from '@/lib/server/auth';
import { panVerify, sandboxConfigured } from '@/lib/server/sandbox';
import { rateLimited } from '@/lib/server/sign';
import { KYC_NOT_CONFIGURED, providerFailure, SIGN_IN_FIRST } from '../notConfigured';

export async function POST(request: Request) {
  const user = await requireUser(request);
  if (!user) return SIGN_IN_FIRST();
  if (!sandboxConfigured()) return KYC_NOT_CONFIGURED();
  const { pan, name, dob } = (await request.json().catch(() => ({}))) as { pan?: string; name?: string; dob?: string };
  const p = String(pan ?? '').toUpperCase();
  if (!isValidPan(p)) return NextResponse.json({ error: 'Enter a valid PAN.' }, { status: 400 });
  if (!name?.trim() || !/^\d{2}\/\d{2}\/\d{4}$/.test(String(dob))) return NextResponse.json({ error: 'Enter your name and date of birth exactly as on the PAN card.' }, { status: 400 });
  if (rateLimited(`pan:${user.id}`, 8, 60 * 60_000)) return NextResponse.json({ error: 'Too many PAN checks. Try again later.' }, { status: 429 });
  try {
    return NextResponse.json(await panVerify(p, name.trim().slice(0, 100), String(dob)));
  } catch (err) {
    return providerFailure(err);
  }
}
