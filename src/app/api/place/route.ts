/**
 * GET /api/place?lat=&lng= → { name: "Chitragam, Shopian, Jammu and Kashmir" }
 * The village or town at a GPS point (OpenStreetMap), for live tracking.
 * Rounded to ~100 m so repeated looks at a parked truck reuse the cache.
 */
import { NextResponse } from 'next/server';

import { placeName } from '@/lib/server/places';
import { ipLimited, tooMany } from '@/lib/server/sign';

export async function GET(request: Request) {
  if (ipLimited(request, 'place', 30)) return tooMany();
  const q = new URL(request.url).searchParams;
  const lat = Math.round(Number(q.get('lat')) * 1000) / 1000;
  const lng = Math.round(Number(q.get('lng')) * 1000) / 1000;
  if (!q.get('lat') || !q.get('lng') || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return NextResponse.json({ error: 'lat and lng are needed' }, { status: 400 });
  }
  const name = await placeName(lat, lng);
  return NextResponse.json({ name }, { headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=86400' } });
}
