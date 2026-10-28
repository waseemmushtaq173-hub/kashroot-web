/**
 * Same-origin proxy to the Supabase project for the browser client
 * (src/lib/supabase.ts). Only the auth and data APIs are forwarded, only to
 * the configured project. When the project can't be reached the reply says
 * why — wrong address, paused project — in words the sign-in form shows.
 *
 * It also guards against attacks before they reach Supabase:
 *   - password guessing: after 8 wrong passwords for one account (or 40 from
 *     one network) in 15 minutes, sign-in is paused for 15 minutes;
 *   - mass sign-ups and reset-email floods from one network;
 *   - request floods on the data API.
 * The sign-in, sign-up and email counts are shared by every server instance
 * (lib/server/sharedLimit), so spreading the guesses over instances does not
 * help. Every sign-in (right or wrong), sign-up, reset email and pause is
 * logged (lib/server/securityLog) — hashed, never the email or password.
 * Supabase keeps its own limits behind this, for anyone calling it directly.
 * Limits are generous because many farmers share one mobile-network address.
 */
const FIFTEEN_MIN = 15 * 60_000;
const paused = (msg: string) => Response.json({ msg: `[setup] ${msg}`, message: `[setup] ${msg}`, error: 'too_many_requests' }, { status: 429, headers: { 'retry-after': '900' } });

/** The email or phone in a sign-in / reset request, lower-cased. */
function account(body: ArrayBuffer | undefined): string {
  if (!body || body.byteLength > 20_000) return '';
  try {
    const j = JSON.parse(new TextDecoder().decode(body)) as { email?: string; phone?: string };
    return String(j.email ?? j.phone ?? '').trim().toLowerCase().slice(0, 200);
  } catch {
    return '';
  }
}
import { securityEvent } from '@/lib/server/securityLog';
import { hashed, sharedClear, sharedCount, sharedLimited, sharedRecord } from '@/lib/server/sharedLimit';
import { clientIp, rateLimited } from '@/lib/server/sign';
import { supabaseOrigin } from '@/lib/supabase-config';

export const dynamic = 'force-dynamic';

const ALLOWED = /^(auth|rest)\/v1(\/|$)/;
const PASS_REQUEST = ['apikey', 'authorization', 'content-type', 'accept', 'accept-profile', 'content-profile', 'prefer', 'range', 'x-client-info', 'x-supabase-api-version'];
const PASS_RESPONSE = ['content-type', 'content-range', 'x-supabase-api-version', 'preference-applied', 'retry-after'];

/** auth-js reads `msg`; "[setup]" tells the form to show it as is. */
const problem = (status: number, msg: string) => Response.json({ msg: `[setup] ${msg}`, message: `[setup] ${msg}` }, { status });

