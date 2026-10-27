'use client';

/**
 * The cold store directory in the shared database
 * (supabase/migrations/20261023000000_cold_store_directory.sql): entries the
 * KashRoot admin imported or added, each with its source, and cold stores
 * people suggested (20261024000000_cold_store_suggestions.sql), which wait
 * for the admin's check before everyone sees them. The live sources come
 * from /api/cold-stores.
 */
import { SOURCE_LABEL, type DirEntry } from '@/lib/coldDirectory';
import { dbMessage, SETUP_NEEDED, supabase } from '@/lib/db/client';

export interface DirectoryRow {
  id: string;
  name: string;
  district: string | null;
  place: string | null;
  state: string;
  capacity_mt: number | null;
  phone: string | null;
  lat: number | null;
  lon: number | null;
  source: string;
  source_url: string | null;
  created_at: string;
  /** 'pending': suggested, not yet checked (seen only by the admin and the person who suggested it). */
  status: 'approved' | 'pending';
}

export type DirectoryInput = Omit<DirectoryRow, 'id' | 'created_at' | 'state' | 'status'> & { state?: string };

const BASE_COLUMNS = 'id, name, district, place, state, capacity_mt, phone, lat, lon, source, source_url, created_at';
const COLUMNS = `${BASE_COLUMNS}, status`;
/** Before the suggestions SQL (20261024000000) there is no status: everything is checked. */
const noStatus = (m?: string) => /status/i.test(m ?? '') && /column|does not exist/i.test(m ?? '');
const missing = (m?: string) => /cold_store_directory|schema cache|does not exist|Could not find the function/i.test(m ?? '');

/**
 * Every entry the viewer may see: checked ones, plus (admin) all suggestions
 * or (others) their own. Before the directory SQL is run: none.
 */
export async function directoryRows(): Promise<DirectoryRow[]> {
  const rows: DirectoryRow[] = [];
  let cols = COLUMNS;
  // Read in pages: the database returns at most 1,000 rows at a time.
  for (let from = 0; from < 20_000; from += 1000) {
    let { data, error } = await supabase.from('cold_store_directory').select(cols).order('district').order('name').range(from, from + 999);
    if (error && cols === COLUMNS && noStatus(error.message)) {
      cols = BASE_COLUMNS;
      ({ data, error } = await supabase.from('cold_store_directory').select(cols).order('district').order('name').range(from, from + 999));
    }
    if (error) {
      if (missing(error.message)) return [];
      throw new Error(dbMessage(error, 'Could not load the cold store directory.'));
    }
    rows.push(...((data ?? []) as unknown as DirectoryRow[]).map((r) => ({ ...r, status: r.status === 'pending' ? ('pending' as const) : ('approved' as const) })));
    if (!data || data.length < 1000) break;
  }
  return rows;
}


/** Anyone signed in: a cold store missing from the list. It waits for the admin's check. */
export async function suggestColdStore(input: { name: string; district: string | null; place: string | null; phone: string | null }): Promise<void> {
  const { error } = await supabase.from('cold_store_directory').insert({ ...input, status: 'pending', source: 'Suggested by a KashRoot user' });
  if (error) {
    if (missing(error.message) || noStatus(error.message)) throw new Error(SETUP_NEEDED);
    if (/duplicate key|unique/i.test(error.message ?? '')) throw new Error('This cold store is already in the list (same name and district) — thank you.');
    if (/enough suggestions/i.test(error.message ?? '')) throw new Error(error.message ?? '');
    throw new Error(dbMessage(error, 'Could not send your suggestion.'));
  }
}

/** Admin: a suggestion checked — everyone sees it now. */
export async function approveSuggestion(id: string): Promise<void> {
  const { error } = await supabase.from('cold_store_directory').update({ status: 'approved', source: 'Suggested by a KashRoot user, checked by the KashRoot team' }).eq('id', id);
  if (error) throw new Error(dbMessage(error, 'Could not approve the suggestion.'));
}

/** A directory row in the shape every source shares. */
export const asEntry = (r: DirectoryRow): DirEntry => ({
  name: r.name,
  district: r.district,
  place: r.place,
  state: r.state,
  capacity_mt: r.capacity_mt,
  phone: r.phone,
  lat: r.lat,
  lon: r.lon,
  source: 'admin',
  sourceLabel: r.source || SOURCE_LABEL.admin,
  sourceUrl: r.source_url,
});

export async function addDirectoryEntry(input: DirectoryInput): Promise<void> {
  const { error } = await supabase.from('cold_store_directory').insert(input);
  if (error) {
    if (missing(error.message)) throw new Error(SETUP_NEEDED);
    if (/duplicate key|unique/i.test(error.message ?? '')) throw new Error('This cold store is already in the directory (same name and district).');
    throw new Error(dbMessage(error, 'Could not add the cold store.'));
  }
}

export async function removeDirectoryEntry(id: string): Promise<void> {
  const { error } = await supabase.from('cold_store_directory').delete().eq('id', id);
  if (error) throw new Error(dbMessage(error, 'Could not remove the cold store.'));
}

/** Adds many at once (stores already there are skipped). Returns how many were added. */
export async function importDirectory(rows: Omit<DirEntry, 'source' | 'sourceLabel' | 'sourceUrl'>[], source: string, sourceUrl: string | null): Promise<number> {
  let added = 0;
  for (let i = 0; i < rows.length; i += 2000) {
    const { data, error } = await supabase.rpc('kr_directory_import', { p_rows: rows.slice(i, i + 2000), p_source: source, p_source_url: sourceUrl });
    if (error) {
      if (missing(error.message)) throw new Error(SETUP_NEEDED);
      throw new Error(dbMessage(error, 'Could not import the list.'));
    }
    added += Number(data) || 0;
  }
  return added;
}
