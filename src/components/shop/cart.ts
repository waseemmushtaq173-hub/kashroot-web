'use client';

/**
 * The Kissan Tools cart: product ids and how many, kept on this phone until
 * the order is sent (each seller gets one order). Prices, stock and names
 * always come from the live listings, never from what was saved here.
 */
import { UNIT_PLURAL, amountOf, type ShopListing } from '@/components/market/shop/useLiveListings';
import type { MarketUnit } from '@/lib/db/market';

export interface CartLine {
  listing_id: string;
  qty: number;
}

export const CART_KEY = 'kr_shop_cart';
export const EMPTY_CART: CartLine[] = [];

/** Units sold whole: nobody orders half a bag. */
export const WHOLE: MarketUnit[] = ['box', 'piece', 'bag'];

/** What is wrong with this quantity, in words the buyer can act on; null when fine. */
export function qtyProblem(l: Pick<ShopListing, 'product' | 'unit' | 'quantity'>, qty: number): string | null {
  const stock = Number(l.quantity);
  if (!(qty > 0)) return `Write how many ${UNIT_PLURAL[l.unit]} of ${l.product} you want (1 or more).`;
  if (WHOLE.includes(l.unit) && !Number.isInteger(qty)) return `Write a whole number of ${UNIT_PLURAL[l.unit]} for ${l.product}, for example 2.`;
  if (qty > stock) return `The seller has only ${amountOf(stock, l.unit)} of ${l.product}. Write ${stock.toLocaleString('en-IN')} or less.`;
  return null;
}

/** Old sample cart and orders this page used to keep on the phone: never shown again. */
export function forgetSampleShop() {
  try {
    localStorage.removeItem('kr_kissan_cart');
    localStorage.removeItem('kr_kissan_orders');
  } catch {
    /* private mode: nothing kept */
  }
}
