/**
 * One-time codes for verifying a mobile number or email address.
 *
 * Stateless: /api/otp/send texts or emails a 6-digit code and returns a
 * signed token that contains only a hash of the code; /api/otp/verify checks
 * the code against it. The code itself never reaches the browser.
 *
 * Providers (first configured wins):
 *   SMS   — MSG91 (MSG91_AUTH_KEY + MSG91_TEMPLATE_ID, DLT-approved template
 *           with an ##OTP## variable), Twilio (TWILIO_ACCOUNT_SID,
 *           TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER) or Fast2SMS (FAST2SMS_API_KEY).
 *   Email — every route the site has, first success wins: Resend with a
 *           verified sender (RESEND_API_KEY + RESEND_FROM), else the site's
 *           Gmail (GMAIL_USER, GMAIL_APP_PASSWORD), then the SMTP relay
 *           (SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS — the support
 *           mailbox lib/server/mail sends from), then Resend without a
 *           sender (onboarding@resend.dev reaches the account owner alone).
 *           When that sandbox refuses another person's address, the code
 *           goes to the site's own verified inbox (OTP_VERIFIED_INBOX)
 *           with the asked-for address in its subject, and the answer says
 *           so: it is never reported as sent to an inbox it did not reach.
 * Signing key: OTP_SECRET (a long random string).
 */
import 'server-only';
import { randomInt, randomUUID } from 'node:crypto';

import { sign, verifySignature } from './sign';

export type Channel = 'sms' | 'whatsapp' | 'email';
const TTL_MS = 10 * 60_000;
/** Email budget: 15 s for the send; after it the request reports the email as not delivered. */
const EMAIL_BUDGET_MS = 15_000;

/**
 * The one inbox Resend's sandbox sender can reach: the Resend account owner's. Used only when every real
 * route (a verified Resend sender, Gmail, the SMTP relay) has failed for another address. OTP_VERIFIED_INBOX
 * names it; the default is the site owner's address.
 */
export function verifiedInbox(): string {
  return (process.env.OTP_VERIFIED_INBOX?.trim() || 'waseemmushtaq173@gmail.com').toLowerCase();
}

export function normalise(channel: Channel, to: string): string | null {
  if (channel === 'sms' || channel === 'whatsapp') {
    const digits = to.replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, '');
    return /^[6-9]\d{9}$/.test(digits) ? digits : null;
  }
  const email = to.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && email.length <= 120 ? email : null;
}

export function smsConfigured() {
  return Boolean((process.env.MSG91_AUTH_KEY && process.env.MSG91_TEMPLATE_ID) || (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER) || process.env.FAST2SMS_API_KEY);
}
/**
 * Resend without RESEND_FROM can only send from onboarding@resend.dev, which
 * delivers to the Resend account owner alone — so Gmail wins unless Resend
 * has a verified sender. 'SMTP' is the relay lib/server/mail sends from
 * (SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS).
 */
export function emailProvider(): 'Resend' | 'Gmail' | 'SMTP' | null {
  const resend = Boolean(process.env.RESEND_API_KEY?.trim());
  const gmail = Boolean(process.env.GMAIL_USER?.trim() && process.env.GMAIL_APP_PASSWORD?.trim());
  const relay = Boolean(process.env.SMTP_USER?.trim() && process.env.SMTP_PASS?.replace(/\s/g, ''));
  if (resend && process.env.RESEND_FROM?.trim()) return 'Resend';
  if (gmail) return 'Gmail';
  if (relay) return 'SMTP';
  return resend ? 'Resend' : null;
}

/**
 * WhatsApp OTP through Meta's WhatsApp Cloud API: WHATSAPP_TOKEN (a permanent
 * system-user token), WHATSAPP_PHONE_NUMBER_ID, and WHATSAPP_TEMPLATE — an
 * approved AUTHENTICATION template with a copy-code button
 * (WHATSAPP_TEMPLATE_LANG, default en). No DLT registration needed.
 */
export function whatsappConfigured() {
  return Boolean(process.env.WHATSAPP_TOKEN?.trim() && process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() && process.env.WHATSAPP_TEMPLATE?.trim());
}

