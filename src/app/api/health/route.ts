/**
 * /api/health — is KashRoot up, and can it really reach Supabase?
 * Used by the public /status page and by the online-first connectivity
 * manager (src/lib/connectivity.ts): the probe must verify an actual
 * database table read, not just the auth service, so "online" always
 * means "the data layer answers". Never cached.
 *
 * ?speed=1 (Admin → Setup check) also times what a sign-in waits for, from this server: a read of the data API and the
 * sign-in service's own health call, each timed twice (the second is the steady speed, the first includes opening the
 * connection). Milliseconds and the server's region only.
 */
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

import { ipLimited, tooMany } from '@/lib/server/sign';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (ipLimited(request, 'health', 60)) return tooMany();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  if (!url || !key) {
    return NextResponse.json(
      {
        ok: false,
        online: true,
        supabaseConnected: false,
        error: 'Missing Supabase environment configuration',
        status: 'degraded',
        services: { web: 'ok', db: 'missing' },
        timestamp: new Date().toISOString(),
      },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  try {
    const supabase = createClient(url, key, { auth: { persistSession: false } });
    if (new URL(request.url).searchParams.get('speed') === '1') {
      const read = async () => {
        const t = Date.now();
        const { error: e } = await supabase.from('rental_listings').select('id').limit(1);
        return { ms: Date.now() - t, ok: !e };
      };
      const authCall = async () => {
        const t = Date.now();
        const ok = await fetch(`${url.replace(/\/+$/, '')}/auth/v1/health`, { headers: { apikey: key }, cache: 'no-store', signal: AbortSignal.timeout(8_000) })
          .then((r) => r.ok)
          .catch(() => false);
        return { ms: Date.now() - t, ok };
      };
      const first = await read();
      const second = await read();
      const a1 = await authCall();
      const a2 = await authCall();
      return NextResponse.json(
        { ok: first.ok && a1.ok, speed: { dbMs: second.ms, dbFirstMs: first.ms, authMs: a2.ms, authFirstMs: a1.ms, dbOk: first.ok && second.ok, authOk: a1.ok && a2.ok, region: process.env.VERCEL_REGION ?? null } },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }
    const { error } = await supabase.from('rental_listings').select('id').limit(1);
    const connected = !error;
    return NextResponse.json(
      {
        ok: connected,
        online: true,
        supabaseConnected: connected,
        error: error ? 'The data layer did not answer.' : null,
        status: connected ? 'ok' : 'degraded',
        services: { web: 'ok', db: connected ? 'ok' : 'down' },
        timestamp: new Date().toISOString(),
      },
      { status: connected ? 200 : 502, headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        online: true,
        supabaseConnected: false,
        error: 'Database health check failed',
        status: 'degraded',
        services: { web: 'ok', db: 'down' },
        timestamp: new Date().toISOString(),
      },
      { status: 502, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
