/**
 * The security gate (lib/server/gate, components/security/SecurityGate).
 *
 * GET  /api/gate          → { on, passed, place }  does this browser hold a valid gate?
 * POST /api/gate { token, place } → { ok } and the kr_gate cookie, when the
 *      "I am human" token is real, from KashRoot's address, and for
 *      "gate-<place>". 20 tries a minute per network. Passes and failures are
 *      logged by place (Admin → Security).
 */
import { NextResponse } from 'next/server';

import { noteBotFailure } from '@/lib/server/botAlert';
import { gateCookie, GATE_PLACES, gateOn, passedGate } from '@/lib/server/gate';
import { checkGateToken } from '@/lib/server/humanCheck';
import { securityEvent } from '@/lib/server/securityLog';
import { sharedIpLimited } from '@/lib/server/sharedLimit';
import { hasSigningSecret } from '@/lib/server/sign';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  const gate = passedGate(request);
  return NextResponse.json({ on: gateOn(), passed: Boolean(gate), place: gate?.place ?? null }, { headers: { 'cache-control': 'no-store' } });
}

export async function POST(request: Request) {
  if (await sharedIpLimited(request, 'gate', 20)) return NextResponse.json({ error: 'Too many tries. Please wait a minute.' }, { status: 429 });
  const body = (await request.json().catch(() => null)) as { token?: unknown; place?: unknown } | null;
  const place = String(body?.place ?? '');
  if (!GATE_PLACES.test(place)) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  if (!hasSigningSecret()) return NextResponse.json({ ok: true, off: true });
  const result = await checkGateToken(request, body?.token, `gate-${place}`);
  if (!result.ok) {
    securityEvent('bot_check_failed', { request, code: `gate: ${result.reason}`, detail: `(gate-${place})` });
    noteBotFailure(request);
    return NextResponse.json({ error: 'The security check was not accepted. Please tap Retry.' }, { status: 403 });
  }
  securityEvent('gate_passed', { request, code: place });
  return NextResponse.json({ ok: true }, { headers: { 'set-cookie': gateCookie(request, place), 'cache-control': 'no-store' } });
}
