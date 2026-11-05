/**
 * The human pass (lib/server/humanPass).
 * GET  /api/human            → { on, pass }  (is the check on; does this browser hold a pass)
 * POST /api/human { token }  → { ok } and the kr_human cookie, when the hCaptcha token is real.
 * POST /api/human { diagnose, otherAddress } → hCaptcha's verdict on that
 *      fresh token with this server's secret (the /status test; the token is
 *      used up and never shown). 10 a minute.
 * POST /api/human { report, action, host, brave, retries } → { ok }: the
 *      security check could not finish in a browser (components/security/
 *      HumanCheck) — its error code, the site address, the browser family
 *      ("Chrome on Android", lib/server/browserFamily) and first try or after
 *      Retry are logged for Admin → Security, nothing personal.
 */
import { NextResponse } from 'next/server';

import { noteBotFailure } from '@/lib/server/botAlert';
import { checkContext } from '@/lib/server/browserFamily';
import { securityEvent } from '@/lib/server/securityLog';
import { diagnoseToken, isHuman } from '@/lib/server/humanCheck';
import { hasHumanPass, humanPassCookie, humanPassOn } from '@/lib/server/humanPass';
import { sharedIpLimited } from '@/lib/server/sharedLimit';

export function GET(request: Request) {
  return NextResponse.json({ on: humanPassOn(), pass: hasHumanPass(request) }, { headers: { 'cache-control': 'no-store' } });
}

export async function POST(request: Request) {
  if (await sharedIpLimited(request, 'human-pass', 20)) return NextResponse.json({ error: 'Too many tries. Please wait a minute.' }, { status: 429 });
  const body = (await request.json().catch(() => null)) as { token?: unknown; report?: unknown; action?: unknown; host?: unknown; diagnose?: unknown; otherAddress?: unknown; brave?: unknown; retries?: unknown } | null;
  if (typeof body?.diagnose === 'string' && body.diagnose) {
    if (await sharedIpLimited(request, 'human-diagnose', 10)) return NextResponse.json({ error: 'Too many tries. Please wait a minute.' }, { status: 429 });
    return NextResponse.json(await diagnoseToken(request, body.diagnose, body.otherAddress === true), { headers: { 'cache-control': 'no-store' } });
  }
  if (typeof body?.report === 'string') {
    const code = body.report.replace(/[^\w-]/g, '').slice(0, 40);
    const action = String(body.action ?? '').replace(/[^\w-]/g, '').slice(0, 20);
    securityEvent('bot_check_failed', { request, code: `browser: ${code}`, detail: `${action ? `(${action})` : ''}${checkContext(request, body)}`, site: String(body.host ?? '') });
    noteBotFailure(request);
    return NextResponse.json({ ok: true });
  }
  if (!humanPassOn()) return NextResponse.json({ ok: true });
  if (!(await isHuman(request, body?.token))) return NextResponse.json({ error: 'The check did not pass. Please try again.' }, { status: 403 });
  return NextResponse.json({ ok: true }, { headers: { 'set-cookie': humanPassCookie(request), 'cache-control': 'no-store' } });
}
