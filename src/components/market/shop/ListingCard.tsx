'use client';

/** One product in a shop: photo, what it is, who sells it, the price and Order. */
import { BadgeCheck, ImageOff, MapPin, Phone, Sparkles, Store } from 'lucide-react';

import { Badge, type PortalTheme } from '@/components/portal/kit';
import { inr } from '@/lib/db/client';
import { amountOf, isNewToday, type ShopListing } from '@/components/market/shop/useLiveListings';
import { CartButton } from '@/components/ui/CartButton';
import { SignInToCall } from '@/components/market/SignInToCall';

export function ListingCard({ listing: l, verified, lowest, own, onOrder }: { listing: ShopListing; verified: boolean; /** Cheapest of the kind being compared. */ lowest: boolean; own: boolean; theme: PortalTheme; onOrder: () => void }) {
  return (
    <li className="flex flex-col rounded-2xl bg-white/90 p-5 shadow-sm ring-1 ring-slate-900/5">
      {l.photo ? (
        // eslint-disable-next-line @next/next/no-img-element -- seller photo (data URL)
        <img src={l.photo} alt={l.product} className="mb-3 h-36 w-full rounded-xl object-cover" />
      ) : (
        // One box while the photo is coming and when there is none (the same element, so the
        // browser sees nothing move): a soft pulse, then "No photo yet".
        <div aria-hidden={l.photo === undefined} className={`mb-3 flex h-36 w-full items-center justify-center gap-1.5 rounded-xl text-sm text-slate-500 ${l.photo === undefined ? 'animate-pulse bg-slate-100' : 'bg-slate-50 ring-1 ring-slate-900/5'}`}>
          {l.photo === null && (
            <>
              <ImageOff className="h-4 w-4" aria-hidden /> No photo yet
            </>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold uppercase tracking-wider text-sky-700">{l.subcategory ?? l.category}</span>
        {lowest && <Badge tone="green">Lowest price</Badge>}
        {isNewToday(l) && <Badge tone="amber"><Sparkles className="h-3 w-3" aria-hidden /> New today</Badge>}
      </div>
      <h3 className="mt-1 font-display text-lg font-semibold text-slate-900">{l.product}</h3>
      {(l.variety || l.grade) && <p className="text-sm text-slate-600">{[l.variety, l.grade && `Grade ${l.grade}`].filter(Boolean).join(' · ')}</p>}
      <p className="mt-2 flex flex-wrap items-center gap-1.5 text-sm text-slate-700">
        {verified ? <BadgeCheck className="h-4 w-4 text-emerald-700" aria-hidden /> : <Store className="h-4 w-4 text-slate-400" aria-hidden />}
        {l.seller_name}
        {verified && <Badge tone="green">Verified seller</Badge>}
      </p>
      <p className="flex items-center gap-1.5 text-sm text-slate-600"><MapPin className="h-4 w-4" aria-hidden /> {l.district}</p>
      {l.details && <p className="mt-2 line-clamp-2 text-sm text-slate-600">{l.details}</p>}
      <div className="mt-auto flex items-end justify-between gap-2 border-t border-slate-900/5 pt-4">
        <div>
          <p className="text-xl font-bold text-slate-900">{inr(l.price)} <span className="text-sm font-normal text-slate-500">/ {l.unit}</span></p>
          <p className="text-xs text-slate-500">{amountOf(Number(l.quantity), l.unit)} in stock</p>
        </div>
        <div className="flex gap-2">
          {/* Signed out, the number is not sent at all (lib/db/phones). */}
          {l.phone === undefined ? (
            <SignInToCall portal="buyer" />
          ) : (
            l.phone && <a href={`tel:${l.phone}`} aria-label={`Call ${l.seller_name}`} className="grid h-11 w-11 place-items-center rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200"><Phone className="h-4 w-4" aria-hidden /></a>
          )}
          {own ? <Badge tone="violet">Yours</Badge> : <CartButton doneLabel={null} onClick={onOrder}>Order</CartButton>}
        </div>
      </div>
    </li>
  );
}
