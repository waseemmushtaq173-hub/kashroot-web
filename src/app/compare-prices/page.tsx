'use client';

/**
 * Price Comparison — real products listed by sellers and dealers
 * (market_listings), compared by price, ordered with pay-after-delivery:
 * the buyer keeps the money until the goods arrive and are checked, then pays
 * the seller directly by UPI / bank (market_orders). KashRoot never holds it.
 *   Compare: farm inputs or produce, by type, search, cheapest first.
 *   My orders: the buyer's orders and the next step on each.
 *   Sell here: a seller's products, orders received and payout details.
 */
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { BadgeCheck, Loader2, MapPin, Package, Phone, Search, ShieldCheck, ShoppingCart, Store } from 'lucide-react';
import { toast } from 'sonner';

import { ToolShell } from '@/components/layout/ToolShell';
import { OrderCard } from '@/components/market/OrderCard';
import { SellerDesk } from '@/components/market/SellerDesk';
import { Badge, Btn, EmptyState, Field, INPUT, Modal, PORTAL_THEMES, Panel } from '@/components/portal/kit';
import { ListProductsLink, PRICE_COMPARISON_BUTTON, PriceComparisonHeader } from '@/components/price-comparison/PriceComparisonHeader';
import { loginHref } from '@/lib/auth/roles';
import { inr, loadAccount, type Account } from '@/lib/db/client';
import { browseListings, buyerOrders, placeOrder, PRODUCE, SUBCATEGORIES, type MarketCategory, type MarketListing, type MarketOrder } from '@/lib/db/market';

const theme = PORTAL_THEMES.buyer;

export default function ComparePricesPage() {
  return (
    <Suspense>
      <ComparePrices />
    </Suspense>
  );
}

