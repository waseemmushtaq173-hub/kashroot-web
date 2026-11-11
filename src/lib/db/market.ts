'use client';

/**
 * Marketplace: products sellers and dealers list (market_listings) and the
 * five-step escrow orders (market_orders). The buyer's payment is locked in
 * KashRoot escrow the moment the order is placed (escrow_status 'locked');
 * the order then moves  placed → accepted (farmer packs) → shipped (live GPS
 * tracking) → delivered (arrived at the buyer) → completed (the buyer
 * confirms delivery received and the escrow releases to the farmer).
 * Both parties live-stream their GPS: the seller pins the dispatch origin
 * (seller_live_*) — and the moving shipment while it is on the way
 * (last_* via kr_order_location); the buyer pins their exact destination
 * (buyer_live_*). A Super Admin (kr_admin_orders) sees 100% of orders.
 *
 * Kissan Tools orders are pay first (pay_first, see src/lib/db/shop.ts): the
 * buyer pays the seller directly once the seller accepts, and the seller
 * ships after the money arrives — no escrow. They live in Kissan Tools, so
 * buyerOrders leaves them out; sellers see both kinds in their order list.
 */
import { dbMessage, supabase } from '@/lib/db/client';
import { readableColumns } from '@/lib/db/phones';

export type MarketCategory = 'produce' | 'supplies';
export type MarketUnit = 'kg' | 'box' | 'quintal' | 'bag' | 'litre' | 'piece';
export type OrderStatus = 'placed' | 'accepted' | 'shipped' | 'delivered' | 'paid' | 'completed' | 'cancelled' | 'rejected' | 'disputed';
/** Pay-first orders only: unpaid → paid (buyer entered the reference) → received (seller confirmed). */
export type PaymentState = 'unpaid' | 'paid' | 'received';
/** The escrow ledger on a pay-after-delivery order: locked when placed, released when the buyer confirms. */
export type EscrowStatus = 'locked' | 'released' | 'refunded';

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
  /** Net weight of one box in kg (e.g. 16.0, 18.0, 20.0). Produce only. */
  box_capacity_kg: number | null;
  /** Packing style per box (e.g. "4 Layer", "5 Layer", "3 Layer", "2 Layer (Half Box)", "Loose / Crate Packed"). Produce only. */
  packing_layers: string | null;
  /** Approximate apple count per box (e.g. "80–100 pieces", "125–150 pieces"). Produce only. */
  apples_per_box: string | null;
  /** Live GPS latitude of the photo/video capture location. */
  captured_lat: number | null;
  /** Live GPS longitude of the photo/video capture location. */
  captured_lng: number | null;
  /** GPS accuracy in metres at capture time. */
  captured_accuracy_m: number | null;
  /** Reverse-geocoded address of the capture location. */
  captured_address: string | null;
  /** ISO timestamp of the live capture. */
  captured_at_iso: string | null;
  /** True when the listing photo/video was captured via live camera with GPS lock. */
  is_live_camera_verified: boolean;
  /** The farmer's payout account, saved from the listing modal for produce — the escrow releases the order money into it. */
  payout_upi: string | null;
  bank_account_name: string | null;
  bank_account_no: string | null;
  bank_ifsc: string | null;
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
  /** A business's order (My business): the business, and who in it did the last step. */
  org_id?: string | null;
  handled_by?: string | null;
  /** The true five-step lifecycle: when the farmer accepted the order. */
  accepted_at?: string | null;
  /** The escrow ledger (20261122000000_order_live_gps_escrow.sql). */
  escrow_status?: EscrowStatus | null;
  escrow_locked_at?: string | null;
  escrow_released_at?: string | null;
  /** The seller's live GPS: the exact orchard / pickup point it is dispatched from. */
  seller_live_lat?: number | null;
  seller_live_lng?: number | null;
  seller_gps_accuracy?: number | null;
  seller_live_address?: string | null;
  seller_gps_updated_at?: string | null;
  /** The buyer's live GPS: their exact live destination. */
  buyer_live_lat?: number | null;
  buyer_live_lng?: number | null;
  buyer_gps_accuracy?: number | null;
  buyer_live_address?: string | null;
  buyer_gps_updated_at?: string | null;
  /** The moving shipment's live GPS, streamed by the seller's phone (kr_order_location writes it next to last_*). */
  shipment_live_lat?: number | null;
  shipment_live_lng?: number | null;
  shipment_gps_updated_at?: string | null;
  /** The buyer's delivery confirmation, and the settlement reference written on the escrow ledger when it released. */
  delivered_confirmed_at?: string | null;
  escrow_tx_ref?: string | null;
}

