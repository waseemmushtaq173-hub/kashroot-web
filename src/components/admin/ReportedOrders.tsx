'use client';

/**
 * Admin → Problems: orders a buyer pressed "Report a problem" on
 * (market_orders, status "disputed" — admins may read these). KashRoot does
 * not hold the money, so the admin's job is to call both sides and help them
 * settle it; the buyer's note and both phone numbers are here.
 */
import { useCallback, useEffect, useState } from 'react';
import { Loader2, PackageX, Phone } from 'lucide-react';

import { EmptyState, Panel, PORTAL_THEMES } from '@/components/portal/kit';
import { ago, dbMessage, inr, supabase } from '@/lib/db/client';

const theme = PORTAL_THEMES.admin ?? PORTAL_THEMES.expert;

export interface ReportedOrder {
  id: string;
  product: string;
  quantity: number;
  unit: string;
  amount: number;
  buyer_name: string;
  buyer_phone: string;
  buyer_note: string | null;
  delivery_address: string;
  payment_ref: string | null;
  created_at: string;
  market_listings: { seller_name: string; phone: string } | null;
}

export async function loadReportedOrders(): Promise<ReportedOrder[]> {
  const { data, error } = await supabase
    .from('market_orders')
    .select('id, product, quantity, unit, amount, buyer_name, buyer_phone, buyer_note, delivery_address, payment_ref, created_at, market_listings(seller_name, phone)')
    .eq('status', 'disputed')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw new Error(dbMessage(error, 'Could not load reported orders.'));
  return (data ?? []) as unknown as ReportedOrder[];
}

export function ReportedOrders() {
  const [orders, setOrders] = useState<ReportedOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setOrders(await loadReportedOrders());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load reported orders.');
      setOrders([]);
    }
  }, []);

  useEffect(() => {
    let live = true;
    const run = async () => {
      if (live) await load();
    };
    void run();
    return () => {
      live = false;
    };
  }, [load]);

  return (
    <Panel theme={theme} title="Orders with a problem" icon={PackageX}>
      <p className="mb-4 text-sm text-slate-600">A buyer pressed “Report a problem” on these. KashRoot does not hold the money — call both sides and help them settle it.</p>
      {orders === null ? (
        <p className="flex items-center gap-2 text-slate-600"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…</p>
      ) : error ? (
        <p role="alert" className="text-rose-800">{error}</p>
      ) : orders.length === 0 ? (
        <EmptyState theme={theme} icon={PackageX} title="No problems reported" text="When a buyer reports a problem with an order, it appears here with both phone numbers." />
      ) : (
        <ul className="space-y-3">
          {orders.map((o) => (
            <li key={o.id} className="rounded-2xl bg-white/85 p-4 text-sm ring-1 ring-slate-900/5">
              <p className="font-semibold text-slate-900">{o.quantity} {o.unit} · {o.product} · {inr(o.amount)} <span className="text-xs font-normal text-slate-500">{ago(o.created_at)}</span></p>
              {o.buyer_note && <p className="mt-1 text-rose-800">“{o.buyer_note}”</p>}
              <p className="mt-2 text-slate-700">
                Buyer: {o.buyer_name} · <a href={`tel:${o.buyer_phone}`} className="inline-flex items-center gap-1 font-semibold text-sky-800"><Phone className="h-3.5 w-3.5" aria-hidden /> {o.buyer_phone}</a>
              </p>
              {o.market_listings && (
                <p className="text-slate-700">
                  Seller: {o.market_listings.seller_name} · <a href={`tel:${o.market_listings.phone}`} className="inline-flex items-center gap-1 font-semibold text-sky-800"><Phone className="h-3.5 w-3.5" aria-hidden /> {o.market_listings.phone}</a>
                </p>
              )}
              <p className="text-xs text-slate-500">Deliver to: {o.delivery_address}{o.payment_ref ? ` · Payment reference: ${o.payment_ref}` : ' · Not paid yet'}</p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
