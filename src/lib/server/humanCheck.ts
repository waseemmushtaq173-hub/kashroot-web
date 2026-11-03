/**
 * Checks the "are you a person?" token (Cloudflare Turnstile,
 * components/security/HumanCheck) on the server, for what Supabase does not
 * check itself: sending sign-in codes and help requests.
 *   TURNSTILE_SECRET_KEY   server only
 * Not set: every request passes (the check is off), as before. A failed check
 * is logged (lib/server/securityLog). Server-only.
 */
import 'server-only';

import { securityEvent } from '@/lib/server/securityLog';
import { clientIp } from '@/lib/server/sign';
import { SITE_URL } from '@/lib/site';

export const humanCheckConfigured = () => Boolean(process.env.TURNSTILE_SECRET_KEY?.trim());

/** Cloudflare's test secrets (preview copies, tests): their tokens name no real address. */
const testSecret = (secret: string) => /^[123]x0{30,}A{2}$/.test(secret);
/** The addresses a real token may come from: the live one, the site's own, any custom domains listed. */
const realHosts = () =>
  ['kashroot-web.vercel.app', new URL(SITE_URL).hostname, ...(process.env.NEXT_PUBLIC_SITE_HOSTS ?? '').split(',')].map((h) => h.trim().toLowerCase().replace(/:\d+$/, '')).filter(Boolean);

/** True when the check is off, or the token is a fresh, real one for this site. */
export async function isHuman(request: Request, token: unknown): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret) return true;
  if (typeof token !== 'string' || !token || token.length > 2048) {
    securityEvent('bot_check_failed', { request, detail: 'no token' });
    return false;
  }
  try {
    const data = await siteverify(secret, token, clientIp(request));
    // Real, and made on KashRoot's own address (not a copy of the widget on another site).
    if (data?.success && (testSecret(secret) || realHosts().includes(String(data.hostname ?? '').toLowerCase()))) return true;
    if (data?.success) {
      securityEvent('bot_check_failed', { request, detail: 'token from another address' });
      return false;
    }
    securityEvent('bot_check_failed', { request, detail: (data?.['error-codes'] ?? ['no answer']).join(',') });
    return false;
  } catch {
    // Cloudflare did not answer: let the person through rather than lock everyone out (the rate limits still hold).
    return true;
  }
}

interface Verdict {
  success?: boolean;
  hostname?: string;
  action?: string;
  'error-codes'?: string[];
}

/** Cloudflare's verdict on one token (it is used up by this). Throws when Cloudflare does not answer. */
async function siteverify(secret: string, token: string, remoteip: string): Promise<Verdict | null> {
  const form = new URLSearchParams({ secret, response: token, remoteip });
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form, cache: 'no-store', signal: AbortSignal.timeout(5_000) });
  return (await res.json().catch(() => null)) as Verdict | null;
}

/**
 * The security-check test on /status: Cloudflare's verdict on a fresh token,
 * checked with this server's TURNSTILE_SECRET_KEY — success, error codes,
 * the address it was made on — never the token or the secret.
 * `otherAddress`: claim a different visitor address, to see whether Cloudflare
 * holds a token to the visitor's own (Supabase checks from its own servers).
 */
export async function diagnoseToken(request: Request, token: string, otherAddress: boolean): Promise<{ configured: boolean; success?: boolean; codes?: string[]; hostname?: string; hostnameOk?: boolean; answered: boolean }> {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret) return { configured: false, answered: true };
  try {
    const data = await siteverify(secret, token.slice(0, 2048), otherAddress ? '203.0.113.7' : clientIp(request));
    const hostname = String(data?.hostname ?? '');
    return { configured: true, answered: true, success: Boolean(data?.success), codes: data?.['error-codes'] ?? [], hostname, hostnameOk: testSecret(secret) || realHosts().includes(hostname.toLowerCase()) };
  } catch {
    return { configured: true, answered: false };
  }
}

/**
 * The security gate's token (lib/server/gate): real, made on KashRoot's own
 * address, and for this very gate (its action, e.g. "gate-buyer"). Cloudflare
 * not answering fails closed here — the gate's Retry tries again.
 */
export async function checkGateToken(request: Request, token: unknown, action: string): Promise<{ ok: boolean; reason: string }> {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret) return { ok: true, reason: 'off' };
  if (typeof token !== 'string' || !token || token.length > 2048) return { ok: false, reason: 'no-token' };
  try {
    const data = await siteverify(secret, token, clientIp(request));
    if (!data?.success) return { ok: false, reason: (data?.['error-codes'] ?? ['no-answer']).join(',') || 'refused' };
    if (!testSecret(secret) && !realHosts().includes(String(data.hostname ?? '').toLowerCase())) return { ok: false, reason: 'another-address' };
    if (!testSecret(secret) && data.action !== action) return { ok: false, reason: 'wrong-action' };
    return { ok: true, reason: 'passed' };
  } catch {
    return { ok: false, reason: 'cloudflare-no-answer' };
  }
}

/** A gate refusal in plain words, by Cloudflare's code or ours (checkGateToken). */
export function gateReasonText(reason: string): string {
  if (reason.includes('timeout-or-duplicate')) return 'the check ran out or was already used. Tap Retry for a fresh one.';
  if (reason.includes('invalid-input-response')) return 'the check’s answer was not valid. Tap Retry.';
  if (/(missing|invalid)-input-secret/.test(reason)) return 'KashRoot’s security key is set up wrongly. Please tell KashRoot through Help & support.';
  if (reason === 'another-address') return 'the check was made on another web address. Please open https://kashroot-web.vercel.app and try again.';
  if (reason === 'wrong-action') return 'the check was made for another page. Tap Retry.';
  if (reason === 'cloudflare-no-answer') return 'Cloudflare did not answer within 5 seconds. Tap Retry.';
  if (reason === 'no-token') return 'no answer came from the check. Tap Retry.';
  if (reason.includes('internal-error')) return 'Cloudflare had a problem. Tap Retry.';
  return `Cloudflare refused it (${reason.slice(0, 40)}). Tap Retry.`;
}

export const NOT_HUMAN = 'The security check was not accepted — it may have run out. A fresh one is ready: please try again.';
