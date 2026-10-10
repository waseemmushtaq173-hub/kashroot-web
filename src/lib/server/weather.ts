/**
 * Weather from Open-Meteo (open-meteo.com, CC BY 4.0 — attribution required).
 * Free without a key for non-commercial use; for commercial use set
 * OPEN_METEO_API_KEY (paid plan, customer-api host). Server-only.
 */
import 'server-only';

export interface Place {
  name: string;
  admin: string;
  country: string;
  lat: number;
  lng: number;
}

export interface Forecast {
  place: Place;
  timezone: string;
  current: { time: string; temperature: number; humidity: number; precipitation: number; wind: number; code: number };
  hourly: { time: string; temperature: number; precipitationProbability: number; code: number }[];
  daily: { date: string; max: number; min: number; precipitation: number; code: number }[];
  fetchedAt: string;
  source: string;
}

function host(sub: 'api' | 'geocoding-api') {
  const key = process.env.OPEN_METEO_API_KEY?.trim();
  if (key && sub === 'api') return { base: 'https://customer-api.open-meteo.com', key };
  return { base: `https://${sub}.open-meteo.com`, key: undefined };
}

export async function geocode(name: string): Promise<Place[]> {
  const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
  url.search = new URLSearchParams({ name, count: '8', language: 'en', format: 'json', countryCode: 'IN' }).toString();
  const res = await fetch(url, { next: { revalidate: 86_400 }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Geocoding answered ${res.status}`);
  const json = (await res.json()) as { results?: { name: string; admin1?: string; admin2?: string; country?: string; latitude: number; longitude: number }[] };
  return (json.results ?? []).map((r) => ({
    name: r.name,
    admin: [r.admin2, r.admin1].filter(Boolean).join(', '),
    country: r.country ?? 'India',
    lat: r.latitude,
    lng: r.longitude,
  }));
}

export async function forecast(place: Place): Promise<Forecast> {
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