export const SUBCATEGORIES = ['Packaging', 'Fertiliser', 'Pesticide / fungicide', 'Seeds & saplings', 'Tools & machinery', 'Irrigation', 'Anti-hail net', 'Other'];
export const PRODUCE = ['Apple', 'Walnut', 'Almond', 'Cherry', 'Pear', 'Saffron', 'Rice', 'Vegetables', 'Other'];
export const UNITS: MarketUnit[] = ['piece', 'box', 'bag', 'kg', 'quintal', 'litre'];

/** The true five-step lifecycle, exactly as farmer and buyer read it. */
export const ORDER_STATUS: Record<OrderStatus, { label: string; tone: 'amber' | 'blue' | 'violet' | 'green' | 'red' | 'slate' }> = {
  placed: { label: 'Order Placed · Payment in Escrow', tone: 'amber' },
  accepted: { label: 'Accepted by Farmer · Packing', tone: 'violet' },
  shipped: { label: 'On the way · Live GPS Tracking Active', tone: 'blue' },
  delivered: { label: 'Arrived at Buyer Location', tone: 'violet' },
  paid: { label: 'Payment reference recorded — farmer confirming', tone: 'blue' },
  completed: { label: 'Delivered · Escrow Released to Farmer', tone: 'green' },
  cancelled: { label: 'Cancelled', tone: 'slate' },
  rejected: { label: 'Declined by farmer', tone: 'red' },
  disputed: { label: 'Problem reported', tone: 'red' },
};

/** Orders not finished: the farmer's "Orders to act on" counts every one of these. */
export const OPEN_ORDER_STATUSES: OrderStatus[] = ['placed', 'accepted', 'shipped', 'delivered', 'paid', 'disputed'];

const fail = (error: { message?: string; code?: string } | null, fallback: string): never => {
  throw new Error(dbMessage(error, fallback));
};

/** The columns to read: use '*' so a missing migrated column never breaks the query. */
const LISTING = '*';
/** A seller's own products without the photos (heavy): the list reloads every 30 seconds. */
const MY_LISTING = '*';
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
    const p = await supabase.from('market_listings').select('*').in('id', missing.slice(i, i + 20));
    if (p.error) fail(p.error, 'Could not load your products.');
    for (const x of (p.data ?? []) as { id: string; photo: string | null; photo_at: string | null }[]) myPhotos.set(x.id, { at: x.photo_at ?? '', photo: x.photo });
  }
  return rows.map((r) => {
    const row: MarketListing & { photo_at?: string | null } = { ...r, photo: myPhotos.get(r.id)?.photo ?? null };
    delete row.photo_at;
    return row;
  });
}

export type ListingInput = Pick<MarketListing, 'seller_name' | 'phone' | 'district' | 'category' | 'subcategory' | 'product' | 'variety' | 'grade' | 'unit' | 'price' | 'quantity' | 'details' | 'photo' | 'box_capacity_kg' | 'packing_layers' | 'apples_per_box' | 'captured_lat' | 'captured_lng' | 'captured_accuracy_m' | 'captured_address' | 'captured_at_iso' | 'is_live_camera_verified'> & {
  /** Up to three photos; when given, `photo` should be the first. */
  photos?: string[] | null;
  /** A recorded live video (data URL), saved when the database owns the column; otherwise packed into details. */
  video_url?: string | null;
  /** The live GPS locked in the listing modal (fallback: the district pin). Saved into details when the columns are missing. */
  seller_lat?: number | null;
  seller_lng?: number | null;
  seller_location_label?: string | null;
  /** The farmer's payout account saved onto the listing itself (produce — the escrow releases there). */
  payout_upi?: string | null;
  bank_account_name?: string | null;
  bank_account_no?: string | null;
  bank_ifsc?: string | null;
};

/** Parse a missing-column name from a Postgres 42703 or PostgREST PGRST204 error message. */
const missingColumnFromError = (message: string): string | null => {
  const m =
    message.match(/column ["']([^"']+)["'] does not exist/i) ??
    message.match(/the ["']([^"']+)["'] column of/i) ??
    message.match(/column "([^"]+)"/i);
  return m ? m[1] : null;
};

/** Store extended metadata inside the details field so nothing is lost when columns are missing. */
const packExtendedIntoDetails = (dbInput: Record<string, unknown>, extended: Record<string, unknown>): Record<string, unknown> => {
  if (!Object.keys(extended).length) return dbInput;
  const existing = String(dbInput.details ?? '');
  const meta = { ...extended, stored_at: new Date().toISOString() };
  try {
    const prev = existing ? JSON.parse(existing) : {};
    dbInput.details = JSON.stringify({ ...prev, _kr_meta: meta });
  } catch {
    dbInput.details = existing ? `${existing}\n${JSON.stringify(meta)}` : JSON.stringify(meta);
  }
  return dbInput;
};

