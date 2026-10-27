'use client';

/**
 * A seller's or dealer's side of the marketplace: their products (stock,
 * price, hide / remove), orders received with the next step, and where
 * buyers pay them. Used by the Farmer portal (What I sell), the Agro-dealer
 * portal (Price Comparison tab) and Price Comparison itself — everything
 * listed here is on the one shared Price Comparison, and farm tools and
 * inputs are also in the Kissan Tools shop. Kissan Tools orders (pay first,
 * possibly several products in one order) show as one card per order.
 * With no signal, a new listing in the Farmer portal is kept as a draft and
 * saved hidden from buyers when the signal is back (components/pwa); it is
 * never put on sale offline.
 */
import { useCallback, useEffect, useState } from 'react';
import { Banknote, Boxes, CheckCircle2, ImageOff, Loader2, Minus, Package, Pencil, Plus, PlusCircle, Trash2 } from 'lucide-react';
import { toast } from '@/lib/client/toast';

import { OrderCard } from '@/components/market/OrderCard';
import { ProductForm, productProblem } from '@/components/market/ProductForm';
import { PayoutForm } from '@/components/payments/PayoutForm';
import { Badge, Btn, EmptyState, Modal, Panel, type PortalTheme } from '@/components/portal/kit';
import { isOfflineError, NEEDS_INTERNET, offlineNow, useOnline } from '@/components/pwa/net';
import { keepListingDraft, OUTBOX_SENT } from '@/components/pwa/outboxSend';
import { inr, type Account } from '@/lib/db/client';
import { deleteListing, myListings, saveListing, sellerOrders, updateListing, type ListingInput, type MarketCategory, type MarketListing, type MarketOrder } from '@/lib/db/market';
import { myPayout, type PayoutAccount } from '@/lib/db/rentals';
import { groupBaskets, listingPhotos, sellerMustAct } from '@/lib/db/shop';

export function blankProduct(account: Account, category: MarketCategory = 'supplies'): ListingInput {
  const produce = category === 'produce';
  return { seller_name: account.business || account.name, phone: account.phone, district: account.district, category, subcategory: produce ? 'Apple' : 'Packaging', product: '', variety: '', grade: '', unit: produce ? 'box' : 'piece', price: 0, quantity: 0, details: '', photo: null };
}

