/**
 * The live part of the cold store directory (lib/coldDirectory), read on the
 * KashRoot server and kept for 12 hours:
 *   nhb  the National Horticulture Board's National Cold Storage database
 *        (its map file: name, district, state, location) — Jammu & Kashmir
 *   osm  OpenStreetMap: places in Jammu & Kashmir mapped as cold storage
 * When a source cannot be reached the last good copy is used (this server's,
 * or the one kept in the database by lib/server/lastGood), and the answer
 * says so. Each source gets a few seconds at most, and one that did
 * not answer is not asked again for 15 minutes — so the page never waits
 * long for a website that is down or far away. Server-only.
 */
import 'server-only';

import { NHB_DATABASE_URL, NHB_GIS_URL, niceName, parseColdStoreList, SOURCE_LABEL, type DirEntry, type SourceState } from '@/lib/coldDirectory';
import { causeCode, govFetch } from '@/lib/server/govFetch';
import { keepGood, lastGood } from '@/lib/server/lastGood';

const KEEP_MS = 12 * 60 * 60 * 1000;
/** The most a source may take, and how long one that failed is left alone. */
const BUDGET_MS = { nhb: 15_000, osm: 25_000 };
const RETRY_MS = 15 * 60 * 1000;
/** NHB_COLD_STORAGE_URL (optional): another address for the same NHB file, e.g. a mirror. */
const nhbUrl = () => process.env.NHB_COLD_STORAGE_URL?.trim() || NHB_GIS_URL;
const hostOf = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};
const OVERPASS_SERVERS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
/** OSM_OVERPASS_URL (optional): one Overpass server to ask instead, e.g. a local one for tests. */
const overpass = () => (process.env.OSM_OVERPASS_URL?.trim() ? [process.env.OSM_OVERPASS_URL.trim()] : OVERPASS_SERVERS);
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
const failed = new Map<'nhb' | 'osm', Pick<SourceState, 'error' | 'fault'> & { at: number }>();

/** A source that answered, but with nothing to add (said to the admin, not a failure). */
class Note extends Error {}
/** A reason already in plain words, and whose side it is on when that is clear (see plainReason). */
class Reason extends Error {
  fault?: SourceState['fault'];
  constructor(message: string, fault?: SourceState['fault']) {
    super(message);
    this.fault = fault;
  }
}
/** The website itself answered badly (an error, not the list) or did not answer in time. */
const siteError = (message: string) => new Reason(message, 'site');

/** "the NHB website" at the start of a sentence. */
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** A read that gives up after `ms`. */
function within<T>(work: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(siteError(`${cap(what)} did not answer within ${Math.round(ms / 1000)} seconds.`)), ms);
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

/**
 * Why a website could not be read, in plain words (never just "fetch failed"),
 * and on whose side the problem is when that is clear: `site` — the website
 * (an error, refused, too slow), `server` — the KashRoot server could not get
 * out to it. `site` is written as inside a sentence ("the NHB website").
 */
function plainReason(err: unknown, site: string, host: string): Pick<SourceState, 'error' | 'fault'> {
  if (err instanceof Note) return { error: err.message };
  if (err instanceof Reason) return { error: err.message, fault: err.fault };
  const code = causeCode(err) ?? '';
  const name = err instanceof Error ? err.name : '';
  if (/timeout|abort/i.test(`${name} ${code}`) || code === 'ETIMEDOUT' || code === 'UND_ERR_CONNECT_TIMEOUT') return { error: `${cap(site)} (${host}) did not answer in time.`, fault: 'site' };
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return { error: `The KashRoot server could not find ${site} (${host}) on the internet. The server may have no internet, or the address is wrong.`, fault: 'server' };
  if (code === 'ECONNREFUSED') return { error: `${cap(site)} (${host}) refused the connection. It may be down.`, fault: 'site' };
  if (code === 'ECONNRESET' || code === 'UND_ERR_SOCKET' || code === 'EPIPE') return { error: `${cap(site)} (${host}) cut the connection before sending the list.`, fault: 'site' };
  if (/CERT|SSL|TLS|SELF_SIGNED|UNABLE_TO/i.test(code)) return { error: `The security certificate of ${site} (${host}) could not be checked (${code}).` };
  const message = err instanceof Error ? err.message : '';
  if (message && !/^fetch failed$/i.test(message)) return { error: message };
  return { error: `${cap(site)} (${host}) could not be reached${code ? ` (${code})` : ''}.` };
}

/** An HTTP error from a website, in plain words. */
function httpReason(site: string, status: number): Reason {
  const s = cap(site);
  if (status === 403 || status === 401) return siteError(`${s} refused to send the list (error ${status}). It may block servers outside India or automatic readers.`);
  if (status === 404 || status === 410) return siteError(`${s} says the list is not at this address any more (error ${status}). The address may have changed.`);
  if (status === 429) return siteError(`${s} is busy and asked us to slow down (error 429). Try again in a few minutes.`);
  if (status >= 500) return siteError(`${s} has a problem on its side right now (error ${status}). Try again later.`);
  return siteError(`${s} answered with error ${status}.`);
}

