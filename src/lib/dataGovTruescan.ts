/**
 * TrueScan on data.gov.in: for a word typed in TrueScan (a product, an ingredient, a fertiliser), what the
 * Government of India's open-data portal publishes about pesticides, insecticides, fungicides, herbicides and
 * fertilisers, looked up live with the site's own key (DATA_GOV_IN_API_KEY).
 *
 *   1. Which datasets: the ones named in TRUESCAN_DATAGOV_RESOURCES (resource ids, comma separated) when that is
 *      set; otherwise the portal's own catalogue is searched for those subjects (kept for six hours).
 *   2. Their rows are read (kept for an hour) and every row that mentions all the words typed is shown, with its
 *      dataset's name, publisher and date.
 *
 * Nothing is invented or summarised: a row is shown as the Government published it, and "nothing found" is said
 * as such. Many data.gov.in datasets on these subjects are statistics (production, imports, consumption), not
 * registers of products, so the screen says that too. The key is added by the server and never returned, logged or
 * repeated in a message. No side effects but the two in-memory caches; the network is passed in.
 */
import { searchCatalog, type CatalogEntry } from '@/lib/dataGovCatalog';

export interface DatasetInfo {
  id: string;
  title: string;
  org: string;
  updated: string | null;
}

export interface DataGovHit {
  dataset: DatasetInfo;
  columns: string[];
  rows: string[][];
}

export type DataGovAnswer =
  | { ok: true; query: string; datasets: DatasetInfo[]; hits: DataGovHit[]; checkedRows: number; at: string }
  | { ok: false; reason: 'no_key' | 'bad_query' | 'unreachable' | 'no_datasets'; message: string };

export interface DataGovEnv {
  DATA_GOV_IN_API_KEY?: string;
  TRUESCAN_DATAGOV_RESOURCES?: string;
}

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

const SUBJECTS = ['pesticide', 'insecticide', 'fungicide', 'herbicide', 'fertilizer', 'fertiliser'];
const SUBJECT_TITLE = /pesticid|insecticid|fungicid|herbicid|fertili[sz]er|agro-?chemical|manure|npk|urea/i;
const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const MAX_DATASETS = 10;
const ROWS_READ = 500;
const ROWS_SHOWN = 5;
const COLUMNS_SHOWN = 7;
const CATALOGUE_TTL = 6 * 3600_000;
const ROWS_TTL = 3600_000;

interface Table {
  at: number;
  title: string;
  org: string;
  updated: string | null;
  columns: string[];
  rows: string[][];
}

/** The two caches live here so a warm server answers without asking data.gov.in again. */
export const dataGovCache: { catalogue: { at: number; entries: DatasetInfo[] } | null; tables: Map<string, Table> } = { catalogue: null, tables: new Map() };

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : Array.isArray(v) ? v.map(text).filter(Boolean).join(' › ') : '');

/** The words a row must contain: letters and digits, two or more characters. */
export function wordsOf(query: string): string[] {
  return query.toLowerCase().split(/[^a-z0-9ऀ-ॿ؀-ۿ]+/i).filter((w) => w.length >= 2).slice(0, 6);
}

/** Reads a resource answer into a table (columns and rows of text). */
export function parseTable(json: unknown): { title: string; org: string; updated: string | null; columns: string[]; rows: string[][] } {
  const root = (json && typeof json === 'object' ? json : {}) as Record<string, unknown>;
  const records = (Array.isArray(root.records) ? root.records : []).filter((r): r is Record<string, unknown> => Boolean(r) && typeof r === 'object');
  const fields = Array.isArray(root.field) ? (root.field as Array<Record<string, unknown>>) : [];
  const named = fields.map((f) => ({ id: text(f.id), name: text(f.name) || text(f.id) })).filter((f) => f.id);
  const keys = named.length ? named.map((f) => f.id) : Array.from(new Set(records.flatMap((r) => Object.keys(r))));
  const columns = (named.length ? named.map((f) => f.name) : keys).slice(0, COLUMNS_SHOWN);
  const rows = records.map((r) => keys.slice(0, COLUMNS_SHOWN).map((k) => text(r[k])));
  return {
    title: text(root.title),
    org: text(root.org) || text(root.org_type) || text(root.source),
    updated: text(root.updated_date ?? root.updated) || null,
    columns,
    rows,
  };
}

