/**
 * The security gate (lib/server/gate, components/security/SecurityGate).
 *
 * GET  /api/gate          → { on, passed, place, tap }  does this browser hold a
 *      valid gate; must everyone press "Tap to confirm" (the Super Admin's
 *      switch, 20261114000000_gate_tap.sql)? Light and fast: the page calls it
 *      as it opens, which also wakes this route before the token arrives.
 * POST /api/gate { token, place, tapped, confirmed } → { ok } and the kr_gate
 *      cookie, when the "I am human" token (hCaptcha) is real and from
 *      KashRoot's address. 20 tries a minute per network. hCaptcha's
 *      verdict waits at most 5 s; a refusal says why in plain words
 *      ("Security check failed: …"). Passes are logged by place and how —
 *      silent, after hCaptcha's puzzle, or after our confirm button (as the
 *      browser reports it) — failures by reason (Admin → Security); each POST
 *      logs how long its steps took (never the token).
 */
import { NextResponse } from 'next/server';

import { noteBotFailure } from '@/lib/server/botAlert';
import { checkContext } from '@/lib/server/browserFamily';
import { gateCookie, GATE_PLACES, gateOn, passedGate } from '@/lib/server/gate';
import { checkGateToken, gateReasonText } from '@/lib/server/humanCheck';
import { securityEvent } from '@/lib/server/securityLog';
import { sharedIpLimited } from '@/lib/server/sharedLimit';
import { hasSigningSecret } from '@/lib/server/sign';
import { supabaseAnonKey, supabaseOrigin } from '@/lib/supabase-config';

export const dynamic = 'force-dynamic';

/** The Super Admin's switch, remembered for a minute on this server instance (it rarely changes). */
let tapCache: { value: boolean; until: number } | null = null;

/** The Super Admin's "Ask everyone to tap the box" switch (off when it cannot be read). */
async function tapRequired(): Promise<boolean> {
  if (tapCache && tapCache.until > Date.now()) return tapCache.value;
  const origin = supabaseOrigin(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anon = supabaseAnonKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  if (!origin || !anon) return false;
  try {
    const res = await fetch(`${origin}/rest/v1/rpc/kr_gate_settings`, { method: 'POST', headers: { apikey: anon, authorization: `Bearer ${anon}`, 'content-type': 'application/json' }, body: '{}', cache: 'no-store', signal: AbortSignal.timeout(2_000) });
    const value = res.ok && Boolean(((await res.json()) as { tap?: boolean }).tap);
    if (res.ok) tapCache = { value, until: Date.now() + 60_000 };
    return value;
  } catch {
    return tapCache?.value ?? false;
  }
}

export async function GET(request: Request) {
  const gate = passedGate(request);
  return NextResponse.json({ on: gateOn(), passed: Boolean(gate), place: gate?.place ?? null, tap: await tapRequired() }, { headers: { 'cache-control': 'no-store' } });
}

export async function POST(request: Request) {
  const begun = Date.now();
  const body = (await request.json().catch(() => null)) as { token?: unknown; place?: unknown; tapped?: unknown; confirmed?: unknown; brave?: unknown; retries?: unknown } | null;
  const place = String(body?.place ?? '');
  if (!GATE_PLACES.test(place)) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  if (!hasSigningSecret()) return NextResponse.json({ ok: true, off: true });
  // The shared count and hCaptcha's verdict side by side: the slower of the two, not both added up.
  let limitMs = 0;
  let verifyMs = 0;
  const [limited, result] = await Promise.all([
    // The shared count may take 1 s at most (then this instance's own count decides): the form opens about 1 s after "Success!".
    sharedIpLimited(request, 'gate', 20, 60_000, 1_000).finally(() => (limitMs = Date.now() - begun)),
    checkGateToken(request, body?.token).finally(() => (verifyMs = Date.now() - begun)),
  ]);
  const timing = { 'server-timing': `limit;dur=${limitMs}, verify;dur=${verifyMs}, total;dur=${Date.now() - begun}`, 'cache-control': 'no-store' };
  console.info(JSON.stringify({ 'kr-gate': place, ok: result.ok && !limited, reason: limited ? 'rate-limited' : result.reason, limitMs, verifyMs, totalMs: Date.now() - begun }));
  if (limited) return NextResponse.json({ error: 'Security check failed: too many tries from this network. Please wait a minute, then tap Retry.' }, { status: 429, headers: timing });
  if (!result.ok) {
    securityEvent('bot_check_failed', { request, code: `gate: ${result.reason}`, detail: `(gate-${place})${checkContext(request, body)}` });
    noteBotFailure(request);
    return NextResponse.json({ error: `Security check failed: ${gateReasonText(result.reason)}`, reason: result.reason }, { status: 403, headers: timing });
  }
  const how = body?.confirmed === true ? '(after the confirm button)' : body?.tapped === true ? '(after a tap)' : '(silent)';
  securityEvent('gate_passed', { request, code: place, detail: `${how}${checkContext(request, body)}` });
  return NextResponse.json({ ok: true }, { headers: { ...timing, 'set-cookie': gateCookie(request, place) } });
}
