/**
 * GET /api/cold-stores — the live part of the cold store directory: the
 * National Horticulture Board's list and OpenStreetMap, for Jammu & Kashmir
 * (lib/server/coldDirectory). ?fresh=1 reads the sources again (Admin).
 */
import { NextResponse } from 'next/server';

import { liveDirectory } from '@/lib/server/coldDirectory';

export async function GET(request: Request) {
  const fresh = new URL(request.url).searchParams.get('fresh') === '1';
  const data = await liveDirectory(fresh);
  // A source that could not be reached is tried again soon, not after hours.
  const allOk = data.sources.every((s) => s.ok);
  return NextResponse.json(data, {
    headers: { 'Cache-Control': fresh ? 'no-store' : allOk ? 'public, s-maxage=21600, stale-while-revalidate=86400' : 'public, s-maxage=300' },
  });
}
