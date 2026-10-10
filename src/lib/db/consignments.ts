'use client';

/**
 * Consignments tracked by the driver's phone GPS (consignments,
 * consignment_points). The transporter creates one and gets a tracking code
 * (for buyers / farmers) and a private driver link; the driver's page sends
 * the position; anyone with the code sees it (kr_track).
 */
import { dbMessage, supabase } from '@/lib/db/client';

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
}

export interface Tracked extends Omit<Consignment, 'driver_token'> {
  last_accuracy: number | null;
  trail: { lat: number; lng: number; at: string }[];
}

export const STATUS_LABEL: Record<ConsignmentStatus, string> = { booked: 'Waiting to start', in_transit: 'On the way', delivered: 'Delivered', cancelled: 'Cancelled' };

const fail = (error: { message?: string; code?: string } | null, fallback: string): never => {
  throw new Error(dbMessage(error, fallback));
};

export async function myConsignments(): Promise<Consignment[]> {
  const { data, error } = await supabase.from('consignments').select('code, vehicle_no, driver_name, driver_phone, origin, destination, cargo, status, driver_token, last_lat, last_lng, last_seen, created_at').order('created_at', { ascending: false }).limit(100);
  if (error) fail(error, 'Could not load your consignments.');
  return (data ?? []) as Consignment[];
}

export async function createConsignment(input: { origin: string; destination: string; cargo?: string; vehicle_no?: string; driver_name?: string; driver_phone?: string }): Promise<Consignment> {
  const { data, error } = await supabase
    .from('consignments')
    .insert({ ...input, vehicle_no: input.vehicle_no?.toUpperCase().replace(/[^A-Z0-9]/g, '') || null })
    .select('code, vehicle_no, driver_name, driver_phone, origin, destination, cargo, status, driver_token, last_lat, last_lng, last_seen, created_at')
    .single();
  if (error) fail(error, 'Could not create the consignment.');
  return data as Consignment;
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

export async function driverView(token: string): Promise<{ code: string; origin: string; destination: string; cargo: string | null; vehicle_no: string | null; status: ConsignmentStatus; last_seen: string | null } | null> {
  const { data, error } = await supabase.rpc('kr_driver_view', { p_token: token });
  if (error) fail(error, 'Could not open this driver link.');
  return data ?? null;
}

export async function driverPing(token: string, lat: number, lng: number, accuracy?: number): Promise<string> {
  const { data, error } = await supabase.rpc('kr_driver_ping', { p_token: token, p_lat: lat, p_lng: lng, p_accuracy: accuracy ?? null });
  if (error) fail(error, 'Could not send the location.');
  return String(data ?? '');
}

export async function driverDelivered(token: string): Promise<void> {
  const { error } = await supabase.rpc('kr_driver_delivered', { p_token: token });
  if (error) fail(error, 'Could not mark delivered.');
}

export const trackUrl = (code: string) => `${typeof window !== 'undefined' ? window.location.origin : ''}/track/${code}`;
export const driverUrl = (token: string) => `${typeof window !== 'undefined' ? window.location.origin : ''}/drive/${token}`;
