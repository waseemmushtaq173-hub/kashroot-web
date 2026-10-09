/** Small HMAC helpers for stateless, tamper-proof tokens (server-only). */
import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

function secret(): string {
  const s = process.env.OTP_SECRET || process.env.SANDBOX_API_SECRET;
  if (!s) throw new Error('OTP_SECRET is not set');
  return s;
}

export const hasSigningSecret = () => Boolean(process.env.OTP_SECRET || process.env.SANDBOX_API_SECRET);

export function sign(value: string): string {
  return createHmac('sha256', secret()).update(value).digest('base64url');
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
