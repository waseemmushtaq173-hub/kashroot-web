'use client';

/**
 * The cold store map (supabase/migrations/20261020000000_cold_store_map.sql):
 * each chamber is rows of stacks — row 1 nearest the door, stacks counted
 * from the left. People read a place as "Row 3, stack 2"; the database keeps
 * it as the short code "3B" (row number + stack letter). Farmers choose free
 * places for the months they need; the database refuses a place someone else
 * holds.
 */
import { asChamberSize, type ChamberSize } from '@/lib/coldLayout';
import { dbMessage, supabase, VERIFY_FIRST } from '@/lib/db/client';

export interface ColdChamber {
  id: string;
  listing_id: string;
  name: string;
  position: number;
  rows: number;
  cols: number;
  boxes_per_slot: number;
  blocked: string[];
  note: string | null;
  /** The chamber's measured size and the store's standards (lib/coldLayout); null for a chamber drawn by rows × stacks. */
  size: ChamberSize | null;
}

/** What a place is for the months being looked at. */
export type PlaceState = 'free' | 'held' | 'booked' | 'mine' | 'blocked';

export interface BookedPlace {
  booking_id: string;
  chamber_id: string;
  slot: string;
}

const fail = (error: { message?: string; code?: string } | null, fallback: string): never => {
  const m = error?.message ?? '';
  if (/Verify your Aadhaar/i.test(m)) throw new Error(VERIFY_FIRST);
  // The database's own sentences are written for farmers: show them as they are.
  if (/taken|cannot be booked|hold ended|booked by a farmer|already booked|Choose|Verify your Aadhaar|own cold store|not taking bookings|at least one place|at most/i.test(m)) throw new Error(m);
  throw new Error(dbMessage(error, fallback));
};

export const COLUMN = (i: number) => String.fromCharCode(65 + i); // 0 → A
/** The stored code of a place: row 3, stack index 1 → "3B". */
export const placeName = (row: number, col: number) => `${row}${COLUMN(col)}`;
export const placeKey = (chamberId: string, slot: string) => `${chamberId}:${slot}`;
/** "3B" → row 3, stack 2 (stacks are counted from 1 for people). */
export const parsePlace = (slot: string) => ({ row: parseInt(slot, 10) || 0, stack: slot.charCodeAt(slot.length - 1) - 64 });
/** "3B" → "Row 3, stack 2". */
export function placeLabel(slot: string): string {
  const { row, stack } = parsePlace(slot);
  return `Row ${row}, stack ${stack}`;
}

/** Places a chamber offers (rows × columns minus the blocked ones). */
export const usablePlaces = (c: Pick<ColdChamber, 'rows' | 'cols' | 'blocked'>) => c.rows * c.cols - c.blocked.length;

/** The first day of the month after `months` months — when a booking ends. */
export function periodEnd(start: string, months: number): string {
  const d = new Date(`${start}T00:00:00`);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

const BASE_COLUMNS = 'id, listing_id, name, position, rows, cols, boxes_per_slot, blocked, note';
const COLUMNS = `${BASE_COLUMNS}, size`;
/** Before the chamber-size SQL (20261021000000) is run the size column is missing. */
const noSizeColumn = (m?: string) => /size/i.test(m ?? '') && /column|schema cache|does not exist/i.test(m ?? '');
const withSize = (rows: unknown[]): ColdChamber[] => (rows as (ColdChamber & { size?: unknown })[]).map((c) => ({ ...c, size: asChamberSize(c.size) }));

export async function chambersOf(listingIds: string[]): Promise<ColdChamber[]> {
  if (!listingIds.length) return [];
  const read = (cols: string) => supabase.from('cold_chambers').select(cols).in('listing_id', listingIds).order('position').order('name');
  let { data, error } = await read(COLUMNS);
  if (error && noSizeColumn(error.message)) ({ data, error } = await read(BASE_COLUMNS));
  if (error) {
    // Before the map SQL is run there are no chambers: stores work by box count.
    if (/cold_chambers|schema cache|does not exist/i.test(error.message ?? '')) return [];
    fail(error, 'Could not load the cold store map.');
  }
  return withSize(data ?? []);
}

/** Taken places of a store for these months: key "chamber:3B" → held / booked / mine. */
export async function takenPlaces(listingId: string, start: string, months: number): Promise<Map<string, PlaceState>> {
  const { data, error } = await supabase.rpc('kr_cold_map', { p_listing: listingId, p_start: start, p_months: months });
  if (error) fail(error, 'Could not load which places are free.');
  return new Map(((data ?? []) as { chamber_id: string; slot: string; state: PlaceState }[]).map((r) => [placeKey(r.chamber_id, r.slot), r.state]));
}

export async function bookPlaces(input: { listingId: string; places: string[]; start: string; months: number; name: string; phone: string }): Promise<string> {
  const { data, error } = await supabase.rpc('kr_book_cold_slots', {
    p_listing: input.listingId,
    p_slots: input.places,
    p_start: input.start,
    p_months: input.months,
    p_name: input.name,
    p_phone: input.phone,
  });
  if (error) fail(error, 'Could not book these places.');
  return String(data);
}

/** The places held by these bookings (a farmer sees their own; an owner sees their store's). */
export async function placesOfBookings(bookingIds: string[]): Promise<BookedPlace[]> {
  if (!bookingIds.length) return [];
  const { data, error } = await supabase.from('cold_slot_bookings').select('booking_id, chamber_id, slot').in('booking_id', bookingIds);
  if (error) {
    if (/cold_slot_bookings|schema cache|does not exist/i.test(error.message ?? '')) return [];
    fail(error, 'Could not load the booked places.');
  }
  return (data ?? []) as BookedPlace[];
}

export type ChamberInput = Pick<ColdChamber, 'listing_id' | 'name' | 'position' | 'rows' | 'cols' | 'boxes_per_slot' | 'blocked' | 'size'>;

export async function saveChamber(input: ChamberInput, id?: string): Promise<ColdChamber> {
  const q = id ? supabase.from('cold_chambers').update(input).eq('id', id) : supabase.from('cold_chambers').insert(input);
  const { data, error } = await q.select(COLUMNS).single();
  if (error && noSizeColumn(error.message)) throw new Error('Run the new cold store SQL (20261021000000_cold_chamber_size.sql, also in RUN_THIS_ONCE.sql) in Supabase, then save again.');
  if (error) fail(error, 'Could not save the chamber.');
  return withSize([data])[0];
}

export async function deleteChamber(id: string): Promise<void> {
  const { error } = await supabase.from('cold_chambers').delete().eq('id', id);
  if (error) fail(error, 'Could not remove the chamber.');
}
