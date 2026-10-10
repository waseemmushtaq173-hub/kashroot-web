/**
 * GET /api/mandi/diagnose?commodity=Apple&state=Jammu and Kashmir
 * Shows what the government price sources answer from this server right
 * now, so a failing mandi board can be traced. Public data only.
 */
import { NextResponse } from 'next/server';

import { diagnoseAgmarknet } from '@/lib/server/agmarknet';
import { fetchMandiPrices } from '@/lib/server/mandi';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const commodity = q.get('commodity')?.slice(0, 40) || 'Apple';
  const state = q.get('state')?.slice(0, 40) || 'Jammu and Kashmir';
  const agmarknet = await diagnoseAgmarknet(commodity, state);
  let combined: unknown;
  try {
    const r = await fetchMandiPrices({ commodity, state, limit: 5 });
    combined = { source: r.source, rows: r.records.length, sample: r.records.slice(0, 3) };
  } catch (err) {
    combined = { error: err instanceof Error ? err.message : String(err) };
  }
  return NextResponse.json({ region: process.env.VERCEL_REGION ?? 'local', agmarknet, combined }, { headers: { 'cache-control': 'no-store' } });
}
