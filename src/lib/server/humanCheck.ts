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

export const humanCheckConfigured = () => Boolean(process.env.TURNSTILE_SECRET_KEY?.trim());

/** True when the check is off, or the token is a fresh, real one for this site. */
export async function isHuman(request: Request, token: unknown): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret) return true;
  if (typeof token !== 'string' || !token || token.length > 2048) {
    securityEvent('bot_check_failed', { request, detail: 'no token' });
    return false;
  }
  try {
    const form = new URLSearchParams({ secret, response: token, remoteip: clientIp(request) });
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form, cache: 'no-store', signal: AbortSignal.timeout(5_000) });
    const data = (await res.json().catch(() => null)) as { success?: boolean; 'error-codes'?: string[] } | null;
    if (data?.success) return true;
    securityEvent('bot_check_failed', { request, detail: (data?.['error-codes'] ?? ['no answer']).join(',') });
    return false;
  } catch {
    // Cloudflare did not answer: let the person through rather than lock everyone out (the rate limits still hold).
    return true;
  }
}

export const NOT_HUMAN = 'Please complete the “I am human” check above, then try again.';