function ComparePrices() {
  const params = useSearchParams();
  const [account, setAccount] = useState<Account | null | undefined>(undefined);
  const [tab, setTab] = useState<'compare' | 'orders' | 'sell'>(params.get('tab') === 'orders' ? 'orders' : params.get('tab') === 'sell' ? 'sell' : 'compare');
  const [category, setCategory] = useState<MarketCategory>(params.get('category') === 'produce' ? 'produce' : 'supplies');
  const [kind, setKind] = useState('All');
  const [search, setSearch] = useState('');
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [data, setData] = useState<{ listings: MarketListing[]; verified: Set<string> } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ordering, setOrdering] = useState<MarketListing | null>(null);
  const [orders, setOrders] = useState<MarketOrder[]>([]);

  useEffect(() => {
    void loadAccount().then(setAccount).catch(() => setAccount(null));
  }, []);

  const load = useCallback(async () => {
    try {
      setData(await browseListings(category));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load products.');
      setData({ listings: [], verified: new Set() });
    }
  }, [category]);

  const loadOrders = useCallback(async () => {
    if (!account) return;
    try {
      setOrders(await buyerOrders(account.id));
    } catch {
      setOrders([]);
    }
  }, [account]);

  useEffect(() => {
    let live = true;
    const run = async () => {
      if (live) await Promise.all([load(), loadOrders()]);
    };
    void run();
    return () => {
      live = false;
    };
  }, [load, loadOrders]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.listings ?? [])
      .filter((l) => (kind === 'All' || l.subcategory === kind) && (!verifiedOnly || data?.verified.has(l.seller_id)) && (!q || `${l.product} ${l.variety ?? ''} ${l.seller_name} ${l.district} ${l.subcategory ?? ''}`.toLowerCase().includes(q)))
      .sort((a, b) => Number(a.price) - Number(b.price));
  }, [data, kind, search, verifiedOnly]);

  const openOrders = orders.filter((o) => ['accepted', 'shipped', 'delivered'].includes(o.status)).length;

  return (
    <ToolShell
      tool="priceComparison"
      header={
        <PriceComparisonHeader
          actions={
            account ? (
              <button type="button" onClick={() => setTab('sell')} className={PRICE_COMPARISON_BUTTON}>
                <Store className="h-4 w-4" aria-hidden /> Sell here
              </button>
            ) : (
              <ListProductsLink />
            )
          }
        />
      }
    >
      <div role="tablist" aria-label="Price Comparison" className="mb-6 inline-flex flex-wrap gap-1 rounded-2xl bg-white/80 p-1 shadow-sm ring-1 ring-slate-900/5">
        {([
          ['compare', 'Compare prices', Search],
          ['orders', `My orders${openOrders ? ` (${openOrders})` : ''}`, ShoppingCart],
          ['sell', 'Sell here', Store],
        ] as const).map(([id, label, Icon]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`inline-flex cursor-pointer items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold transition ${tab === id ? 'bg-sky-700 text-white shadow-sm' : 'text-slate-700 hover:bg-slate-900/5'}`}>
            <Icon className="h-4 w-4" aria-hidden /> {label}
          </button>
        ))}
      </div>

      {tab === 'compare' && (
        <div className="space-y-5">
          <div className="flex flex-col gap-3 rounded-2xl bg-white/80 p-4 shadow-sm ring-1 ring-slate-900/5 lg:flex-row lg:items-center">
            <div role="group" aria-label="What" className="inline-flex rounded-xl bg-slate-100 p-1">
              {([['supplies', 'Farm inputs & supplies'], ['produce', 'Fruit & produce']] as const).map(([id, label]) => (
                <button key={id} type="button" aria-pressed={category === id} onClick={() => { setCategory(id); setKind('All'); }} className={`cursor-pointer rounded-lg px-3 py-1.5 text-sm font-semibold ${category === id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}>{label}</button>
              ))}
            </div>
            <label className="relative flex-1">
              <span className="sr-only">Search</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products, sellers or districts" className={`${INPUT} pl-9`} />
            </label>
            <select aria-label="Type" value={kind} onChange={(e) => setKind(e.target.value)} className={`${INPUT} lg:w-56`}>
              <option value="All">All types</option>
              {(category === 'produce' ? PRODUCE : SUBCATEGORIES).map((c) => <option key={c}>{c}</option>)}
            </select>
            <label className="flex items-center gap-2 whitespace-nowrap text-sm font-medium text-slate-700">
              <input type="checkbox" checked={verifiedOnly} onChange={(e) => setVerifiedOnly(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-sky-700" /> Verified sellers only
            </label>
          </div>

          <p className="flex items-start gap-2 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-950 ring-1 ring-emerald-200">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" aria-hidden />
            <span><strong>Pay after delivery.</strong> Order now; pay the seller directly by UPI only when the goods reach you and you have checked them. KashRoot never holds your money.</span>
          </p>

          {error ? (
            <p role="alert" className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-800 ring-1 ring-rose-200">{error}</p>
          ) : data === null ? (
            <p className="flex items-center gap-2 text-slate-600"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading prices…</p>
          ) : shown.length === 0 ? (
            <EmptyState theme={theme} icon={Package} title={data.listings.length ? 'Nothing matches' : 'No products listed yet'} text={data.listings.length ? 'Try another type or search.' : 'Sellers and dealers can list their products with “Sell here”.'} />
          ) : (
            <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {shown.map((l, i) => {
                const verified = data.verified.has(l.seller_id);
                const own = account?.id === l.seller_id;
                return (
                  <li key={l.id} className="flex flex-col rounded-2xl bg-white/90 p-5 shadow-sm ring-1 ring-slate-900/5">
                    {l.photo && (
                      // eslint-disable-next-line @next/next/no-img-element -- seller photo (data URL)
                      <img src={l.photo} alt="" className="mb-3 h-36 w-full rounded-xl object-cover" />
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-sky-700">{l.subcategory ?? l.category}</span>
                      {i === 0 && kind !== 'All' && <Badge tone="green">Lowest price</Badge>}
                    </div>
                    <h3 className="mt-1 text-lg font-semibold text-slate-900">{l.product}</h3>
                    {(l.variety || l.grade) && <p className="text-sm text-slate-600">{[l.variety, l.grade && `Grade ${l.grade}`].filter(Boolean).join(' · ')}</p>}
                    <p className="mt-2 flex items-center gap-1.5 text-sm text-slate-700">
                      {verified ? <BadgeCheck className="h-4 w-4 text-emerald-600" aria-label="KashRoot-verified seller" /> : <Store className="h-4 w-4 text-slate-400" aria-hidden />}
                      {l.seller_name}{verified ? ' (verified)' : ''}
                    </p>
                    <p className="flex items-center gap-1.5 text-sm text-slate-600"><MapPin className="h-4 w-4" aria-hidden /> {l.district}</p>
                    {l.details && <p className="mt-2 line-clamp-2 text-sm text-slate-600">{l.details}</p>}
                    <div className="mt-auto flex items-end justify-between gap-2 border-t border-slate-900/5 pt-4">
                      <div>
                        <p className="text-xl font-bold text-slate-900">{inr(l.price)} <span className="text-sm font-normal text-slate-500">/ {l.unit}</span></p>
                        <p className="text-xs text-slate-500">{Number(l.quantity).toLocaleString('en-IN')} {l.unit} in stock</p>
                      </div>
                      <div className="flex gap-2">
                        <a href={`tel:${l.phone}`} aria-label={`Call ${l.seller_name}`} className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200"><Phone className="h-4 w-4" aria-hidden /></a>
                        {own ? <Badge tone="violet">Yours</Badge> : <Btn theme={theme} icon={ShoppingCart} onClick={() => setOrdering(l)}>Order</Btn>}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {tab === 'orders' && (
        account ? (
          <Panel theme={theme} title="My orders" icon={ShoppingCart}>
            {orders.length === 0 ? (
              <EmptyState theme={theme} icon={ShoppingCart} title="No orders yet" text="Order from Compare prices. You pay the seller only after the goods reach you." />
            ) : (
              <ul className="space-y-3">{orders.map((o) => <OrderCard key={o.id} order={o} as="buyer" theme={theme} onChange={() => void loadOrders()} />)}</ul>
            )}
          </Panel>
        ) : (
          <SignInPrompt next="/compare-prices" />
        )
      )}

      {tab === 'sell' && (account ? <SellerDesk account={account} theme={theme} /> : <SignInPrompt next="/compare-prices" seller />)}

      {ordering && (
        account ? (
          <OrderModal listing={ordering} account={account} onClose={() => setOrdering(null)} onPlaced={() => { setOrdering(null); setTab('orders'); void loadOrders(); }} />
        ) : (
          <Modal open onClose={() => setOrdering(null)} title="Sign in to order">
            <SignInPrompt next="/compare-prices" />
          </Modal>
        )
      )}
    </ToolShell>
  );
}

function SignInPrompt({ next, seller = false }: { next: string; seller?: boolean }) {
  return (
    <div className="rounded-2xl bg-white/90 p-6 text-center ring-1 ring-slate-900/5">
      <p className="text-slate-700">{seller ? 'Sign in to list your products and receive orders.' : 'Sign in to order and follow your orders.'}</p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {seller ? (
          <Link href={loginHref('seller', next)} className={PRICE_COMPARISON_BUTTON}>Seller sign-in</Link>
        ) : (
          <>
            <Link href={loginHref('farmer', next)} className={PRICE_COMPARISON_BUTTON}>Farmer sign-in</Link>
            <Link href={loginHref('buyer', next)} className="inline-flex items-center rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 no-underline ring-1 ring-slate-200 hover:no-underline">Buyer sign-in</Link>
          </>
        )}
      </div>
    </div>
  );
}

function OrderModal({ listing: l, account, onClose, onPlaced }: { listing: MarketListing; account: Account; onClose: () => void; onPlaced: () => void }) {
  const [form, setForm] = useState({ quantity: '1', name: account.name, phone: account.phone, address: [account.village, account.district].filter(Boolean).join(', ') });
  const [busy, setBusy] = useState(false);
  const qty = Number(form.quantity) || 0;

  const place = async () => {
    if (!(qty > 0)) return toast.error('How many do you want?');
    if (qty > Number(l.quantity)) return toast.error(`Only ${l.quantity} ${l.unit} in stock.`);
    if (!/^(\+?91)?[6-9]\d{9}$/.test(form.phone.replace(/\s/g, ''))) return toast.error('Add your 10-digit mobile number.');
    if (form.address.trim().length < 5) return toast.error('Add the delivery address (village, district).');
    setBusy(true);
    try {
      await placeOrder({ listing_id: l.id, buyer_name: form.name.trim() || account.name, buyer_phone: form.phone.replace(/\s/g, ''), delivery_address: form.address.trim(), quantity: qty });
      toast.success('Order sent to the seller — pay only after delivery');
      onPlaced();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not place the order.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Order ${l.product}`}
      footer={
        <>
          <Btn theme={theme} variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn theme={theme} icon={ShoppingCart} disabled={busy} onClick={() => void place()}>{busy ? 'Sending…' : `Order for ${inr(qty * Number(l.price))}`}</Btn>
        </>
      }
    >
      <div className="grid gap-4">
        <p className="text-sm text-slate-600">{inr(l.price)} per {l.unit} from {l.seller_name}, {l.district}</p>
        <div className="grid grid-cols-2 gap-4">
          <Field label={`How many (${l.unit})`}>
            <input type="number" min={1} max={Number(l.quantity)} className={INPUT} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
          </Field>
          <Field label="Your mobile">
            <input type="tel" className={INPUT} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </Field>
        </div>
        <Field label="Your name">
          <input className={INPUT} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Deliver to">
          <textarea rows={2} className={INPUT} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Village, tehsil, district, landmark" />
        </Field>
        <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-950">You pay nothing now. When the goods reach you and you have checked them, press “I received the goods” and pay the seller by UPI.</p>
      </div>
    </Modal>
  );
}
