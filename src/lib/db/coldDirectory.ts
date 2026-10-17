'use client';

/**
 * The cold store directory in the shared database
 * (supabase/migrations/20261023000000_cold_store_directory.sql): entries the
 * KashRoot admin imported or added, each with its source. Everyone reads it;
 * only an admin writes. The live sources come from /api/cold-stores.
 */
import { SOURCE_LABEL, type DirEntry } from '@/lib/coldDirectory';
import { dbMessage, supabase } from '@/lib/db/client';

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
}

export type DirectoryInput = Omit<DirectoryRow, 'id' | 'created_at' | 'state'> & { state?: string };

const COLUMNS = 'id, name, district, place, state, capacity_mt, phone, lat, lon, source, source_url, created_at';
const missing = (m?: string) => /cold_store_directory|schema cache|does not exist|Could not find the function/i.test(m ?? '');
export const DIRECTORY_SQL = 'Run the new cold store SQL (20261023000000_cold_store_directory.sql, also in RUN_THIS_ONCE.sql) in Supabase first.';

/** Every entry (before the directory SQL is run: none). */
export async function directoryRows(): Promise<DirectoryRow[]> {
  const rows: DirectoryRow[] = [];
  // Read in pages: the database returns at most 1,000 rows at a time.
  for (let from = 0; from < 20_000; from += 1000) {
    const { data, error } = await supabase.from('cold_store_directory').select(COLUMNS).order('district').order('name').range(from, from + 999);
    if (error) {
      if (missing(error.message)) return [];
      throw new Error(dbMessage(error, 'Could not load the cold store directory.'));
    }
    rows.push(...((data ?? []) as DirectoryRow[]));
    if (!data || data.length < 1000) break;
  }
  return rows;
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
    if (missing(error.message)) throw new Error(DIRECTORY_SQL);
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
      if (missing(error.message)) throw new Error(DIRECTORY_SQL);
      throw new Error(dbMessage(error, 'Could not import the list.'));
    }
    added += Number(data) || 0;
  }
  return added;
}
