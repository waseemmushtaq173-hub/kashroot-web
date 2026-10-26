'use client';

/**
 * The cold store map (supabase/migrations/20261020000000_cold_store_map.sql):
 * each chamber is rows of stacks — row 1 nearest the door, stacks counted
 * from the left. People read a place as "Row 3, stack 2"; the database keeps
 * it as the short code "3B" (row number + stack letter). Farmers choose free
 * places for the months they need and how many of their boxes go on each, so
 * a small farmer can share a place with others
 * (supabase/migrations/20261022000000_cold_shared_places.sql); the database
 * refuses more boxes than a place holds.
 * Stores set up with the owner wizard (lib/coldStore,
 * supabase/migrations/20261025000000_cold_store_details.sql) keep each floor
 * of a chamber as its own row ("Chamber 1 · Floor 2") holding bins or
 * crates, saved all together by kr_save_cold_chambers.
 */
import { asChamberSize, type ChamberSize } from '@/lib/coldLayout';
import type { ChamberRow, Storage } from '@/lib/coldStore';
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
  /** Owner wizard: the chamber's number (null for chambers set up before it) and which floor this row is (1 = lowest). */
  chamber_no: number | null;
  floor: number;
  /** What a place holds: bins or crates (owner wizard), boxes (before it). One place = one stack; boxes_per_slot = bins / crates in it. */
  storage: Storage;
  /** Kg in one bin / crate, the capacity the owner gave in metric tonnes (the whole chamber), and rupees per bin / crate per month (null = the store's rate). */
  unit_kg: number | null;
  capacity_mt: number | null;
  rate: number | null;
}

/** What a place is for the months being looked at ("part": some boxes booked, room left). */
export type PlaceState = 'free' | 'part' | 'held' | 'booked' | 'mine' | 'blocked';

/** A place with boxes booked on it for the months looked at. */
export interface PlaceInfo {
  state: Exclude<PlaceState, 'free' | 'blocked'>;
  /** Boxes other farmers have on it; null = the whole place (before the shared-places SQL is run). */
  used: number | null;
  /** The viewer's own boxes on it. */
  mine: number;
}

/** Boxes that still fit on a place for those months. */
export function roomOn(c: Pick<ColdChamber, 'boxes_per_slot'>, info: PlaceInfo | undefined): number {
  if (!info) return c.boxes_per_slot;
  if (info.used === null) return 0;
  return Math.max(0, c.boxes_per_slot - info.used - info.mine);
}

export interface BookedPlace {
  booking_id: string;
  chamber_id: string;
  slot: string;
  /** The booking's boxes on this place (null: the whole place). */
  boxes: number | null;
}

/** Shown when a place is shared before the shared-places SQL is run. */
const SHARED_SQL = 'Sharing a place needs the latest cold store update: run 20261022000000_cold_shared_places.sql (also in RUN_THIS_ONCE.sql) in Supabase. Until then choose whole places.';

