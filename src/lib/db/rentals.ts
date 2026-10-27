'use client';

/**
 * Cold-store space and machinery rentals (supabase/migrations:
 * rental_listings, rental_bookings, payout_accounts). Money goes straight
 * from the renter to the owner by UPI or bank transfer — no escrow; the
 * owner confirms the payment, which reserves the space.
 * Cold stores set up with the owner wizard also keep the manager, the state
 * and area, and the building's size and main door
 * (supabase/migrations/20261025000000_cold_store_details.sql, lib/coldStore).
 */
import { asBuilding, type Building, type StoreRow } from '@/lib/coldStore';
import { dbMessage, supabase } from '@/lib/db/client';

export type RentalKind = 'cold_store' | 'machinery';
export type RentalUnit = 'box_month' | 'day' | 'hour';
export type BookingStatus = 'requested' | 'paid' | 'confirmed' | 'rejected' | 'cancelled' | 'completed';

export interface RentalListing {
  id: string;
  owner_id: string;
  kind: RentalKind;
  title: string;
  owner_name: string;
  phone: string;
  district: string;
  address: string | null;
  unit: RentalUnit;
  capacity: number;
  available: number;
  rate: number;
  min_units: number;
  temperature: string | null;
  details: string | null;
  active: boolean;
  updated_at: string;
  /** Owner wizard: the manager, the state and area / village, and the building (metres); null for stores listed before it. */
  manager_name: string | null;
  manager_phone: string | null;
  state: string;
  area: string | null;
  building: Building | null;
}

export interface RentalBooking {
  id: string;
  listing_id: string;
  owner_id: string;
  renter_id: string;
  renter_name: string;
  renter_phone: string;
  units: number;
  duration: number;
  start_date: string;
  amount: number;
  payment_ref: string | null;
  status: BookingStatus;
  owner_note: string | null;
  created_at: string;
  /**
   * Set by the database only (20261025100000_cold_booking_pay.sql): when the
   * farmer said they paid (with the reference), when the owner confirmed,
   * and whom the farmer was asked to pay. Missing before that SQL is run.
   */
  paid_at?: string | null;
  confirmed_at?: string | null;
  paid_to?: PaidTo | null;
  rental_listings?: (Pick<RentalListing, 'title' | 'kind' | 'unit' | 'owner_name' | 'phone' | 'district'> & Partial<Pick<RentalListing, 'manager_name' | 'manager_phone' | 'area' | 'state'>>) | null;
}

/** Whom a farmer paid: the owner's payment details when the payment was recorded (the account's last 4 digits only). */
export interface PaidTo {
  name: string;
  upi: string | null;
  account_end: string | null;
  ifsc: string | null;
  bank: string | null;
}

export interface PayoutAccount {
  account_name: string;
  upi_id: string | null;
  account_number: string | null;
  ifsc: string | null;
  bank_name: string | null;
}

export const UNIT_LABEL: Record<RentalUnit, { unit: string; per: string; duration: string }> = {
  box_month: { unit: 'boxes', per: 'per box per month', duration: 'months' },
  day: { unit: 'units', per: 'per day', duration: 'days' },
  hour: { unit: 'units', per: 'per hour', duration: 'hours' },
};

export const BOOKING_STATUS: Record<BookingStatus, { label: string; tone: 'amber' | 'blue' | 'green' | 'red' | 'slate' | 'violet' }> = {
  requested: { label: 'Requested — pay the owner', tone: 'amber' },
  paid: { label: 'Paid — owner to confirm', tone: 'blue' },
  confirmed: { label: 'Booked', tone: 'green' },
  rejected: { label: 'Not accepted', tone: 'red' },
  cancelled: { label: 'Cancelled', tone: 'slate' },
  completed: { label: 'Completed', tone: 'violet' },
};

const fail = (error: { message?: string; code?: string } | null, fallback: string): never => {
  throw new Error(dbMessage(error, fallback));
};

const BASE_LISTING_COLUMNS = 'id, owner_id, kind, title, owner_name, phone, district, address, unit, capacity, available, rate, min_units, temperature, details, active, updated_at';
const LISTING_COLUMNS = `${BASE_LISTING_COLUMNS}, manager_name, manager_phone, state, area, building`;
/** Before the cold store details SQL (20261025000000) is run the wizard's columns are missing. */
const noStoreColumns = (m?: string) => /manager_|state|area|building/i.test(m ?? '') && /column|schema cache|does not exist/i.test(m ?? '');
const asListings = (rows: unknown[] | null): RentalListing[] =>
  ((rows ?? []) as Partial<RentalListing>[]).map((l) => ({ ...l, manager_name: l.manager_name ?? null, manager_phone: l.manager_phone ?? null, state: l.state || 'Jammu & Kashmir', area: l.area ?? null, building: asBuilding(l.building) }) as RentalListing);