export function SellerDesk({ account, theme, show = 'all', category = 'supplies', mixed = false, addRequest = 0, addDraft, onLoaded }: { account: Account; theme: PortalTheme; /** 'sell': orders and products (payout details shown elsewhere). */ show?: 'all' | 'sell' | 'products' | 'orders' | 'payouts'; category?: MarketCategory; /** Farmer portal: produce and farm inputs side by side. */ mixed?: boolean; addRequest?: number; /** Filled into the form that addRequest opens (e.g. a dealer's batch). */ addDraft?: Partial<ListingInput>; onLoaded?: (products: MarketListing[], orders: MarketOrder[]) => void }) {
  const [products, setProducts] = useState<MarketListing[] | null>(null);
  const [orders, setOrders] = useState<MarketOrder[]>([]);
  const [payout, setPayout] = useState<PayoutAccount | null | undefined>(undefined);
  const [editing, setEditing] = useState<{ id?: string; data: ListingInput } | null>(null);
  const [busy, setBusy] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The list could not load for want of signal (what was shown stays).
  const [noSignal, setNoSignal] = useState(false);
  const online = useOnline();
  // Bumping addRequest (e.g. a "List produce" button outside) opens the form.
  const [seenAdd, setSeenAdd] = useState(0);
  if (addRequest !== seenAdd) {
    setSeenAdd(addRequest);
    if (addRequest > 0) setEditing({ data: { ...blankProduct(account, category), ...addDraft } });
  }

  const reload = useCallback(async () => {
    try {
      const [p, o] = await Promise.all([myListings(account.id), sellerOrders(account.id)]);
      setProducts(p);
      setOrders(o);
      setError(null);
      setNoSignal(false);
      onLoaded?.(p, o);
    } catch (err) {
      if (isOfflineError(err)) return setNoSignal(true);
      setError(err instanceof Error ? err.message : 'Could not load.');
      setProducts([]);
    }
  }, [account.id, onLoaded]);

  // Every 30 seconds while the page is on screen, and at once when the seller comes back to it.
  useEffect(() => {
    let live = true;
    const run = async () => {
      if (live && document.visibilityState === 'visible') await reload();
    };
    void run();
    void myPayout(account.id).then((p) => live && setPayout(p)).catch(() => live && setPayout(null));
    const id = window.setInterval(() => void run(), 30000);
    const back = () => void run();
    document.addEventListener('visibilitychange', back);
    // A draft kept with no signal has just been saved: show it.
    window.addEventListener(OUTBOX_SENT, back);
    return () => {
      live = false;
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', back);
      window.removeEventListener(OUTBOX_SENT, back);
    };
  }, [account.id, reload]);

  // The list carries only the first photo; Edit loads all of them.
  const edit = async (p: MarketListing) => {
    setOpening(p.id);
    try {
      const photos = p.photo ? await listingPhotos(p.id) : [];
      setEditing({ id: p.id, data: { seller_name: p.seller_name, phone: p.phone, district: p.district, category: p.category, subcategory: p.subcategory, product: p.product, variety: p.variety ?? '', grade: p.grade ?? '', unit: p.unit, price: Number(p.price), quantity: Number(p.quantity), details: p.details ?? '', photo: photos[0] ?? null, photos: photos.length ? photos : null } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not open the product. Check your internet and try again.');
    } finally {
      setOpening(null);
    }
  };

  const run = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      // The list first, then the message: "Listed" shows when the product is on screen.
      await reload();
      toast.success(ok);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  // A new listing in the Farmer portal can wait for signal as a draft; changes and other portals cannot.
  const draftable = mixed && !editing?.id;
  const save = () => {
    if (!editing) return;
    const problem = productProblem(editing.data, { isNew: !editing.id });
    if (problem) return toast.error(problem);
    const input = { ...editing.data, product: editing.data.product.trim(), phone: editing.data.phone.replace(/\s/g, ''), variety: editing.data.variety || null, grade: editing.data.grade || null, details: editing.data.details || null };
    if (offlineNow()) return draftable ? void keepDraft(input) : void toast.error(NEEDS_INTERNET);
    const id = editing.id;
    void (async () => {
      setBusy(true);
      try {
        await saveListing(input, id);
        setEditing(null);
        // The list first, then the message: "Listed" shows when the product is on screen.
        await reload();
        toast.success(id ? 'Product updated' : 'Listed — buyers can now compare and order it');
      } catch (err) {
        // The signal dropped while sending: a new listing waits as a draft.
        if (draftable && isOfflineError(err)) await keepDraft(input);
        else toast.error(err instanceof Error ? err.message : 'Something went wrong.');
      } finally {
        setBusy(false);
      }
    })();
  };

  // No signal: kept on this phone and saved hidden from buyers when the signal is back.
  const keepDraft = async (input: ListingInput) => {
    try {
      await keepListingDraft(account.id, input);
      setEditing(null);
      toast.success('You are offline. Your listing is kept on this phone as a draft. When you are back online it is saved, hidden from buyers, until you put it on sale.', { duration: 9000 });
    } catch {
      toast.error(NEEDS_INTERNET);
    }
  };

  const editor = editing && (
    <Modal
      open
      wide
      onClose={() => setEditing(null)}
      title={editing.id ? 'Edit' : editing.data.category === 'produce' ? 'List your produce' : mixed ? 'Add a farm input' : 'Add a product'}
      footer={
        <>
          {!online && <p className="me-auto max-w-sm self-center text-sm text-amber-900">{draftable ? 'You are offline. Saving keeps this as a draft; it is sent when you are back online and stays hidden from buyers until you put it on sale.' : NEEDS_INTERNET}</p>}
          <Btn theme={theme} variant="ghost" className="min-h-11" onClick={() => setEditing(null)}>Cancel</Btn>
          <Btn theme={theme} icon={CheckCircle2} className="min-h-11" disabled={busy} onClick={save}>{!online && draftable ? 'Save draft' : 'Save'}</Btn>
        </>
      }
    >
      <ProductForm value={editing.data} isNew={!editing.id} onChange={(data) => setEditing({ ...editing, data })} />
    </Modal>
  );

  if (error) return <p role="alert" className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-800 ring-1 ring-rose-200">{error}</p>;
  if (products === null) {
    // No signal before the list ever loaded: a new listing can still be written (kept as a draft).
    if (noSignal) {
      return (
        <>
          <p role="status" className="rounded-2xl bg-amber-50 p-4 text-amber-950 ring-1 ring-amber-200">
            You are offline. Your products and orders show when you are back online.{mixed && show === 'products' ? ' You can still write a new listing: it is kept as a draft and sent when you are back online.' : ''}
          </p>
          {mixed && show === 'products' && (
            <div className="mt-3 flex flex-wrap gap-2">
              <Btn theme={theme} icon={PlusCircle} className="min-h-11" onClick={() => setEditing({ data: blankProduct(account, 'produce') })}>List produce</Btn>
              <Btn theme={theme} variant="soft" icon={PlusCircle} className="min-h-11" onClick={() => setEditing({ data: blankProduct(account, 'supplies') })}>Add farm input</Btn>
            </div>
          )}
          {editor}
        </>
      );
    }
    return <p className="flex items-center gap-2 text-slate-600"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…</p>;
  }

  // Orders that need the seller now come first: new ones, payments to check, orders to ship.
  const groups = groupBaskets(orders);
  const waiting = groups.filter((g) => sellerMustAct(g[0]));
  const others = groups.filter((g) => !sellerMustAct(g[0]));
  // A Kissan Tools buyer pays before shipping: the seller needs payout details to accept.
  const needsPayout = payout === null && show !== 'all' && show !== 'payouts' && orders.some((o) => o.pay_first && ['placed', 'accepted'].includes(o.status));

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {needsPayout && (
        <div className="space-y-3 lg:col-span-2">
          <p className="flex items-start gap-2 rounded-2xl bg-amber-50 p-4 text-sm text-amber-950 ring-1 ring-amber-200">
            <Banknote className="mt-0.5 h-5 w-5 shrink-0" aria-hidden /> A Kissan Tools buyer pays you before you ship. Add your bank account or UPI ID below, so you can accept the order and the buyer can pay you.
          </p>
          <PayoutForm theme={theme} payout={payout} onSaved={setPayout} title="Where buyers pay you" intro="Only a buyer with a live order from you sees these. The money comes straight to you." />
        </div>
      )}

      {(show === 'all' || show === 'sell' || show === 'orders') && (
        <Panel theme={theme} title="Orders to act on" icon={CheckCircle2} className="lg:col-span-2">
          {waiting.length === 0 && others.length === 0 ? (
            <EmptyState theme={theme} icon={Package} title="No orders yet" text="When a buyer orders one of your products, it appears here. Accept it, ship it, and confirm when the money reaches you." />
          ) : (
            <ul className="space-y-3">
              {[...waiting, ...others].map((g) => <OrderCard key={g[0].basket ?? g[0].id} order={g[0]} lines={g} as="seller" theme={theme} onChange={() => void reload()} />)}
            </ul>
          )}
        </Panel>
      )}

      {(show === 'all' || show === 'sell' || show === 'products') && (
        <Panel
          theme={theme}
          title={mixed ? 'What I sell' : category === 'produce' ? 'My produce on sale' : 'My products'}
          icon={Boxes}
          className={show === 'products' || show === 'sell' ? 'lg:col-span-2' : ''}
          action={
            mixed ? (
              <div className="flex flex-wrap gap-2">
                <Btn theme={theme} size="sm" icon={PlusCircle} className="min-h-11" onClick={() => setEditing({ data: blankProduct(account, 'produce') })}>List produce</Btn>
                <Btn theme={theme} size="sm" variant="soft" icon={PlusCircle} className="min-h-11" onClick={() => setEditing({ data: blankProduct(account, 'supplies') })}>Add farm input</Btn>
              </div>
            ) : (
              <Btn theme={theme} size="sm" icon={PlusCircle} className="min-h-11" onClick={() => setEditing({ data: blankProduct(account, category) })}>{category === 'produce' ? 'List produce' : 'Add product'}</Btn>
            )
          }
        >
          {products.length === 0 ? (
            <EmptyState
              theme={theme}
              icon={Boxes}
              title="Nothing listed yet"
              text={
                mixed
                  ? 'List your apples, walnuts or saffron, or farm inputs you sell (fertiliser, sprays, packaging, tools), with price and quantity. Buyers see your produce right away in their Buyer portal (Buy apples & produce) and on Price Comparison. Farm inputs, with a photo, show in the Kissan Tools shop.'
                  : category === 'produce'
                    ? 'List your apples, walnuts or saffron with price and quantity. Buyers see them right away in their Buyer portal (Buy apples & produce) and on Price Comparison, and can order.'
                    : 'Add your products with price, stock and a photo. Farmers see them right away in the Kissan Tools shop and on Price Comparison, and can order.'
              }
            />
          ) : (
            <ul className="space-y-3">
              {products.map((p) => {
                const step = p.unit === 'piece' || p.unit === 'box' ? 10 : 1;
                return (
                  <li key={p.id} className="rounded-2xl bg-white/85 p-4 ring-1 ring-slate-900/5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex min-w-0 gap-3">
                        {p.photo ? (
                          // eslint-disable-next-line @next/next/no-img-element -- seller photo (data URL)
                          <img src={p.photo} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover ring-1 ring-slate-200" />
                        ) : (
                          <span className="grid h-16 w-16 shrink-0 place-items-center rounded-xl bg-slate-50 text-slate-400 ring-1 ring-slate-200" title="No photo yet"><ImageOff className="h-5 w-5" aria-hidden /></span>
                        )}
                        <div className="min-w-0">
                          <p className="text-xs text-slate-500">{p.subcategory ?? p.category}</p>
                          <p className="font-semibold text-slate-900">{p.product}{p.variety ? ` · ${p.variety}` : ''}</p>
                          <p className="text-sm text-slate-700"><strong>{inr(p.price)}</strong> per {p.unit}</p>
                          {p.category === 'supplies' && !p.photo && <p className="text-xs font-medium text-amber-800">No photo yet. Press Edit and add one: buyers in Kissan Tools choose by the photo.</p>}
                        </div>
                      </div>
                      {!p.active ? <Badge tone="slate">Hidden</Badge> : Number(p.quantity) === 0 ? <Badge tone="red">Out of stock</Badge> : <Badge tone="green">On sale to buyers</Badge>}
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className="text-sm text-slate-600">Stock:</span>
                      <button type="button" aria-label={`${step} fewer`} disabled={busy} onClick={() => void run(() => updateListing(p.id, { quantity: Math.max(0, Number(p.quantity) - step) }), 'Stock updated')} className="grid h-11 w-11 cursor-pointer place-items-center rounded-xl bg-slate-100 hover:bg-slate-200"><Minus className="h-4 w-4" aria-hidden /></button>
                      <span className="min-w-[4rem] text-center font-bold tabular-nums">{Number(p.quantity).toLocaleString('en-IN')}</span>
                      <button type="button" aria-label={`${step} more`} disabled={busy} onClick={() => void run(() => updateListing(p.id, { quantity: Number(p.quantity) + step }), 'Stock updated')} className="grid h-11 w-11 cursor-pointer place-items-center rounded-xl bg-slate-100 hover:bg-slate-200"><Plus className="h-4 w-4" aria-hidden /></button>
                      <span className="text-sm text-slate-500">{p.unit}</span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Btn theme={theme} size="sm" variant="soft" icon={opening === p.id ? Loader2 : Pencil} className="min-h-11" disabled={opening !== null} onClick={() => void edit(p)}>{opening === p.id ? 'Opening…' : 'Edit'}</Btn>
                      <Btn theme={theme} size="sm" variant="ghost" className="min-h-11" disabled={busy} onClick={() => void run(() => updateListing(p.id, { active: !p.active }), p.active ? 'Hidden from buyers' : 'Visible again')}>{p.active ? 'Hide' : 'Show again'}</Btn>
                      <Btn theme={theme} size="sm" variant="danger" icon={Trash2} className="min-h-11" disabled={busy} onClick={() => { if (window.confirm(`Remove ${p.product}?`)) void run(() => deleteListing(p.id), 'Removed'); }}>Remove</Btn>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      )}

      {(show === 'all' || show === 'payouts') && (
        <PayoutForm theme={theme} payout={payout} onSaved={setPayout} title="Where buyers pay you" intro="Price Comparison buyers pay you here after the goods reach them. Kissan Tools buyers pay you here before you ship. Only a buyer with a live order sees these details." />
      )}

      {editor}
    </div>
  );
}
