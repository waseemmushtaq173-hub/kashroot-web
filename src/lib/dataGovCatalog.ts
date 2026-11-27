/**
 * Looks datasets up in data.gov.in's own catalogue (api.data.gov.in/lists) with the site's key,
 * so the admin can see what the Government really publishes on a subject ("pesticide",
 * "fungicide", "fertiliser"…) and pick a resource instead of guessing its id.
 *
 * Nothing is assumed about what a dataset holds: data.gov.in publishes many statistics tables
 * and few product lists, and only the admin can tell which a dataset is. The answer is read
 * forgivingly (the catalogue's field names are not documented to us); an entry without a
 * resource id is left out. The key is put in by the server and never returned, logged or
 * repeated in a message. No side effects of its own — the network is passed in.
 */
export interface CatalogEntry {
  /** The resource id used in api.data.gov.in/resource/<id>. */
  id: string;
  title: string;
  org: string;
  updated: string | null;
}

export type CatalogAnswer = { entries: CatalogEntry[]; total: number | null } | { problem: string };

const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const LIMIT = 50;

const text = (v: unknown): string => {
  if (typeof v === 'string') return v.trim();
  if (Array.isArray(v)) return v.map(text).filter(Boolean).join(' › ');
  if (typeof v === 'number') return String(v);
  return '';
};

/** The catalogue address for a search (the key is part of it: never show or log this). */
export function catalogUrl(query: string, key: string): string {
  const u = new URL('https://api.data.gov.in/lists');
  u.searchParams.set('format', 'json');
  u.searchParams.set('api-key', key);
  u.searchParams.set('offset', '0');
  u.searchParams.set('limit', String(LIMIT));
  u.searchParams.set('filters[title]', query);
  return u.toString();
}

/** The entries of a catalogue answer; unreadable shapes give an empty list. */
export function parseCatalog(json: unknown): { entries: CatalogEntry[]; total: number | null } {
  const root = (json && typeof json === 'object' ? json : {}) as Record<string, unknown>;
  const records = Array.isArray(root.records) ? root.records : [];
  const entries: CatalogEntry[] = [];
  for (const r of records) {
    if (!r || typeof r !== 'object') continue;
    const rec = r as Record<string, unknown>;
    const id = text(rec.index_name ?? rec.resource_id ?? rec.id);
    const title = text(rec.title);
    if (!UUID.test(id) || !title) continue;
    entries.push({ id, title: title.slice(0, 300), org: text(rec.org ?? rec.org_type ?? rec.source).slice(0, 200), updated: text(rec.updated ?? rec.updated_date ?? rec.created) || null });
  }
  const total = Number(root.total ?? root.count);
  return { entries, total: Number.isFinite(total) ? total : null };
}

/** Searches the catalogue for a word or two. */
export async function searchCatalog(
  query: string,
  env: { DATA_GOV_IN_API_KEY?: string },
  fetcher: (url: string, init?: RequestInit) => Promise<Response> = fetch,
): Promise<CatalogAnswer> {
  const q = query.trim().slice(0, 80);
  if (q.length < 3) return { problem: 'Type at least three letters, for example “pesticide”.' };
  const key = (env.DATA_GOV_IN_API_KEY ?? '').trim();
  if (!key) return { problem: 'The data.gov.in key is not set on this site (DATA_GOV_IN_API_KEY in Vercel).' };
  let res: Response;
  try {
    res = await fetcher(catalogUrl(q, key), { cache: 'no-store', redirect: 'manual', headers: { accept: 'application/json' }, signal: AbortSignal.timeout(25_000) });
  } catch {
    // The address is not repeated: it carries the key.
    return { problem: 'data.gov.in could not be reached from this site.' };
  }
  if (!res.ok) return { problem: `data.gov.in answered with an error (${res.status}).${res.status === 403 || res.status === 401 ? ' Check the key.' : ''}` };
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return { problem: 'data.gov.in did not answer with a list of datasets.' };
  }
  return parseCatalog(json);
}

/** The link to put in a feed for a resource: the key is filled in by the server when it reads it. */
export function resourceFeedUrl(id: string): string {
  return `https://api.data.gov.in/resource/${id}?api-key={DATA_GOV_IN_API_KEY}`;
}
