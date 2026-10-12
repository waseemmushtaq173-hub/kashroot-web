/**
 * GET /api/weather?q=<place>          → forecast for the best match
 * GET /api/weather?lat=&lng=&name=     → forecast for coordinates
 * GET /api/weather?search=<text>       → matching places only (&deep=1 when the
 *                                       person pressed Find: adds Nominatim)
 * Data: Open-Meteo (CC BY 4.0); places also from OpenStreetMap (ODbL).
 */
import { NextResponse } from 'next/server';

import { forecast, geocode, type Place } from '@/lib/server/weather';
import { ipLimited, tooMany } from '@/lib/server/sign';

export const maxDuration = 30;

export async function GET(request: Request) {
  if (ipLimited(request, 'weather', 60)) return tooMany();
  const q = new URL(request.url).searchParams;
  try {
    const search = q.get('search')?.trim();
    if (search) return NextResponse.json({ places: await geocode(search.slice(0, 80), { deep: q.get('deep') === '1' }) });

    let place: Place | undefined;
    const lat = Number(q.get('lat'));
    const lng = Number(q.get('lng'));
    if (q.get('lat') && q.get('lng') && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      place = { name: q.get('name')?.slice(0, 60) || 'Your location', admin: '', country: 'India', lat, lng };
    } else {
      const name = (q.get('q') || q.get('district') || 'Srinagar').slice(0, 60);
      place = (await geocode(name, { deep: true }))[0];
      if (!place) return NextResponse.json({ error: `No place called “${name}” was found.` }, { status: 404 });
    }
    return NextResponse.json(await forecast(place), { headers: { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1200' } });
  } catch (err) {
    return NextResponse.json(
      { error: 'The weather service did not respond. Try again in a minute.', detail: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