/** Listings with the wizard's columns, or without them before that SQL is run. */
async function readListings(query: (cols: string) => PromiseLike<{ data: unknown[] | null; error: { message?: string; code?: string } | null }>, fallback: string): Promise<RentalListing[]> {
  let { data, error } = await query(LISTING_COLUMNS);
  if (error && noStoreColumns(error.message)) ({ data, error } = await query(BASE_LISTING_COLUMNS));
  if (error) fail(error, fallback);
  return asListings(data);
}

/**
 * Every active listing, most free space first. Read a page at a time so none
 * is ever left out: the search filters this list, so a store missing here
 * could not be found at all.
 */
export async function listListings(kind: RentalKind): Promise<RentalListing[]> {
  const PAGE = 500;
  const all: RentalListing[] = [];
  for (let from = 0; from < 10_000; from += PAGE) {
    const page = await readListings((cols) => supabase.from('rental_listings').select(cols).eq('kind', kind).eq('active', true).order('available', { ascending: false }).order('id').range(from, from + PAGE - 1), 'Could not load listings.');
    all.push(...page);
    if (page.length < PAGE) break;
  }
  return all;
}

export async function myListings(ownerId: string): Promise<RentalListing[]> {
  return readListings((cols) => supabase.from('rental_listings').select(cols).eq('owner_id', ownerId).order('created_at', { ascending: false }), 'Could not load your listings.');
}

export type ListingInput = Omit<RentalListing, 'id' | 'owner_id' | 'active' | 'updated_at' | 'manager_name' | 'manager_phone' | 'state' | 'area' | 'building'>;

export async function saveListing(input: ListingInput, id?: string): Promise<RentalListing> {
  const row = { ...input, available: Math.min(input.available, input.capacity) };
  const q = id ? supabase.from('rental_listings').update(row).eq('id', id) : supabase.from('rental_listings').insert(row);
  const { data, error } = await q.select(BASE_LISTING_COLUMNS).single();
  if (error) fail(error, 'Could not save the listing.');
  return asListings([data])[0];
}

/**
 * Save the owner wizard's store details (step 1) and building (step 2). A
 * new store starts hidden from farmers until it is published; its capacity
 * and vacancy are counted from its chambers once they are saved.
 */
export async function saveStore(input: Partial<StoreRow>, id?: string): Promise<RentalListing> {
  const q = id
    ? supabase.from('rental_listings').update(input).eq('id', id)
    : supabase.from('rental_listings').insert({ kind: 'cold_store', unit: 'box_month', capacity: 1, available: 0, rate: 0, min_units: 1, active: false, ...input });
  const { data, error } = await q.select(LISTING_COLUMNS).single();
  if (error && noStoreColumns(error.message)) throw new Error('Run the new cold store SQL (20261025000000_cold_store_details.sql, also in RUN_THIS_ONCE.sql) in Supabase, then save again.');
  if (error) fail(error, 'Could not save your cold store.');
  return asListings([data])[0];
}

/** A real photo of the store, with a few words about it (20261030000000_cold_store_photos.sql). */
export interface StorePhoto {
  src: string;
  note: string;
}
export const MAX_STORE_PHOTOS = 8;
/** The longest photo (data URL) the database keeps. */
export const STORE_PHOTO_MAX_CHARS = 450_000;
const noPhotosColumn = (m?: string) => /photos/i.test(m ?? '') && /column|schema cache|does not exist/i.test(m ?? '');

/** The store's photos — read only when a farmer opens the store (they are large). None before that SQL is run. */
export async function storePhotos(listingId: string): Promise<StorePhoto[]> {
  const { data, error } = await supabase.from('rental_listings').select('photos').eq('id', listingId).maybeSingle();
  if (error && noPhotosColumn(error.message)) return [];
  if (error) fail(error, 'Could not load the photos of this store.');
  const list = (data as { photos?: unknown } | null)?.photos;
  if (!Array.isArray(list)) return [];
  return list
    .filter((p): p is { src: string; note?: unknown } => Boolean(p) && typeof (p as { src?: unknown }).src === 'string')
    .map((p) => ({ src: p.src, note: typeof p.note === 'string' ? p.note : '' }));
}

