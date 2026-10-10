/** Small HMAC helpers for stateless, tamper-proof tokens (server-only). */
import 'server-only';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/**
 * OTP_SECRET when set. Otherwise a key derived from the provider secrets
 * already on the server (Gmail app password, Fast2SMS key, …), so one-time
 * codes work without an extra setting. Changing those secrets only voids
 * codes that are still in flight (10 minutes).
 */
function secret(): string | null {
  const direct = process.env.OTP_SECRET?.trim() || process.env.SANDBOX_API_SECRET?.trim();
  if (direct) return direct;
  const material = ['GMAIL_APP_PASSWORD', 'FAST2SMS_API_KEY', 'RESEND_API_KEY', 'MSG91_AUTH_KEY', 'TWILIO_AUTH_TOKEN', 'ANTHROPIC_API_KEY']
    .map((name) => process.env[name]?.trim() ?? '')
    .join('|');
  return material.replace(/\|/g, '') ? createHash('sha256').update(`kashroot-otp|${material}`).digest('base64url') : null;
}

export const hasSigningSecret = () => secret() !== null;

export function sign(value: string): string {
  const key = secret();
  if (!key) throw new Error('No signing secret: set OTP_SECRET');
  return createHmac('sha256', key).update(value).digest('base64url');
}

export function verifySignature(value: string, signature: string): boolean {
  const expected = Buffer.from(sign(value));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** Best-effort per-instance limiter (serverless instances do not share it). */
const hits = new Map<string, number[]>();
export function rateLimited(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  recent.push(now);
  hits.set(key, recent);
  return recent.length > max;
}
