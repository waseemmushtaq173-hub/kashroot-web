'use client';

/**
 * Cold-store space and machinery rentals (supabase/migrations:
 * rental_listings, rental_bookings, payout_accounts). Money goes straight
 * from the renter to the owner by UPI or bank transfer — no escrow; the
 * owner confirms the payment, which reserves the space.
 */
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
  rental_listings?: Pick<RentalListing, 'title' | 'kind' | 'unit' | 'owner_name' | 'phone' | 'district'> | null;
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

const LISTING_COLUMNS = 'id, owner_id, kind, title, owner_name, phone, district, address, unit, capacity, available, rate, min_units, temperature, details, active, updated_at';

export async function listListings(kind: RentalKind): Promise<RentalListing[]> {
  const { data, error } = await supabase.from('rental_listings').select(LISTING_COLUMNS).eq('kind', kind).eq('active', true).order('available', { ascending: false }).limit(200);
  if (error) fail(error, 'Could not load listings.');
  return (data ?? []) as RentalListing[];
}

export async function myListings(ownerId: string): Promise<RentalListing[]> {
  const { data, error } = await supabase.from('rental_listings').select(LISTING_COLUMNS).eq('owner_id', ownerId).order('created_at', { ascending: false });
  if (error) fail(error, 'Could not load your listings.');
  return (data ?? []) as RentalListing[];
}

export type ListingInput = Omit<RentalListing, 'id' | 'owner_id' | 'active' | 'updated_at'>;

export async function saveListing(input: ListingInput, id?: string): Promise<RentalListing> {
  const row = { ...input, available: Math.min(input.available, input.capacity) };
  const q = id ? supabase.from('rental_listings').update(row).eq('id', id) : supabase.from('rental_listings').insert(row);
  const { data, error } = await q.select(LISTING_COLUMNS).single();
  if (error) fail(error, 'Could not save the listing.');
  return data as RentalListing;
}

export async function setAvailability(id: string, available: number, active?: boolean): Promise<void> {
  const { error } = await supabase.from('rental_listings').update({ available, ...(active === undefined ? {} : { active }) }).eq('id', id);
  if (error) fail(error, 'Could not update the vacancy.');
}

export async function deleteListing(id: string): Promise<void> {
  const { error } = await supabase.from('rental_listings').delete().eq('id', id);
  if (error) fail(error, 'Could not remove the listing.');
}

const BOOKING_COLUMNS = '*, rental_listings(title, kind, unit, owner_name, phone, district)';

export async function myBookings(renterId: string): Promise<RentalBooking[]> {
  const { data, error } = await supabase.from('rental_bookings').select(BOOKING_COLUMNS).eq('renter_id', renterId).order('created_at', { ascending: false });
  if (error) fail(error, 'Could not load your bookings.');
  return (data ?? []) as RentalBooking[];
}

export async function incomingBookings(ownerId: string): Promise<RentalBooking[]> {
  const { data, error } = await supabase.from('rental_bookings').select(BOOKING_COLUMNS).eq('owner_id', ownerId).order('created_at', { ascending: false });
  if (error) fail(error, 'Could not load bookings.');
  return (data ?? []) as RentalBooking[];
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
export function upiLink(p: { upi: string; name: string; amount: number; note: string }): string {
  const q = new URLSearchParams({ pa: p.upi, pn: p.name, am: p.amount.toFixed(2), cu: 'INR', tn: p.note.slice(0, 50) });
  return `upi://pay?${q.toString()}`;
}