/** The owner keeps these photos of the store (all of them at once, in this order). */
export async function saveStorePhotos(listingId: string, photos: StorePhoto[]): Promise<void> {
  const list = photos.slice(0, MAX_STORE_PHOTOS).map((p) => ({ src: p.src, note: p.note.trim().slice(0, 80) }));
  const { error } = await supabase.from('rental_listings').update({ photos: list.length ? list : null }).eq('id', listingId).select('id').single();
  if (error && noPhotosColumn(error.message)) throw new Error('Run the store photos SQL (20261030000000_cold_store_photos.sql, also in RUN_THIS_ONCE.sql) in Supabase, then save again.');
  if (error && /photos_check/i.test(error.message ?? '')) throw new Error('One of the photos is too big. Remove it and add it again (it is made smaller on the phone).');
  if (error) fail(error, 'Could not save the photos.');
}

/** Show the store to farmers. */
export async function publishStore(id: string): Promise<void> {
  const { error } = await supabase.from('rental_listings').update({ active: true }).eq('id', id);
  if (error) fail(error, 'Could not publish your cold store.');
}

export async function setAvailability(id: string, available: number, active?: boolean): Promise<void> {
  const { error } = await supabase.from('rental_listings').update({ available, ...(active === undefined ? {} : { active }) }).eq('id', id);
  if (error) fail(error, 'Could not update the vacancy.');
}

/**
 * A store set up before the owner wizard: its rent for one box a month and,
 * for a store without chambers, how many boxes it holds (and so how many are free).
 */
export async function setRent(id: string, rate: number, space?: { capacity: number; available: number }): Promise<void> {
  const { error } = await supabase.from('rental_listings').update({ rate, ...(space ?? {}) }).eq('id', id);
  if (error) fail(error, 'Could not save the rent.');
}

export async function deleteListing(id: string): Promise<void> {
  const { error } = await supabase.from('rental_listings').delete().eq('id', id);
  if (error) fail(error, 'Could not remove the listing.');
}

const BOOKING_COLUMNS = '*, rental_listings(title, kind, unit, owner_name, phone, district)';
/** With the store's manager and place (owner wizard columns, 20261025000000). */
const BOOKING_COLUMNS_FULL = '*, rental_listings(title, kind, unit, owner_name, phone, district, manager_name, manager_phone, area, state)';

/** Bookings with the store's manager and area, or without them before that SQL is run. */
async function readBookings(column: 'renter_id' | 'owner_id', id: string, fallback: string): Promise<RentalBooking[]> {
  const read = (cols: string) => supabase.from('rental_bookings').select(cols).eq(column, id).order('created_at', { ascending: false });
  let { data, error } = await read(BOOKING_COLUMNS_FULL);
  if (error && noStoreColumns(error.message)) ({ data, error } = await read(BOOKING_COLUMNS));
  if (error) fail(error, fallback);
  return (data ?? []) as unknown as RentalBooking[];
}

export async function myBookings(renterId: string): Promise<RentalBooking[]> {
  return readBookings('renter_id', renterId, 'Could not load your bookings.');
}

export async function incomingBookings(ownerId: string): Promise<RentalBooking[]> {
  return readBookings('owner_id', ownerId, 'Could not load bookings.');
}

/** One booking (the farmer's or the owner's): what the database priced it at, and where it stands. */
export async function bookingById(id: string): Promise<Pick<RentalBooking, 'id' | 'amount' | 'status' | 'created_at' | 'payment_ref'> | null> {
  const { data, error } = await supabase.from('rental_bookings').select('id, amount, status, created_at, payment_ref').eq('id', id).maybeSingle();
  if (error) fail(error, 'Could not load the booking.');
  return data as Pick<RentalBooking, 'id' | 'amount' | 'status' | 'created_at' | 'payment_ref'> | null;
}

/** The short number a farmer and the owner read out: receipt number, UPI note. "CS-3F2A9C1B". */
export const bookingCode = (id: string) => `CS-${id.replace(/-/g, '').slice(0, 8).toUpperCase()}`;

/** The payment reference as stored: letters and numbers only (spaces and dashes left out). */
export const cleanRef = (text: string) => text.replace(/[\s-]/g, '');

/** What is wrong with a payment reference the farmer wrote, and how to fix it (null: fine). */
export function paymentRefProblem(text: string): string | null {
  const v = cleanRef(text);
  if (!v) return 'Write the payment reference. Your bank or UPI app shows it after you pay. A UPI reference has 12 digits, like 412345678901.';
  if (/[^A-Za-z0-9]/.test(v)) return 'Use only letters and numbers in the payment reference, with no signs like / or #.';
  if (v.length < 6) return `This reference has only ${v.length} letters or numbers. A UPI reference has 12 digits. Please copy it again from your bank or UPI app.`;
  if (v.length > 30) return `This reference has ${v.length} letters and numbers, which is too long. A UPI reference has 12 digits; a bank transfer reference (NEFT, IMPS) has up to 22. Please check it.`;
  return null;
}