/** The datasets to look in: the ones the site names, else what the portal's catalogue holds on these subjects. */
async function datasetsToSearch(env: DataGovEnv, fetcher: Fetcher, now: number): Promise<DatasetInfo[]> {
  const named = (env.TRUESCAN_DATAGOV_RESOURCES ?? '')
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter((s) => UUID.test(s));
  if (named.length) return named.slice(0, MAX_DATASETS).map((id) => ({ id, title: dataGovCache.tables.get(id)?.title || id, org: '', updated: null }));

  if (dataGovCache.catalogue && now - dataGovCache.catalogue.at < CATALOGUE_TTL) return dataGovCache.catalogue.entries;
  const found = await Promise.all(SUBJECTS.map((s) => searchCatalog(s, env, fetcher)));
  const seen = new Set<string>();
  const entries: DatasetInfo[] = [];
  for (const answer of found) {
    if ('problem' in answer) continue;
    for (const e of answer.entries as CatalogEntry[]) {
      if (seen.has(e.id) || !SUBJECT_TITLE.test(e.title)) continue;
      seen.add(e.id);
      entries.push({ id: e.id, title: e.title, org: e.org, updated: e.updated });
    }
  }
  const list = entries.slice(0, MAX_DATASETS);
  // Only a successful discovery is kept: an outage must not hide the datasets for six hours.
  if (list.length) dataGovCache.catalogue = { at: now, entries: list };
  return list;
}

async function tableOf(id: string, env: DataGovEnv, fetcher: Fetcher, now: number): Promise<Table | null> {
  const cached = dataGovCache.tables.get(id);
  if (cached && now - cached.at < ROWS_TTL) return cached;
  const key = (env.DATA_GOV_IN_API_KEY ?? '').trim();
  const url = `https://api.data.gov.in/resource/${id}?api-key=${encodeURIComponent(key)}&format=json&offset=0&limit=${ROWS_READ}`;
  try {
    const res = await fetcher(url, { cache: 'no-store', redirect: 'manual', headers: { accept: 'application/json' }, signal: AbortSignal.timeout(9_000) });
    if (!res.ok) return null;
    const t = parseTable(await res.json());
    if (!t.columns.length) return null;
    const table: Table = { at: now, ...t };
    if (dataGovCache.tables.size >= 24) dataGovCache.tables.delete(dataGovCache.tables.keys().next().value as string);
    dataGovCache.tables.set(id, table);
    return table;
  } catch {
    // The address carries the key: it is never repeated.
    return null;
  }
}

/** Looks for the typed words in the Government's datasets on pesticides and fertilisers. */
export async function searchDataGov(query: string, env: DataGovEnv, fetcher: Fetcher = fetch, now = Date.now()): Promise<DataGovAnswer> {
  const q = query.trim().slice(0, 60);
  const words = wordsOf(q);
  if (!words.length) return { ok: false, reason: 'bad_query', message: 'Type at least two letters.' };
  if (!(env.DATA_GOV_IN_API_KEY ?? '').trim()) return { ok: false, reason: 'no_key', message: 'data.gov.in is not connected on this site yet.' };

  const datasets = await datasetsToSearch(env, fetcher, now);
  if (!datasets.length) return { ok: false, reason: 'no_datasets', message: 'data.gov.in did not list a dataset on pesticides or fertilisers just now.' };

  const tables = await Promise.all(datasets.map((d) => tableOf(d.id, env, fetcher, now)));
  if (tables.every((t) => t === null)) return { ok: false, reason: 'unreachable', message: 'data.gov.in could not be reached just now. Try again in a minute.' };

  const hits: DataGovHit[] = [];
  const searched: DatasetInfo[] = [];
  let checkedRows = 0;
  tables.forEach((t, i) => {
    if (!t) return;
    const info: DatasetInfo = { id: datasets[i].id, title: t.title || datasets[i].title, org: t.org || datasets[i].org, updated: t.updated ?? datasets[i].updated };
    searched.push(info);
    checkedRows += t.rows.length;
    const rows = t.rows.filter((r) => {
      const hay = r.join(' ').toLowerCase();
      return words.every((w) => hay.includes(w));
    });
    if (rows.length) hits.push({ dataset: info, columns: t.columns, rows: rows.slice(0, ROWS_SHOWN) });
  });
  return { ok: true, query: q, datasets: searched, hits, checkedRows, at: new Date(now).toISOString() };
}
