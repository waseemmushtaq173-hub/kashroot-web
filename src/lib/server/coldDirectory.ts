/**
 * The live part of the cold store directory (lib/coldDirectory), read on the
 * KashRoot server and kept for 12 hours:
 *   nhb  the National Horticulture Board's National Cold Storage database
 *        (its map file: name, district, state, location) — Jammu & Kashmir
 *   osm  OpenStreetMap: places in Jammu & Kashmir mapped as cold storage
 * When a source cannot be reached the last good copy is used, and the
 * answer says so. Each source gets a few seconds at most, and one that did
 * not answer is not asked again for 15 minutes — so the page never waits
 * long for a website that is down or far away. Server-only.
 */
import 'server-only';

import { NHB_DATABASE_URL, NHB_GIS_URL, niceName, parseColdStoreList, SOURCE_LABEL, type DirEntry, type SourceState } from '@/lib/coldDirectory';
import { govFetch } from '@/lib/server/govFetch';

const KEEP_MS = 12 * 60 * 60 * 1000;
/** The most a source may take, and how long one that failed is left alone. */
const BUDGET_MS = { nhb: 15_000, osm: 25_000 };
const RETRY_MS = 15 * 60 * 1000;
/** NHB_COLD_STORAGE_URL (optional): another address for the same NHB file, e.g. a mirror. */
const nhbUrl = () => process.env.NHB_COLD_STORAGE_URL?.trim() || NHB_GIS_URL;
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
// Jammu & Kashmir (ISO 3166-2 IN-JK): places tagged as cold storage, or named as one.
const OSM_QUERY = `[out:json][timeout:22];
area["ISO3166-2"="IN-JK"]->.jk;
(
  nwr["industrial"="cold_storage"](area.jk);
  nwr["building"="cold_storage"](area.jk);
  nwr["name"~"cold ?stor|c\\\\.? ?a\\\\.? ?stor|controlled atmosphere|cold chain",i](area.jk);
);
out center tags;`;

const cache = new Map<'nhb' | 'osm', { at: number; entries: DirEntry[] }>();
const failed = new Map<'nhb' | 'osm', { at: number; error: string }>();

/** A read that gives up after `ms`. */
function within<T>(work: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${what} did not answer in ${Math.round(ms / 1000)} seconds`)), ms);
    work.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

async function readNhb(fresh: boolean): Promise<DirEntry[]> {
  const res = await govFetch(nhbUrl(), { Accept: 'text/csv,application/json,text/plain,*/*', 'User-Agent': 'Mozilla/5.0 (compatible; KashRoot cold store directory)' }, 12_000, fresh ? 0 : KEEP_MS / 1000);
  if (!res.ok) throw new Error(`NHB answered ${res.status}`);
  const parsed = parseColdStoreList(await res.text(), true);
  if (parsed.problem) throw new Error(parsed.problem);
  return parsed.entries.map((e) => ({ ...e, source: 'nhb', sourceLabel: SOURCE_LABEL.nhb, sourceUrl: NHB_GIS_URL }));
}

type OsmElement = { type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> };

/** One OpenStreetMap server's answer. */
async function askOverpass(url: string, signal: AbortSignal): Promise<OsmElement[]> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'KashRoot cold store directory' },
    body: `data=${encodeURIComponent(OSM_QUERY)}`,
    signal,
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`OpenStreetMap answered ${res.status}`);
  return ((await res.json()) as { elements?: OsmElement[] }).elements ?? [];
}

async function readOsm(): Promise<DirEntry[]> {
  // Several OpenStreetMap servers at once: the first answer counts, the others are stopped.
  const stop = new AbortController();
  const signal = AbortSignal.any([stop.signal, AbortSignal.timeout(BUDGET_MS.osm - 1_000)]);
  let elements: OsmElement[];
  try {
    elements = await Promise.any(OVERPASS.map((url) => askOverpass(url, signal)));
  } catch (err) {
    const first = err instanceof AggregateError ? err.errors[0] : err;
    throw first instanceof Error ? first : new Error('OpenStreetMap could not be reached');
  } finally {
    stop.abort();
  }
  return elements
    .filter((e) => e.tags?.name)
    .map((e) => {
      const t = e.tags ?? {};
      return {
        name: niceName(t.name).slice(0, 120),
        district: t['addr:district'] ? niceName(t['addr:district']) : null,
        place: [t['addr:street'], t['addr:village'] ?? t['addr:place'] ?? t['addr:city'] ?? t['addr:suburb']].filter(Boolean).join(', ') || null,
        state: 'Jammu & Kashmir',
        capacity_mt: null,
        phone: (t.phone ?? t['contact:phone'] ?? '').replace(/\s/g, '').slice(0, 20) || null,
        lat: e.lat ?? e.center?.lat ?? null,
        lon: e.lon ?? e.center?.lon ?? null,
        source: 'osm' as const,
        sourceLabel: SOURCE_LABEL.osm,
        sourceUrl: `https://www.openstreetmap.org/${e.type}/${e.id}`,
      };
    });
}

async function source(id: 'nhb' | 'osm', read: (fresh: boolean) => Promise<DirEntry[]>, fresh: boolean): Promise<{ entries: DirEntry[]; state: SourceState }> {
  const url = id === 'nhb' ? NHB_DATABASE_URL : 'https://www.openstreetmap.org';
  const have = cache.get(id);
  if (have && !fresh && Date.now() - have.at < KEEP_MS) {
    return { entries: have.entries, state: { id, label: SOURCE_LABEL[id], url, ok: true, count: have.entries.length, at: new Date(have.at).toISOString() } };
  }
  // Failed a moment ago: not asked again yet (Admin's "read again" always asks).
  const down = failed.get(id);
  if (down && !fresh && Date.now() - down.at < RETRY_MS) {
    if (have) return { entries: have.entries, state: { id, label: SOURCE_LABEL[id], url, ok: false, count: have.entries.length, at: new Date(have.at).toISOString(), error: down.error } };
    return { entries: [], state: { id, label: SOURCE_LABEL[id], url, ok: false, count: 0, at: null, error: down.error } };
  }
  try {
    const entries = await within(read(fresh), BUDGET_MS[id], SOURCE_LABEL[id]);
    cache.set(id, { at: Date.now(), entries });
    failed.delete(id);
    return { entries, state: { id, label: SOURCE_LABEL[id], url, ok: true, count: entries.length, at: new Date().toISOString() } };
  } catch (err) {
    const error = err instanceof Error ? err.message : 'could not be reached';
    failed.set(id, { at: Date.now(), error });
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
