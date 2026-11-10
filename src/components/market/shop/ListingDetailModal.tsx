/**
 * The rich detail window over a produce listing: what it is, who sells it,
 * how much there is and how to buy it — or, when it is your own listing,
 * how to test buying it or manage it.
 */
'use client';

import { useMemo, useState } from 'react';
import React from 'react';
import dynamic from 'next/dynamic';
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

const FarmMap = dynamic(() => import('@/components/market/shop/FarmMap'), {
  ssr: false,
  loading: () => <div className="h-56 w-full animate-pulse rounded-xl bg-slate-100" aria-hidden />,
});

const ListingDetailModalInner = React.memo(function ListingDetailModalInner({ listing: l, verified, own, theme, onClose, onOrder, onManageListing }: ListingDetailModalProps) {
  const [qty, setQty] = useState(1);
  const max = Number(l.quantity);
  const stockText = amountOf(max, l.unit);

  const stockRange = useMemo(() => {
    const n = Math.min(max, 20);
    return Array.from({ length: n }, (_, i) => i + 1);
  }, [max]);

  const total = useMemo(() => Number(l.price) * qty, [l.price, qty]);
  const totalWeightKg = useMemo(() => l.box_capacity_kg ? Number(l.quantity) * Number(l.box_capacity_kg) : null, [l.quantity, l.box_capacity_kg]);
  const pricePerKg = useMemo(() => l.box_capacity_kg && Number(l.price) > 0 ? Number(l.price) / Number(l.box_capacity_kg) : null, [l.price, l.box_capacity_kg]);

  const whatsapp = useMemo(() => `https://wa.me/${String(l.phone).replace(/[^\d+]/g, '')}?text=${encodeURIComponent(`Hi ${l.seller_name}, I want to buy ${qty} ${l.unit} of ${l.product} from KashRoot.`)}`, [l.phone, l.seller_name, l.unit, l.product, qty]);

  const call = useMemo(() => {
    return () => {
      if (!l.phone) return;
      if (typeof window !== 'undefined') window.location.href = `tel:${l.phone}`;
    };
  }, [l.phone]);

  const handleOrder = useMemo(() => {
    return () => {
      if (onOrder) onOrder(l);
      onClose();
    };
  }, [l, onOrder, onClose]);

  const handleManage = useMemo(() => {
    return () => {
      if (onManageListing) onManageListing();
      onClose();
    };
  }, [onManageListing, onClose]);

  const isProduce = l.category === 'produce';

  return (
    <Modal open onClose={onClose} title={l.product} wide>
      <div className="grid gap-4">
        {/* Photo row: main photo + a strip of the rest. */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-2xl bg-slate-100 overflow-hidden border border-slate-200 aspect-[4/5]">
            {l.photo ? (
              <img src={l.photo} alt={l.product} className="h-full w-full object-cover cursor-pointer" title="Tap to enlarge" loading="lazy" decoding="async" />
            ) : (
              <div className="h-full w-full flex flex-col items-center justify-center text-slate-400 text-sm">
                <span>No photo</span>
              </div>
            )}
          </div>
          {(l.photos ?? []).slice(1, 4).map((p, i) => (
            <div key={i} className="rounded-xl bg-slate-100 overflow-hidden border border-slate-200 aspect-[4/5] cursor-pointer" title="Tap to enlarge">
              <img src={p} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
            </div>
          ))}
        </div>

        {/* Identity + verified badge. */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-sky-700">{l.subcategory ?? l.category}</span>
          {verified && <BadgeCheck className="h-4 w-4 text-emerald-700" aria-hidden />}
          {verified && <Badge tone="green">Verified seller</Badge>}
          {l.is_live_camera_verified && <Badge tone="green">🛡️ Live Camera & GPS Verified at Orchard</Badge>}
          <span className="text-sm font-semibold text-slate-900">{l.seller_name}</span>
        </div>
        {l.is_live_camera_verified && l.captured_address && (
          <p className="text-xs text-slate-500"><MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden /> {l.captured_address} · ±{l.captured_accuracy_m?.toFixed(0)}m · {new Date(l.captured_at_iso ?? '').toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
        )}
        {/* The exact orchard spot the live photo/video was taken — the same map
            for farmer and buyer, with the GPS lock from the capture itself. */}
        {l.is_live_camera_verified && l.captured_lat != null && l.captured_lng != null && (
          <figure className="grid gap-1.5">
            <FarmMap lat={Number(l.captured_lat)} lng={Number(l.captured_lng)} label="Live camera capture point" />
            <figcaption className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
              <span>📍 Farm gate on the map — where the live photo was taken, shown the same to farmer and buyer.</span>
              <a href={`https://www.google.com/maps?q=${l.captured_lat},${l.captured_lng}`} target="_blank" rel="noopener noreferrer" className="font-semibold text-emerald-700 underline underline-offset-2">Open in Google Maps</a>
            </figcaption>
          </figure>
        )}
        <p className="text-sm text-slate-600"><MapPin className="h-4 w-4 shrink-0" aria-hidden /> {l.district}</p>

        {/* Crop / variety / grade. */}
        {(l.variety || l.grade || l.packing_layers) && (
          <p className="text-sm text-slate-600">{[l.variety, l.grade && `Grade ${l.grade}`, l.packing_layers].filter(Boolean).join(' · ')}</p>
        )}

        {/* Price + stock. */}
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-slate-900">{inr(l.price)}</span>
          <span className="text-sm font-normal text-slate-500">/ {l.unit}</span>{l.box_capacity_kg && <span className="text-xs text-emerald-600 font-semibold ml-2">({l.box_capacity_kg} kg / box)</span>}
        </div>
        <p className="text-sm text-slate-500">{stockText} in stock{l.box_capacity_kg ? ` · ${totalWeightKg!.toLocaleString('en-IN')} kg total` : ''}</p>
        {l.details && <p className="mt-2 line-clamp-3 text-sm text-slate-600">{l.details}</p>}

        {/* Packing specs for produce */}
        {(l.box_capacity_kg || l.packing_layers || l.apples_per_box) && (
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
            <p className="text-xs font-semibold text-slate-700 mb-1">Box specifications</p>
            <div className="grid grid-cols-2 gap-2 text-sm">
              {l.box_capacity_kg && (
                <div className="flex items-center gap-1">
                  <span className="text-slate-500">Box capacity:</span>
                  <span className="font-semibold text-slate-900">{l.box_capacity_kg} kg</span>
                </div>
              )}
              {l.packing_layers && (
                <div className="flex items-center gap-1">
                  <span className="text-slate-500">Packing:</span>
                  <span className="font-semibold text-slate-900">{l.packing_layers}</span>
                </div>
              )}
              {l.apples_per_box && (
                <div className="flex items-center gap-1">
                  <span className="text-slate-500">Apples per box:</span>
                  <span className="font-semibold text-slate-900">{l.apples_per_box}</span>
                </div>
              )}
              {l.box_capacity_kg && l.quantity > 0 && (
                <div className="flex items-center gap-1">
                  <span className="text-slate-500">Total weight:</span>
                  <span className="font-semibold text-slate-900">${totalWeightKg!.toLocaleString('en-IN')} kg</span>
                </div>
              )}
              {l.box_capacity_kg && Number(l.price) > 0 && (
                <div className="flex items-center gap-1">
                  <span className="text-slate-500">Rate per kg:</span>
                  <span className="font-semibold text-emerald-700">₹${pricePerKg!.toFixed(2)}</span>
                </div>
              )}
            </div>
          </div>
        )}

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
});

export function ListingDetailModal({ listing: l, verified, own, theme, onClose, onOrder, onManageListing }: ListingDetailModalProps) {
  return <ListingDetailModalInner listing={l} verified={verified} own={own} theme={theme} onClose={onClose} onOrder={onOrder} onManageListing={onManageListing} />;
}

function BadgeCheck({ className }: { className?: string }) {
  return <ShieldCheck className={className} aria-hidden />;
}