const fail = (error: { message?: string; code?: string } | null, fallback: string): never => {
  const m = error?.message ?? '';
  if (/Verify your Aadhaar/i.test(m)) throw new Error(VERIFY_FIRST);
  // The database's own sentences are written for farmers: show them as they are.
  if (/taken|cannot be booked|hold ended|booked by a farmer|already booked|Choose|Verify your Aadhaar|own cold store|not taking bookings|at least|at most/i.test(m)) throw new Error(m);
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
const SIZE_COLUMNS = `${BASE_COLUMNS}, size`;
const COLUMNS = `${SIZE_COLUMNS}, chamber_no, floor, storage, unit_kg, capacity_mt, rate`;
/** Before the chamber-size SQL (20261021000000) is run the size column is missing. */
const noSizeColumn = (m?: string) => /size/i.test(m ?? '') && /column|schema cache|does not exist/i.test(m ?? '');
/** Before the cold store details SQL (20261025000000) is run the wizard's columns are missing. */
const noWizardColumns = (m?: string) => /chamber_no|floor|storage|unit_kg|capacity_mt|rate/i.test(m ?? '') && /column|schema cache|does not exist/i.test(m ?? '');
const STORAGES: Storage[] = ['bins', 'crates', 'boxes'];
const asNumber = (v: unknown) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const withSize = (rows: unknown[]): ColdChamber[] =>
  (rows as (ColdChamber & { size?: unknown })[]).map((c) => ({
    ...c,
    size: asChamberSize(c.size),
    chamber_no: asNumber(c.chamber_no),
    floor: asNumber(c.floor) ?? 1,
    storage: STORAGES.includes(c.storage) ? c.storage : 'boxes',
    unit_kg: asNumber(c.unit_kg),
    capacity_mt: asNumber(c.capacity_mt),
    rate: asNumber(c.rate),
  }));

export async function chambersOf(listingIds: string[]): Promise<ColdChamber[]> {
  if (!listingIds.length) return [];
  const read = (cols: string) => supabase.from('cold_chambers').select(cols).in('listing_id', listingIds).order('position').order('name');
  let { data, error } = await read(COLUMNS);
  if (error && noWizardColumns(error.message)) ({ data, error } = await read(SIZE_COLUMNS));
  if (error && noSizeColumn(error.message)) ({ data, error } = await read(BASE_COLUMNS));
  if (error) {
    // Before the map SQL is run there are no chambers: stores work by box count.
    if (/cold_chambers|schema cache|does not exist/i.test(error.message ?? '')) return [];
    fail(error, 'Could not load the cold store map.');
  }
  return withSize(data ?? []);
}

/** Places of a store with boxes booked for these months: key "chamber:3B" → state and box counts. */
export async function takenPlaces(listingId: string, start: string, months: number): Promise<Map<string, PlaceInfo>> {
  const { data, error } = await supabase.rpc('kr_cold_map', { p_listing: listingId, p_start: start, p_months: months });
  if (error) fail(error, 'Could not load which places are free.');
  type Row = { chamber_id: string; slot: string; state: PlaceInfo['state']; used?: number; mine?: number };
  return new Map(
    ((data ?? []) as Row[]).map((r) => [placeKey(r.chamber_id, r.slot), { state: r.state, used: typeof r.used === 'number' ? r.used : null, mine: r.mine ?? 0 }]),
  );
}

const missingFunction = (e: { code?: string; message?: string } | null) => e?.code === 'PGRST202' || /Could not find the function/i.test(e?.message ?? '');

/** Book places: each with the farmer's boxes on it (`whole`: the place was empty and takes all of them). */
export async function bookPlaces(input: { listingId: string; places: { key: string; boxes: number; whole: boolean }[]; start: string; months: number; name: string; phone: string }): Promise<string> {
  const rest = { p_listing: input.listingId, p_start: input.start, p_months: input.months, p_name: input.name, p_phone: input.phone };
  let { data, error } = await supabase.rpc('kr_book_cold_places', { ...rest, p_places: input.places.map((p) => `${p.key}:${p.boxes}`) });
  if (error && missingFunction(error)) {
    // Before the shared-places SQL: whole places only.
    if (!input.places.every((p) => p.whole)) throw new Error(SHARED_SQL);
    ({ data, error } = await supabase.rpc('kr_book_cold_slots', { ...rest, p_slots: input.places.map((p) => p.key) }));
  }
  if (error) fail(error, 'Could not book these places.');
  return String(data);
}

/** The places held by these bookings (a farmer sees their own; an owner sees their store's). */
export async function placesOfBookings(bookingIds: string[]): Promise<BookedPlace[]> {
  if (!bookingIds.length) return [];
  const read = (cols: string) => supabase.from('cold_slot_bookings').select(cols).in('booking_id', bookingIds);
  let { data, error } = await read('booking_id, chamber_id, slot, boxes');
  // Before the shared-places SQL there is no box count: every place is whole.
  if (error && /boxes/i.test(error.message ?? '') && /column|does not exist/i.test(error.message ?? '')) ({ data, error } = await read('booking_id, chamber_id, slot'));
  if (error) {
    if (/cold_slot_bookings|schema cache|does not exist/i.test(error.message ?? '')) return [];
    fail(error, 'Could not load the booked places.');
  }
  return ((data ?? []) as unknown as (Omit<BookedPlace, 'boxes'> & { boxes?: number | null })[]).map((p) => ({ ...p, boxes: p.boxes ?? null }));
}

export type ChamberInput = Pick<ColdChamber, 'listing_id' | 'name' | 'position' | 'rows' | 'cols' | 'boxes_per_slot' | 'blocked' | 'size'>;

export async function saveChamber(input: ChamberInput, id?: string): Promise<ColdChamber> {
  const q = id ? supabase.from('cold_chambers').update(input).eq('id', id) : supabase.from('cold_chambers').insert(input);
  const { data, error } = await q.select(SIZE_COLUMNS).single();
  if (error && noSizeColumn(error.message)) throw new Error('Run the new cold store SQL (20261021000000_cold_chamber_size.sql, also in RUN_THIS_ONCE.sql) in Supabase, then save again.');
  if (error) fail(error, 'Could not save the chamber.');
  return withSize([data])[0];
}

/**
 * Save every chamber of a store set up with the owner wizard, in one go
 * (kr_save_cold_chambers): floors that are new are added, changed ones are
 * changed in place, and the wizard's floors no longer there are removed —
 * all or nothing. A place a farmer has booked cannot be removed or made
 * smaller: then nothing is saved and the database says which place it is.
 * Chambers set up before the wizard are left as they are. Returns how many
 * floor rows the store now has from the wizard.
 */
export async function saveColdStore(listingId: string, rows: ChamberRow[]): Promise<number> {
  const { data, error } = await supabase.rpc('kr_save_cold_chambers', { p_listing: listingId, p_rows: rows });
  if (error && (error.code === 'PGRST202' || /Could not find the function/i.test(error.message ?? ''))) {
    throw new Error('Run the new cold store SQL (20261025000000_cold_store_details.sql, also in RUN_THIS_ONCE.sql) in Supabase, then save again.');
  }
  if (error && /not your cold store|same number|at most 100|Each chamber needs/i.test(error.message ?? '')) throw new Error(error.message);
  if (error) fail(error, 'Could not save the chambers.');
  return Number(data) || 0;
}

export async function deleteChamber(id: string): Promise<void> {
  const { error } = await supabase.from('cold_chambers').delete().eq('id', id);
  if (error) fail(error, 'Could not remove the chamber.');
}

// ───────────────────────── booking in words (farmers, owners, receipts) ─────────────────────────

/**
 * Bins / crates / boxes still free today on each chamber floor of these
 * stores (kr_cold_free_now): chamber id → count. Places held for payment
 * count as taken. Empty before that SQL is run.
 */
export async function freeNow(listingIds: string[]): Promise<Map<string, number>> {
  if (!listingIds.length) return new Map();
  const { data, error } = await supabase.rpc('kr_cold_free_now', { p_listings: listingIds.slice(0, 200) });
  if (error) {
    if (missingFunction(error)) return new Map();
    fail(error, 'Could not load how much space is free.');
  }
  return new Map(((data ?? []) as { chamber_id: string; free: number }[]).map((r) => [r.chamber_id, Number(r.free) || 0]));
}

/** A place a booking has (or will have), with the farmer's bins on it (null: the whole place). */
export type PlacedOn = { chamber_id: string; slot: string; boxes?: number | null };
/** The chamber facts the words need. */
type Named = Pick<ColdChamber, 'id' | 'name' | 'storage' | 'boxes_per_slot'>;

/** One line per chamber floor: "Chamber 2 · Floor 1 · Row 3, stacks 4–6", with how many bins it is. */
export interface PlaceLine {
  chamberId: string;
  name: string;
  storage: Storage;
  /** Bins / crates / boxes on these places. */
  count: number;
  /** The places in words, chamber name first. */
  text: string;
}

const UNIT_ONE: Record<Storage, [string, string]> = { bins: ['bin', 'bins'], crates: ['crate', 'crates'], boxes: ['box', 'boxes'] };
const unitOf = (s: Storage, n: number) => `${n.toLocaleString('en-IN')} ${UNIT_ONE[s][n === 1 ? 0 : 1]}`;

/**
 * The places in words, a line per chamber floor (in the chambers' order):
 * "Chamber 1 · Floor 2 · Row 3, stacks 4–6" — whole places in runs, a
 * shared place with the farmer's own count: "Row 1, stack 3 (20 bins)".
 */
export function placeLines(places: PlacedOn[], chambers: Named[]): PlaceLine[] {
  const by = new Map<string, PlacedOn[]>();
  for (const p of places) by.set(p.chamber_id, [...(by.get(p.chamber_id) ?? []), p]);
  return chambers
    .filter((c) => by.has(c.id))
    .map((c) => {
      const mine = by.get(c.id) ?? [];
      const rows = new Map<number, { stack: number; boxes: number; whole: boolean }[]>();
      for (const p of mine) {
        const { row, stack } = parsePlace(p.slot);
        const boxes = p.boxes ?? c.boxes_per_slot;
        rows.set(row, [...(rows.get(row) ?? []), { stack, boxes, whole: boxes >= c.boxes_per_slot }]);
      }
      const parts = [...rows.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([row, stacks]) => {
          stacks.sort((a, b) => a.stack - b.stack);
          // Whole places in runs of stacks next to each other: "stacks 1–3, 5".
          const runs: [number, number][] = [];
          for (const s of stacks.filter((x) => x.whole)) {
            const last = runs.at(-1);
            if (last && s.stack === last[1] + 1) last[1] = s.stack;
            else runs.push([s.stack, s.stack]);
          }
          const wholeCount = runs.reduce((n, [a, b]) => n + b - a + 1, 0);
          const whole = runs.length ? `${wholeCount === 1 ? 'stack' : 'stacks'} ${runs.map(([a, b]) => (a === b ? String(a) : `${a}–${b}`)).join(', ')}` : '';
          const shared = stacks.filter((x) => !x.whole).map((x) => `stack ${x.stack} (${unitOf(c.storage, x.boxes)})`);
          return `Row ${row}, ${[whole, ...shared].filter(Boolean).join(', ')}`;
        });
      return {
        chamberId: c.id,
        name: c.name,
        storage: c.storage,
        count: mine.reduce((n, p) => n + (p.boxes ?? c.boxes_per_slot), 0),
        text: `${c.name} · ${parts.join('; ')}`,
      };
    });
}

/** "40 bins", "40 bins and 100 crates" — a booking's count in the words of its chambers. */
export function countsText(places: PlacedOn[], chambers: Named[], fallback?: { units: number; storage?: Storage }): string {
  const sums = new Map<Storage, number>();
  for (const line of placeLines(places, chambers)) sums.set(line.storage, (sums.get(line.storage) ?? 0) + line.count);
  if (!sums.size) return fallback ? unitOf(fallback.storage ?? 'boxes', fallback.units) : '';
  return (['bins', 'crates', 'boxes'] as const)
    .filter((s) => sums.has(s))
    .map((s) => unitOf(s, sums.get(s)!))
    .join(' and ');
}

/** A chosen place and the farmer's bins on it. */
export interface ChosenPlace {
  chamber: ColdChamber;
  slot: string;
  boxes: number;
}

/**
 * "Just give me 40 bins": places for `want` bins / crates / boxes, nearest
 * the door. All on one chamber floor when one has room (chambers in number
 * order, lowest floor first), else all in one chamber, else spread over the
 * chambers in order. Inside a floor, row 1 (at the chamber door) fills
 * first, a shared place takes only what still fits. Places already chosen
 * stay; returns the choice and how many now have a place.
 */
export function pickNearest(input: {
  chambers: ColdChamber[];
  want: number;
  roomFor: (c: ColdChamber, slot: string) => number;
  already?: Map<string, ChosenPlace>;
}): { picked: Map<string, ChosenPlace>; placed: number } {
  const picked = new Map(input.already ?? []);
  let placed = [...picked.values()].reduce((n, p) => n + p.boxes, 0);
  // Chamber floors in order: chambers by number (older ones after, by position), lowest floor first.
  const groups: ColdChamber[][] = [];
  const at = new Map<string, number>();
  const sorted = [...input.chambers].sort((a, b) => (a.chamber_no ?? 1e6) - (b.chamber_no ?? 1e6) || a.floor - b.floor || a.position - b.position || a.name.localeCompare(b.name));
  for (const c of sorted) {
    const key = c.chamber_no !== null ? `no:${c.chamber_no}` : `id:${c.id}`;
    if (!at.has(key)) {
      at.set(key, groups.length);
      groups.push([]);
    }
    groups[at.get(key)!].push(c);
  }
  const roomIn = (c: ColdChamber) => {
    let n = 0;
    for (let r = 1; r <= c.rows; r++) for (let i = 0; i < c.cols; i++) {
      const slot = placeName(r, i);
      if (!picked.has(placeKey(c.id, slot)) && !c.blocked.includes(slot)) n += Math.max(0, input.roomFor(c, slot));
    }
    return n;
  };
  const fill = (c: ColdChamber) => {
    for (let r = 1; r <= c.rows && placed < input.want; r++) for (let i = 0; i < c.cols && placed < input.want; i++) {
      const slot = placeName(r, i);
      const key = placeKey(c.id, slot);
      const room = c.blocked.includes(slot) ? 0 : input.roomFor(c, slot);
      if (picked.has(key) || room <= 0) continue;
      const n = Math.min(room, input.want - placed);
      picked.set(key, { chamber: c, slot, boxes: n });
      placed += n;
    }
  };
  const need = input.want - placed;
  if (need <= 0) return { picked, placed };
  const floors = groups.flat();
  const oneFloor = floors.find((c) => roomIn(c) >= need);
  const oneChamber = oneFloor ? null : groups.find((g) => g.reduce((n, c) => n + roomIn(c), 0) >= need);
  for (const c of oneFloor ? [oneFloor] : oneChamber ?? floors) fill(c);
  return { picked, placed };
}

/**
 * The last day of a booking of `months` months from `start`, as the
 * database counts it (kr_cold_period: from start up to, not including, the
 * same day `months` later, or that month's last day when it is shorter):
 * "2026-11-01", 6 → "2027-04-30"; "2026-01-31", 1 → "2026-02-27". Worked out
 * on the calendar date, so it is the same in every time zone.
 */
export function lastDay(start: string, months: number): string {
  const [y, m, d] = start.split('-').map(Number);
  const month = m - 1 + Math.max(1, months);
  const days = new Date(Date.UTC(y, month + 1, 0)).getUTCDate();
  const end = new Date(Date.UTC(y, month, Math.min(d, days)) - 86_400_000);
  return end.toISOString().slice(0, 10);
}

/** One chamber's part of a booking's price: its bins × its rent × months. */
export interface PriceLine {
  key: string;
  /** "Chamber 2" (all its floors together), or an older chamber's own name. */
  name: string;
  storage: Storage;
  count: number;
  /** Rupees for one bin / crate / box for one month. */
  rate: number;
  /** count × rate × months. */
  amount: number;
}

/**
 * What a booking costs, chamber by chamber, the same way the database works
 * it out (kr_cold_booking_amount): the bins on each place × that chamber's
 * own rent (else the store's) × months. `rate` on an item is the rent kept
 * when it was booked (receipts); without it today's rent is used.
 */
export function priceLines(
  items: { chamber: Pick<ColdChamber, 'id' | 'name' | 'chamber_no' | 'storage' | 'rate'>; boxes: number; rate?: number | null }[],
  storeRate: number,
  months: number,
): { lines: PriceLine[]; total: number } {
  const lines = new Map<string, PriceLine>();
  for (const it of items) {
    const rate = Number(it.rate ?? it.chamber.rate ?? storeRate) || 0;
    const group = it.chamber.chamber_no !== null ? `no:${it.chamber.chamber_no}` : `id:${it.chamber.id}`;
    const key = `${group}:${rate}`;
    const line = lines.get(key) ?? { key, name: it.chamber.chamber_no !== null ? `Chamber ${it.chamber.chamber_no}` : it.chamber.name, storage: it.chamber.storage, count: 0, rate, amount: 0 };
    line.count += it.boxes;
    line.amount = line.count * rate * months;
    lines.set(key, line);
  }
  const list = [...lines.values()];
  return { lines: list, total: Math.round(list.reduce((s, l) => s + l.amount, 0) * 100) / 100 };
}