async function sendWhatsapp(mobile10: string, code: string) {
  const version = process.env.WHATSAPP_API_VERSION?.trim() || 'v25.0';
  const res = await fetch(`https://graph.facebook.com/${version}/${process.env.WHATSAPP_PHONE_NUMBER_ID!.trim()}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN!.trim()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: `91${mobile10}`,
      type: 'template',
      template: {
        name: process.env.WHATSAPP_TEMPLATE!.trim(),
        language: { code: process.env.WHATSAPP_TEMPLATE_LANG?.trim() || 'en' },
        // Authentication templates take the code in the body and in the copy-code button.
        components: [
          { type: 'body', parameters: [{ type: 'text', text: code }] },
          { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: code }] },
        ],
      },
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.error) throw new SmsProviderError(`WhatsApp: ${j.error?.error_user_msg || j.error?.message || `answered ${res.status}`}`);
}

export function emailConfigured() {
  return emailProvider() !== null;
}

/**
 * Fast2SMS route, FAST2SMS_ROUTE:
 *   otp (default) — cheapest; Fast2SMS first requires website verification
 *                   (dashboard → OTP Message).
 *   q             — Quick SMS: no verification or DLT, costs more per SMS and
 *                   comes from a random number.
 *   dlt           — your DLT-approved template: FAST2SMS_SENDER_ID and
 *                   FAST2SMS_TEMPLATE_ID (the code fills its {#var#}).
 */
function fast2smsBody(mobile10: string, code: string) {
  const route = (process.env.FAST2SMS_ROUTE ?? 'otp').trim().toLowerCase();
  if (route === 'q') {
    return { route: 'q', message: `${code} is your KashRoot verification code. It expires in 10 minutes. Do not share it.`, language: 'english', flash: 0, numbers: mobile10 };
  }
  if (route === 'dlt') {
    return { route: 'dlt', sender_id: process.env.FAST2SMS_SENDER_ID?.trim(), message: process.env.FAST2SMS_TEMPLATE_ID?.trim(), variables_values: code, flash: 0, numbers: mobile10 };
  }
  return { route: 'otp', variables_values: code, numbers: mobile10, flash: 0 };
}

/** An SMS provider refused the message; its text is safe to show. */
export class SmsProviderError extends Error {}

async function sendSms(mobile10: string, code: string) {
  if (process.env.MSG91_AUTH_KEY && process.env.MSG91_TEMPLATE_ID) {
    const res = await fetch('https://control.msg91.com/api/v5/otp?' + new URLSearchParams({ template_id: process.env.MSG91_TEMPLATE_ID, mobile: `91${mobile10}`, otp: code }), {
      method: 'POST',
      headers: { authkey: process.env.MSG91_AUTH_KEY, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || j.type === 'error') throw new SmsProviderError(j.message || `MSG91 answered ${res.status}`);
    return;
  }
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER) {
    const twilio = (await import('twilio')).default;
    await twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN).messages.create({
      body: `${code} is your KashRoot verification code. It expires in 10 minutes. Do not share it.`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: `+91${mobile10}`,
    });
    return;
  }
  const res = await fetch('https://www.fast2sms.com/dev/bulkV2', {
    method: 'POST',
    // Keys pasted from a .env file often keep their quotes; Fast2SMS rejects those.
    headers: { authorization: process.env.FAST2SMS_API_KEY!.trim().replace(/^["']+|["']+$/g, '').trim(), 'Content-Type': 'application/json' },
    body: JSON.stringify(fast2smsBody(mobile10, code)),
    signal: AbortSignal.timeout(15_000),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.return === false) throw new SmsProviderError(`Fast2SMS: ${Array.isArray(j.message) ? j.message.join(' ') : j.message || `answered ${res.status}`}`);
}

/** The SMTP relay (lib/server/mail's SMTP_* settings) as an OTP route. The pair is used
 *  whole — SMTP_USER with SMTP_PASS, never one account's address with another's
 *  password (the mail server refuses that with 535). */
function smtpRelay(): { host: string; port: number; user: string; pass: string } | null {
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.replace(/\s/g, '');
  if (!user || !pass) return null;
  return { host: process.env.SMTP_HOST?.trim() || 'smtp.gmail.com', port: Number(process.env.SMTP_PORT) || 465, user, pass };
}

/** A send failure's own words — its code and the server's first reply line, never a
 *  credential — with the fix spelled out when the login was refused (535). */
function mailFailure(err: unknown): string {
  const e = err as { code?: string; responseCode?: number; response?: string; message?: string };
  const reply = String(e?.response ?? e?.message ?? '').split(/\r?\n/)[0].replace(/https?:\/\/\S+/g, '').trim();
  const head = [e?.code, e?.responseCode].filter(Boolean).join(' ');
  const hint =
    e?.code === 'EAUTH' || e?.responseCode === 535
      ? " — the password must be that mail account's own App Password (Gmail: exactly 16 letters, Google Account → Security → 2-Step Verification → App passwords)"
      : '';
  return `${head} ${reply}${hint}`.replace(/\s+/g, ' ').trim().slice(0, 200);
}

const UNREACHABLE = ['ETIMEDOUT', 'ECONNECTION', 'ESOCKET', 'EDNS', 'ECONNREFUSED'];

/** One SMTP send, on 465 (secure) and then 587 (STARTTLS) when 465 cannot be
 *  reached — the same port pair lib/server/mail uses. Every attempt is bounded
 *  (8 s to connect and greet, 12 s per socket), so a hung mail server can never
 *  eat the whole 15-second budget. */
async function smtpSend(s: { host: string; port: number; user: string; pass: string }, email: string, subject: string, html: string) {
  const nodemailer = (await import('nodemailer')).default;
  const message = { from: `KashRoot <${s.user}>`, to: email, subject, html };
  const ports = s.port === 465 ? [465, 587] : [s.port];
  let last: unknown = null;
  for (const port of ports) {
    try {
      const t = nodemailer.createTransport({ host: s.host, port, secure: port === 465, requireTLS: port !== 465, auth: { user: s.user, pass: s.pass }, connectionTimeout: 8_000, greetingTimeout: 8_000, socketTimeout: 12_000 });
      await t.sendMail(message);
      return;
    } catch (err) {
      last = err;
      if (!UNREACHABLE.includes(String((err as { code?: string })?.code))) break; // a refusal is the same on any port
    }
  }
  throw last;
}

/**
 * One code email through every route the site has, first success wins:
 *   Resend with a verified sender → the site's Gmail (GMAIL_USER +
 *   GMAIL_APP_PASSWORD) → the SMTP relay (SMTP_*) → Resend without a sender
 *   (onboarding@resend.dev reaches the account owner alone — the last resort).
 * Each route that fails adds its reason to the log, so one dead App Password
 * no longer takes the whole email step down when another route still works.
 * Returns `routedVia` when the code could not reach `email` itself and went
 * to the site's verified inbox instead (the Resend sandbox's one recipient).
 */
async function sendEmail(email: string, code: string): Promise<{ routedVia?: string }> {
  const subject = `${code} is your KashRoot verification code`;
  const html = `<div style="font-family:system-ui,sans-serif;font-size:16px;color:#0f172a"><p>Your KashRoot verification code is</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</p><p>It expires in 10 minutes. Never share it with anyone — KashRoot staff will never ask for it.</p></div>`;
  const resend = Boolean(process.env.RESEND_API_KEY?.trim());
  const gmail = Boolean(process.env.GMAIL_USER?.trim() && process.env.GMAIL_APP_PASSWORD?.trim());
  const relay = smtpRelay();
  const failures: string[] = [];
  const resendSend = async (from: string, to = email, subj = subject, body = html) => {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY!.trim()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, subject: subj, html: body }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Resend answered ${res.status}`);
  };
  if (resend && process.env.RESEND_FROM?.trim()) {
    try {
      await resendSend(process.env.RESEND_FROM.trim());
      return {};
    } catch (err) {
      failures.push(`Resend: ${mailFailure(err)}`);
    }
  }
  if (gmail) {
    try {
      await smtpSend({ host: 'smtp.gmail.com', port: 465, user: process.env.GMAIL_USER!.trim(), pass: process.env.GMAIL_APP_PASSWORD!.replace(/\s/g, '') }, email, subject, html);
      return {};
    } catch (err) {
      failures.push(`Gmail: ${mailFailure(err)}`);
    }
  }
  if (relay) {
    try {
      await smtpSend(relay, email, subject, html);
      return {};
    } catch (err) {
      failures.push(`SMTP: ${mailFailure(err)}`);
    }
  }
  if (resend) {
    try {
      await resendSend('KashRoot <onboarding@resend.dev>');
      return {};
    } catch (err) {
      failures.push(`Resend sandbox: ${mailFailure(err)}`);
    }
    // The sandbox sender reaches the Resend account owner alone. For anyone else the code goes to that
    // verified inbox, named for the address that asked — and the caller is told where it really went.
    const inbox = verifiedInbox();
    if (email !== inbox) {
      try {
        const safe = email.replace(/[<>&"]/g, '');
        await resendSend(
          'KashRoot <onboarding@resend.dev>',
          inbox,
          `OTP requested for: ${safe} — Code: ${code}`,
          `<div style="font-family:system-ui,sans-serif;font-size:16px;color:#0f172a"><p>A KashRoot verification code was requested for <strong>${safe}</strong>.</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</p><p>It came to this inbox because the site's own mail login was refused and Resend's test sender can only reach this address. It expires in 10 minutes. Give it only to the person you know asked for it.</p></div>`,
        );
        console.error('OTP email routed to the verified inbox:', failures.join('; '));
        return { routedVia: inbox };
      } catch (err) {
        failures.push(`Resend to the verified inbox: ${mailFailure(err)}`);
      }
    }
  }
  throw new Error(failures.join('; ') || 'no email route is configured');
}

/**
 * Sends one code. A mobile code (channel 'sms') goes out by every phone route
 * the site has — SMS and WhatsApp at the same time — and succeeds when at
 * least one delivers; 'whatsapp' alone sends only by WhatsApp.
 */
export async function sendCode(channel: Channel, to: string): Promise<{ token: string; via: string[] }> {
  const code = String(randomInt(100000, 1000000));
  let via: string[];
  if (channel === 'email') {
    await sendEmail(to, code);
    via = ['email'];
  } else {
    const routes: [string, (m: string, c: string) => Promise<void>][] = [];
    if (channel === 'sms' && smsConfigured()) routes.push(['SMS', sendSms]);
    if (whatsappConfigured()) routes.push(['WhatsApp', sendWhatsapp]);
    const results = await Promise.allSettled(routes.map(([, send]) => send(to, code)));
    via = routes.filter((_, i) => results[i].status === 'fulfilled').map(([name]) => name);
    const failures = results.flatMap((r) => (r.status === 'rejected' ? [r.reason] : []));
    failures.forEach((err) => console.error('OTP route failed:', err instanceof Error ? err.message : err));
    if (via.length === 0) {
      // Every route failed: report them all (provider text is safe to show).
      if (failures.length > 0 && failures.every((e) => e instanceof SmsProviderError)) throw new SmsProviderError(failures.map((e) => (e as Error).message).join('; '));
      throw failures[0] ?? new Error('No phone route is configured');
    }
  }
  const payload = { id: randomUUID(), ch: channel, to, exp: Date.now() + TTL_MS };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return { token: `${body}.${sign(`${body}|${code}`)}`, via };
}

/** One email code: whether it went out, and the signed token. The code itself goes only to the inbox. */
export interface EmailOtpResult {
  /** False when the sender was unconfigured, refused, or slower than the 15-second budget. */
  delivered: boolean;
  token: string;
  /** Set when the code did not reach the address itself but the site's verified inbox (see sendEmail). */
  routedVia?: string;
}

/**
 * One email code with a hard 15-second budget: the send is raced against the
 * clock, and the moment the race is lost the request reports the email as
 * not delivered (the same signed token would still have verified the code).
 * A send still in flight when the race ends may yet land in the inbox; if
 * the person pressed send again meanwhile, the newest code is the one that
 * works and the older one quietly expires.
 */
export async function sendEmailCode(to: string): Promise<EmailOtpResult> {
  const code = String(randomInt(100000, 1000000));
  const payload = { id: randomUUID(), ch: 'email' as const, to, exp: Date.now() + TTL_MS };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const token = `${body}.${sign(`${body}|${code}`)}`;
  const attempt = sendEmail(to, code).then(
    (sent): { delivered: boolean; routedVia?: string } => ({ delivered: true, routedVia: sent.routedVia }),
    (err): { delivered: boolean; routedVia?: string } => {
      console.error('OTP email send failed:', err instanceof Error ? err.message : err);
      return { delivered: false };
    },
  );
  const outOfTime = new Promise<{ delivered: boolean; routedVia?: string }>((resolve) => {
    setTimeout(() => resolve({ delivered: false }), EMAIL_BUDGET_MS);
  });
  const { delivered, routedVia } = await Promise.race([attempt, outOfTime]);
  return { delivered, token, routedVia };
}

export function checkCode(token: string, code: string): { ok: true; channel: Channel; to: string; id: string } | { ok: false; reason: string } {
  const [body, mac] = String(token).split('.');
  if (!body || !mac || !/^\d{6}$/.test(code)) return { ok: false, reason: 'Enter the 6-digit code.' };
  let payload: { id: string; ch: Channel; to: string; exp: number };
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return { ok: false, reason: 'Request a new code.' };
  }
  if (Date.now() > payload.exp) return { ok: false, reason: 'That code has expired. Request a new one.' };
  if (!verifySignature(`${body}|${code}`, mac)) return { ok: false, reason: 'That code is not correct.' };
  return { ok: true, channel: payload.ch, to: payload.to, id: payload.id };
}

/** Signed proof that `to` was verified, for later server-side use. */
export function proofFor(channel: Channel, to: string): string {
  const body = Buffer.from(JSON.stringify({ ch: channel, to, at: Date.now() })).toString('base64url');
  return `${body}.${sign(`proof|${body}`)}`;
}
