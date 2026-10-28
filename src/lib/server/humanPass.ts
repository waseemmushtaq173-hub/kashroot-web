/**
 * The "human pass": after one "I am human" check (Cloudflare Turnstile,
 * lib/server/humanCheck), the browser gets a signed cookie for an hour, so
 * the assistant, KashRoot's voice and the AI photo checks — called many times
 * in a row, where a one-time token does not fit — serve people, not scripts.
 *   kr_human = <expiry>.<browser hash>.<signature>   HttpOnly, Secure, SameSite=Lax
 * The signature is an HMAC with a key derived from TURNSTILE_SECRET_KEY (server
 * only); the browser hash ties it to the browser it was given to. When the
 * check is off (no TURNSTILE_SECRET_KEY) every request passes, as before.
 * The per-network, per-account and per-day limits apply on top. Server-only.
 */
import 'server-only';

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

const COOKIE = 'kr_human';
const HOUR = 3600;

const secret = () => process.env.TURNSTILE_SECRET_KEY?.trim() || '';
export const humanPassOn = () => Boolean(secret());

const key = () => createHash('sha256').update(`kr-human-pass|${secret()}`).digest();
const browserOf = (request: Request) => createHash('sha256').update(`ua|${request.headers.get('user-agent') ?? ''}`).digest('base64url').slice(0, 16);
const sign = (body: string) => createHmac('sha256', key()).update(body).digest('base64url');

function cookieOf(request: Request): string | null {
  const raw = request.headers.get('cookie') ?? '';
  const hit = raw.split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`));
  return hit ? decodeURIComponent(hit.slice(COOKIE.length + 1)) : null;
}

/** True when the check is off, or this browser holds a valid, unexpired pass. */
export function hasHumanPass(request: Request): boolean {
  if (!humanPassOn()) return true;
  const value = cookieOf(request);
  if (!value) return false;
  const [exp, browser, sig] = value.split('.');
  if (!exp || !browser || !sig || !/^\d{10}$/.test(exp) || Number(exp) < Date.now() / 1000) return false;
  if (browser !== browserOf(request)) return false;
  const want = Buffer.from(sign(`${exp}.${browser}`));
  const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got);
}

/** The Set-Cookie header value for a fresh pass. */
export function humanPassCookie(request: Request): string {
  const exp = String(Math.floor(Date.now() / 1000) + HOUR);
  const browser = browserOf(request);
  const value = `${exp}.${browser}.${sign(`${exp}.${browser}`)}`;
  return `${COOKIE}=${encodeURIComponent(value)}; Path=/; Max-Age=${HOUR}; HttpOnly; Secure; SameSite=Lax`;
}

/** The answer when the pass is missing: the page shows the check once and tries again. */
export const needHuman = () => Response.json({ error: 'Please complete the “I am human” check, then try again.', needHuman: true }, { status: 403, headers: { 'cache-control': 'no-store' } });