export async function saveListing(input: ListingInput, id?: string): Promise<void> {
  // Every column goes in as itself: the real database columns carry the real
  // data (box capacity, packing layers, the payout account — all of it). If
  // the remote database is still missing one of them, that column is taken
  // back out, packed into the details text so nothing is lost, and the save
  // tries again — until it goes through.
  const dbInput: Record<string, unknown> = { ...input };
  const extended: Record<string, unknown> = {};
  for (;;) {
    const q = id ? supabase.from('market_listings').update(dbInput).eq('id', id) : supabase.from('market_listings').insert(dbInput);
    const { error } = await q;
    if (!error) return;
    const col = (error.code === 'PGRST204' || error.code === '42703') ? missingColumnFromError(error.message ?? '') : null;
    if (col === null || !(col in dbInput)) throw new Error(dbMessage(error, 'Could not save the product.'));
    extended[col] = dbInput[col];
    delete dbInput[col];
    packExtendedIntoDetails(dbInput, extended);
  }
}

export async function updateListing(id: string, patch: Partial<Pick<MarketListing, 'quantity' | 'price' | 'active'>>): Promise<void> {
  const { error } = await supabase.from('market_listings').update(patch).eq('id', id);
  if (error) fail(error, 'Could not update the product.');
}

export async function deleteListing(id: string): Promise<void> {
  const { error } = await supabase.from('market_listings').delete().eq('id', id);
  if (error) fail(error, 'Could not remove the product.');
}

export interface PlaceOrderInput {
  listing_id: string;
  buyer_name: string;
  buyer_phone: string;
  delivery_address: string;
  quantity: number;
  /** The buyer's live GPS, locked at checkout (the database keeps what the buyer sends on their own order). */
  buyer_live_lat?: number | null;
  buyer_live_lng?: number | null;
  buyer_live_address?: string | null;
}

/** Buyer-GPS columns that may not exist on a not-yet-migrated database: dropped and retried. */
const PLACE_ORDER_FALLBACKS = ['buyer_live_lat', 'buyer_live_lng', 'buyer_live_address'] as const;

export async function placeOrder(input: PlaceOrderInput): Promise<MarketOrder> {
  const row: Record<string, unknown> = { ...input };
  if (!row.delivery_address) delete row.delivery_address;
  // The buyer's live destination doubles as the delivery point.
  if (typeof input.buyer_live_lat === 'number' && typeof input.buyer_live_lng === 'number') {
    row.delivery_lat = input.buyer_live_lat;
    row.delivery_lon = input.buyer_live_lng;
  }
  for (;;) {
    const { data, error } = await supabase.from('market_orders').insert(row).select('*').single();
    if (!error) return data as MarketOrder;
    // A missing migrated column never fails the order: drop just that column and try again.
    const col = (error.code === 'PGRST204' || error.code === '42703') ? missingColumnFromError(error.message ?? '') : null;
    const droppable = col !== null && (PLACE_ORDER_FALLBACKS as readonly string[]).includes(col) && col in row;
    if (!droppable) fail(error, 'Could not place the order.');
    delete row[col!];
  }
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

/** One live GPS fix. */
export interface GpsFix {
  lat: number;
  lng: number;
  accuracy?: number | null;
  address?: string | null;
}

/** The farmer's dispatch-origin GPS: the exact orchard / pickup point, and its live updates (10 s throttle in the database). */
export async function orderSellerGps(id: string, fix: GpsFix): Promise<void> {
  const { error } = await supabase.rpc('kr_order_seller_gps', { p_order: id, p_lat: fix.lat, p_lon: fix.lng, p_accuracy: fix.accuracy ?? null, p_address: fix.address ?? null });
  if (error) fail(error, 'Could not share your live GPS.');
}

/** The buyer's live-destination GPS: where they are now, streamed while the order is open (10 s throttle in the database). */
export async function orderBuyerGps(id: string, fix: GpsFix): Promise<void> {
  const { error } = await supabase.rpc('kr_order_buyer_gps', { p_order: id, p_lat: fix.lat, p_lon: fix.lng, p_accuracy: fix.accuracy ?? null, p_address: fix.address ?? null });
  if (error) fail(error, 'Could not share your live GPS.');
}

/** The farmer's "Arrived at Buyer Location" (their step after dispatch). */
export async function orderArrive(id: string): Promise<void> {
  const { error } = await supabase.rpc('kr_order_arrive', { p_order: id });
  if (error) fail(error, 'Could not mark the order arrived.');
}

/** The buyer confirms delivery received: the escrow releases to the farmer and the order completes. */
export async function orderRelease(id: string): Promise<void> {
  const { error } = await supabase.rpc('kr_order_release', { p_order: id });
  if (error) fail(error, 'Could not release the escrow.');
}
