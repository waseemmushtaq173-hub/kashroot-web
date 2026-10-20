'use client';

/**
 * Kissan Tools shop: farm tools and inputs that agro-dealers and farmers list
 * (market_listings, category 'supplies'), ordered with pay first.
 *
 * One checkout to one seller is one basket (one market_orders row per
 * product, sharing a basket id). The seller accepts (stock is checked and
 * kept aside) → the buyer pays the seller directly by UPI or bank and enters
 * the reference → the seller confirms the money arrived → the seller ships and
 * the vehicle's position comes from the seller's phone or the driver's link
 * (/deliver/<token>) → the buyer presses "I received it". Every step moves the
 * whole basket (kr_order_action / kr_order_ship in the database). KashRoot
 * never holds the money.
 */
import { dbMessage, supabase } from '@/lib/db/client';
import { ORDER_STATUS, type MarketOrder, type MarketUnit } from '@/lib/db/market';

const fail = (error: { message?: string; code?: string } | null, fallback: string): never => {
  throw new Error(dbMessage(error, fallback));
};

/** Every photo of one listing (the shop cards only carry the first). */
export async function listingPhotos(id: string): Promise<string[]> {
  const { data, error } = await supabase.from('market_listings').select('photo, photos').eq('id', id).maybeSingle();
  if (error) fail(error, 'Could not load the photos.');
  const row = data as { photo: string | null; photos: string[] | null } | null;
  return row?.photos?.length ? row.photos : row?.photo ? [row.photo] : [];
}

/** A random id for a basket (crypto.randomUUID is missing on plain-http pages). */
function newId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export interface ShopOrderInput {
  lines: { listing_id: string; quantity: number }[];
  buyer_name: string;
  buyer_phone: string;
  delivery_address: string;
  delivery_lat: number;
  delivery_lon: number;
}

/** Sends one order to one seller: all its lines in one basket. */
export async function placeShopOrder(input: ShopOrderInput): Promise<MarketOrder[]> {
  const basket = newId();
  const rows = input.lines.map((l) => ({
    listing_id: l.listing_id,
    quantity: l.quantity,
    buyer_name: input.buyer_name,
    buyer_phone: input.buyer_phone,
    delivery_address: input.delivery_address,
    delivery_lat: input.delivery_lat,
    delivery_lon: input.delivery_lon,
    pay_first: true,
    basket,
  }));
  const { data, error } = await supabase.from('market_orders').insert(rows).select('*');
  if (error) fail(error, 'Could not send the order.');
  return (data ?? []) as MarketOrder[];
}

/** The buyer's Kissan Tools orders (pay first), newest first. */
export async function shopOrders(buyerId: string): Promise<MarketOrder[]> {
  const { data, error } = await supabase.from('market_orders').select('*').eq('buyer_id', buyerId).eq('pay_first', true).order('created_at', { ascending: false });
  if (error) fail(error, 'Could not load your orders.');
  return (data ?? []) as MarketOrder[];
}

/** Orders as people think of them: the lines of one basket together, newest first. */
export function groupBaskets(orders: MarketOrder[]): MarketOrder[][] {
  const groups = new Map<string, MarketOrder[]>();
  for (const o of orders) {
    const key = o.pay_first && o.basket ? `b:${o.basket}` : `o:${o.id}`;
    groups.set(key, [...(groups.get(key) ?? []), o]);
  }
  return [...groups.values()].map((g) => g.sort((a, b) => a.created_at.localeCompare(b.created_at)));
}

export const basketTotal = (lines: MarketOrder[]) => lines.reduce((s, l) => s + Number(l.amount), 0);

/** Does the order wait for the seller? New, a payment to check, or one to ship (not a Kissan Tools order the buyer has yet to pay). */
export const sellerMustAct = (o: Pick<MarketOrder, 'status' | 'pay_first' | 'payment_state'>) =>
  o.status === 'placed' || o.status === 'paid' || (o.status === 'accepted' && !(o.pay_first && (o.payment_state ?? 'unpaid') === 'unpaid'));

/** How many orders wait for the seller (the products of one Kissan Tools order count once). */
export const sellerToAct = (orders: MarketOrder[]) => groupBaskets(orders).filter((g) => sellerMustAct(g[0])).length;

/** The seller ships: vehicle number or courier, and the driver (optional). */
export async function shipOrder(id: string, p: { vehicle: string; driverName?: string; driverPhone?: string; note?: string }): Promise<void> {
  const { error } = await supabase.rpc('kr_order_ship', { p_order: id, p_vehicle: p.vehicle, p_driver_name: p.driverName || null, p_driver_phone: p.driverPhone || null, p_note: p.note || null });
  if (error) fail(error, 'Could not mark the order shipped.');
}

/** The vehicle's position from the seller's phone. */
export async function sendLocation(id: string, lat: number, lon: number, accuracy?: number | null): Promise<void> {
  const { error } = await supabase.rpc('kr_order_location', { p_order: id, p_lat: lat, p_lon: lon, p_accuracy: accuracy ?? null });
  if (error) fail(error, 'Could not send the location.');
}

/** The tracking link for the driver's phone (made the first time it is asked for). */
export async function driverLink(id: string): Promise<string> {
  const { data, error } = await supabase.rpc('kr_order_driver_link', { p_order: id });
  if (error) fail(error, 'Could not make the driver link.');
  return `${window.location.origin}/deliver/${data as string}`;
}

export interface DriverTrip {
  status: MarketOrder['status'];
  delivery_address: string;
  delivery_lat: number | null;
  delivery_lon: number | null;
  buyer_name: string;
  buyer_phone: string;
  ship_vehicle: string | null;
  last_at: string | null;
  items: { product: string; quantity: number; unit: MarketUnit }[];
}

