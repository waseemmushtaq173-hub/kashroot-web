/**
 * What the server saw that matters for security — sign-ins (right and wrong),
 * sign-ups, reset emails, requests refused for going too fast, bot checks
 * that failed, API errors — so an attack can be spotted:
 *   - one JSON line in the server log (Vercel → Logs; search "kr-security"),
 *   - and a row in security_events (20261106000000_security_hardening.sql)
 *     for Admin → Security, written after the reply has gone (after()).
 * Never an IP address, email, phone, password, token or key: the network and
 * the account appear only as hashes (lib/server/sharedLimit hashed), and
 * `detail` is cut short and stripped of anything that looks like a secret.
 * Logging can never break a request. Server-only.
 */
import 'server-only';

import { after } from 'next/server';

import { hashed } from '@/lib/server/sharedLimit';
import { clientIp, rateLimited } from '@/lib/server/sign';
import { supabaseAnonKey, supabaseOrigin } from '@/lib/supabase-config';

export type SecurityKind =
  | 'signin_ok'
  | 'signin_fail'
  | 'signin_paused'
  | 'signup'
  | 'signup_paused'
  | 'reset_email'
  | 'email_paused'
  | 'rate_limited'
  | 'api_error'
  | 'bot_check_failed'
  | 'forbidden';

/** Long digit runs, emails, bearer tokens, JWTs and key-like strings out of a message. */
export function scrub(text: string): string {
  return text
    .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '[token]')
    .replace(/\b(sk|pk|sb|rk)_[\w-]{8,}/gi, '[key]')
    .replace(/bearer\s+\S+/gi, 'Bearer [token]')
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[email]')
    .replace(/\d{6,}/g, '[number]')
    .replace(/[A-Za-z0-9_-]{32,}/g, '[secret]')
    .slice(0, 300);
}

async function store(kind: SecurityKind, ip: string | null, actor: string | null, path: string | null, status: number | null, detail: string | null) {
  const secret = process.env.KYC_DB_SECRET?.trim();
  const origin = supabaseOrigin(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anon = supabaseAnonKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  if (!secret || !origin || !anon) return;
  try {
    await fetch(`${origin}/rest/v1/rpc/kr_log_event`, {
      method: 'POST',
      headers: { apikey: anon, authorization: `Bearer ${anon}`, 'content-type': 'application/json' },
      body: JSON.stringify({ p_secret: secret, p_kind: kind, p_ip: ip, p_actor: actor, p_path: path, p_status: status, p_detail: detail }),
      cache: 'no-store',
      signal: AbortSignal.timeout(3_000),
    });
  } catch {
    /* the log line above is enough */
  }
}

/**
 * Record one event. `account` (an email or phone) and the caller's network are
 * hashed here. A flood is logged in full on the server, but at most 30 rows a
 * minute per kind and network reach the database.
 */
export function securityEvent(kind: SecurityKind, opts: { request?: Request; account?: string; path?: string; status?: number; detail?: string } = {}): void {
  try {
    const ip = opts.request ? hashed(`ip|${clientIp(opts.request)}`) : null;
    const actor = opts.account ? hashed(`who|${opts.account}`) : null;
    const path = opts.path ?? (opts.request ? new URL(opts.request.url).pathname.slice(0, 120) : null);
    const detail = opts.detail ? scrub(opts.detail) : null;
    console.warn(JSON.stringify({ 'kr-security': kind, ip, actor, path, status: opts.status ?? null, detail, at: new Date().toISOString() }));
    if (rateLimited(`log:${kind}:${ip}`, 30, 60_000)) return;
    const write = () => store(kind, ip, actor, path, opts.status ?? null, detail);
    try {
      after(write);
    } catch {
      void write();
    }
  } catch {
    /* never break a request for a log line */
  }
}

/** An API route's unexpected failure: logged (without secrets) and summed up for Admin → Security. */
export function apiError(request: Request, err: unknown, status = 500): void {
  const name = err instanceof Error ? err.name : 'Error';
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[api] ${new URL(request.url).pathname}: ${name}: ${scrub(message)}`);
  securityEvent('api_error', { request, status, detail: `${name}: ${message}` });
}

/** A server error Next.js caught (instrumentation onRequestError): logged and stored, awaited (no after() there). */
export async function serverError(path: string, method: string, routeType: string, err: unknown): Promise<void> {
  try {
    const where = path.split('?')[0].slice(0, 120);
    const message = scrub(`${err instanceof Error ? `${err.name}: ${err.message}` : String(err)}`);
    console.error(JSON.stringify({ 'kr-security': 'api_error', path: where, method, routeType, detail: message, at: new Date().toISOString() }));
    if (rateLimited(`log:api_error:${where}`, 30, 60_000)) return;
    await store('api_error', null, null, where, 500, `${method} ${routeType}: ${message}`);
  } catch {
    /* never throw from the error reporter */
  }
}
