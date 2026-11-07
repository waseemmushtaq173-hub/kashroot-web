/**
 * Checks the "are you a person?" token (hCaptcha,
 * components/security/HumanCheck) on the server, for what Supabase does not
 * check itself: the security gate, sending sign-in codes and help requests.
 * hCaptcha's siteverify (api.hcaptcha.com) must say success, and the token
 * must have been made on KashRoot's own address.
 *   HCAPTCHA_SECRET_KEY   server only
 * Not set: every request passes (the check is off), as before. A failed check
 * is logged (lib/server/securityLog). Server-only.
 */
import 'server-only';

import { securityEvent } from '@/lib/server/securityLog';
import { clientIp } from '@/lib/server/sign';
import { SITE_URL } from '@/lib/site';

/** The server's hCaptcha secret ('' when the check is off). */
export const humanSecret = () => process.env.HCAPTCHA_SECRET_KEY?.trim() || process.env.RECAPTCHA_SECRET_KEY?.trim() || '';
export const humanCheckConfigured = () => Boolean(humanSecret());
const captchaProvider = () => process.env.HCAPTCHA_SECRET_KEY?.trim() ? 'hcaptcha' : process.env.RECAPTCHA_SECRET_KEY?.trim() ? 'recaptcha' : 'none';

/** hCaptcha's test secret (this computer, tests): its tokens name no real address. */
const testSecret = (secret: string) => /^0x0{40}$/.test(secret);
/** The addresses a real token may come from: the live one, the site's own, any custom domains listed. */
const realHosts = () =>
  ['kashroot-web.vercel.app', new URL(SITE_URL).hostname, ...(process.env.NEXT_PUBLIC_SITE_HOSTS ?? '').split(',')].map((h) => h.trim().toLowerCase().replace(/:\d+$/, '')).filter(Boolean);

/** True when the check is off, or the token is a fresh, real one for this site. */
export async function isHuman(request: Request, token: unknown): Promise<boolean> {
  const secret = humanSecret();
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
    // hCaptcha did not answer: let the person through rather than lock everyone out (the rate limits still hold).
    return true;
  }
}

interface Verdict {
  success?: boolean;
  hostname?: string;
  action?: string;
  'error-codes'?: string[];
}

/** The configured provider's verdict on one token. */
async function siteverify(secret: string, token: string, remoteip: string): Promise<Verdict | null> {
  const provider = captchaProvider();
  const form = new URLSearchParams({ secret, response: token, remoteip });
  // The site key too, on the real site: a token from another hCaptcha site is refused ("sitekey-secret-mismatch").
  const sitekey = process.env.NEXT_PUBLIC_HCAPTCHA_SITE_KEY?.trim() || process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY?.trim();
  if (provider === 'hcaptcha' && sitekey && !testSecret(secret)) form.set('sitekey', sitekey);
  const endpoint = provider === 'recaptcha' ? 'https://www.google.com/recaptcha/api/siteverify' : 'https://api.hcaptcha.com/siteverify';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4_000);
  try {
    const res = await fetch(endpoint, { method: 'POST', body: form, cache: 'no-store', signal: controller.signal });
    return (await res.json().catch(() => null)) as Verdict | null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * The security-check test on /status: hCaptcha's verdict on a fresh token,
 * checked with this server's HCAPTCHA_SECRET_KEY — success, error codes,
 * the address it was made on — never the token or the secret.
 * `otherAddress`: claim a different visitor address, to see whether hCaptcha
 * holds a token to the visitor's own (Supabase checks from its own servers).
 */
export async function diagnoseToken(request: Request, token: string, otherAddress: boolean): Promise<{ configured: boolean; success?: boolean; codes?: string[]; hostname?: string; hostnameOk?: boolean; answered: boolean }> {
  const secret = humanSecret();
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
 * The security gate's token (lib/server/gate): real (hCaptcha says success)
 * and made on KashRoot's own address. hCaptcha not answering fails closed
 * here — the gate's Retry tries again.
 */
export async function checkGateToken(request: Request, token: unknown): Promise<{ ok: boolean; reason: string }> {
  const secret = humanSecret();
  if (!secret) return { ok: true, reason: 'off' };
  if (typeof token !== 'string' || !token || token.length > 2048) return { ok: false, reason: 'no-token' };
  try {
    const data = await siteverify(secret, token, clientIp(request));
    if (!data?.success) {
      const reason = (data?.['error-codes'] ?? ['no-answer']).join(',') || 'refused';
      return { ok: false, reason };
    }
    if (!testSecret(secret) && !realHosts().includes(String(data.hostname ?? '').toLowerCase())) return { ok: false, reason: 'another-address' };
    return { ok: true, reason: 'passed' };
  } catch {
    return { ok: false, reason: captchaProvider() === 'recaptcha' ? 'recaptcha-no-answer' : 'hcaptcha-no-answer' };
  }
}

/** A gate refusal in plain words, by hCaptcha's siteverify code or ours (checkGateToken). */
export function gateReasonText(reason: string): string {
  if (/expired-input-response|already-seen-response/.test(reason)) return 'the check ran out or was already used. Tap Retry for a fresh one.';
  if (/(missing|invalid)-input-response/.test(reason)) return 'the check’s answer was not valid. Tap Retry.';
  if (/(missing|invalid)-input-secret|sitekey-secret-mismatch|not-using-dummy/.test(reason)) return 'KashRoot’s security key is set up wrongly. Please tell KashRoot through Help & support.';
  if (reason === 'another-address') return 'the check was made on another web address. Please open https://kashroot-web.vercel.app and try again.';
  if (reason === 'recaptcha-no-answer') return 'Google reCAPTCHA did not answer within 4 seconds. Tap Retry.';
  if (reason === 'hcaptcha-no-answer') return 'hCaptcha did not answer within 4 seconds. Tap Retry.';
  if (reason === 'no-token') return 'no answer came from the check. Tap Retry.';
  return `${captchaProvider() === 'recaptcha' ? 'Google reCAPTCHA' : 'hCaptcha'} refused it (${reason.slice(0, 40)}). Tap Retry.`;
}
export const NOT_HUMAN = 'Please complete the human verification and try again.';
