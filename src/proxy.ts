/**
 * One address for the real site. On a production deployment (VERCEL_ENV
 * "production"), a page opened on any other address — a deployment's own
 * kashroot-…-team-….vercel.app link, www., an old domain — is sent, before
 * anything loads, to the same path and query on the real site: the security
 * check (Cloudflare Turnstile) works only there (error 110200 elsewhere), and
 * sign-in links and emails all point there.
 *
 * The real site: NEXT_PUBLIC_SITE_URL (else https://kashroot-web.vercel.app);
 * also accepted as-is: kashroot-web.vercel.app and any host listed in
 * NEXT_PUBLIC_SITE_HOSTS (comma-separated), so a custom domain is added
 * without code changes. Preview deployments and this computer are left alone
 * (they use Cloudflare's test key and show a "test copy" banner). API routes
 * and files are not redirected: scheduled jobs and scripts call them as they are.
 */
import { NextResponse, type NextRequest } from 'next/server';

const CANONICAL = (process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://kashroot-web.vercel.app').replace(/\/$/, '');
const REAL_HOSTS = ['kashroot-web.vercel.app', new URL(CANONICAL).host, ...(process.env.NEXT_PUBLIC_SITE_HOSTS ?? '').split(',')]
  .map((h) => h.trim().toLowerCase())
  .filter(Boolean);

export function proxy(request: NextRequest) {
  if (process.env.VERCEL_ENV !== 'production') return NextResponse.next();
  const host = (request.headers.get('host') ?? '').toLowerCase();
  if (REAL_HOSTS.includes(host)) return NextResponse.next();
  const to = new URL(request.nextUrl.pathname + request.nextUrl.search, CANONICAL);
  return NextResponse.redirect(to, 308);
}

export const config = {
  // Pages only: not /api, Next's own files, or files with an extension (icons, sw.js, manifest…).
  matcher: ['/((?!api/|_next/|.*\\.[a-z0-9]+$).*)'],
};
