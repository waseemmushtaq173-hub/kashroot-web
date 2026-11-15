/**
 * GET /api/v1/weather?district=<name>   → the mandi-weather page's IMD panel
 * GET /api/v1/weather?lat=&lng=         → the same for GPS coordinates
 *
 * The panel renders api.imd.gov.in's response shape, but IMD's API is
 * licensed and not open to the site, so this route serves the very same
 * fields derived honestly from the Open-Meteo forecast (lib/server/weather.ts)
 * for the same district. Every value is real, warnings are raised only from
 * that forecast (heavy rain, frost, strong winds), and the source line on the
 * page says exactly where the data came from — nothing is labelled IMD that
 * is not.
 */
import { NextResponse } from 'next/server';

import { forecast, geocode, type Place } from '@/lib/server/weather';
import { placeName } from '@/lib/server/places';
import { ipLimited, tooMany } from '@/lib/server/sign';

export const maxDuration = 30;

/** WMO weather codes → the same short names the Open-Meteo card on the page shows. */
const NAMES: [number[], string][] = [
  [[0], 'Clear sky'],
  [[1, 2], 'Partly cloudy'],
  [[3], 'Overcast'],
  [[45, 48], 'Fog'],
  [[51, 53, 55, 56, 57], 'Drizzle'],
  [[61, 63, 65, 66, 67, 80, 81, 82], 'Rain'],
  [[71, 73, 75, 77, 85, 86], 'Snow'],
  [[95, 96, 99], 'Thunderstorm'],
];
const conditionOf = (code: number) => NAMES.find(([codes]) => codes.includes(code))?.[1] ?? 'Overcast';

type Warning = { severity: 'INFO' | 'WARNING' | 'CRITICAL'; message: string; issuedAt: string; validUntil: string; affectedDistricts: string[]; source: string };

export async function GET(request: Request) {
  if (ipLimited(request, 'weather', 60)) return tooMany();
  const q = new URL(request.url).searchParams;
  try {
    const lat = Number(q.get('lat'));
    const lng = Number(q.get('lng'));
    let place: Place;
    let district = q.get('name')?.slice(0, 60) ?? '';
    if (q.get('lat') && q.get('lng') && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      // "Chitragam, Shopian, Jammu and Kashmir" for the GPS point, best effort.
      const named = await placeName(lat, lng).catch(() => null);
      const parts = (named ?? '').split(',').map((p) => p.trim()).filter(Boolean);
      district = district || parts[1] || parts[0] || '';
      place = { name: parts[0] || district || 'Your location', admin: named ?? '', country: 'India', lat, lng };
    } else {
      district = (q.get('district') || district || 'Srinagar').slice(0, 60);
      const hit = (await geocode(district))[0];
      if (!hit) return NextResponse.json({ error: `No weather grid point for “${district}”. Try the nearest town, or press “Use my location”.` }, { status: 404 });
      place = hit;
    }

    const f = await forecast(place);
    const where = district || place.name;
    const nowIso = new Date().toISOString();
    const endOfDay = (date: string) => `${date}T23:59:59+05:30`;
    const warnings: Warning[] = [];
    const today = f.daily[0];
    if (today && today.precipitation >= 20) {
      warnings.push({ severity: 'WARNING', message: `Forecast: about ${Math.round(today.precipitation)} mm of rain near ${place.name} today — hold sprays and keep loaded crates covered.`, issuedAt: nowIso, validUntil: endOfDay(today.date), affectedDistricts: [where], source: f.source });
    }
    const frost = f.daily.slice(0, 3).find((d) => d.min <= 2);
    if (frost) {
      warnings.push({ severity: 'CRITICAL', message: `Forecast: frost likely on ${frost.date} (min about ${Math.round(frost.min)} °C) — protect blossoms, nurseries and water lines.`, issuedAt: nowIso, validUntil: endOfDay(frost.date), affectedDistricts: [where], source: f.source });
    }
    const windy = f.daily.slice(0, 3).find((d) => d.windMax >= 40);
    if (windy) {
      warnings.push({ severity: 'WARNING', message: `Forecast: strong winds up to about ${Math.round(windy.windMax)} km/h around ${windy.date} — no spraying, and check cold-store doors and tarpaulins.`, issuedAt: nowIso, validUntil: endOfDay(windy.date), affectedDistricts: [where], source: f.source });
    }

    const cell = `OM-${place.lat.toFixed(1)},${place.lng.toFixed(1)}`;
    return NextResponse.json({
      current: {
        temperature: f.current.temperature,
        humidity: f.current.humidity,
        windSpeed: f.current.wind,
        windDirection: f.current.windDirection,
        rainfall: f.current.precipitation,
        pressure: f.current.pressure,
        condition: conditionOf(f.current.code),
        observedAt: f.current.time,
        source: f.source,
        stationCode: cell,
        stationName: place.name,
      },
      hourly: f.hourly.map((h) => ({
        time: h.time,
        temperature: h.temperature,
        humidity: h.humidity,
        precipitationProbability: h.precipitationProbability,
        rainfall: h.rainfall,
        windSpeed: h.wind,
        condition: conditionOf(h.code),
      })),
      daily: f.daily.map((d) => ({
        date: d.date,
        maxTemperature: d.max,
        minTemperature: d.min,
        totalRainfall: d.precipitation,
        avgHumidity: d.humidityMean,
        maxWindSpeed: d.windMax,
        condition: conditionOf(d.code),
      })),
      warnings,
      advisories: [],
      district: where,
      source: `${f.source}; IMD station feed not connected`,
      observationTime: f.current.time,
      stationCode: cell,
      stationName: place.name,
      stale: f.stale,
    }, { headers: { 'Cache-Control': f.stale ? 'public, s-maxage=60' : 'public, s-maxage=600, stale-while-revalidate=1200' } });
  } catch (err) {
    // The reason stays in the server's log; the person gets plain words.
    console.error('IMD panel weather failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'The weather service did not respond. Try again in a minute.' }, { status: 502 });
  }
}
