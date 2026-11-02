/**
 * Emails from KashRoot's support address (lib/supportEmail), server-only.
 * Sent through SMTP from Vercel's SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS
 * (GMAIL_USER / GMAIL_APP_PASSWORD, used for the email codes, also work). The
 * password is never logged or returned: a failure is reported by its kind
 * ("the login was refused"), never by the server's words.
 *
 * Everything but the Setup check's test email is queued first
 * (20261108000000_email_outbox.sql) and sent by flushOutbox(): a failed send
 * is tried again later, and the whole site stays under Gmail's daily limit.
 * Each outcome goes into the security log, without the email's content.
 * What each email says: lib/emailLetters (never a password, code, Aadhaar or
 * bank number).
 */
import 'server-only';

import { letterFor, render, type Letter, type Queued } from '@/lib/emailLetters';
import { securityEvent } from '@/lib/server/securityLog';
import { SITE_URL } from '@/lib/site';
import { supabaseAnonKey, supabaseOrigin } from '@/lib/supabase-config';
import { SUPPORT_EMAIL } from '@/lib/supportEmail';

/** Where help requests go and replies come from: SUPPORT_EMAIL in Vercel, else the official address. */
export const supportInbox = () => (process.env.SUPPORT_EMAIL?.trim() || SUPPORT_EMAIL).toLowerCase();

interface Smtp {
  host: string;
  port: number;
  user: string;
  pass: string;
}

/** The SMTP settings, or null when they are not all there. */
function smtp(): Smtp | null {
  const user = process.env.SMTP_USER?.trim() || process.env.GMAIL_USER?.trim();
  const pass = (process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD || '').replace(/\s/g, '');
  if (!user || !pass) return null;
  const port = Number(process.env.SMTP_PORT) || 465;
  return { host: process.env.SMTP_HOST?.trim() || 'smtp.gmail.com', port, user, pass };
}

/** Whether emails can be sent, and from which address (no secret). */
export function mailStatus(): { configured: boolean; from: string | null; inbox: string } {
  const s = smtp();
  return { configured: Boolean(s), from: s?.user ?? null, inbox: supportInbox() };
}

/** What went wrong, in words safe to show and log (never the server's own message). */
function failureKind(err: unknown): string {
  const e = err as { code?: string; responseCode?: number };
  if (e?.code === 'EAUTH' || e?.responseCode === 535) return 'login refused (check SMTP_USER and the app password)';
  if (e?.code === 'ECONNECTION' || e?.code === 'ESOCKET' || e?.code === 'EDNS') return 'could not reach the mail server';
  if (e?.code === 'ETIMEDOUT') return 'the mail server took too long';
  if (e?.responseCode && e.responseCode >= 400 && e.responseCode < 500) return `mail server busy (${e.responseCode}), will retry`;
  if (e?.responseCode) return `mail server refused (${e.responseCode})`;
  return 'sending failed';
}

let transport: { key: string; send: (m: Record<string, unknown>) => Promise<unknown> } | null = null;

/** Send one email now. Never throws. */
export async function sendLetter(l: Letter): Promise<{ ok: true } | { ok: false; reason: string }> {
  const s = smtp();
  if (!s) return { ok: false, reason: 'email is not set up (SMTP_USER and SMTP_PASS in Vercel)' };
  try {
    const key = `${s.host}|${s.port}|${s.user}`;
    if (transport?.key !== key) {
      const nodemailer = (await import('nodemailer')).default;
      const t = nodemailer.createTransport({ host: s.host, port: s.port, secure: s.port === 465, auth: { user: s.user, pass: s.pass }, connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 15_000 });
      transport = { key, send: (m) => t.sendMail(m) };
    }
    const { text, html } = render(l);
    await transport.send({ from: `KashRoot <${s.user}>`, to: l.to, replyTo: l.replyTo ?? supportInbox(), subject: l.subject, text, html });
    return { ok: true };
  } catch (err) {
    transport = null;
    return { ok: false, reason: failureKind(err) };
  }
}

// ── The queue ──

async function rpc(fn: string, args: Record<string, unknown>): Promise<unknown> {
  const secret = process.env.KYC_DB_SECRET?.trim();
  const origin = supabaseOrigin(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anon = supabaseAnonKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  if (!secret || !origin || !anon) return null;
  try {
    const res = await fetch(`${origin}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: anon, authorization: `Bearer ${anon}`, 'content-type': 'application/json' },
      body: JSON.stringify({ p_secret: secret, ...args }),
      cache: 'no-store',
      signal: AbortSignal.timeout(6_000),
    });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

/** Queue a security notice for an account (the change already went through). */
export async function queueNotice(kind: 'password_changed' | 'email_changed' | 'phone_changed' | 'new_signin', userId: string, detail?: string): Promise<void> {
  await rpc('kr_email_enqueue', { p_kind: kind, p_user: userId, p_detail: detail ?? null });
}

/**
 * Send what is due in the queue (at most `limit` now). Safe to call any time,
 * from anywhere: it only sends what the database queued. Returns counts.
 */
export async function flushOutbox(limit = 10): Promise<{ sent: number; failed: number }> {
  if (!smtp()) return { sent: 0, failed: 0 }; // Kept queued until email is set up.
  const due = (await rpc('kr_email_claim', { p_limit: limit })) as Queued[] | null;
  let sent = 0;
  let failed = 0;
  for (const q of Array.isArray(due) ? due : []) {
    const letter = letterFor(q, SITE_URL, supportInbox());
    const result = letter ? await sendLetter(letter) : ({ ok: false, reason: 'no address to send to' } as const);
    await rpc('kr_email_done', { p_id: q.id, p_ok: result.ok, p_error: result.ok ? null : result.reason });
    if (result.ok) sent++;
    else failed++;
    securityEvent(result.ok ? 'email_sent' : 'email_failed', { path: '/email', detail: result.ok ? q.kind : `${q.kind}: ${result.reason}` });
  }
  return { sent, failed };
}
