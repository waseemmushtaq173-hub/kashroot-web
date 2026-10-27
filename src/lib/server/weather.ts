/**
 * Weather from Open-Meteo (open-meteo.com, CC BY 4.0 — attribution required).
 * Free without a key for non-commercial use; for commercial use set
 * OPEN_METEO_API_KEY (paid plan, customer-api host). Server-only.
 */
import 'server-only';

import { keepGood, lastGood } from '@/lib/server/lastGood';
import type { Place } from '@/lib/server/places';

export { geocode, type Place } from '@/lib/server/places';

export interface Forecast {
  place: Place;
  timezone: string;
  current: { time: string; temperature: number; humidity: number; precipitation: number; wind: number; code: number };
  hourly: { time: string; temperature: number; precipitationProbability: number; code: number }[];
  daily: { date: string; max: number; min: number; precipitation: number; code: number }[];
  fetchedAt: string;
  source: string;
  /** Open-Meteo did not answer: this is the last good forecast, from fetchedAt. */
  stale?: boolean;
}

/** A kept forecast older than this is no help for deciding today's spraying: say it is unavailable instead. */
const WEATHER_KEEP_MS = 48 * 3600_000;

/**
 * The forecast for a place; when Open-Meteo is down, the last good one for
 * the same spot (to about 1 km) with `stale` and its time.
 */
export async function forecast(place: Place): Promise<Forecast> {
  // Rounded: the kept copy is for an area, never a person's exact position.
  const key = `weather:${place.lat.toFixed(2)},${place.lng.toFixed(2)}`;
  try {
    const live = await readForecast(place);
    const body: Partial<Forecast> = { ...live };
    delete body.place;
    keepGood(key, body, live.fetchedAt);
    return live;
  } catch (err) {
    const kept = await lastGood<Omit<Forecast, 'place'>>(key);
    if (!kept || Date.now() - Date.parse(kept.fetchedAt) > WEATHER_KEEP_MS) throw err;
    return { ...kept.body, place, fetchedAt: kept.fetchedAt, stale: true };
  }
}

function host(sub: 'api' | 'geocoding-api') {
  const key = process.env.OPEN_METEO_API_KEY?.trim();
  if (key && sub === 'api') return { base: 'https://customer-api.open-meteo.com', key };
  return { base: `https://${sub}.open-meteo.com`, key: undefined };
}

async function readForecast(place: Place): Promise<Forecast> {
  const { base, key } = host('api');
  const params = new URLSearchParams({
    latitude: String(place.lat),
    longitude: String(place.lng),
    current: 'temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,weather_code',
    hourly: 'temperature_2m,precipitation_probability,weather_code',
    daily: 'weather_code,precipitation_sum,temperature_2m_max,temperature_2m_min',
    timezone: 'auto',
    forecast_days: '7',
  });
  if (key) params.set('apikey', key);
  const res = await fetch(`${base}/v1/forecast?${params}`, { next: { revalidate: 600 }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Open-Meteo answered ${res.status}`);
  const j = await res.json();
  const now = j.current;
  const startHour = Math.max(0, (j.hourly.time as string[]).findIndex((t) => t >= now.time.slice(0, 13)));
  return {
    place,
    timezone: j.timezone,
    current: {
      time: now.time,
      temperature: now.temperature_2m,
      humidity: now.relative_humidity_2m,
      precipitation: now.precipitation,
      wind: now.wind_speed_10m,
      code: now.weather_code,
    },
    hourly: (j.hourly.time as string[]).slice(startHour, startHour + 24).map((time, i) => ({
      time,
      temperature: j.hourly.temperature_2m[startHour + i],
      precipitationProbability: j.hourly.precipitation_probability?.[startHour + i] ?? 0,
      code: j.hourly.weather_code[startHour + i],
    })),
    daily: (j.daily.time as string[]).map((date, i) => ({
      date,
      max: j.daily.temperature_2m_max[i],
      min: j.daily.temperature_2m_min[i],
      precipitation: j.daily.precipitation_sum[i],
      code: j.daily.weather_code[i],
    })),
    fetchedAt: new Date().toISOString(),
    source: 'Open-Meteo (open-meteo.com)',
  };
}
