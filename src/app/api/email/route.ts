/**
 * The support email (lib/server/mail).
 *
 * GET  /api/email                    → { configured, from, inbox, settings }  (no secret: yes/no, the password's length)
 * GET  /api/email?verify=1           → the same, and { login: { ok, code } }: KashRoot logs in to the
 *     mail server and out again, sending nothing (3 an hour per network, 10 an hour in all).
 * POST /api/email { action: 'test' } → { sent: true } | { sent: false, reason }
 *     KashRoot admins only (Admin → Setup check): sends a real test email to
 *     the support inbox now, not through the queue, and says how it went —
 *     never the password or the mail server's own words. 5 an hour.
 */
import { NextResponse } from 'next/server';

import { mailStatus, sendLetter, supportInbox, verifyLogin } from '@/lib/server/mail';
import { securityEvent } from '@/lib/server/securityLog';
import { sharedIpLimited, sharedLimited } from '@/lib/server/sharedLimit';
import { supabaseAnonKey, supabaseOrigin } from '@/lib/supabase-config';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(req: Request) {
  const headers = { 'cache-control': 'no-store' };
  if (new URL(req.url).searchParams.get('verify') !== '1') return NextResponse.json(mailStatus(), { headers });
  if ((await sharedIpLimited(req, 'email-verify', 3, 3_600_000)) || (await sharedLimited('email-verify', 10, 3_600_000))) return NextResponse.json({ ...mailStatus(), login: { ok: false, code: 'too-many-checks' } }, { status: 429, headers });
  return NextResponse.json({ ...mailStatus(), login: await verifyLogin() }, { headers });
}

/** An admin-only database function, called as the caller (the database decides who is an admin); null when refused. */
async function asCaller(req: Request, fn: 'kr_setup_status' | 'kr_email_status'): Promise<unknown> {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();
  const origin = supabaseOrigin(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anon = supabaseAnonKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  if (!token || !origin || !anon) return null;
  try {
    const res = await fetch(`${origin}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: anon, authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: '{}',
      cache: 'no-store',
      signal: AbortSignal.timeout(6_000),
    });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { action?: string } | null;
  if (body?.action !== 'test') return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  // Admins only: kr_setup_status refuses anyone else. The queue's counts come too once its SQL is run.
  if (!(await asCaller(req, 'kr_setup_status'))) return NextResponse.json({ error: 'Only KashRoot admins can send a test email.' }, { status: 403 });
  const queue = (await asCaller(req, 'kr_email_status')) ?? undefined;
  if (await sharedLimited('email-test', 5, 3_600_000)) return NextResponse.json({ sent: false, reason: 'Five test emails were sent in the last hour. Try again later.', queue }, { status: 429 });
  const when = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
  const result = await sendLetter({
    to: supportInbox(),
    subject: `KashRoot test email — ${when}`,
    lines: ['This is a test email from Admin → Setup check.', `Sent ${when} (India time). If you can read this, KashRoot's emails work.`],
  });
  securityEvent(result.ok ? 'email_sent' : 'email_failed', { request: req, detail: result.ok ? 'setup test' : `setup test: ${result.reason}` });
  return NextResponse.json(result.ok ? { sent: true, to: supportInbox(), queue } : { sent: false, reason: result.reason, queue });
}
