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

export type Channel = 'sms' | 'email';
const TTL_MS = 10 * 60_000;

export function normalise(channel: Channel, to: string): string | null {
  if (channel === 'sms') {
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

export function emailConfigured() {
  return emailProvider() !== null;
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
    headers: { authorization: process.env.FAST2SMS_API_KEY!.trim(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ route: 'otp', variables_values: code, numbers: mobile10, flash: 0 }),
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

export async function sendCode(channel: Channel, to: string): Promise<string> {
  const code = String(randomInt(100000, 1000000));
  if (channel === 'sms') await sendSms(to, code);
  else await sendEmail(to, code);
  const payload = { id: randomUUID(), ch: channel, to, exp: Date.now() + TTL_MS };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${sign(`${body}|${code}`)}`;
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
