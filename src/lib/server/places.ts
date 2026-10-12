/**
 * Finding places by name, down to small villages, and naming a GPS position.
 *
 *   1. Open-Meteo geocoding (GeoNames) — towns and larger villages.
 *   2. Photon (photon.komoot.io) and Nominatim (nominatim.openstreetmap.org),
 *      both OpenStreetMap — many more villages and hamlets, and they
 *      understand "village district" in one line ("chitragam kalan shopian").
 *   3. If nothing matches the whole text, the last words are dropped one at a
 *      time ("chitragam kalan shopian" → "chitragam kalan" → "chitragam"),
 *      preferring places whose district matches the dropped words.
 *
 * Map data © OpenStreetMap contributors (ODbL). Nominatim's policy allows
 * light use with an identifying User-Agent and caching; results are cached
 * for a day. Server-only.
 */
import 'server-only';

export interface Place {
  name: string;
  admin: string;
  country: string;
  lat: number;
  lng: number;
  /** Set when the exact place is not on the public map and this is the nearest known one. */
  note?: string;
}

const UA = 'KashRoot/1.0 (+https://kashroot-web.vercel.app)';
// India's far north (J&K, Ladakh, Himachal, Punjab) first; the rest of India still matches.
const NORTH = { minLng: 72.5, minLat: 32.2, maxLng: 80.5, maxLat: 37.1 };

const words = (s: string) => s.toLowerCase().split(/[\s,]+/).filter((w) => w.length > 1);
const clean = (s: string) => s.replace(/[^\p{L}\p{N}\s,.'-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);

// How many map services answered during this server instance's last search (to tell
// "no such place" from "the map services are down").
let answered = 0;

async function getJson<T>(url: string, init: RequestInit = {}): Promise<T | null> {
  try {
    const res = await fetch(url, { ...init, headers: { 'User-Agent': UA, Accept: 'application/json', ...(init.headers ?? {}) }, next: { revalidate: 86_400 }, signal: AbortSignal.timeout(9_000) });
    if (!res.ok) return null;
    const json = (await res.json()) as T;
    answered++;
    return json;
  } catch {
    return null;
  }
}

const title = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);

/**
 * District headquarters and big towns of J&K and Ladakh, so the common names
 * work even when every map service is down.
 */
const KNOWN: Record<string, Place> = Object.fromEntries(
  ([
    ['Srinagar', 34.0837, 74.7973], ['Anantnag', 33.7311, 75.1487], ['Baramulla', 34.198, 74.3636], ['Budgam', 34.021, 74.721],
    ['Bandipora', 34.417, 74.643], ['Ganderbal', 34.216, 74.774], ['Kulgam', 33.645, 75.019], ['Kupwara', 34.531, 74.255],
    ['Pulwama', 33.874, 74.899], ['Shopian', 33.717, 74.834], ['Sopore', 34.286, 74.462], ['Jammu', 32.7266, 74.857], ['Leh', 34.1526, 77.5771],
  ] as const).map(([name, lat, lng]) => [name.toLowerCase(), { name, admin: name === 'Leh' ? 'Ladakh' : 'Jammu and Kashmir', country: 'India', lat, lng }]),
);

async function openMeteo(name: string): Promise<Place[]> {
  const q = new URLSearchParams({ name, count: '8', language: 'en', format: 'json', countryCode: 'IN' });
  const j = await getJson<{ results?: { name: string; admin1?: string; admin2?: string; admin3?: string; country?: string; latitude: number; longitude: number }[] }>(`https://geocoding-api.open-meteo.com/v1/search?${q}`);
  return (j?.results ?? []).map((r) => ({
    name: r.name,
    admin: [r.admin3, r.admin2, r.admin1].filter(Boolean).join(', '),
    country: r.country ?? 'India',
    lat: r.latitude,
    lng: r.longitude,
  }));
}

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: { name?: string; countrycode?: string; country?: string; state?: string; district?: string; county?: string; city?: string; osm_key?: string; osm_value?: string };
}

const photonPlace = (f: PhotonFeature): Place | null => {
  const p = f.properties;
  if (!p.name || (p.countrycode && p.countrycode.toUpperCase() !== 'IN')) return null;
  const [lng, lat] = f.geometry.coordinates;
  return { name: p.name, admin: [p.city !== p.name ? p.city : undefined, p.district ?? p.county, p.state].filter(Boolean).join(', '), country: p.country ?? 'India', lat, lng };
};

