'use client';

/**
 * The cold store map (supabase/migrations/20261020000000_cold_store_map.sql):
 * chambers as rows × columns of places, like the seats of a plane. A place
 * is named row + column letter ("3B"). Farmers choose free places for the
 * months they need; the database refuses a place someone else holds.
 */
import { dbMessage, supabase } from '@/lib/db/client';

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
  // The database's own sentences are written for farmers: show them as they are.
  if (/taken|cannot be booked|hold ended|booked by a farmer|already booked|Choose|Verify your Aadhaar|own cold store|not taking bookings|at least one place|at most/i.test(m)) throw new Error(m);
  throw new Error(dbMessage(error, fallback));
};

export const COLUMN = (i: number) => String.fromCharCode(65 + i); // 0 → A
export const placeName = (row: number, col: number) => `${row}${COLUMN(col)}`;
export const placeKey = (chamberId: string, slot: string) => `${chamberId}:${slot}`;

/** Places a chamber offers (rows × columns minus the blocked ones). */
export const usablePlaces = (c: Pick<ColdChamber, 'rows' | 'cols' | 'blocked'>) => c.rows * c.cols - c.blocked.length;

/** The first day of the month after `months` months — when a booking ends. */
export function periodEnd(start: string, months: number): string {
  const d = new Date(`${start}T00:00:00`);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

const COLUMNS = 'id, listing_id, name, position, rows, cols, boxes_per_slot, blocked, note';

export async function chambersOf(listingIds: string[]): Promise<ColdChamber[]> {
  if (!listingIds.length) return [];
  const { data, error } = await supabase.from('cold_chambers').select(COLUMNS).in('listing_id', listingIds).order('position').order('name');
  if (error) {
    // Before the map SQL is run there are no chambers: stores work by box count.
    if (/cold_chambers|schema cache|does not exist/i.test(error.message ?? '')) return [];
    fail(error, 'Could not load the cold store map.');
  }
  return (data ?? []) as ColdChamber[];
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

export type ChamberInput = Pick<ColdChamber, 'listing_id' | 'name' | 'position' | 'rows' | 'cols' | 'boxes_per_slot' | 'blocked'>;

export async function saveChamber(input: ChamberInput, id?: string): Promise<ColdChamber> {
  const q = id ? supabase.from('cold_chambers').update(input).eq('id', id) : supabase.from('cold_chambers').insert(input);
  const { data, error } = await q.select(COLUMNS).single();
  if (error) fail(error, 'Could not save the chamber.');
  return data as ColdChamber;
}

export async function deleteChamber(id: string): Promise<void> {
  const { error } = await supabase.from('cold_chambers').delete().eq('id', id);
  if (error) fail(error, 'Could not remove the chamber.');
}
