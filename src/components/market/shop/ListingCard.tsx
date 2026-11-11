'use client';

import { useMemo, useState } from 'react';
import React from 'react';
import { ArrowRight, ImageOff, MapPin, Phone, ShieldCheck, Sparkles, Store } from 'lucide-react';

import { Badge, type PortalTheme } from '@/components/portal/kit';
import { inr } from '@/lib/db/client';
import { amountOf, isNewToday, type ShopListing } from '@/components/market/shop/useLiveListings';
import { CartButton } from '@/components/ui/CartButton';
import { ListingDetailModal } from '@/components/market/shop/ListingDetailModal';
import { SignInToCall } from '@/components/market/SignInToCall';

const ListingCardInner = React.memo(function ListingCardInner({ listing: l, verified, lowest, own, theme, onOrder }: { listing: ShopListing; verified: boolean; /** Cheapest of the kind being compared. */ lowest: boolean; own: boolean; theme: PortalTheme; onOrder: () => void }) {
  const [open, setOpen] = useState(false);

  const totalWeightKg = useMemo(() => l.box_capacity_kg ? Number(l.quantity) * Number(l.box_capacity_kg) : null, [l.quantity, l.box_capacity_kg]);

  return (
    <li className="flex flex-col rounded-2xl bg-white/90 p-5 shadow-sm ring-1 ring-slate-900/5 border border-slate-900/5 transition hover:shadow-md hover:ring-slate-900/10 cursor-pointer [will-change:transform,box-shadow,ring-shadow][transform:translate3d(0,0,0)]" onClick={() => setOpen(true)}>
      {l.photo ? (
        // eslint-disable-next-line @next/next/no-img-element -- seller photo (data URL)
        <img src={l.photo} alt={l.product} className="mb-3 h-36 w-full rounded-xl object-cover cursor-pointer" onClick={(e) => e.stopPropagation()} title="Tap to enlarge" loading="lazy" decoding="async" />
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
      {(l.variety || l.grade || l.packing_layers) && <p className="text-sm text-slate-600">{[l.variety, l.grade && `Grade ${l.grade}`].filter(Boolean).join(l.packing_layers ? ` · ${l.packing_layers}` : ' · ')}</p>}
      <p className="flex items-center gap-1.5 text-sm text-slate-700">
        {verified ? <ShieldCheck className="h-4 w-4 text-emerald-700" aria-hidden /> : <Store className="h-4 w-4 text-slate-400" aria-hidden />}
        {l.seller_name}
        {verified && <Badge tone="green">Verified seller</Badge>}
        {l.is_live_camera_verified && <Badge tone="green">🛡️ Live GPS Verified</Badge>}
      </p>
      <p className="flex items-center gap-1.5 text-sm text-slate-600"><MapPin className="h-4 w-4" aria-hidden /> {l.district}</p>
      {l.details && <p className="mt-2 line-clamp-2 text-sm text-slate-600">{l.details}</p>}
      <div className="mt-auto flex items-end justify-between gap-2 border-t border-slate-900/5 pt-4">
        <div>
          <p className="text-xl font-bold text-slate-900">{inr(l.price)} <span className="text-sm font-normal text-slate-500">/ {l.unit}</span>{l.box_capacity_kg && <span className="text-xs text-emerald-600 font-semibold ml-1">({l.box_capacity_kg} kg/box)</span>}</p>
          <p className="text-xs text-slate-500">{amountOf(Number(l.quantity), l.unit)} in stock{l.box_capacity_kg && ` · ${totalWeightKg!.toLocaleString('en-IN')} kg`}</p>
        </div>
        <div className="flex gap-2">
          {/* Signed out, the number is not sent at all (lib/db/phones). */}
          {l.phone === undefined ? (
            <SignInToCall portal="buyer" />
          ) : (
            l.phone && <a href={`tel:${l.phone}`} aria-label={`Call ${l.seller_name}`} className="grid h-11 w-11 place-items-center rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200" onClick={(e: React.MouseEvent) => e.stopPropagation()}><Phone className="h-4 w-4" aria-hidden /></a>
          )}
          {own ? (
            <span className="cursor-pointer" onClick={(e) => { e.stopPropagation(); setOpen(true); }}>
              <Badge tone="violet">Yours</Badge>
            </span>
          ) : (
            <CartButton doneLabel={null} onClick={() => { onOrder(); }}>Order</CartButton>
          )}
          <ArrowRight className="h-4 w-4 text-slate-400 shrink-0" aria-hidden />
        </div>
      </div>

      {open && (
        <ListingDetailModal
          listing={l}
          verified={verified}
          own={own}
          theme={theme}
          onClose={() => setOpen(false)}
          onOrder={() => { setOpen(false); onOrder(); }}
          // “Manage / Edit My Listing”: the modal closes and the farmer's
          // sell desk opens with this listing's editor.
          onManageListing={() => { setOpen(false); window.location.href = `/farmer/dashboard?tab=sell&edit=${l.id}`; }}
        />
      )}
    </li>
  );
});

export function ListingCard({ listing: l, verified, lowest, own, theme, onOrder }: { listing: ShopListing; verified: boolean; /** Cheapest of the kind being compared. */ lowest: boolean; own: boolean; theme: PortalTheme; onOrder: () => void }) {
  return <ListingCardInner listing={l} verified={verified} lowest={lowest} own={own} theme={theme} onOrder={onOrder} />;
}
