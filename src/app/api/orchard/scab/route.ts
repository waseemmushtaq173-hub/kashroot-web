/**
 * GET /api/orchard/scab?lat=&lng= — hourly weather for the last 3 days and
 * the next 4 (Open-Meteo), and the wet spells in it, for the scab risk map.
 * → { timezone, now, spells: WetSpell[], source }
 */
import { NextResponse } from 'next/server';

import { wetSpells, type Hour } from '@/lib/scab';
import { ipLimited, tooMany } from '@/lib/server/sign';

export const maxDuration = 30;

export async function GET(request: Request) {
  if (ipLimited(request, 'orchard-scab', 30)) return tooMany();
  const q = new URL(request.url).searchParams;
  const lat = Number(q.get('lat'));
  const lng = Number(q.get('lng'));
  if (!q.get('lat') || !q.get('lng') || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return NextResponse.json({ error: 'Set the orchard’s location first.' }, { status: 400 });
  }
  const key = process.env.OPEN_METEO_API_KEY?.trim();
  const base = key ? 'https://customer-api.open-meteo.com' : 'https://api.open-meteo.com';
  const params = new URLSearchParams({
    latitude: lat.toFixed(3),
    longitude: lng.toFixed(3),
    hourly: 'temperature_2m,relative_humidity_2m,precipitation,soil_moisture_0_to_7cm',
    current: 'temperature_2m',
    past_days: '3',
    forecast_days: '4',
    timezone: 'auto',
  });
  if (key) params.set('apikey', key);
  try {
    const res = await fetch(`${base}/v1/forecast?${params}`, { next: { revalidate: 900 }, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`Open-Meteo answered ${res.status}`);
    const j = await res.json();
    const times = j.hourly.time as string[];
    const hours: Hour[] = times.map((time, i) => ({
      time,
      temp: j.hourly.temperature_2m[i],
      rh: j.hourly.relative_humidity_2m[i],
      rain: j.hourly.precipitation[i] ?? 0,
    }));
    const now = String(j.current?.time ?? new Date().toISOString().slice(0, 16));
    // Top-soil moisture (0–7 cm, m³/m³): the first value from now onward that
    // the source actually has — undefined stays undefined, never a made-up number.
    const moist = (j.hourly.soil_moisture_0_to_7cm ?? []) as (number | null)[];
    const mIdx = times.findIndex((t, i) => t >= now && Number.isFinite(moist[i] as number));
    const soilMoisture = mIdx >= 0 ? { value: Number(moist[mIdx]), at: times[mIdx] } : undefined;
    return NextResponse.json(
      { timezone: j.timezone, now, spells: wetSpells(hours, now), soilMoisture, source: 'Open-Meteo (open-meteo.com)' },
      { headers: { 'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=1800' } },
    );
  } catch (err) {
    console.error('scab weather', err);
    return NextResponse.json({ error: 'The weather service did not respond. Try again in a minute.' }, { status: 502 });
  }
}
