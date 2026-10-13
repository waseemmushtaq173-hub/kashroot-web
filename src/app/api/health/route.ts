/**
 * /api/health — is KashRoot up? Checks the website itself and the Supabase
 * project that holds accounts and data (its sign-in service answers only
 * when its database does). Used by the public /status page.
 */
import { NextResponse } from 'next/server';

import { ipLimited, tooMany } from '@/lib/server/sign';
import { supabaseAnonKey, supabaseOrigin } from '@/lib/supabase-config';

export const dynamic = 'force-dynamic';

type State = 'ok' | 'down' | 'missing';

export async function GET(request: Request) {
  if (ipLimited(request, 'health', 30)) return tooMany();
  const origin = supabaseOrigin(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = supabaseAnonKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  let db: State = 'missing';
  if (origin && key) {
    try {
      const res = await fetch(`${origin}/auth/v1/health`, { headers: { apikey: key }, cache: 'no-store', signal: AbortSignal.timeout(8000) });
      db = res.ok ? 'ok' : 'down';
    } catch {
      db = 'down';
    }
  }

  const status = db === 'ok' ? 'ok' : 'degraded';
  return NextResponse.json(
    { status, timestamp: new Date().toISOString(), services: { web: 'ok', db } },
    { status: status === 'ok' ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  );
}
