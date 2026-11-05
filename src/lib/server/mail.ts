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
  /** Which Vercel settings these came from (shown, never their values). */
  from: 'SMTP_*' | 'GMAIL_*';
}

/**
 * The SMTP settings, or null when they are not all there. Each pair is used
 * whole — SMTP_USER with SMTP_PASS, or else GMAIL_USER with
 * GMAIL_APP_PASSWORD — never one account's address with another's password
 * (Gmail refuses that with 535).
 */
function smtp(): Smtp | null {
  const host = process.env.SMTP_HOST?.trim() || 'smtp.gmail.com';
  const port = Number(process.env.SMTP_PORT) || 465;
  const pass = (v: string | undefined) => (v ?? '').replace(/\s/g, '');
  if (process.env.SMTP_USER?.trim() && pass(process.env.SMTP_PASS)) return { host, port, user: process.env.SMTP_USER.trim(), pass: pass(process.env.SMTP_PASS), from: 'SMTP_*' };
  if (process.env.GMAIL_USER?.trim() && pass(process.env.GMAIL_APP_PASSWORD)) return { host: 'smtp.gmail.com', port: 465, user: process.env.GMAIL_USER.trim(), pass: pass(process.env.GMAIL_APP_PASSWORD), from: 'GMAIL_*' };
  return null;
}

/** Which settings are there (true/false only) and what the password looks like — never a value. */
export function mailSettings(): Record<string, boolean | number | string> {
  const has = (n: string) => Boolean(process.env[n]?.trim());
  const p = (process.env.SMTP_PASS ?? '').replace(/\s/g, '');
  return {
    SMTP_HOST: has('SMTP_HOST'),
    SMTP_PORT: has('SMTP_PORT'),
    SMTP_USER: has('SMTP_USER'),
    SMTP_PASS: Boolean(p),
    // A Gmail app password is 16 letters (Google shows it in 4 groups of 4).
    SMTP_PASS_looks_like_app_password: /^[a-z]{16}$/i.test(p),
    SUPPORT_EMAIL: has('SUPPORT_EMAIL'),
    port: Number(process.env.SMTP_PORT) || 465,
    using: smtp()?.from ?? 'none',
  };
}

/** Whether emails can be sent, and from which address (no secret). */
export function mailStatus(): { configured: boolean; from: string | null; inbox: string; settings: Record<string, boolean | number | string> } {
  const s = smtp();
  return { configured: Boolean(s), from: s?.user ?? null, inbox: supportInbox(), settings: mailSettings() };
}

/**
 * What went wrong: the error's code and the mail server's own reply (e.g.
 * "EAUTH 535 5.7.8 Username and Password not accepted"), one line, at most
 * 160 characters — it never holds the password or the email.
 */
function failureOf(err: unknown, port: number): string {
  const e = err as { code?: string; responseCode?: number; response?: string; message?: string };
  const reply = String(e?.response ?? e?.message ?? '')
    .split(/\r?\n/)[0]
    .replace(/https?:\/\/\S+/g, '')
    .trim();
  const hint =
    e?.code === 'EAUTH' || e?.responseCode === 535
      ? ' — Gmail refused the login: SMTP_PASS must be a 16-letter App Password of SMTP_USER’s account, with 2-Step Verification on'
      : e?.code === 'ETIMEDOUT' || e?.code === 'ECONNECTION' || e?.code === 'ESOCKET'
        ? ' — could not reach the mail server'
        : '';
  return `port ${port}: ${[e?.code, e?.responseCode].filter(Boolean).join(' ')} ${reply}`.replace(/\s+/g, ' ').trim().slice(0, 160) + hint;
}
const unreachable = (err: unknown) => ['ETIMEDOUT', 'ECONNECTION', 'ESOCKET', 'EDNS', 'ECONNREFUSED'].includes(String((err as { code?: string })?.code));

/** Send one email now; tried on port 587 (STARTTLS) when 465 cannot be reached. Never throws. */
export async function sendLetter(l: Letter): Promise<{ ok: true } | { ok: false; reason: string }> {
  const s = smtp();
  if (!s) return { ok: false, reason: 'email is not set up (SMTP_USER and SMTP_PASS in Vercel)' };
  const nodemailer = (await import('nodemailer')).default;
  const { text, html } = render(l);
  const message = { from: `KashRoot <${s.user}>`, to: l.to, replyTo: l.replyTo ?? supportInbox(), subject: l.subject, text, html };
  const ports = s.port === 465 ? [465, 587] : [s.port];
  let reason = '';
  for (const port of ports) {
    try {
      const t = nodemailer.createTransport({ host: s.host, port, secure: port === 465, requireTLS: port !== 465, auth: { user: s.user, pass: s.pass }, connectionTimeout: 8_000, greetingTimeout: 8_000, socketTimeout: 12_000 });
      await t.sendMail(message);
      return { ok: true };
    } catch (err) {
      reason = failureOf(err, port);
      if (!unreachable(err)) break; // a refusal is the same on any port
    }
  }
  return { ok: false, reason };
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

/** Sign-in was paused or locked for wrong passwords: tell the account with that email (nothing happens when there is none). */
export async function queueLockNotice(email: string, pause: string): Promise<void> {
  await rpc('kr_email_enqueue_email', { p_kind: 'signin_locked', p_email: email, p_detail: pause });
}

/**
 * Send what is due in the queue (at most `limit` now). Safe to call any time,
 * from anywhere: it only sends what the database queued. Returns counts.
 */
/**
 * A failure's short code, safe to show anyone: "EAUTH 535", "ETIMEDOUT",
 * "no-address" — never the mail server's words, an address or content.
 */
const shortCode = (reason: string) => reason.match(/^port \d+: ((?:E[A-Z]+ ?)?(?:\d{3})?)/)?.[1]?.trim() || (reason.startsWith('no address') ? 'no-address' : reason.startsWith('email is not set up') ? 'not-set-up' : 'other');

export async function flushOutbox(limit = 10): Promise<{ sent: number; failed: number; codes: string[] }> {
  // Trips with no position for 5 minutes are marked lost and an email to the sender is queued
  // (20261120000000_trip_lock.sql; nothing happens before that SQL is run). Done even when email
  // is not set up, so the senders' pages show "Location lost".
  await rpc('kr_trip_watch', {});
  if (!smtp()) return { sent: 0, failed: 0, codes: [] }; // Kept queued until email is set up.
  const due = (await rpc('kr_email_claim', { p_limit: limit })) as Queued[] | null;
  let sent = 0;
  let failed = 0;
  const codes: string[] = [];
  for (const q of Array.isArray(due) ? due : []) {
    const letter = letterFor(q, SITE_URL, supportInbox());
    const result = letter ? await sendLetter(letter) : ({ ok: false, reason: 'no address to send to' } as const);
    await rpc('kr_email_done', { p_id: q.id, p_ok: result.ok, p_error: result.ok ? null : result.reason });
    if (result.ok) sent++;
    else {
      failed++;
      codes.push(`${q.kind}: ${shortCode(result.reason)}`);
    }
    securityEvent(result.ok ? 'email_sent' : 'email_failed', { path: '/email', detail: result.ok ? q.kind : `${q.kind}: ${result.reason}` });
  }
  return { sent, failed, codes };
}
