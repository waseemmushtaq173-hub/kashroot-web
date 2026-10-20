/**
 * GET /api/cold-stores — the live part of the cold store directory: the
 * National Horticulture Board's list and OpenStreetMap, for Jammu & Kashmir
 * (lib/server/coldDirectory). ?fresh=1 reads the sources again (Admin's
 * "Read the official list now"): a few times a minute at most, so nobody can
 * make KashRoot flood those websites.
 */
import { NextResponse } from 'next/server';

import { liveDirectory } from '@/lib/server/coldDirectory';
import { ipLimited } from '@/lib/server/sign';

/** Each source has its own few-second limit; this is the outer bound. */
export const maxDuration = 30;

export async function GET(request: Request) {
  const fresh = new URL(request.url).searchParams.get('fresh') === '1';
  if (fresh && ipLimited(request, 'cold-stores-fresh', 6)) {
    return NextResponse.json({ error: 'The official list was read several times just now. Wait one minute, then tap the button again.' }, { status: 429, headers: { 'retry-after': '60' } });
  }
  const data = await liveDirectory(fresh);
  // A source that could not be reached is tried again soon, not after hours.
  const allOk = data.sources.every((s) => s.ok);
  return NextResponse.json(data, {
    headers: { 'Cache-Control': fresh ? 'no-store' : allOk ? 'public, s-maxage=21600, stale-while-revalidate=86400' : 'public, s-maxage=300' },
  });
}
