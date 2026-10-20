'use client';

/**
 * A product seen big: every photo the seller added (up to three), the price,
 * stock, seller and the seller's details, with "Add to cart".
 */
import { useEffect, useState } from 'react';
import { Loader2, MapPin, ShoppingCart } from 'lucide-react';

import { amountOf, type ShopListing } from '@/components/market/shop/useLiveListings';
import { Btn, Modal, type PortalTheme } from '@/components/portal/kit';
import { ProductPhoto } from '@/components/shop/ProductCard';
import { inr } from '@/lib/db/client';
import { listingPhotos } from '@/lib/db/shop';

export function PhotoViewer({ listing: l, own, theme, onAdd, onClose }: { listing: ShopListing; own: boolean; theme: PortalTheme; onAdd: () => void; onClose: () => void }) {
  const [photos, setPhotos] = useState<string[] | null>(null);
  const [shown, setShown] = useState(0);

  useEffect(() => {
    let live = true;
    listingPhotos(l.id)
      .then((p) => live && setPhotos(p))
      .catch(() => live && setPhotos(l.photo ? [l.photo] : []));
    return () => {
      live = false;
    };
  }, [l.id, l.photo]);

  const list = photos ?? (l.photo ? [l.photo] : []);
  const big = list[Math.min(shown, Math.max(0, list.length - 1))];

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={l.product}
      footer={
        <>
          <Btn theme={theme} variant="ghost" className="min-h-11" onClick={onClose}>Close</Btn>
          {!own && <Btn theme={theme} icon={ShoppingCart} className="min-h-11" onClick={onAdd}>Add to cart</Btn>}
        </>
      }
    >
      <div className="space-y-4">
        {big ? (
          // eslint-disable-next-line @next/next/no-img-element -- seller photo (data URL)
          <img src={big} alt={`${l.product}, photo ${shown + 1}`} className="max-h-[55svh] w-full rounded-2xl bg-slate-100 object-contain" />
        ) : (
          <div className="overflow-hidden rounded-2xl"><ProductPhoto listing={{ ...l, photo: null }} className="h-56" /></div>
        )}
        {photos === null && l.photo && <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading more photos…</p>}
        {list.length > 1 && (
          <div className="flex gap-2" role="group" aria-label="Photos">
            {list.map((src, i) => (
              <button key={i} type="button" onClick={() => setShown(i)} aria-label={`Photo ${i + 1}`} aria-pressed={i === shown} className={`h-16 w-16 cursor-pointer overflow-hidden rounded-xl ring-2 ${i === shown ? 'ring-orange-600' : 'ring-transparent'}`}>
                {/* eslint-disable-next-line @next/next/no-img-element -- seller photo (data URL) */}
                <img src={src} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        )}
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-orange-800">{l.subcategory ?? 'Farm input'}</p>
          {(l.variety || l.grade) && <p className="text-sm text-slate-600">{[l.variety, l.grade && `Grade ${l.grade}`].filter(Boolean).join(' · ')}</p>}
          <p className="mt-1 text-2xl font-bold text-slate-900">{inr(l.price)} <span className="text-sm font-normal text-slate-500">per {l.unit}</span></p>
          <p className="text-sm text-slate-600">{amountOf(Number(l.quantity), l.unit)} in stock</p>
          <p className="mt-2 flex items-center gap-1.5 text-sm text-slate-700"><MapPin className="h-4 w-4" aria-hidden /> {l.seller_name}, {l.district}</p>
          {l.details && <p className="mt-2 whitespace-pre-line text-sm text-slate-700">{l.details}</p>}
        </div>
      </div>
    </Modal>
  );
}
