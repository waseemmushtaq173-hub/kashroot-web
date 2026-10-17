/**
 * The live part of the cold store directory (lib/coldDirectory), read on the
 * KashRoot server and kept for 12 hours:
 *   nhb  the National Horticulture Board's National Cold Storage database
 *        (its map file: name, district, state, location) — Jammu & Kashmir
 *   osm  OpenStreetMap: places in Jammu & Kashmir mapped as cold storage
 * When a source cannot be reached the last good copy is used, and the
 * answer says so. Server-only.
 */
import 'server-only';

import { NHB_DATABASE_URL, NHB_GIS_URL, niceName, parseColdStoreList, SOURCE_LABEL, type DirEntry, type SourceState } from '@/lib/coldDirectory';
import { govFetch } from '@/lib/server/govFetch';

const KEEP_MS = 12 * 60 * 60 * 1000;
/** NHB_COLD_STORAGE_URL (optional): another address for the same NHB file, e.g. a mirror. */
const nhbUrl = () => process.env.NHB_COLD_STORAGE_URL?.trim() || NHB_GIS_URL;
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
// Jammu & Kashmir (ISO 3166-2 IN-JK): places tagged as cold storage, or named as one.
const OSM_QUERY = `[out:json][timeout:60];
area["ISO3166-2"="IN-JK"]->.jk;
(
  nwr["industrial"="cold_storage"](area.jk);
  nwr["building"="cold_storage"](area.jk);
  nwr["name"~"cold ?stor|c\\\\.? ?a\\\\.? ?stor|controlled atmosphere|cold chain",i](area.jk);
);
out center tags;`;

const cache = new Map<'nhb' | 'osm', { at: number; entries: DirEntry[] }>();

async function readNhb(fresh: boolean): Promise<DirEntry[]> {
  const res = await govFetch(nhbUrl(), { Accept: 'text/csv,application/json,text/plain,*/*', 'User-Agent': 'Mozilla/5.0 (compatible; KashRoot cold store directory)' }, 25_000, fresh ? 0 : KEEP_MS / 1000);
  if (!res.ok) throw new Error(`NHB answered ${res.status}`);
  const parsed = parseColdStoreList(await res.text(), true);
  if (parsed.problem) throw new Error(parsed.problem);
  return parsed.entries.map((e) => ({ ...e, source: 'nhb', sourceLabel: SOURCE_LABEL.nhb, sourceUrl: NHB_GIS_URL }));
}

async function readOsm(): Promise<DirEntry[]> {
  let last: unknown;
  for (const url of OVERPASS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'KashRoot cold store directory' },
        body: `data=${encodeURIComponent(OSM_QUERY)}`,
        signal: AbortSignal.timeout(40_000),
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`OpenStreetMap answered ${res.status}`);
      const data = (await res.json()) as { elements?: { type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }[] };
      return (data.elements ?? [])
        .filter((e) => e.tags?.name)
        .map((e) => {
          const t = e.tags ?? {};
          const lat = e.lat ?? e.center?.lat ?? null;
          const lon = e.lon ?? e.center?.lon ?? null;
          return {
            name: niceName(t.name).slice(0, 120),
            district: t['addr:district'] ? niceName(t['addr:district']) : null,
            place: [t['addr:street'], t['addr:village'] ?? t['addr:place'] ?? t['addr:city'] ?? t['addr:suburb']].filter(Boolean).join(', ') || null,
            state: 'Jammu & Kashmir',
            capacity_mt: null,
            phone: (t.phone ?? t['contact:phone'] ?? '').replace(/\s/g, '').slice(0, 20) || null,
            lat,
            lon,
            source: 'osm' as const,
            sourceLabel: SOURCE_LABEL.osm,
            sourceUrl: `https://www.openstreetmap.org/${e.type}/${e.id}`,
          };
        });
    } catch (err) {
      last = err;
    }
  }
  throw last instanceof Error ? last : new Error('OpenStreetMap could not be reached');
}

async function source(id: 'nhb' | 'osm', read: (fresh: boolean) => Promise<DirEntry[]>, fresh: boolean): Promise<{ entries: DirEntry[]; state: SourceState }> {
  const url = id === 'nhb' ? NHB_DATABASE_URL : 'https://www.openstreetmap.org';
  const have = cache.get(id);
  if (have && !fresh && Date.now() - have.at < KEEP_MS) {
    return { entries: have.entries, state: { id, label: SOURCE_LABEL[id], url, ok: true, count: have.entries.length, at: new Date(have.at).toISOString() } };
  }
  try {
    const entries = await read(fresh);
    cache.set(id, { at: Date.now(), entries });
    return { entries, state: { id, label: SOURCE_LABEL[id], url, ok: true, count: entries.length, at: new Date().toISOString() } };
  } catch (err) {
    const error = err instanceof Error ? err.message : 'could not be reached';
    // The last good copy, if there is one.
    if (have) return { entries: have.entries, state: { id, label: SOURCE_LABEL[id], url, ok: false, count: have.entries.length, at: new Date(have.at).toISOString(), error } };
    return { entries: [], state: { id, label: SOURCE_LABEL[id], url, ok: false, count: 0, at: null, error } };
  }
}

/** The live sources, read together. `fresh` skips the 12-hour copy (Admin's "read again"). */
export async function liveDirectory(fresh = false): Promise<{ entries: DirEntry[]; sources: SourceState[] }> {
  const [nhb, osm] = await Promise.all([source('nhb', readNhb, fresh), source('osm', readOsm, fresh)]);
  return { entries: [...nhb.entries, ...osm.entries], sources: [nhb.state, osm.state] };
}
