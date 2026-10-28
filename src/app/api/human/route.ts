/**
 * The human pass (lib/server/humanPass).
 * GET  /api/human            → { on, pass }  (is the check on; does this browser hold a pass)
 * POST /api/human { token }  → { ok } and the kr_human cookie, when the Turnstile token is real.
 */
import { NextResponse } from 'next/server';

import { isHuman } from '@/lib/server/humanCheck';
import { hasHumanPass, humanPassCookie, humanPassOn } from '@/lib/server/humanPass';
import { sharedIpLimited } from '@/lib/server/sharedLimit';

export function GET(request: Request) {
  return NextResponse.json({ on: humanPassOn(), pass: hasHumanPass(request) }, { headers: { 'cache-control': 'no-store' } });
}

export async function POST(request: Request) {
  if (await sharedIpLimited(request, 'human-pass', 20)) return NextResponse.json({ error: 'Too many tries. Please wait a minute.' }, { status: 429 });
  const body = (await request.json().catch(() => null)) as { token?: unknown } | null;
  if (!humanPassOn()) return NextResponse.json({ ok: true });
  if (!(await isHuman(request, body?.token))) return NextResponse.json({ error: 'The check did not pass. Please try again.' }, { status: 403 });
  return NextResponse.json({ ok: true }, { headers: { 'set-cookie': humanPassCookie(request), 'cache-control': 'no-store' } });
}
