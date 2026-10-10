'use client';

/**
 * Marketplace: products sellers and dealers list (market_listings) and
 * pay-after-delivery orders (market_orders). The buyer keeps the money until
 * the goods arrive and are checked, then pays the seller directly by UPI /
 * bank and enters the reference; the seller confirms. KashRoot never holds it.
 */
import { dbMessage, supabase } from '@/lib/db/client';

export type MarketCategory = 'produce' | 'supplies';
export type MarketUnit = 'kg' | 'box' | 'quintal' | 'bag' | 'litre' | 'piece';
export type OrderStatus = 'placed' | 'accepted' | 'shipped' | 'delivered' | 'paid' | 'completed' | 'cancelled' | 'rejected' | 'disputed';

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

export async function browseListings(category: MarketCategory): Promise<{ listings: MarketListing[]; verified: Set<string> }> {
  const { data, error } = await supabase.from('market_listings').select(LISTING).eq('category', category).eq('active', true).gt('quantity', 0).order('updated_at', { ascending: false }).limit(300);
  if (error) fail(error, 'Could not load products.');
  const listings = (data ?? []) as MarketListing[];
  const ids = [...new Set(listings.map((l) => l.seller_id))];
  let verified = new Set<string>();
  if (ids.length) {
    const v = await supabase.rpc('kr_verified_sellers', { p_ids: ids });
    if (!v.error) verified = new Set(((v.data ?? []) as string[]).map(String));
  }
  return { listings, verified };
}

export async function myListings(sellerId: string): Promise<MarketListing[]> {
  const { data, error } = await supabase.from('market_listings').select(LISTING).eq('seller_id', sellerId).order('updated_at', { ascending: false });
  if (error) fail(error, 'Could not load your products.');
  return (data ?? []) as MarketListing[];
}

export type ListingInput = Pick<MarketListing, 'seller_name' | 'phone' | 'district' | 'category' | 'subcategory' | 'product' | 'variety' | 'grade' | 'unit' | 'price' | 'quantity' | 'details' | 'photo'>;

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
  return (data ?? []) as MarketOrder[];
}

export async function sellerOrders(sellerId: string): Promise<MarketOrder[]> {
  const { data, error } = await supabase.from('market_orders').select('*').eq('seller_id', sellerId).order('created_at', { ascending: false });
  if (error) fail(error, 'Could not load orders.');
  return (data ?? []) as MarketOrder[];
}

export type OrderAction = 'accept' | 'reject' | 'ship' | 'confirm_payment' | 'cancel' | 'delivered' | 'pay' | 'dispute';

export async function orderAction(id: string, action: OrderAction, ref?: string, note?: string): Promise<void> {
  const { error } = await supabase.rpc('kr_order_action', { p_order: id, p_action: action, p_ref: ref ?? null, p_note: note ?? null });
  if (error) fail(error, 'Could not update the order.');
}
