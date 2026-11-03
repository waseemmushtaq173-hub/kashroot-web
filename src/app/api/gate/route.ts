/**
 * The security gate (lib/server/gate, components/security/SecurityGate).
 *
 * GET  /api/gate          → { on, passed, place, tap }  does this browser hold a
 *      valid gate; must everyone press "Tap to confirm" (the Super Admin's
 *      switch, 20261114000000_gate_tap.sql)?
 * POST /api/gate { token, place, tapped, confirmed } → { ok } and the kr_gate
 *      cookie, when the "I am human" token is real, from KashRoot's address,
 *      and for "gate-<place>". 20 tries a minute per network. Passes are
 *      logged by place and how — silent, after Cloudflare's tap, or after our
 *      confirm button (as the browser reports it) — failures by reason
 *      (Admin → Security).
 */
import { NextResponse } from 'next/server';

import { noteBotFailure } from '@/lib/server/botAlert';
import { gateCookie, GATE_PLACES, gateOn, passedGate } from '@/lib/server/gate';
import { checkGateToken } from '@/lib/server/humanCheck';
import { securityEvent } from '@/lib/server/securityLog';
import { sharedIpLimited } from '@/lib/server/sharedLimit';
import { hasSigningSecret } from '@/lib/server/sign';
import { supabaseAnonKey, supabaseOrigin } from '@/lib/supabase-config';

export const dynamic = 'force-dynamic';

/** The Super Admin's "Ask everyone to tap the box" switch (off when it cannot be read). */
async function tapRequired(): Promise<boolean> {
  const origin = supabaseOrigin(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anon = supabaseAnonKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  if (!origin || !anon) return false;
  try {
    const res = await fetch(`${origin}/rest/v1/rpc/kr_gate_settings`, { method: 'POST', headers: { apikey: anon, authorization: `Bearer ${anon}`, 'content-type': 'application/json' }, body: '{}', cache: 'no-store', signal: AbortSignal.timeout(3_000) });
    return res.ok && Boolean(((await res.json()) as { tap?: boolean }).tap);
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  const gate = passedGate(request);
  return NextResponse.json({ on: gateOn(), passed: Boolean(gate), place: gate?.place ?? null, tap: await tapRequired() }, { headers: { 'cache-control': 'no-store' } });
}

export async function POST(request: Request) {
  if (await sharedIpLimited(request, 'gate', 20)) return NextResponse.json({ error: 'Too many tries. Please wait a minute.' }, { status: 429 });
  const body = (await request.json().catch(() => null)) as { token?: unknown; place?: unknown; tapped?: unknown; confirmed?: unknown } | null;
  const place = String(body?.place ?? '');
  if (!GATE_PLACES.test(place)) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  if (!hasSigningSecret()) return NextResponse.json({ ok: true, off: true });
  const result = await checkGateToken(request, body?.token, `gate-${place}`);
  if (!result.ok) {
    securityEvent('bot_check_failed', { request, code: `gate: ${result.reason}`, detail: `(gate-${place})` });
    noteBotFailure(request);
    return NextResponse.json({ error: 'The security check was not accepted. Please tap Retry.' }, { status: 403 });
  }
  const how = body?.confirmed === true ? '(after the confirm button)' : body?.tapped === true ? '(after a tap)' : '(silent)';
  securityEvent('gate_passed', { request, code: place, detail: how });
  return NextResponse.json({ ok: true }, { headers: { 'set-cookie': gateCookie(request, place), 'cache-control': 'no-store' } });
}
