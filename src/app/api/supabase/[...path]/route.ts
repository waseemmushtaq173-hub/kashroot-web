/**
 * Same-origin proxy to the Supabase project for the browser client
 * (src/lib/supabase.ts). Only the auth and data APIs are forwarded, only to
 * the configured project. When the project can't be reached the reply says
 * why — wrong address, paused project — in words the sign-in form shows.
 */
import { supabaseOrigin } from '@/lib/supabase-config';

export const dynamic = 'force-dynamic';

const ALLOWED = /^(auth|rest)\/v1(\/|$)/;
const PASS_REQUEST = ['apikey', 'authorization', 'content-type', 'accept', 'accept-profile', 'content-profile', 'prefer', 'range', 'x-client-info', 'x-supabase-api-version'];
const PASS_RESPONSE = ['content-type', 'content-range', 'x-supabase-api-version', 'preference-applied', 'retry-after'];

/** auth-js reads `msg`; "[setup]" tells the form to show it as is. */
const problem = (status: number, msg: string) => Response.json({ msg: `[setup] ${msg}`, message: `[setup] ${msg}` }, { status });

async function proxy(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const origin = supabaseOrigin(process.env.NEXT_PUBLIC_SUPABASE_URL);
  if (!origin) return problem(503, 'Sign-in is not set up on this site yet: add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in Vercel and redeploy.');
  const path = (await params).path.join('/');
  if (!ALLOWED.test(path)) return Response.json({ msg: 'Not found' }, { status: 404 });

  const headers = new Headers();
  for (const name of PASS_REQUEST) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';

  let upstream: Response;
  try {
    upstream = await fetch(`${origin}/${path}${new URL(request.url).search}`, {
      method: request.method,
      headers,
      body: hasBody ? await request.arrayBuffer() : undefined,
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

  const out = new Headers();
  for (const name of PASS_RESPONSE) {
    const value = upstream.headers.get(name);
    if (value) out.set(name, value);
  }
  out.set('cache-control', 'no-store');
  return new Response(upstream.status === 204 ? null : upstream.body, { status: upstream.status, headers: out });
}

export { proxy as GET, proxy as POST, proxy as PUT, proxy as PATCH, proxy as DELETE };