async function proxy(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  // Only Supabase's sign-in and data APIs, and no path tricks ("..", encoded slashes).
  const parts = (await params).path;
  const path = parts.join('/');
  if (!ALLOWED.test(path) || parts.some((p) => p === '..' || p === '.' || /[\\/%]/.test(p))) return Response.json({ msg: 'Not found' }, { status: 404 });
  const origin = supabaseOrigin(process.env.NEXT_PUBLIC_SUPABASE_URL);
  if (!origin) return problem(503, 'Sign-in is not set up on this site yet: add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in Vercel and redeploy.');

  const headers = new Headers();
  for (const name of PASS_REQUEST) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  const body = hasBody ? await request.arrayBuffer() : undefined;
  const ip = hashed(clientIp(request));
  const query = new URL(request.url).searchParams;
  const passwordSignIn = path === 'auth/v1/token' && query.get('grant_type') === 'password';
  const who = passwordSignIn || /^auth\/v1\/(recover|otp|resend)$/.test(path) ? account(body) : '';

  const whoKey = who ? hashed(who) : '';

  if (passwordSignIn) {
    const [mine, network] = await Promise.all([whoKey ? sharedCount(`pw-fail:${whoKey}`, FIFTEEN_MIN) : 0, sharedCount(`pw-fail-ip:${ip}`, FIFTEEN_MIN)]);
    if (mine >= 8 || network >= 40) {
      securityEvent('signin_paused', { request, account: who, path, status: 429, detail: mine >= 8 ? 'account: 8 wrong passwords in 15 min' : 'network: 40 wrong passwords in 15 min' });
      return paused('Too many wrong passwords. For safety, sign-in is paused for 15 minutes. Use “Forgot password” if you do not remember it.');
    }
  } else if (path === 'auth/v1/signup') {
    if (await sharedLimited(`signup-ip:${ip}`, 30, 60 * 60_000)) {
      securityEvent('signup_paused', { request, path, status: 429, detail: '30 new accounts from one network in an hour' });
      return paused('Too many new accounts from this network. Please try again in an hour.');
    }
  } else if (who) {
    if ((await sharedLimited(`mail:${whoKey}`, 4, FIFTEEN_MIN)) || (await sharedLimited(`mail-ip:${ip}`, 20, FIFTEEN_MIN))) {
      securityEvent('email_paused', { request, account: who, path, status: 429, detail: 'too many emails or codes in 15 min' });
      return paused('Too many emails or codes requested. Please wait 15 minutes.');
    }
  } else if (path.startsWith('rest/')) {
    if (rateLimited(`rest-ip:${ip}`, 1200, 60_000)) return Response.json({ message: 'Too many requests. Please wait a minute.' }, { status: 429, headers: { 'retry-after': '60' } });
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${origin}/${path}${new URL(request.url).search}`, {
      method: request.method,
      headers,
      body,
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(25_000),
    });
  } catch (err) {
    const cause = (err as { cause?: { code?: string } })?.cause?.code ?? (err as Error)?.name;
    const host = new URL(origin).host;
    console.error('Supabase proxy:', host, cause);
    if (cause === 'ENOTFOUND' || cause === 'EAI_AGAIN') {
      return problem(502, `The sign-in service address saved for this site (${host}) does not exist. In Supabase open Project Settings → Data API, copy the Project URL exactly, put it in Vercel as NEXT_PUBLIC_SUPABASE_URL and redeploy.`);
    }
    if (cause === 'TimeoutError') return problem(504, 'The sign-in service took too long to answer. Please try again in a minute.');
    return problem(502, `Could not connect to the sign-in service (${host}). If the Supabase project is paused, open the Supabase dashboard and restore it.`);
  }

  if (upstream.status === 540 || (upstream.status >= 500 && !(upstream.headers.get('content-type') ?? '').includes('json'))) {
    return problem(503, 'The sign-in service is paused or not responding. Open the Supabase dashboard; if the project shows “Paused”, press Restore, then try again.');
  }

  // Everyone's sign-in traffic reaches Supabase from this server's few
  // addresses, so its per-address limit can answer "too many" to a session
  // refresh. As a 429 that makes the browser delete the session (signed out);
  // as a 503 it keeps the session and simply tries again a little later.
  const keepsSession = (path === 'auth/v1/token' && query.get('grant_type') === 'refresh_token') || path === 'auth/v1/user';
  if (upstream.status === 429 && keepsSession) {
    return Response.json({ msg: 'The sign-in service is busy. Trying again shortly.', message: 'The sign-in service is busy.' }, { status: 503, headers: { 'retry-after': '30', 'cache-control': 'no-store' } });
  }

  if (passwordSignIn) {
    if (upstream.status === 400 || upstream.status === 401) {
      await Promise.all([whoKey ? sharedRecord(`pw-fail:${whoKey}`, FIFTEEN_MIN) : null, sharedRecord(`pw-fail-ip:${ip}`, FIFTEEN_MIN)]);
      securityEvent('signin_fail', { request, account: who, path, status: upstream.status });
    } else if (upstream.ok) {
      if (whoKey) await sharedClear(`pw-fail:${whoKey}`);
      securityEvent('signin_ok', { request, account: who, path, status: upstream.status });
    }
  } else if (path === 'auth/v1/signup' && upstream.ok) {
    securityEvent('signup', { request, path, status: upstream.status });
  } else if (path === 'auth/v1/recover' && upstream.ok) {
    securityEvent('reset_email', { request, account: who, path, status: upstream.status });
  } else if (upstream.status === 401 || upstream.status === 403) {
    // A data request refused (no permission, or an expired / forged token): worth seeing when it comes in waves.
    if (path.startsWith('rest/')) securityEvent('forbidden', { request, path: path.split('?')[0].slice(0, 120), status: upstream.status });
  }

  const out = new Headers();
  for (const name of PASS_RESPONSE) {
    const value = upstream.headers.get(name);
    if (value) out.set(name, value);
  }
  out.set('cache-control', 'no-store');
  return new Response(upstream.status === 204 ? null : upstream.body, { status: upstream.status, headers: out });
}

export { proxy as GET, proxy as POST, proxy as PUT, proxy as PATCH, proxy as DELETE };
