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

export const NOT_HUMAN = 'The security check was not accepted — it may have run out. A fresh one is ready: please try again.';
