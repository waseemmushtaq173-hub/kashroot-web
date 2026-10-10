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
 *   Email — Resend with a verified sender (RESEND_API_KEY + RESEND_FROM), else
 *           Gmail SMTP (GMAIL_USER,
 *           GMAIL_APP_PASSWORD).
 * Signing key: OTP_SECRET (a long random string).
 */
import 'server-only';
import { randomInt, randomUUID } from 'node:crypto';

import { sign, verifySignature } from './sign';

export type Channel = 'sms' | 'whatsapp' | 'email';
const TTL_MS = 10 * 60_000;

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
 * has a verified sender.
 */
export function emailProvider(): 'Resend' | 'Gmail' | null {
  const resend = Boolean(process.env.RESEND_API_KEY?.trim());
  const gmail = Boolean(process.env.GMAIL_USER?.trim() && process.env.GMAIL_APP_PASSWORD?.trim());
  if (resend && process.env.RESEND_FROM?.trim()) return 'Resend';
  if (gmail) return 'Gmail';
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

async function sendEmail(email: string, code: string) {
  const subject = `${code} is your KashRoot verification code`;
  const html = `<div style="font-family:system-ui,sans-serif;font-size:16px;color:#0f172a"><p>Your KashRoot verification code is</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</p><p>It expires in 10 minutes. Never share it with anyone — KashRoot staff will never ask for it.</p></div>`;
  if (emailProvider() === 'Resend') {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY!.trim()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.RESEND_FROM || 'KashRoot <onboarding@resend.dev>', to: email, subject, html }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Resend answered ${res.status}`);
    return;
  }
  const nodemailer = (await import('nodemailer')).default;
  await nodemailer
    .createTransport({ service: 'gmail', auth: { user: process.env.GMAIL_USER?.trim(), pass: process.env.GMAIL_APP_PASSWORD?.replace(/\s/g, '') } })
    .sendMail({ from: `KashRoot <${process.env.GMAIL_USER}>`, to: email, subject, html });
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