async function photon(text: string): Promise<Place[]> {
  // India only, with Kashmir preferred when names tie.
  const q = new URLSearchParams({ q: text, limit: '8', lang: 'en', bbox: '68,6,98,37.5', lat: '33.9', lon: '74.8', location_bias_scale: '0.4' });
  const j = await getJson<{ features?: PhotonFeature[] }>(`https://photon.komoot.io/api/?${q}`);
  const all = j?.features ?? [];
  // Real places (villages, towns, localities…) first. Many Kashmir villages are on the map only
  // through a named building — "CHC Zainapora", "Jamia Masjid Zainapora" — which still marks
  // the village; those count only when they carry a typed word in their name.
  const places = all.filter((f) => f.properties.osm_key === 'place' || f.properties.osm_key === 'boundary');
  const typed = words(text).filter((w) => w.length >= 4);
  const named = all.filter((f) => !places.includes(f) && typed.some((w) => (f.properties.name ?? '').toLowerCase().includes(w)));
  if (places.length) return places.map(photonPlace).filter((p): p is Place => p !== null);
  return named
    .map((f) => {
      const p = photonPlace(f);
      const word = typed.find((w) => (f.properties.name ?? '').toLowerCase().includes(w));
      return p && word ? { ...p, name: title(word), admin: `near ${title((f.properties.name ?? '').toLowerCase())}${p.admin ? `, ${p.admin}` : ''}` } : null;
    })
    .filter((p): p is Place => p !== null);
}

interface NominatimRow {
  lat: string;
  lon: string;
  name?: string;
  display_name: string;
  address?: Record<string, string>;
}

const nominatimPlace = (r: NominatimRow): Place => {
  const a = r.address ?? {};
  const name = r.name || a.village || a.hamlet || a.town || a.city || r.display_name.split(',')[0];
  const district = a.state_district || a.county || a.district;
  return { name, admin: [a.village && a.village !== name ? a.village : undefined, district, a.state].filter(Boolean).join(', '), country: a.country ?? 'India', lat: Number(r.lat), lng: Number(r.lon) };
};

async function nominatim(text: string): Promise<Place[]> {
  const q = new URLSearchParams({ q: text, format: 'jsonv2', addressdetails: '1', countrycodes: 'in', limit: '8', 'accept-language': 'en' });
  const rows = await getJson<NominatimRow[]>(`https://nominatim.openstreetmap.org/search?${q}`);
  return (rows ?? []).map(nominatimPlace);
}

/** Same place from two sources (within ~1.5 km and same first word) counts once. */
function merge(lists: Place[][]): Place[] {
  const out: Place[] = [];
  for (const p of lists.flat()) {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) continue;
    const first = (x: Place) => x.name.toLowerCase().split(' ')[0];
    // Same name, or one name inside the other ("Zainapora" and "CHC Zainapora").
    const same = (o: Place) => first(o) === first(p) || o.name.toLowerCase().includes(first(p)) || p.name.toLowerCase().includes(first(o));
    const near = (d: number) => out.find((o) => Math.abs(o.lat - p.lat) < d && Math.abs(o.lng - p.lng) < d && same(o));
    // The same name within ~1.5 km is the same place; a town and its district share a name within ~10 km.
    const dup = near(0.015) ?? (p.name.toLowerCase() === p.admin.toLowerCase().split(',')[0]?.trim() ? near(0.1) : undefined);
    if (!dup) out.push(p);
  }
  return out;
}

/** Best first: name matches the typed words, district matches, and in the north. */
function rank(places: Place[], typed: string[]): Place[] {
  const score = (p: Place) => {
    const name = p.name.toLowerCase();
    const all = `${name} ${p.admin.toLowerCase()}`;
    let s = typed.join(' ') === name ? 6 : 0;
    for (const w of typed) {
      if (name.includes(w)) s += 3;
      else if (all.includes(w)) s += 2;
    }
    if (p.lat >= NORTH.minLat && p.lat <= NORTH.maxLat && p.lng >= NORTH.minLng && p.lng <= NORTH.maxLng) s += 1;
    return s;
  };
  return places.map((p, i) => ({ p, s: score(p), i })).sort((a, b) => b.s - a.s || a.i - b.i).map((x) => x.p);
}

/**
 * `deep` adds Nominatim — only for a search the person asked for (pressing
 * Find), never for suggestions while typing: Nominatim's usage policy does
 * not allow search-as-you-type.
 */
