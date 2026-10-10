'use client';

/**
 * Orchard blocks and spray log: saved to the account (orchard_blocks,
 * spray_logs) when signed in, otherwise on this phone (localStorage), so the
 * free tools work without an account.
 */
import { dbMessage, supabase } from '@/lib/db/client';

export interface Block {
  id: string;
  name: string;
  variety: string | null;
  place: string | null;
  lat: number | null;
  lng: number | null;
  /** Extra wet hours this block holds (shade, low ground) — negative for sunny slopes. */
  wet_bias: number;
}

export interface Spray {
  id: string;
  block_id: string | null;
  block_name: string;
  product: string;
  phi_days: number;
  sprayed_on: string;
  note: string | null;
}

const LOCAL = { blocks: 'kr_orchard_blocks_v2', sprays: 'kr_orchard_sprays_v2' };
const read = <T,>(key: string): T[] => {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};
const write = (key: string, v: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* storage full or blocked */
  }
};
const fail = (error: { message?: string; code?: string } | null, fallback: string): never => {
  throw new Error(dbMessage(error, fallback));
};

export function orchardStore(signedIn: boolean) {
  return {
    async blocks(): Promise<Block[]> {
      if (!signedIn) return read<Block>(LOCAL.blocks);
      const { data, error } = await supabase.from('orchard_blocks').select('id, name, variety, place, lat, lng, wet_bias').order('created_at');
      if (error) fail(error, 'Could not load your blocks.');
      return (data ?? []) as Block[];
    },
    async saveBlock(b: Omit<Block, 'id'> & { id?: string }): Promise<void> {
      if (!signedIn) {
        const all = read<Block>(LOCAL.blocks);
        const row = { ...b, id: b.id ?? crypto.randomUUID() } as Block;
        write(LOCAL.blocks, b.id ? all.map((x) => (x.id === b.id ? row : x)) : [...all, row]);
        return;
      }
      const { id, ...row } = b;
      const { error } = id ? await supabase.from('orchard_blocks').update(row).eq('id', id) : await supabase.from('orchard_blocks').insert(row);
      if (error) fail(error, 'Could not save the block.');
    },
    async deleteBlock(id: string): Promise<void> {
      if (!signedIn) {
        write(LOCAL.blocks, read<Block>(LOCAL.blocks).filter((x) => x.id !== id));
        write(LOCAL.sprays, read<Spray>(LOCAL.sprays).filter((x) => x.block_id !== id));
        return;
      }
      const { error } = await supabase.from('orchard_blocks').delete().eq('id', id);
      if (error) fail(error, 'Could not remove the block.');
    },
    async sprays(): Promise<Spray[]> {
      if (!signedIn) return read<Spray>(LOCAL.sprays);
      const { data, error } = await supabase.from('spray_logs').select('id, block_id, block_name, product, phi_days, sprayed_on, note').order('sprayed_on', { ascending: false });
      if (error) fail(error, 'Could not load your spray log.');
      return (data ?? []) as Spray[];
    },
    async addSpray(s: Omit<Spray, 'id'>): Promise<void> {
      if (!signedIn) {
        write(LOCAL.sprays, [{ ...s, id: crypto.randomUUID() }, ...read<Spray>(LOCAL.sprays)]);
        return;
      }
      const { error } = await supabase.from('spray_logs').insert(s);
      if (error) fail(error, 'Could not save the spray.');
    },
    async deleteSpray(id: string): Promise<void> {
      if (!signedIn) {
        write(LOCAL.sprays, read<Spray>(LOCAL.sprays).filter((x) => x.id !== id));
        return;
      }
      const { error } = await supabase.from('spray_logs').delete().eq('id', id);
      if (error) fail(error, 'Could not remove the spray.');
    },
  };
}
