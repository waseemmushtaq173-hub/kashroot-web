'use client';

/**
 * Marketplace: products sellers and dealers list (market_listings) and
 * pay-after-delivery orders (market_orders). The buyer keeps the money until
 * the goods arrive and are checked, then pays the seller directly by UPI /
 * bank and enters the reference; the seller confirms. KashRoot never holds it.
 *
 * Kissan Tools orders are pay first (pay_first, see src/lib/db/shop.ts): the
 * buyer pays the seller directly once the seller accepts, and the seller
 * ships after the money arrives. They live in Kissan Tools, so buyerOrders
 * leaves them out; sellers see both kinds in their order list.
 */
import { dbMessage, supabase } from '@/lib/db/client';
import { readableColumns } from '@/lib/db/phones';

export type MarketCategory = 'produce' | 'supplies';
export type MarketUnit = 'kg' | 'box' | 'quintal' | 'bag' | 'litre' | 'piece';
export type OrderStatus = 'placed' | 'accepted' | 'shipped' | 'delivered' | 'paid' | 'completed' | 'cancelled' | 'rejected' | 'disputed';
/** Pay-first orders only: unpaid → paid (buyer entered the reference) → received (seller confirmed). */
export type PaymentState = 'unpaid' | 'paid' | 'received';

export interface MarketListing {
  id: string;
  seller_id: string;
  seller_name: string;
  phone: string;
  district: string;
  category: MarketCategory;
  subcategory: string | null;
  product: string;
  variety: string | null;
  grade: string | null;
  unit: MarketUnit;
  price: number;
  quantity: number;
  details: string | null;
  photo: string | null;
  /** Up to three photos; the first is also in `photo`. Only read where needed (they are heavy). */
  photos?: string[] | null;
  active: boolean;
  updated_at: string;
}

export interface MarketOrder {
  id: string;
  listing_id: string | null;
  seller_id: string;
  buyer_id: string;
  buyer_name: string;
  buyer_phone: string;
  delivery_address: string;
  product: string;
  unit: MarketUnit;
  quantity: number;
  unit_price: number;
  amount: number;
  payment_ref: string | null;
  status: OrderStatus;
  seller_note: string | null;
  buyer_note: string | null;
  created_at: string;
  /** Kissan Tools: pay the seller before shipping. The fields below are set on those orders. */
  pay_first?: boolean;
  /** One checkout to one seller: every line of it shares this id. */
  basket?: string | null;
  payment_state?: PaymentState | null;
  paid_at?: string | null;
  payment_confirmed_at?: string | null;
  delivery_lat?: number | null;
  delivery_lon?: number | null;
  ship_vehicle?: string | null;
  driver_name?: string | null;
  driver_phone?: string | null;
  shipped_at?: string | null;
  last_lat?: number | null;
  last_lon?: number | null;
  last_accuracy?: number | null;
  last_at?: string | null;
  delivered_at?: string | null;
  /** Who sells it, kept on the order when it is made (older orders: null). */
  seller_name?: string | null;
  seller_phone?: string | null;
  seller_district?: string | null;
}

export const SUBCATEGORIES = ['Packaging', 'Fertiliser', 'Pesticide / fungicide', 'Seeds & saplings', 'Tools & machinery', 'Irrigation', 'Anti-hail net', 'Other'];
export const PRODUCE = ['Apple', 'Walnut', 'Almond', 'Cherry', 'Pear', 'Saffron', 'Rice', 'Vegetables', 'Other'];
export const UNITS: MarketUnit[] = ['piece', 'box', 'bag', 'kg', 'quintal', 'litre'];

export const ORDER_STATUS: Record<OrderStatus, { label: string; tone: 'amber' | 'blue' | 'violet' | 'green' | 'red' | 'slate' }> = {
  placed: { label: 'Waiting for the seller', tone: 'amber' },
  accepted: { label: 'Accepted — being packed', tone: 'violet' },
  shipped: { label: 'On the way', tone: 'blue' },
  delivered: { label: 'Received — pay the seller', tone: 'amber' },
  paid: { label: 'Paid — seller to confirm', tone: 'blue' },
  completed: { label: 'Completed', tone: 'green' },
  cancelled: { label: 'Cancelled', tone: 'slate' },
  rejected: { label: 'Declined by seller', tone: 'red' },
  disputed: { label: 'Problem reported', tone: 'red' },
};

const fail = (error: { message?: string; code?: string } | null, fallback: string): never => {
  throw new Error(dbMessage(error, fallback));
};

const LISTING = 'id, seller_id, seller_name, phone, district, category, subcategory, product, variety, grade, unit, price, quantity, details, photo, active, updated_at';
/** A seller's own products without the photos (heavy): the list reloads every 30 seconds. */
const MY_LISTING = 'id, seller_id, seller_name, phone, district, category, subcategory, product, variety, grade, unit, price, quantity, details, active, updated_at, photo_at';
/** The first photo of each of the seller's products, fetched again only when photo_at changes. */
const myPhotos = new Map<string, { at: string; photo: string | null }>();