/** What the driver delivers and where; null when the link is not valid. */
export async function driverTrip(token: string): Promise<DriverTrip | null> {
  const { data, error } = await supabase.rpc('kr_order_driver_view', { p_token: token });
  if (error) fail(error, 'Could not open this link.');
  return (data as DriverTrip | null) ?? null;
}

/** The driver's phone sends where it is; returns the order's status. */
export async function driverPing(token: string, lat: number, lon: number, accuracy?: number | null): Promise<string> {
  const { data, error } = await supabase.rpc('kr_order_driver_ping', { p_token: token, p_lat: lat, p_lon: lon, p_accuracy: accuracy ?? null });
  if (error) fail(error, 'Could not send the location.');
  return String(data ?? '');
}

// ── Distance and arrival time ──────────────────────────────────────────────

export interface Point {
  lat: number;
  lng: number;
}

/** Straight-line distance in km. */
export function kmBetween(a: Point, b: Point): number {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

/** Roads in the hills are about 1.3 × the straight line, at about 30 km/h. */
export const ROAD_FACTOR = 1.3;
export const HILL_SPEED_KMH = 30;

/** Road distance and minutes to go, both "about". */
export function etaOf(from: Point, to: Point): { km: number; minutes: number } {
  const km = kmBetween(from, to) * ROAD_FACTOR;
  return { km, minutes: Math.round((km / HILL_SPEED_KMH) * 60) };
}

/** "about 25 minutes", "about 1 hour 20 minutes" (an hour or more: to the nearest 5 minutes). */
export function minutesText(m: number): string {
  if (m < 2) return 'a minute or two';
  if (m < 60) return `${m} minutes`;
  // Round the whole time first, so 118 minutes reads "2 hours", never "1 hour 60 minutes".
  const t = Math.round(m / 5) * 5;
  const h = Math.floor(t / 60);
  const rest = t - h * 60;
  return `${h} ${h === 1 ? 'hour' : 'hours'}${rest ? ` ${rest} minutes` : ''}`;
}

/** "12 km", "800 m". */
export const kmText = (km: number) => (km < 1 ? `${Math.max(50, Math.round((km * 1000) / 50) * 50)} m` : `${km < 10 ? km.toFixed(1) : Math.round(km)} km`);

// ── Status words ───────────────────────────────────────────────────────────

type Tone = 'amber' | 'blue' | 'violet' | 'green' | 'red' | 'slate';

/** The order's status in plain words for whoever is looking. */
export function shopStatus(o: Pick<MarketOrder, 'status' | 'payment_state'> & { payment_ref?: string | null }, as: 'buyer' | 'seller'): { label: string; tone: Tone } {
  const buyer = as === 'buyer';
  if (o.status === 'placed') return buyer ? { label: 'Waiting for the seller to accept', tone: 'amber' } : { label: 'New order — accept or decline', tone: 'amber' };
  if (o.status === 'accepted') {
    if (o.payment_state === 'paid') return buyer ? { label: 'Paid — the seller is checking the money', tone: 'blue' } : { label: 'Buyer says paid — check your bank', tone: 'amber' };
    if (o.payment_state === 'received') return buyer ? { label: 'Money received — being packed', tone: 'violet' } : { label: 'Money received — ship it now', tone: 'amber' };
    // A reference was given, but the seller pressed "Money not received".
    if (o.payment_ref) return buyer ? { label: 'The seller has not found your money', tone: 'red' } : { label: 'Money not found — check again', tone: 'amber' };
    return buyer ? { label: 'Accepted — pay the seller now', tone: 'amber' } : { label: 'Accepted — waiting for the buyer to pay', tone: 'violet' };
  }
  if (o.status === 'shipped') return { label: 'On the way', tone: 'blue' };
  if (o.status === 'completed') return { label: 'Delivered — order complete', tone: 'green' };
  return ORDER_STATUS[o.status];
}

/** The steps of a pay-first order, and how far this one is (0–5). */
export const SHOP_STEPS = ['Order sent', 'Accepted', 'Paid', 'Money received', 'On the way', 'Received'];
export function shopStep(o: Pick<MarketOrder, 'status' | 'payment_state'>): number {
  if (o.status === 'completed') return 5;
  if (o.status === 'shipped') return 4;
  if (o.status === 'accepted') return o.payment_state === 'received' ? 3 : o.payment_state === 'paid' ? 2 : 1;
  return 0;
}

// ── Who sells it ───────────────────────────────────────────────────────────

export interface ShopSeller {
  seller_name: string;
  phone: string;
  district: string;
}

/** Who sells an order: kept on the order since it was made; older orders fall back to the listing. */
export function sellerOfOrder(o: MarketOrder, byListing?: Map<string, ShopSeller>): ShopSeller | null {
  if (o.seller_name) return { seller_name: o.seller_name, phone: o.seller_phone ?? '', district: o.seller_district ?? '' };
  return byListing?.get(o.listing_id ?? '') ?? null;
}

/** The seller's shop name, mobile and district for each listing (older orders, made before the order kept them). */
export async function sellersOf(listingIds: string[]): Promise<Map<string, ShopSeller>> {
  const ids = [...new Set(listingIds.filter(Boolean))];
  if (!ids.length) return new Map();
  const { data, error } = await supabase.from('market_listings').select('id, seller_name, phone, district').in('id', ids);
  // A hidden or removed product leaves the order without the name: not an error.
  if (error) return new Map();
  return new Map(((data ?? []) as (ShopSeller & { id: string })[]).map((r) => [r.id, { seller_name: r.seller_name, phone: r.phone, district: r.district }]));
}
