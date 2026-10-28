/**
 * Help & Support requests (20261105000000_support_desk.sql), for anyone —
 * also someone who cannot sign in.
 *
 * POST /api/support
 *   { action: 'open', name, phone, email?, topic, portal?, lang?, message } → { code }
 *   { action: 'status', code, phone }  → { request } (404: no request with that code and phone)
 *   { action: 'add', code, phone, body } → { ok }
 *
 * Only this server can open or read requests (KYC_DB_SECRET); a signed-in
 * person's bearer token is passed on, so their request is linked to their
 * account. Limits per person, so the desk cannot be flooded. Without the
 * secret it says honestly that requests are not switched on, with the email.
 */
import { NextResponse } from 'next/server';

import { isHuman, NOT_HUMAN } from '@/lib/server/humanCheck';
import { hashed, sharedIpLimited, sharedLimited } from '@/lib/server/sharedLimit';
import { supabaseAnonKey, supabaseOrigin } from '@/lib/supabase-config';

export const maxDuration = 20;

const TOPICS = ['login', 'payment', 'order', 'cold_storage', 'selling', 'other'];
const LANGS = ['en', 'hi', 'ur', 'ks'];
const NOT_ON = 'Help requests are not switched on yet. Please email support@kashroot.com — say your name, mobile number and the problem.';
const BUSY = 'KashRoot could not take your request just now. Please try again in a minute, or email support@kashroot.com.';

/** A 10-digit Indian mobile number, from "+91 98765 43210" and the like; null when it is not one. */
function mobileOf(raw: unknown): string | null {
  const d = String(raw ?? '').replace(/\D/g, '').replace(/^(91|0)(?=[6-9]\d{9}$)/, '');
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}
const clean = (v: unknown, max: number) => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max);

async function rpc(fn: string, args: Record<string, unknown>, bearer?: string): Promise<{ ok: boolean; body: unknown }> {
  const origin = supabaseOrigin(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anon = supabaseAnonKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  if (!origin || !anon) return { ok: false, body: null };
  try {
    const res = await fetch(`${origin}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: anon, authorization: `Bearer ${bearer || anon}`, 'content-type': 'application/json' },
      body: JSON.stringify(args),
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    });
    return { ok: res.ok, body: await res.json().catch(() => null) };
  } catch {
    return { ok: false, body: null };
  }
}

export async function POST(req: Request) {
  const secret = process.env.KYC_DB_SECRET?.trim();
  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  if (!secret) return NextResponse.json({ error: NOT_ON }, { status: 503 });
  const phone = mobileOf(b.phone);
  if (!phone) return NextResponse.json({ error: 'Write your 10-digit mobile number.' }, { status: 400 });

  if (b.action === 'open') {
    const name = clean(b.name, 80);
    const message = clean(b.message, 2000);
    const topic = TOPICS.includes(String(b.topic)) ? String(b.topic) : 'other';
    const lang = LANGS.includes(String(b.lang)) ? String(b.lang) : 'en';
    const email = clean(b.email, 120);
    if (!name) return NextResponse.json({ error: 'Write your name.' }, { status: 400 });
    if (message.length < 5) return NextResponse.json({ error: 'Tell us the problem in a few words.' }, { status: 400 });
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: 'That email does not look right — or leave it empty.' }, { status: 400 });
    if (!(await isHuman(req, b.human))) return NextResponse.json({ error: NOT_HUMAN }, { status: 403 });
    if ((await sharedIpLimited(req, 'support-open', 5, 3_600_000)) || (await sharedLimited(`support-open:phone:${hashed(phone)}`, 5, 86_400_000))) {
      return NextResponse.json({ error: 'You have sent several requests already. KashRoot will call you — or check your request below with its number.' }, { status: 429 });
    }
    // Signed in: the request belongs to their account (the token is checked by Supabase).
    const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() || undefined;
    const args = { p_secret: secret, p_name: name, p_phone: phone, p_email: email || null, p_topic: topic, p_portal: clean(b.portal, 30) || null, p_lang: lang, p_message: message };
    let r = await rpc('kr_support_open', args, bearer);
    // An expired sign-in should never stop someone asking for help: open it without the account.
    if (!r.ok && bearer) r = await rpc('kr_support_open', args);
    if (!r.ok || typeof r.body !== 'string') return NextResponse.json({ error: BUSY }, { status: 502 });
    return NextResponse.json({ code: r.body });
  }

  const code = clean(b.code, 20).toUpperCase();
  if (!/^H-[0-9A-F]{8}$/.test(code)) return NextResponse.json({ error: 'The request number looks like H-3F9A2C1B.' }, { status: 400 });
  if (await sharedIpLimited(req, 'support-check', 20)) return NextResponse.json({ error: 'Too many tries. Please wait a minute.' }, { status: 429 });

  if (b.action === 'status') {
    const r = await rpc('kr_support_status', { p_secret: secret, p_code: code, p_phone: phone });
    if (!r.ok) return NextResponse.json({ error: BUSY }, { status: 502 });
    if (!r.body) return NextResponse.json({ error: 'No request with that number and mobile number.' }, { status: 404 });
    return NextResponse.json({ request: r.body }, { headers: { 'cache-control': 'no-store' } });
  }
  if (b.action === 'add') {
    const body = clean(b.body, 2000);
    if (!body) return NextResponse.json({ error: 'Write your note.' }, { status: 400 });
    if (await sharedIpLimited(req, 'support-add', 10, 3_600_000)) return NextResponse.json({ error: 'Too many notes. Please wait a while.' }, { status: 429 });
    const r = await rpc('kr_support_add', { p_secret: secret, p_code: code, p_phone: phone, p_body: body });
    if (!r.ok) return NextResponse.json({ error: BUSY }, { status: 502 });
    if (r.body !== true) return NextResponse.json({ error: 'No request with that number and mobile number.' }, { status: 404 });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
}
