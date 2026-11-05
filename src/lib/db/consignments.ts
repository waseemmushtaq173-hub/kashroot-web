'use client';

/**
 * Consignments tracked by the driver's phone GPS (consignments,
 * consignment_points). The transporter creates one and gets a tracking code
 * (for buyers / farmers) and a private driver link; the driver's page sends
 * the position; anyone with the code sees it (kr_track).
 * Trips (20261120000000_trip_lock.sql): the driver agrees and starts the trip
 * (kr_driver_start) and can end it only with the receiver's 6-digit delivery
 * code, which only the sender sees; no position for 5 minutes marks the trip
 * "lost" and emails the sender. Before that SQL is run, the older calls are used.
 */
import { dbMessage, supabase } from '@/lib/db/client';
import { publicOrigin } from '@/lib/site';

export type ConsignmentStatus = 'booked' | 'in_transit' | 'delivered' | 'cancelled';

export interface Consignment {
  code: string;
  vehicle_no: string | null;
  driver_name: string | null;
  driver_phone: string | null;
  origin: string;
  destination: string;
  cargo: string | null;
  status: ConsignmentStatus;
  driver_token: string;
  last_lat: number | null;
  last_lng: number | null;
  last_seen: string | null;
  created_at: string;
  /** From the place search (20261120000000_trip_lock.sql); null for older loads. */
  origin_lat?: number | null;
  origin_lng?: number | null;
  dest_lat?: number | null;
  dest_lng?: number | null;
  /** The receiver's code that ends the trip (the sender's own rows only). */
  delivery_code?: string | null;
  delivery_tries?: number;
  trip_started_at?: string | null;
  lost_at?: string | null;
}

export interface Tracked extends Omit<Consignment, 'driver_token' | 'delivery_code' | 'delivery_tries' | 'trip_started_at' | 'lost_at'> {
  last_accuracy: number | null;
  trail: { lat: number; lng: number; at: string }[];
  started?: boolean;
  /** On a trip with no position for 5 minutes. */
  lost?: boolean;
}