async function readNhb(fresh: boolean): Promise<DirEntry[]> {
  const url = nhbUrl();
  const site = 'The NHB website';
  const res = await govFetch(url, { Accept: 'text/csv,application/json,application/xml,text/plain,*/*', 'User-Agent': 'Mozilla/5.0 (compatible; KashRoot cold store directory)' }, 12_000, fresh ? 0 : KEEP_MS / 1000);
  if (!res.ok) throw httpReason(site, res.status);
  const parsed = parseColdStoreList(await res.text(), true);
  if (parsed.problem) {
    if (/web page/.test(parsed.problem)) throw siteError(`${site} sent a web page instead of the list. The list's address may have changed.`);
    throw siteError(`${site} answered, but the list could not be read: ${parsed.problem}`);
  }
  if (!parsed.entries.length) throw new Note(`The NHB list was read (${parsed.rows.toLocaleString('en-IN')} rows), but none of them is in Jammu & Kashmir.`);
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
  if (!res.ok) throw httpReason('OpenStreetMap', res.status);
  const json = (await res.json().catch(() => null)) as { elements?: OsmElement[]; remark?: string } | null;
  if (!json) throw siteError('OpenStreetMap answered, but not with a list.');
  // Overpass reports a query it had to stop (too busy, too slow) as a remark.
  if (!json.elements?.length && json.remark && /error|timed? ?out|runtime/i.test(json.remark)) throw siteError('OpenStreetMap was too busy to finish the search. Try again in a few minutes.');
  return json.elements ?? [];
}

async function readOsm(): Promise<DirEntry[]> {
  // Several OpenStreetMap servers at once: the first answer counts, the others are stopped.
  const stop = new AbortController();
  const signal = AbortSignal.any([stop.signal, AbortSignal.timeout(BUDGET_MS.osm - 1_000)]);
  let elements: OsmElement[];
  try {
    elements = await Promise.any(overpass().map((url) => askOverpass(url, signal)));
  } catch (err) {
    const first = err instanceof AggregateError ? err.errors[0] : err;
    const why = plainReason(first, 'OpenStreetMap', hostOf(overpass()[0]));
    throw new Reason(why.error ?? 'OpenStreetMap could not be reached.', why.fault);
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

/** This instance's copy, else the last good copy any instance kept (lib/server/lastGood). */
async function lastCopy(id: 'nhb' | 'osm'): Promise<{ at: number; entries: DirEntry[] } | undefined> {
  const have = cache.get(id);
  if (have) return have;
  const kept = await lastGood<DirEntry[]>(`directory:${id}`);
  if (!kept || !Array.isArray(kept.body)) return undefined;
  const copy = { at: Date.parse(kept.fetchedAt), entries: kept.body };
  cache.set(id, copy);
  return copy;
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
    const why = { error: down.error, fault: down.fault };
    const have = await lastCopy(id);
    if (have) return { entries: have.entries, state: { id, label: SOURCE_LABEL[id], url, ok: false, count: have.entries.length, at: new Date(have.at).toISOString(), ...why } };
    return { entries: [], state: { id, label: SOURCE_LABEL[id], url, ok: false, count: 0, at: null, ...why } };
  }
  try {
    const entries = await within(read(fresh), BUDGET_MS[id], id === 'nhb' ? 'the NHB website' : 'OpenStreetMap');
    const at = Date.now();
    cache.set(id, { at, entries });
    keepGood(`directory:${id}`, entries, new Date(at).toISOString());
    failed.delete(id);
    return { entries, state: { id, label: SOURCE_LABEL[id], url, ok: true, count: entries.length, at: new Date(at).toISOString() } };
  } catch (err) {
    // Read, but nothing in Jammu & Kashmir: said as it is, not as a failure.
    if (err instanceof Note) {
      cache.set(id, { at: Date.now(), entries: [] });
      failed.delete(id);
      return { entries: [], state: { id, label: SOURCE_LABEL[id], url, ok: true, count: 0, at: new Date().toISOString(), note: err.message } };
    }
    const why = id === 'nhb' ? plainReason(err, 'the NHB website', hostOf(nhbUrl())) : plainReason(err, 'OpenStreetMap', hostOf(overpass()[0]));
    failed.set(id, { at: Date.now(), ...why });
    // The last good copy, if there is one (this instance's, or one any instance kept).
    const have = await lastCopy(id);
    if (have) return { entries: have.entries, state: { id, label: SOURCE_LABEL[id], url, ok: false, count: have.entries.length, at: new Date(have.at).toISOString(), ...why } };
    return { entries: [], state: { id, label: SOURCE_LABEL[id], url, ok: false, count: 0, at: null, ...why } };
  }
}

/** The live sources, read together. `fresh` skips the 12-hour copy (Admin's "read again"). */
export async function liveDirectory(fresh = false): Promise<{ entries: DirEntry[]; sources: SourceState[] }> {
  const [nhb, osm] = await Promise.all([source('nhb', readNhb, fresh), source('osm', readOsm, fresh)]);
  return { entries: [...nhb.entries, ...osm.entries], sources: [nhb.state, osm.state] };
}