export async function browseListings(category: MarketCategory): Promise<{ listings: MarketListing[]; verified: Set<string> }> {
  const { data, error } = await supabase.from('market_listings').select(await readableColumns(LISTING)).eq('category', category).eq('active', true).gt('quantity', 0).order('updated_at', { ascending: false }).limit(300);
  if (error) fail(error, 'Could not load products.');
  const listings = (data ?? []) as unknown as MarketListing[];
  const ids = [...new Set(listings.map((l) => l.seller_id))];
  let verified = new Set<string>();
  if (ids.length) {
    const v = await supabase.rpc('kr_verified_sellers', { p_ids: ids });
    if (!v.error) verified = new Set(((v.data ?? []) as string[]).map(String));
  }
  return { listings, verified };
}

/** A seller's own products with the first photo of each (every photo: listingPhotos in shop.ts). */
export async function myListings(sellerId: string): Promise<MarketListing[]> {
  const { data, error } = await supabase.from('market_listings').select(MY_LISTING).eq('seller_id', sellerId).order('updated_at', { ascending: false });
  if (error) fail(error, 'Could not load your products.');
  const rows = (data ?? []) as (Omit<MarketListing, 'photo'> & { photo_at: string | null })[];
  const missing = rows.filter((r) => myPhotos.get(r.id)?.at !== (r.photo_at ?? '')).map((r) => r.id);
  // A few photos per request keeps the request address short.
  for (let i = 0; i < missing.length; i += 20) {
    const p = await supabase.from('market_listings').select('id, photo, photo_at').in('id', missing.slice(i, i + 20));
    if (p.error) fail(p.error, 'Could not load your products.');
    for (const x of (p.data ?? []) as { id: string; photo: string | null; photo_at: string | null }[]) myPhotos.set(x.id, { at: x.photo_at ?? '', photo: x.photo });
  }
  return rows.map((r) => {
    const row: MarketListing & { photo_at?: string | null } = { ...r, photo: myPhotos.get(r.id)?.photo ?? null };
    delete row.photo_at;
    return row;
  });
}

export type ListingInput = Pick<MarketListing, 'seller_name' | 'phone' | 'district' | 'category' | 'subcategory' | 'product' | 'variety' | 'grade' | 'unit' | 'price' | 'quantity' | 'details' | 'photo'> & {
  /** Up to three photos; when given, `photo` should be the first. */
  photos?: string[] | null;
};

export async function saveListing(input: ListingInput, id?: string): Promise<void> {
  const q = id ? supabase.from('market_listings').update(input).eq('id', id) : supabase.from('market_listings').insert(input);
  const { error } = await q;
  if (error) fail(error, 'Could not save the product.');
}

export async function updateListing(id: string, patch: Partial<Pick<MarketListing, 'quantity' | 'price' | 'active'>>): Promise<void> {
  const { error } = await supabase.from('market_listings').update(patch).eq('id', id);
  if (error) fail(error, 'Could not update the product.');
}

export async function deleteListing(id: string): Promise<void> {
  const { error } = await supabase.from('market_listings').delete().eq('id', id);
  if (error) fail(error, 'Could not remove the product.');
}

export async function placeOrder(input: { listing_id: string; buyer_name: string; buyer_phone: string; delivery_address: string; quantity: number }): Promise<MarketOrder> {
  const { data, error } = await supabase.from('market_orders').insert(input).select('*').single();
  if (error) fail(error, 'Could not place the order.');
  return data as MarketOrder;
}

export async function buyerOrders(buyerId: string): Promise<MarketOrder[]> {
  const { data, error } = await supabase.from('market_orders').select('*').eq('buyer_id', buyerId).order('created_at', { ascending: false });
  if (error) fail(error, 'Could not load your orders.');
  // Kissan Tools orders (pay first) are followed in Kissan Tools.
  return ((data ?? []) as MarketOrder[]).filter((o) => !o.pay_first);
}

export async function sellerOrders(sellerId: string): Promise<MarketOrder[]> {
  const { data, error } = await supabase.from('market_orders').select('*').eq('seller_id', sellerId).order('created_at', { ascending: false });
  if (error) fail(error, 'Could not load orders.');
  return (data ?? []) as MarketOrder[];
}

/** not_received, seller_cancel and seller_dispute (the seller's "Report a problem") are for pay-first orders only. */
export type OrderAction = 'accept' | 'reject' | 'ship' | 'confirm_payment' | 'cancel' | 'delivered' | 'pay' | 'dispute' | 'not_received' | 'seller_cancel' | 'seller_dispute';

export async function orderAction(id: string, action: OrderAction, ref?: string, note?: string): Promise<void> {
  const { error } = await supabase.rpc('kr_order_action', { p_order: id, p_action: action, p_ref: ref ?? null, p_note: note ?? null });
  if (error) fail(error, 'Could not update the order.');
}