export type TripEventKind = 'started' | 'resumed' | 'lost' | 'back' | 'gps_off' | 'location_blocked' | 'page_closed' | 'code_wrong' | 'code_locked' | 'delivered' | 'cancelled';
export interface TripEvent {
  kind: TripEventKind;
  detail: string | null;
  at: string;
}
export const EVENT_LABEL: Record<TripEventKind, string> = {
  started: 'Trip started — the driver agreed to share location',
  resumed: 'Driver opened the trip again',
  lost: 'Location lost',
  back: 'Location back',
  gps_off: 'Driver’s GPS was off',
  location_blocked: 'Driver blocked location for KashRoot',
  page_closed: 'Driver closed or left the KashRoot page',
  code_wrong: 'A wrong delivery code was typed',
  code_locked: 'Too many wrong codes — only you can mark it delivered now',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

/** A place picked on the map: its name and point. */
export interface PlacePoint {
  name: string;
  lat: number;
  lng: number;
}

/** The setup SQL for trips (20261120000000_trip_lock.sql) is not run yet: a column or function is missing. */
const notSetUp = (e: { message?: string; code?: string } | null) =>
  Boolean(e) && (/PGRST20[24]|42703|42883/.test(e?.code ?? '') || /schema cache|does not exist|Could not find the function/i.test(e?.message ?? ''));

const BASE_COLS = 'code, vehicle_no, driver_name, driver_phone, origin, destination, cargo, status, driver_token, last_lat, last_lng, last_seen, created_at';
const TRIP_COLS = `${BASE_COLS}, origin_lat, origin_lng, dest_lat, dest_lng, delivery_code, delivery_tries, trip_started_at, lost_at`;

export const STATUS_LABEL: Record<ConsignmentStatus, string> = { booked: 'Waiting to start', in_transit: 'On the way', delivered: 'Delivered', cancelled: 'Cancelled' };

const fail = (error: { message?: string; code?: string } | null, fallback: string): never => {
  throw new Error(dbMessage(error, fallback));
};

export async function myConsignments(): Promise<Consignment[]> {
  const read = (cols: string) => supabase.from('consignments').select(cols).order('created_at', { ascending: false }).limit(100);
  let { data, error } = await read(TRIP_COLS);
  if (error && notSetUp(error)) ({ data, error } = await read(BASE_COLS));
  if (error) fail(error, 'Could not load your consignments.');
  return (data ?? []) as unknown as Consignment[];
}

export async function createConsignment(input: { origin: string; destination: string; cargo?: string; vehicle_no?: string; driver_name?: string; driver_phone?: string; from?: PlacePoint | null; to?: PlacePoint | null }): Promise<Consignment> {
  const { from, to, ...rest } = input;
  const row = { ...rest, vehicle_no: rest.vehicle_no?.toUpperCase().replace(/[^A-Z0-9]/g, '') || null };
  const points = {
    origin_lat: from?.lat ?? null,
    origin_lng: from?.lng ?? null,
    dest_lat: to?.lat ?? null,
    dest_lng: to?.lng ?? null,
  };
  let { data, error } = await supabase.from('consignments').insert({ ...row, ...points }).select(TRIP_COLS).single();
  // Before the trips SQL is run: save it without the points (the names are enough to track).
  if (error && notSetUp(error)) ({ data, error } = await supabase.from('consignments').insert(row).select(BASE_COLS).single());
  if (error) fail(error, 'Could not create the consignment.');
  return data as unknown as Consignment;
}

/** What happened on a trip, newest first (the sender's own loads). */
export async function tripEvents(code: string): Promise<TripEvent[]> {
  const { data, error } = await supabase.from('consignment_events').select('kind, detail, at').eq('code', code).order('id', { ascending: false }).limit(50);
  if (error && notSetUp(error)) return [];
  if (error) fail(error, 'Could not load what happened on this trip.');
  return (data ?? []) as TripEvent[];
}

export async function setConsignmentStatus(code: string, status: ConsignmentStatus): Promise<void> {
  const { error } = await supabase.from('consignments').update({ status }).eq('code', code);
  if (error) fail(error, 'Could not update the consignment.');
}

export async function track(code: string): Promise<Tracked | null> {
  const { data, error } = await supabase.rpc('kr_track', { p_code: code.trim().toUpperCase() });
  if (error) fail(error, 'Could not look up this code.');
  return (data as Tracked | null) ?? null;
}

export interface DriverView {
  code: string;
  origin: string;
  destination: string;
  cargo: string | null;
  vehicle_no: string | null;
  status: ConsignmentStatus;
  last_seen: string | null;
  /** Set once the trips SQL is run. */
  started?: boolean;
  consent_at?: string | null;
  origin_lat?: number | null;
  origin_lng?: number | null;
  dest_lat?: number | null;
  dest_lng?: number | null;
  code_locked?: boolean;
}

export async function driverView(token: string): Promise<DriverView | null> {
  const { data, error } = await supabase.rpc('kr_driver_view', { p_token: token });
  if (error) fail(error, 'Could not open this driver link.');
  return data ?? null;
}

export async function driverPing(token: string, lat: number, lng: number, accuracy?: number): Promise<string> {
  const { data, error } = await supabase.rpc('kr_driver_ping', { p_token: token, p_lat: lat, p_lng: lng, p_accuracy: accuracy ?? null });
  if (error) fail(error, 'Could not send the location.');
  return String(data ?? '');
}

/** The driver agrees to share their location until delivery, and the trip starts. 'legacy' before the trips SQL is run. */
export async function driverStart(token: string): Promise<string> {
  const { data, error } = await supabase.rpc('kr_driver_start', { p_token: token, p_consent: true });
  if (error && notSetUp(error)) return 'legacy';
  if (error) fail(error, 'Could not start the trip.');
  return String(data ?? 'in_transit');
}

/** The driver's page says GPS is off, location is blocked, or the page was closed. Never throws. */
export function driverSignal(token: string, kind: 'gps_off' | 'location_blocked' | 'page_closed'): void {
  void Promise.resolve(supabase.rpc('kr_driver_signal', { p_token: token, p_kind: kind })).catch(() => undefined);
}

export type DeliverResult = { ok: true } | { ok: false; locked: boolean; left: number };

/** The load arrived: the receiver's 6-digit code ends the trip. */
export async function driverDelivered(token: string, code: string): Promise<DeliverResult> {
  const { data, error } = await supabase.rpc('kr_driver_delivered', { p_token: token, p_code: code });
  if (error && notSetUp(error)) {
    // Before the trips SQL is run there is no code yet: the older call.
    const old = await supabase.rpc('kr_driver_delivered', { p_token: token });
    if (old.error) fail(old.error, 'Could not mark delivered.');
    return { ok: true };
  }
  if (error) fail(error, 'Could not mark delivered.');
  const r = (data ?? {}) as { ok?: boolean; locked?: boolean; left?: number };
  return r.ok ? { ok: true } : { ok: false, locked: Boolean(r.locked), left: Number(r.left ?? 0) };
}

export const trackUrl = (code: string) => `${publicOrigin()}/tracking/dashboard?code=${encodeURIComponent(code)}`;
export const driverUrl = (token: string) => `${publicOrigin()}/drive/${token}`;