export async function geocode(input: string, { deep = false }: { deep?: boolean } = {}): Promise<Place[]> {
  const text = clean(input);
  if (!text) return [];
  const typed = words(text);
  answered = 0;
  const known = KNOWN[text.toLowerCase()];

  // A 6-digit PIN code (e.g. 192303) — the post office area.
  if (/^\d{6}$/.test(text)) {
    const q = new URLSearchParams({ postalcode: text, country: 'India', format: 'jsonv2', addressdetails: '1', limit: '3', 'accept-language': 'en' });
    const rows = deep ? await getJson<NominatimRow[]>(`https://nominatim.openstreetmap.org/search?${q}`) : null;
    const viaPhoton = await photon(text);
    return merge([(rows ?? []).map((r) => ({ ...nominatimPlace(r), name: `PIN ${text}` })), viaPhoton]).slice(0, 5);
  }

  // 1. The whole text, from every source at once.
  let found = merge(await Promise.all([openMeteo(text), photon(text), deep ? nominatim(text) : Promise.resolve([])]));
  // With several words, the first one is the village: keep only places spelt like it
  // (first 4 letters — "pinjoora" still finds Pinjura), not just the district.
  const stem = typed[0]?.slice(0, 4) ?? '';
  if (typed.length > 1) found = found.filter((p) => p.name.toLowerCase().includes(stem));
  if (known) return merge([[known], rank(found, typed)]).slice(0, 8);
  if (found.length) return withLookAlikeNote(rank(found, typed), typed).slice(0, 8);

  // 2. "village district": drop the last words (usually the district) and look for the
  //    village alone — but only inside the district that was typed, never a look-alike
  //    village elsewhere ("chitragam" must not become Chatrugam in Tral).
  const parts = text.split(/[\s,]+/).filter(Boolean);
  for (let n = parts.length - 1; n >= 1; n--) {
    const head = parts.slice(0, n).join(' ');
    const rest = words(parts.slice(n).join(' ')).filter((w) => !/^(jammu|kashmir|and|j&k|jk|india|district|tehsil)$/.test(w));
    if (!rest.length) continue;
    found = merge(await Promise.all([openMeteo(head), photon(head)]));
    const inDistrict = found.filter((p) => rest.some((w) => p.admin.toLowerCase().includes(w)));
    if (inDistrict.length) return rank(inDistrict, typed).slice(0, 8);
  }

  // 3. The village is not on any public map: use the district or town that was typed, and say so.
  for (let n = 1; n < parts.length; n++) {
    const tail = parts.slice(n).join(' ');
    const k = KNOWN[tail.toLowerCase()];
    found = k ? [k] : merge(await Promise.all([openMeteo(tail), photon(tail)]));
    if (found.length) {
      const missing = parts.slice(0, n).join(' ');
      const best = KNOWN[tail.toLowerCase()] ?? rank(found, words(tail))[0];
      return [{ ...best, note: `“${missing}” is not on the public map yet — showing ${best.name}. For your exact spot, press “Use my location”.` }];
    }
  }

  if (!answered) throw new Error('The map services did not respond');
  return [];
}

/** Places spelt differently from what was typed ("chitragam" → Chatrugam) are marked, so nobody picks the wrong village by mistake. */
function withLookAlikeNote(places: Place[], typed: string[]): Place[] {
  return places.map((p) => (typed.some((w) => p.name.toLowerCase().includes(w.slice(0, 4))) ? p : { ...p, note: p.note ?? `Spelt differently from “${typed.join(' ')}” — check it is your area (${p.admin || p.name}) before choosing.` }));
}

/** "Chitragam, Shopian, Jammu and Kashmir" for a GPS point, or null. */
export async function placeName(lat: number, lng: number): Promise<string | null> {
  const q = new URLSearchParams({ lat: lat.toFixed(5), lon: lng.toFixed(5), format: 'jsonv2', zoom: '14', addressdetails: '1', 'accept-language': 'en' });
  const r = await getJson<NominatimRow & { error?: string }>(`https://nominatim.openstreetmap.org/reverse?${q}`);
  if (r && !r.error && r.address) {
    const a = r.address;
    const parts = [a.village || a.hamlet || a.suburb || a.town || a.city || a.road, a.state_district || a.county, a.state].filter(Boolean);
    if (parts.length) return [...new Set(parts)].join(', ');
  }
  const p = await getJson<{ features?: PhotonFeature[] }>(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}&lang=en`);
  const f = p?.features?.[0];
  if (!f) return null;
  const pr = f.properties;
  const parts = [pr.name, pr.district ?? pr.county, pr.state].filter(Boolean);
  return parts.length ? [...new Set(parts)].join(', ') : null;
}
