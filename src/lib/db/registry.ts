'use client';

/**
 * The official lists of registered products in the shared database
 * (supabase/migrations/20261029000000_official_registry.sql), for KashRoot
 * TrueScan: everyone searches them and reads what they hold; the admin
 * imports a list (in batches) or removes one. Every answer carries its
 * source and date, because KashRoot only holds what the admin imported.
 */
import { dbMessage, SETUP_NEEDED, supabase, supabaseConfigured } from '@/lib/db/client';
import type { OfficialKind, OfficialRow } from '@/lib/fertilizer/officialList';

export type { OfficialKind } from '@/lib/fertilizer/officialList';

export interface OfficialHit {
  kind: OfficialKind;
  name: string;
  registration_no: string | null;
  registrant: string | null;
  details: Record<string, string>;
  source: string;
  source_url: string;
  imported_at: string;
  /** 'registration': the number typed is this product's; 'name': its name has the words typed. */
  matched: 'registration' | 'name';
}

export interface OfficialListInfo {
  kind: OfficialKind;
  source: string;
  source_url: string;
  count: number;
  imported_at: string;
}

export interface RegistryStats {
  total: number;
  last_import: string | null;
  kinds: Partial<Record<OfficialKind, { count: number; last_import: string }>>;
  lists: OfficialListInfo[];
}

/** The table or functions are not there yet (the SQL has not been run). */
const missing = (e: { code?: string; message?: string }) =>
  ['PGRST202', 'PGRST205', '42P01', '42883'].includes(e.code ?? '') || /schema cache|does not exist|Could not find the (function|table)/i.test(e.message ?? '');

const NO_LISTS: RegistryStats = { total: 0, last_import: null, kinds: {}, lists: [] };
let statsMemo: { at: number; promise: Promise<RegistryStats | null> } | null = null;

/**
 * What the lists hold, shared for two minutes by everything on the page.
 * null: the lists are not set up on this site (no database, or the SQL has
 * not been run) — the checker then says it cannot check registrations.
 */
export function registryStats(fresh = false): Promise<RegistryStats | null> {
  if (!supabaseConfigured) return Promise.resolve(null);
  if (!fresh && statsMemo && Date.now() - statsMemo.at < 120_000) return statsMemo.promise;
  const promise = (async () => {
    const { data, error } = await supabase.rpc('kr_registry_stats');
    if (error) {
      if (missing(error)) return null;
      throw new Error(dbMessage(error, 'Could not read the official lists. Try again.'));
    }
    const s = (data ?? NO_LISTS) as RegistryStats;
    const kinds = Object.fromEntries(Object.entries(s.kinds ?? {}).map(([k, v]) => [k, { ...v, count: Number(v?.count) || 0 }])) as RegistryStats['kinds'];
    return { total: Number(s.total) || 0, last_import: s.last_import ?? null, kinds, lists: (s.lists ?? []).map((l) => ({ ...l, count: Number(l.count) || 0 })) };
  })();
  statsMemo = { at: Date.now(), promise };
  promise.catch(() => {
    if (statsMemo?.promise === promise) statsMemo = null;
  });
  return promise;
}

/**
 * The official list's answer for what is printed on a label — registration
 * number matches first, then products whose name has the words. At most 20.
 * null: the lists are not set up on this site.
 */
export async function searchRegistry(text: string): Promise<OfficialHit[] | null> {
  if (!supabaseConfigured) return null;
  const { data, error } = await supabase.rpc('kr_registry_search', { p_text: text.slice(0, 200) });
  if (error) {
    if (missing(error)) return null;
    throw new Error(dbMessage(error, 'Could not check the official list. Try again.'));
  }
  return ((data ?? []) as OfficialHit[]).map((h) => ({ ...h, details: h.details ?? {} }));
}

/** Rows sent per call (the database takes at most 2,000). */
const BATCH = 1000;

/**
 * Admin: imports a list in batches, telling `onProgress` how many rows are
 * done. Rows already in this list are kept (and marked as seen today).
 * Returns how many rows were new.
 */
export async function importRegistry(
  rows: OfficialRow[],
  kind: OfficialKind,
  source: string,
  sourceUrl: string,
  onProgress?: (done: number) => void,
): Promise<number> {
  let added = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const { data, error } = await supabase.rpc('kr_registry_import', { p_rows: rows.slice(i, i + BATCH), p_kind: kind, p_source: source, p_source_url: sourceUrl });
    if (error) {
      statsMemo = null;
      if (missing(error)) throw new Error(SETUP_NEEDED);
      const done = i > 0 ? ` ${i.toLocaleString('en-IN')} rows were imported before this; import the file again to add the rest.` : '';
      throw new Error(`${dbMessage(error, 'Could not import the list.')}${done}`);
    }
    added += Number(data) || 0;
    onProgress?.(Math.min(i + BATCH, rows.length));
  }
  statsMemo = null;
  return added;
}

/** Admin: removes a whole list (all its rows of this kind). Returns how many rows went. */
export async function removeRegistryList(source: string, kind: OfficialKind): Promise<number> {
  const { data, error } = await supabase.rpc('kr_registry_remove', { p_source: source, p_kind: kind });
  statsMemo = null;
  if (error) {
    if (missing(error)) throw new Error(SETUP_NEEDED);
    throw new Error(dbMessage(error, 'Could not remove the list.'));
  }
  return Number(data) || 0;
}
