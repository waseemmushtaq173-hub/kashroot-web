'use client';

/**
 * A seller's or dealer's side of the marketplace: their products (stock,
 * price, hide / remove), orders received with the next step, and where
 * buyers pay them. Used by the Seller portal and Price Comparison.
 */
import { useCallback, useEffect, useState } from 'react';
import { Boxes, CheckCircle2, Loader2, Minus, Package, Pencil, Plus, PlusCircle, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { OrderCard } from '@/components/market/OrderCard';
import { ProductForm, productProblem } from '@/components/market/ProductForm';
import { PayoutForm } from '@/components/payments/PayoutForm';
import { Badge, Btn, EmptyState, Modal, Panel, type PortalTheme } from '@/components/portal/kit';
import { inr, type Account } from '@/lib/db/client';
import { deleteListing, myListings, saveListing, sellerOrders, updateListing, type ListingInput, type MarketListing, type MarketOrder } from '@/lib/db/market';
import { myPayout, type PayoutAccount } from '@/lib/db/rentals';

export function blankProduct(account: Account): ListingInput {
  return { seller_name: account.business || account.name, phone: account.phone, district: account.district, category: 'supplies', subcategory: 'Packaging', product: '', variety: '', grade: '', unit: 'piece', price: 0, quantity: 0, details: '', photo: null };
}

export function SellerDesk({ account, theme, show = 'all', onLoaded }: { account: Account; theme: PortalTheme; show?: 'all' | 'products' | 'orders' | 'payouts'; onLoaded?: (products: MarketListing[], orders: MarketOrder[]) => void }) {
  const [products, setProducts] = useState<MarketListing[] | null>(null);
  const [orders, setOrders] = useState<MarketOrder[]>([]);
  const [payout, setPayout] = useState<PayoutAccount | null | undefined>(undefined);
  const [editing, setEditing] = useState<{ id?: string; data: ListingInput } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [p, o] = await Promise.all([myListings(account.id), sellerOrders(account.id)]);
      setProducts(p);
      setOrders(o);
      setError(null);
      onLoaded?.(p, o);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load.');
      setProducts([]);
    }
  }, [account.id, onLoaded]);

  useEffect(() => {
    let live = true;
    const run = async () => {
      if (live) await reload();
    };
    void run();
    void myPayout(account.id).then((p) => live && setPayout(p)).catch(() => live && setPayout(null));
    const id = window.setInterval(() => void run(), 30000);
    return () => {
      live = false;
      window.clearInterval(id);
    };
  }, [account.id, reload]);

  const run = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    if (!editing) return;
    const problem = productProblem(editing.data);
    if (problem) return toast.error(problem);
    void run(async () => {
      await saveListing({ ...editing.data, product: editing.data.product.trim(), phone: editing.data.phone.replace(/\s/g, ''), variety: editing.data.variety || null, grade: editing.data.grade || null, details: editing.data.details || null }, editing.id);
      setEditing(null);
    }, editing.id ? 'Product updated' : 'Listed — buyers can now compare and order it');
  };

  if (error) return <p role="alert" className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-800 ring-1 ring-rose-200">{error}</p>;
  if (products === null) return <p className="flex items-center gap-2 text-slate-600"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…</p>;

  const waiting = orders.filter((o) => ['placed', 'paid'].includes(o.status));
  const others = orders.filter((o) => !['placed', 'paid'].includes(o.status));

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {(show === 'all' || show === 'orders') && (
        <Panel theme={theme} title="Orders to act on" icon={CheckCircle2} className="lg:col-span-2">
          {waiting.length === 0 && others.length === 0 ? (
            <EmptyState theme={theme} icon={Package} title="No orders yet" text="When a buyer orders one of your products, it appears here. Accept it, ship it, and confirm when the money reaches you." />
          ) : (
            <ul className="space-y-3">
              {[...waiting, ...others].map((o) => <OrderCard key={o.id} order={o} as="seller" theme={theme} onChange={() => void reload()} />)}
            </ul>
          )}
        </Panel>
      )}

      {(show === 'all' || show === 'products') && (
        <Panel theme={theme} title="My products" icon={Boxes} className={show === 'products' ? 'lg:col-span-2' : ''} action={<Btn theme={theme} size="sm" icon={PlusCircle} onClick={() => setEditing({ data: blankProduct(account) })}>Add product</Btn>}>
          {products.length === 0 ? (
            <EmptyState theme={theme} icon={Boxes} title="Nothing listed yet" text="Add your products with price and stock. They appear on Price Comparison for buyers and farmers right away." />
          ) : (
            <ul className="space-y-3">
              {products.map((p) => {
                const step = p.unit === 'piece' || p.unit === 'box' ? 10 : 1;
                return (
                  <li key={p.id} className="rounded-2xl bg-white/85 p-4 ring-1 ring-slate-900/5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-xs text-slate-500">{p.subcategory ?? p.category}</p>
                        <p className="font-semibold text-slate-900">{p.product}{p.variety ? ` · ${p.variety}` : ''}</p>
                        <p className="text-sm text-slate-700"><strong>{inr(p.price)}</strong> per {p.unit}</p>
                      </div>
                      {!p.active ? <Badge tone="slate">Hidden</Badge> : p.quantity === 0 ? <Badge tone="red">Out of stock</Badge> : <Badge tone="green">On Price Comparison</Badge>}
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className="text-sm text-slate-600">Stock:</span>
                      <button type="button" aria-label={`${step} fewer`} disabled={busy} onClick={() => void run(() => updateListing(p.id, { quantity: Math.max(0, Number(p.quantity) - step) }), 'Stock updated')} className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg bg-slate-100 hover:bg-slate-200"><Minus className="h-4 w-4" aria-hidden /></button>
                      <span className="min-w-[4rem] text-center font-bold tabular-nums">{Number(p.quantity).toLocaleString('en-IN')}</span>
                      <button type="button" aria-label={`${step} more`} disabled={busy} onClick={() => void run(() => updateListing(p.id, { quantity: Number(p.quantity) + step }), 'Stock updated')} className="grid h-8 w-8 cursor-pointer place-items-center rounded-lg bg-slate-100 hover:bg-slate-200"><Plus className="h-4 w-4" aria-hidden /></button>
                      <span className="text-sm text-slate-500">{p.unit}</span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Btn theme={theme} size="sm" variant="soft" icon={Pencil} onClick={() => setEditing({ id: p.id, data: { seller_name: p.seller_name, phone: p.phone, district: p.district, category: p.category, subcategory: p.subcategory, product: p.product, variety: p.variety ?? '', grade: p.grade ?? '', unit: p.unit, price: Number(p.price), quantity: Number(p.quantity), details: p.details ?? '', photo: p.photo } })}>Edit</Btn>
                      <Btn theme={theme} size="sm" variant="ghost" disabled={busy} onClick={() => void run(() => updateListing(p.id, { active: !p.active }), p.active ? 'Hidden from buyers' : 'Visible again')}>{p.active ? 'Hide' : 'Show again'}</Btn>
                      <Btn theme={theme} size="sm" variant="danger" icon={Trash2} disabled={busy} onClick={() => { if (window.confirm(`Remove ${p.product}?`)) void run(() => deleteListing(p.id), 'Removed'); }}>Remove</Btn>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      )}

      {(show === 'all' || show === 'payouts') && (
        <PayoutForm theme={theme} payout={payout} onSaved={setPayout} intro="Buyers pay you here after they receive the goods. Only a buyer with a live order sees these details." />
      )}

      {editing && (
        <Modal
          open
          wide
          onClose={() => setEditing(null)}
          title={editing.id ? 'Edit product' : 'Add a product'}
          footer={
            <>
              <Btn theme={theme} variant="ghost" onClick={() => setEditing(null)}>Cancel</Btn>
              <Btn theme={theme} icon={CheckCircle2} disabled={busy} onClick={save}>Save</Btn>
            </>
          }
        >
          <ProductForm value={editing.data} onChange={(data) => setEditing({ ...editing, data })} />
        </Modal>
      )}
    </div>
  );
}
