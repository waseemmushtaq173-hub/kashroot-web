/**
 * /api/health — is KashRoot up, and can it really reach Supabase?
 * Used by the public /status page and by the online-first connectivity
 * manager (src/lib/connectivity.ts): the probe must verify an actual
 * database table read, not just the auth service, so "online" always
 * means "the data layer answers". Never cached.
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
    const { error } = await supabase.from('rental_listings').select('id').limit(1);
    const connected = !error;
    return NextResponse.json(
      {
        ok: connected,
        online: true,
        supabaseConnected: connected,
        error: error ? error.message : null,
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
        error: err instanceof Error ? err.message : 'Database health check failed',
        status: 'degraded',
        services: { web: 'ok', db: 'down' },
        timestamp: new Date().toISOString(),
      },
      { status: 502, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
