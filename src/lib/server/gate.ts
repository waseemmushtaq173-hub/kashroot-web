/**
 * The security gate (components/security/SecurityGate): every sign-in,
 * sign-up, password-reset and help form shows only after the person passed
 * the "I am human" check. /api/gate checks that token with Cloudflare
 * (success, KashRoot's own address, and the action "gate-<where>") and sets
 * the kr_gate cookie: signed, HttpOnly, Secure, SameSite=Lax, 30 minutes,
 * naming where it was passed and bound to the browser (a hash of its user
 * agent). The Supabase proxy refuses sign-in, sign-up, reset and code
 * emails without it; help requests need it too. The form then gets its own,
 * fresh token for Supabase — the gate's token is used up.
 * Off (every request passes) while TURNSTILE_SECRET_KEY is not set.
 * Server-only.
 */
import 'server-only';

import { createHash } from 'node:crypto';

import { humanCheckConfigured } from '@/lib/server/humanCheck';
import { hasSigningSecret, sign, verifySignature } from '@/lib/server/sign';

export const GATE_COOKIE = 'kr_gate';
const LIFE_S = 30 * 60;
/** Where a gate can be passed: a portal's sign-in, or one of these forms. */
export const GATE_PLACES = /^(farmer|buyer|kissan|rental|tracking|dealer|expert|trader|admin|signin|register|reset|support)$/;

const uaHash = (request: Request) => createHash('sha256').update(`kr-gate|${request.headers.get('user-agent') ?? ''}`).digest('base64url').slice(0, 16);

/** The Set-Cookie value for a gate just passed at `place`. */
export function gateCookie(request: Request, place: string): string {
  const value = `${place}.${Math.floor(Date.now() / 1000) + LIFE_S}.${uaHash(request)}`;
  return `${GATE_COOKIE}=${value}.${sign(`gate|${value}`)}; Path=/; Max-Age=${LIFE_S}; HttpOnly; Secure; SameSite=Lax`;
}

/** The gate this request carries, if it is genuine, unexpired and from this browser; null otherwise. */
export function passedGate(request: Request): { place: string } | null {
  const raw = request.headers.get('cookie')?.match(/(?:^|;\s*)kr_gate=([\w.-]+)/)?.[1];
  if (!raw || !hasSigningSecret()) return null;
  const parts = raw.split('.');
  if (parts.length !== 4) return null;
  const [place, exp, ua, sig] = parts;
  try {
    if (!verifySignature(`gate|${place}.${exp}.${ua}`, sig)) return null;
  } catch {
    return null;
  }
  if (!GATE_PLACES.test(place) || Number(exp) < Date.now() / 1000 || ua !== uaHash(request)) return null;
  return { place };
}

/** Is the gate required here (the check is switched on)? */
export const gateOn = () => humanCheckConfigured() && hasSigningSecret();
