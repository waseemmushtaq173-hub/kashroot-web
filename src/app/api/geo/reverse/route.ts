/**
 * GET /api/geo/reverse?lat=34.05&lng=74.80 — a human-readable address for
 * live coordinates, looked up on the server: the browser never depends on a
 * third party's CORS policy or their fair-use rules, and the app's contact
 * (per OpenStreetMap's usage policy) goes in the User-Agent once, here.
 *
 *   1. OpenStreetMap Nominatim (zoom 18, addressdetails) — the exact place;
 *   2. BigDataCloud's client reverse geocode — when Nominatim is slow or down.
 *
 * `formattedAddress` is always a place name. When both upstreams are
 * unreachable the answer is 502 and the caller shows the coordinates — the
 * server never sends raw coordinates dressed up as an address.
 *
 * 200 GeoAddress · 400 malformed coordinates · 502 both upstreams down.
 */
import { NextResponse } from 'next/server';

import { ipLimited, tooMany } from '@/lib/server/sign';

export const maxDuration = 20;

const NOMINATIM = 'https://nominatim.openstreetmap.org/reverse';
const BIGDATACLOUD = 'https://api.bigdatacloud.net/data/reverse-geocode-client';

interface GeoAddress {
  ok: true;
  formattedAddress: string;
  neighbourhood: string | null;
  city: string | null;
  district: string | null;
  state: string | null;
  postcode: string | null;
  lat: number;
  lng: number;
}

const clean = (s: unknown): string | null => {
  const v = typeof s === 'string' ? s.trim() : '';
  return v.length > 0 ? v : null;
};

/** One lookup on Nominatim: the exact address with its parts. */
async function fromNominatim(lat: number, lng: number): Promise<GeoAddress | null> {
  const url = `${NOMINATIM}?${new URLSearchParams({ format: 'jsonv2', lat: String(lat), lon: String(lng), zoom: '18', addressdetails: '1' })}`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        'User-Agent': 'KashRoot-AgriTech/1.0 (waseemmushtaq173@gmail.com)',
        'Accept-Language': 'en',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(7_000),
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const d = (await res.json().catch(() => null)) as
    | { display_name?: string; address?: Record<string, string> }
    | null;
  if (!d) return null;
  const a = d.address ?? {};
  const formatted = clean(d.display_name);
  if (!formatted) return null;
  return {
    ok: true,
    formattedAddress: formatted,
    neighbourhood: clean(a.neighbourhood) ?? clean(a.suburb) ?? clean(a.village) ?? clean(a.hamlet) ?? clean(a.quarter) ?? null,
    city: clean(a.city) ?? clean(a.town) ?? clean(a.municipality) ?? null,
    district: clean(a.city_district) ?? clean(a.county) ?? clean(a.state_district) ?? null,
    state: clean(a.state) ?? null,
    postcode: clean(a.postcode) ?? null,
    lat,
    lng,
  };
}

/** One lookup on BigDataCloud: a place name and its parts, no key needed. */
async function fromBigDataCloud(lat: number, lng: number): Promise<GeoAddress | null> {
  const url = `${BIGDATACLOUD}?${new URLSearchParams({ latitude: String(lat), longitude: String(lng), localityLanguage: 'en' })}`;
  let res: Response;
  try {
    res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(7_000) });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const d = (await res.json().catch(() => null)) as
    | { locality?: string; city?: string; principalSubdivision?: string; postcode?: string; localityInfo?: { administrative?: { administrativeName?: string; adminLevel?: number }[] } }
    | null;
  if (!d) return null;
  const parts = [clean(d.locality), clean(d.city), clean(d.principalSubdivision)].filter((x): x is string => Boolean(x));
  if (parts.length === 0) return null;
  const admins = (d.localityInfo?.administrative ?? []).filter((x) => clean(x?.administrativeName));
  const district = clean(admins.find((x) => (x.adminLevel ?? 0) >= 6)?.administrativeName) ?? clean(admins[0]?.administrativeName);
  return {
    ok: true,
    formattedAddress: [...new Set(parts)].join(', '),
    neighbourhood: clean(d.locality) ?? null,
    city: clean(d.city) ?? null,
    district: district ?? null,
    state: clean(d.principalSubdivision) ?? null,
    postcode: clean(d.postcode) ?? null,
    lat,
    lng,
  };
}

export async function GET(request: Request) {
  if (ipLimited(request, 'geo-reverse', 40)) return tooMany(60);
  const params = new URL(request.url).searchParams;
  const lat = Number(params.get('lat'));
  const lng = Number(params.get('lng'));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return NextResponse.json({ ok: false, error: 'Send lat and lng as decimal degrees.' }, { status: 400 });
  }

  const answer = (await fromNominatim(lat, lng)) ?? (await fromBigDataCloud(lat, lng));
  if (answer) return NextResponse.json(answer, { headers: { 'Cache-Control': 'private, max-age=60' } });
  return NextResponse.json({ ok: false, error: 'Both address lookups are unreachable right now.' }, { status: 502 });
}
