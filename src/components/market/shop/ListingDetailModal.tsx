/**
 * The rich detail window over a produce listing: what it is, who sells it,
 * how much there is and how to buy it — or, when it is your own listing,
 * how to test buying it or manage it.
 */
'use client';

import { useMemo, useState } from 'react';
import { CreditCard, ExternalLink, MapPin, MessageCircle, Phone, ShoppingCart, ShieldCheck } from 'lucide-react';

import { Btn, Badge, Modal, type PortalTheme } from '@/components/portal/kit';
import { inr } from '@/lib/db/client';
import { amountOf, type ShopListing } from '@/components/market/shop/useLiveListings';
import { SignInToCall } from '@/components/market/SignInToCall';

export interface ListingDetailModalProps {
  listing: ShopListing;
  verified: boolean;
  own: boolean;
  theme: PortalTheme;
  onClose: () => void;
  onOrder?: (listing: ShopListing) => void;
  onManageListing?: () => void;
}

export function ListingDetailModal({ listing: l, verified, own, theme, onClose, onOrder, onManageListing }: ListingDetailModalProps) {
  const [qty, setQty] = useState(1);
  const max = Number(l.quantity);
  const total = Number(l.price) * qty;
  const stockText = amountOf(max, l.unit);

  const stockRange = useMemo(() => {
    const n = Math.min(max, 20);
    return Array.from({ length: n }, (_, i) => i + 1);
  }, [max]);

  const whatsapp = `https://wa.me/${String(l.phone).replace(/[^\d+]/g, '')}?text=${encodeURIComponent(`Hi ${l.seller_name}, I want to buy ${qty} ${l.unit} of ${l.product} from KashRoot.`)}`;

  const call = () => {
    if (!l.phone) return;
    if (typeof window !== 'undefined') window.location.href = `tel:${l.phone}`;
  };

  const handleOrder = () => {
    if (onOrder) onOrder(l);
    onClose();
  };

  const handleManage = () => {
    if (onManageListing) onManageListing();
    onClose();
  };

  const isProduce = l.category === 'produce';

  return (
    <Modal open onClose={onClose} title={l.product} wide>
      <div className="grid gap-4">
        {/* Photo row: main photo + a strip of the rest. */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-2xl bg-slate-100 overflow-hidden border border-slate-200 aspect-[4/5]">
            {l.photo ? (
              <img src={l.photo} alt={l.product} className="h-full w-full object-cover cursor-pointer" title="Tap to enlarge" />
            ) : (
              <div className="h-full w-full flex flex-col items-center justify-center text-slate-400 text-sm">
                <span>No photo</span>
              </div>
            )}
          </div>
          {(l.photos ?? []).slice(1, 4).map((p, i) => (
            <div key={i} className="rounded-xl bg-slate-100 overflow-hidden border border-slate-200 aspect-[4/5] cursor-pointer" title="Tap to enlarge">
              <img src={p} alt="" className="h-full w-full object-cover" />
            </div>
          ))}
        </div>

        {/* Identity + verified badge. */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-sky-700">{l.subcategory ?? l.category}</span>
          {verified && <BadgeCheck className="h-4 w-4 text-emerald-700" aria-hidden />}
          {verified && <Badge tone="green">Verified seller</Badge>}
          <span className="text-sm font-semibold text-slate-900">{l.seller_name}</span>
        </div>
        <p className="text-sm text-slate-600"><MapPin className="h-4 w-4 shrink-0" aria-hidden /> {l.district}</p>

        {/* Crop / variety / grade. */}
        {(l.variety || l.grade) && (
          <p className="text-sm text-slate-600">{[l.variety, l.grade && `Grade ${l.grade}`].filter(Boolean).join(' · ')}</p>
        )}

        {/* Price + stock. */}
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-slate-900">{inr(l.price)}</span>
          <span className="text-sm font-normal text-slate-500">/ {l.unit}</span>
        </div>
        <p className="text-sm text-slate-500">{stockText} in stock</p>
        {l.details && <p className="mt-2 line-clamp-3 text-sm text-slate-600">{l.details}</p>}

        <div className="border-t border-slate-900/5 pt-4 mt-4 grid gap-3">
          {own ? (
            <>
              <p className="text-sm font-semibold text-slate-900">This is your active listing</p>
              <div className="flex flex-wrap gap-2">
                <Btn theme={theme} variant="soft" icon={CreditCard} className="min-h-10 text-sm" onClick={() => void handleOrder()}>
                  Preview Buyer Checkout / Test Order Flow
                </Btn>
                <Btn theme={theme} variant="soft" icon={ExternalLink} className="min-h-10 text-sm" onClick={() => void handleManage()}>
                  Manage / Edit My Listing
                </Btn>
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-end gap-1">
                  <label className="text-xs text-slate-500">Quantity ({l.unit})</label>
                  <select
                    value={String(qty)}
                    onChange={(e) => setQty(Math.max(1, Math.min(max, Number(e.target.value))))}
                    className="bg-white border border-slate-200 rounded px-2 py-1.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    {stockRange.map((n) => (
                      <option key={n} value={String(n)}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-500">Total</p>
                  <p className="text-xl font-bold text-emerald-700">{inr(total)}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Btn theme={theme} icon={ShoppingCart} className="flex-1 min-h-11 text-sm" disabled={max <= 0} onClick={() => void handleOrder()}>
                  Buy Now with Escrow
                </Btn>
                {l.phone ? (
                  <Btn theme={theme} variant="soft" icon={Phone} className="min-h-10 text-sm" onClick={call}>
                    Call / WhatsApp Seller
                  </Btn>
                ) : (
                  <SignInToCall portal="buyer" />
                )}
                <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 min-h-10 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition">
                  <MessageCircle className="h-4 w-4 text-emerald-600" aria-hidden />
                  <span>Message on WhatsApp</span>
                </a>
              </div>
              <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-950">
                You pay nothing now. When the goods reach you and you have checked them, press “I received the goods” and pay the seller by UPI.
              </p>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

function BadgeCheck({ className }: { className?: string }) {
  return <ShieldCheck className={className} aria-hidden />;
}