export async function requestBooking(input: { listing_id: string; renter_name: string; renter_phone: string; units: number; duration: number; start_date: string }): Promise<RentalBooking> {
  const { data, error } = await supabase.from('rental_bookings').insert(input).select(BOOKING_COLUMNS).single();
  if (error) fail(error, 'Could not send the booking.');
  return data as RentalBooking;
}

export async function bookingAction(id: string, action: 'pay' | 'cancel' | 'confirm' | 'reject' | 'complete', ref?: string, note?: string): Promise<void> {
  const { error } = await supabase.rpc('kr_booking_action', { p_booking: id, p_action: action, p_ref: ref ?? null, p_note: note ?? null });
  if (error) fail(error, 'Could not update the booking.');
}

/** Everything a cold store booking's receipt shows (kr_cold_receipt): only for the farmer who booked and the store's owner. */
export interface ColdReceipt {
  /** Who is looking: the farmer who booked, or the store's owner. */
  viewer: 'farmer' | 'owner';
  booking: {
    id: string;
    status: BookingStatus;
    units: number;
    months: number;
    start: string;
    amount: number;
    payment_ref: string | null;
    created_at: string;
    paid_at: string | null;
    confirmed_at: string | null;
    paid_to: PaidTo | null;
    farmer_name: string;
    farmer_phone: string;
    owner_note: string | null;
  };
  store: {
    title: string;
    owner_name: string;
    phone: string;
    manager_name: string | null;
    manager_phone: string | null;
    address: string | null;
    area: string | null;
    district: string;
    state: string | null;
    rate: number;
    unit: RentalUnit;
  };
  /** Each place with the farmer's bins on it and the rate kept when it was booked (`rate_kept` false: today's rate). */
  places: { chamber_id: string; name: string; chamber_no: number | null; floor: number; position: number; storage: 'bins' | 'crates' | 'boxes'; boxes_per_slot: number; slot: string; boxes: number; rate: number; rate_kept: boolean }[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A booking's receipt, or null when this account may not see it (or there is no such booking). */
export async function coldReceipt(id: string): Promise<ColdReceipt | null> {
  if (!UUID.test(id)) return null;
  const { data, error } = await supabase.rpc('kr_cold_receipt', { p_booking: id });
  if (error && (error.code === 'PGRST202' || /Could not find the function/i.test(error.message ?? ''))) {
    throw new Error('Receipts need the latest cold store update: run 20261025100000_cold_booking_pay.sql (also in RUN_THIS_ONCE.sql) in Supabase.');
  }
  if (error) fail(error, 'Could not load the receipt.');
  if (!data) return null;
  const r = data as ColdReceipt;
  return {
    ...r,
    booking: { ...r.booking, amount: Number(r.booking.amount) || 0 },
    store: { ...r.store, rate: Number(r.store.rate) || 0 },
    places: (r.places ?? []).map((p) => ({ ...p, rate: Number(p.rate) || 0, boxes: Number(p.boxes) || 0 })),
  };
}

/** The owner's UPI / bank details, for a renter with a live booking. */
export async function paymentDetails(kind: 'booking' | 'order', id: string): Promise<PayoutAccount | null> {
  const { data, error } = await supabase.rpc('kr_payment_details', { p_kind: kind, p_id: id });
  if (error) fail(error, 'Could not load the payment details.');
  return ((data as PayoutAccount[] | null) ?? [])[0] ?? null;
}

export async function myPayout(userId: string): Promise<PayoutAccount | null> {
  const { data, error } = await supabase.from('payout_accounts').select('account_name, upi_id, account_number, ifsc, bank_name').eq('user_id', userId).maybeSingle();
  if (error) fail(error, 'Could not load your payment details.');
  return data as PayoutAccount | null;
}

export async function savePayout(input: PayoutAccount): Promise<void> {
  const row = {
    account_name: input.account_name.trim(),
    upi_id: input.upi_id?.trim() || null,
    account_number: input.account_number?.replace(/\s/g, '') || null,
    ifsc: input.ifsc?.trim().toUpperCase() || null,
    bank_name: input.bank_name?.trim() || null,
  };
  const { error } = await supabase.from('payout_accounts').upsert(row, { onConflict: 'user_id' });
  if (error) fail(error, 'Could not save your payment details.');
}

/** upi://pay link that opens PhonePe, Google Pay, Paytm or BHIM with the amount filled in. */
export function upiLink(p: { upi: string; name: string; amount?: number; note: string }): string {
  const q = new URLSearchParams({ pa: p.upi, pn: p.name, cu: 'INR', tn: p.note.slice(0, 50) });
  // Without an amount the payer types it in their UPI app.
  if (p.amount && p.amount > 0) q.set('am', p.amount.toFixed(2));
  return `upi://pay?${q.toString()}`;
}
