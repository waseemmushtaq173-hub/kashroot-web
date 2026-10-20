'use client';

/**
 * One farm tool or input in the Kissan Tools shop: the seller's photo (tap
 * to see it big), what it is, the price per unit, stock, who sells it and
 * from where, and "Add to cart". A product without a photo says so — no
 * stand-in picture.
 */
import { BadgeCheck, ImageOff, MapPin, Phone, ShoppingCart, Store } from 'lucide-react';

import { amountOf, type ShopListing } from '@/components/market/shop/useLiveListings';
import { Badge, Btn, type PortalTheme } from '@/components/portal/kit';
import { inr } from '@/lib/db/client';

export function ProductPhoto({ listing: l, className = 'h-48' }: { listing: Pick<ShopListing, 'photo' | 'product'>; className?: string }) {
  if (l.photo === undefined) return <div aria-hidden className={`${className} w-full animate-pulse bg-slate-100`} />;
  if (!l.photo) {
    return (
      <div className={`${className} flex w-full flex-col items-center justify-center gap-1.5 bg-slate-50 text-sm text-slate-500`}>
        <ImageOff className="h-8 w-8 text-slate-400" aria-hidden /> No photo yet
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element -- seller photo (data URL)
  return <img src={l.photo} alt={l.product} className={`${className} w-full object-cover`} />;
}

export function ProductCard({ listing: l, verified, own, inCart, theme, onAdd, onOpen }: {
  listing: ShopListing;
  verified: boolean;
  /** The signed-in person's own product. */
  own: boolean;
  /** How many are in the cart already. */
  inCart: number;
  theme: PortalTheme;
  onAdd: () => void;
  onOpen: () => void;
}) {
  const phone = l.phone.replace(/\D/g, '').slice(-10);
  return (
    <li className="flex flex-col overflow-hidden rounded-2xl bg-white/90 shadow-sm ring-1 ring-slate-900/5">
      {l.photo ? (
        <button type="button" onClick={onOpen} aria-label={`See the photos of ${l.product}`} className="block cursor-zoom-in">
          <ProductPhoto listing={l} />
        </button>
      ) : (
        <ProductPhoto listing={l} />
      )}
      <div className="flex flex-1 flex-col p-4">
        <p className="text-xs font-bold uppercase tracking-wider text-orange-800">{l.subcategory ?? 'Farm input'}</p>
        <h3 className="mt-0.5 text-lg font-semibold leading-snug text-slate-900">
          <button type="button" onClick={onOpen} className="cursor-pointer text-left hover:underline">{l.product}</button>
        </h3>
        {(l.variety || l.grade) && <p className="text-sm text-slate-600">{[l.variety, l.grade && `Grade ${l.grade}`].filter(Boolean).join(' · ')}</p>}
        <p className="mt-2 text-2xl font-bold text-slate-900">
          {inr(l.price)} <span className="text-sm font-normal text-slate-500">per {l.unit}</span>
        </p>
        <p className="text-sm text-slate-600">{amountOf(Number(l.quantity), l.unit)} in stock</p>
        <p className="mt-2 flex flex-wrap items-center gap-1.5 text-sm text-slate-700">
          {verified ? <BadgeCheck className="h-4 w-4 text-emerald-600" aria-hidden /> : <Store className="h-4 w-4 text-slate-400" aria-hidden />}
          {l.seller_name}
          {verified && <Badge tone="green">Verified seller</Badge>}
        </p>
        <p className="flex items-center gap-1.5 text-sm text-slate-600"><MapPin className="h-4 w-4" aria-hidden /> {l.district}</p>
        <div className="mt-auto flex items-center gap-2 pt-4">
          {own ? (
            <Badge tone="violet">Your product</Badge>
          ) : (
            <Btn theme={theme} icon={ShoppingCart} className="min-h-11 flex-1" onClick={onAdd}>
              {inCart ? `Add one more (${inCart} in cart)` : 'Add to cart'}
            </Btn>
          )}
          {/^[6-9]\d{9}$/.test(phone) && (
            <a href={`tel:+91${phone}`} aria-label={`Call ${l.seller_name}`} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200">
              <Phone className="h-4 w-4" aria-hidden />
            </a>
          )}
        </div>
      </div>
    </li>
  );
}
