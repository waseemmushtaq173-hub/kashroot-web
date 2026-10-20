'use client';

/**
 * Kissan Tools — the shop for farm tools and inputs: the real products
 * agro-dealers and farmers list (market_listings, category 'supplies'; the
 * same rows as in their portals), with the seller's photos, cheapest first.
 *
 * Add to cart → one order per seller, with a delivery pin on the map → the
 * seller accepts (stock check) → the buyer pays the seller directly by UPI
 * or bank and enters the reference → the seller confirms the money and ships
 * → the buyer follows the vehicle on the map (distance and about when it
 * arrives) → "I received it". KashRoot never holds the money. The cart is
 * kept on this phone; the orders are in the database (src/lib/db/shop.ts).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Minus, Package, Plus, RefreshCw, Search, ShoppingCart, Store, Trash2 } from 'lucide-react';
import { toast } from '@/lib/client/toast';

import { PortalShell } from '@/components/layout/PortalShell';
import { OrderCard } from '@/components/market/OrderCard';
import { amountOf, useLiveListings, type ShopListing } from '@/components/market/shop/useLiveListings';
import { Btn, EmptyState, INPUT, PORTAL_THEMES, Panel } from '@/components/portal/kit';
import { Checkout } from '@/components/shop/Checkout';
import { PhotoViewer } from '@/components/shop/PhotoViewer';
import { ProductCard, ProductPhoto } from '@/components/shop/ProductCard';
import { CART_KEY, EMPTY_CART, WHOLE, forgetSampleShop, qtyProblem, type CartLine } from '@/components/shop/cart';
import { inr, loadAccount, type Account } from '@/lib/db/client';
import { SUBCATEGORIES, type MarketOrder } from '@/lib/db/market';
import { groupBaskets, sellersOf, shopOrders, type ShopSeller } from '@/lib/db/shop';
import { usePersistentState } from '@/lib/portal-store';

const theme = PORTAL_THEMES.kissan;
type Tab = 'shop' | 'cart' | 'orders';
const ALL = '';
const ACTIVE = ['placed', 'accepted', 'shipped'];

export default function KissanToolsDashboardPage() {
  const [tab, setTab] = useState<Tab>('shop');
  const [account, setAccount] = useState<Account | null | undefined>(undefined);
  const { listings, verified, error, refresh } = useLiveListings('supplies');
  const [cart, setCart] = usePersistentState<CartLine[]>(CART_KEY, EMPTY_CART);
  const [orders, setOrders] = useState<MarketOrder[] | null>(null);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [sellers, setSellers] = useState<Map<string, ShopSeller>>(() => new Map());
  const [kind, setKind] = useState(ALL);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<ShopListing | null>(null);
  const [checkoutSeller, setCheckoutSeller] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    forgetSampleShop();
    void loadAccount().then(setAccount).catch(() => setAccount(null));
  }, []);

  const loadOrders = useCallback(async () => {
    if (!account) return;
    try {
      const rows = await shopOrders(account.id);
      // Who sells each order comes with it, so a card shows complete at once.
      const who = await sellersOf(rows.map((o) => o.listing_id ?? ''));
      setSellers(who);
      setOrders(rows);
      setOrdersError(null);
    } catch (err) {
      setOrdersError(err instanceof Error ? err.message : 'Could not load your orders.');
      setOrders((o) => o ?? []);
    }
  }, [account]);

  // Orders refresh every 30 seconds while the page is on screen (payment, shipping, the vehicle's position).
  useEffect(() => {
    let live = true;
    const load = async () => {
      if (live) await loadOrders();
    };
    const run = async () => {
      if (document.visibilityState === 'visible') await load();
    };
    void load();
    const id = window.setInterval(() => void run(), 30_000);
    return () => {
      live = false;
      window.clearInterval(id);
    };
  }, [loadOrders]);

  const all = useMemo(() => listings ?? [], [listings]);
  const byId = useMemo(() => new Map(all.map((l) => [l.id, l])), [all]);
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all
      .filter((l) => (!kind || l.subcategory === kind) && (!q || `${l.product} ${l.variety ?? ''} ${l.grade ?? ''} ${l.seller_name} ${l.district} ${l.subcategory ?? ''}`.toLowerCase().includes(q)))
      .sort((a, b) => Number(a.price) - Number(b.price));
  }, [all, kind, search]);

  const qtyOf = (id: string) => cart.find((c) => c.listing_id === id)?.qty ?? 0;
  const add = (l: ShopListing) => {
    const now = qtyOf(l.id);
    if (now + 1 > Number(l.quantity)) return toast.error(`The seller has only ${amountOf(Number(l.quantity), l.unit)} of ${l.product}.`);
    setCart((c) => (c.some((x) => x.listing_id === l.id) ? c.map((x) => (x.listing_id === l.id ? { ...x, qty: x.qty + 1 } : x)) : [...c, { listing_id: l.id, qty: 1 }]));
    toast.success(`${l.product} added to the cart`);
  };
  const setQty = (id: string, qty: number) => setCart((c) => c.map((x) => (x.listing_id === id ? { ...x, qty } : x)));
  const remove = (id: string) => setCart((c) => c.filter((x) => x.listing_id !== id));

  // The cart by seller: each seller gets one order.
  const cartGroups = useMemo(() => {
    const groups = new Map<string, { seller: ShopListing; lines: { listing: ShopListing; qty: number }[] }>();
    for (const c of cart) {
      const l = byId.get(c.listing_id);
      if (!l) continue;
      const g = groups.get(l.seller_id) ?? { seller: l, lines: [] };
      g.lines.push({ listing: l, qty: c.qty });
      groups.set(l.seller_id, g);
    }
    return [...groups.values()];
  }, [cart, byId]);
  // Products in the cart that are no longer on sale (sold out, hidden or removed).
  const gone = listings === null ? [] : cart.filter((c) => !byId.has(c.listing_id));
  const cartCount = cart.length;
  const cartTotal = cartGroups.reduce((s, g) => s + g.lines.reduce((t, l) => t + l.qty * Number(l.listing.price), 0), 0);

  const baskets = useMemo(() => groupBaskets(orders ?? []), [orders]);
  const activeOrders = baskets.filter((g) => ACTIVE.includes(g[0].status)).length;
  const checkoutGroup = cartGroups.find((g) => g.seller.seller_id === checkoutSeller) ?? null;

  const reload = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  return (
    <PortalShell
      title="Kissan Tools"
      description="Farm tools, sprays, fertiliser and packaging from sellers in the valley. See the photo, order, pay the seller, and follow the delivery on the map."
      eyebrow="Farm tools & inputs"
      theme="kissan"
      kpis={[
        { label: 'Products', value: listings === null ? '…' : String(all.length), trend: 'Listed by sellers' },
        { label: 'In cart', value: String(cartCount), trend: inr(cartTotal) },
        { label: 'My orders', value: String(baskets.length), trend: `${activeOrders} not finished` },
      ]}
      tabs={[
        { id: 'shop', label: 'Shop', icon: Store },
        { id: 'cart', label: 'Cart', icon: ShoppingCart, count: cartCount || undefined },
        { id: 'orders', label: 'My orders', icon: Package, count: activeOrders || undefined },
      ]}
      activeTab={tab}
      onTabChange={(id) => setTab(id as Tab)}
      actions={
        <Btn theme={theme} variant="white" icon={ShoppingCart} className="min-h-11" onClick={() => setTab('cart')}>
          Cart ({cartCount})
        </Btn>
      }
    >
      {tab === 'shop' && (
        <div className="space-y-5">
          <div className="grid min-w-0 gap-3 rounded-2xl bg-white/80 p-4 shadow-sm ring-1 ring-slate-900/5">
            <label className="relative block">
              <span className="sr-only">Search</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
              <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tools, sprays, sellers or districts" className={`${INPUT} min-h-11 pl-9`} />
            </label>
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label="Type of product">
              {[ALL, ...SUBCATEGORIES].map((c) => (
                <button
                  key={c || 'all'}
                  type="button"
                  aria-pressed={kind === c}
                  onClick={() => setKind(c)}
                  className={`min-h-11 shrink-0 cursor-pointer whitespace-nowrap rounded-xl px-4 text-sm font-semibold ${kind === c ? theme.solid : theme.soft}`}
                >
                  {c || 'All'}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              {listings !== null && <span className="text-sm text-slate-600">{shown.length} {shown.length === 1 ? 'product' : 'products'} · cheapest first</span>}
              <Btn theme={theme} variant="ghost" icon={RefreshCw} className="min-h-11" disabled={refreshing} onClick={() => void reload()}>Refresh</Btn>
            </div>
          </div>

          {error ? (
            <p role="alert" className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-800 ring-1 ring-rose-200">{error}</p>
          ) : listings === null ? (
            <p className="flex items-center gap-2 text-slate-600"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading products…</p>
          ) : all.length === 0 ? (
            <EmptyState
              theme={theme}
              icon={Store}
              title="No farm tools or inputs listed yet"
              text="Agro-dealers and farmers who sell tools, sprays, fertiliser or packaging list them in their portal. They show here with their photos as soon as they do. Check again soon."
            />
          ) : shown.length === 0 ? (
            <EmptyState
              theme={theme}
              icon={Search}
              title="Nothing matches"
              text="Try another type, or clear the search."
              action={<Btn theme={theme} variant="soft" className="min-h-11" onClick={() => { setKind(ALL); setSearch(''); }}>Show everything</Btn>}
            />
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {shown.map((l) => (
                <ProductCard key={l.id} listing={l} verified={verified.has(l.seller_id)} own={account?.id === l.seller_id} inCart={qtyOf(l.id)} theme={theme} onAdd={() => add(l)} onOpen={() => setOpen(l)} />
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === 'cart' && (
        <Panel theme={theme} title="Your cart" icon={ShoppingCart}>
          {cartGroups.length === 0 && gone.length === 0 ? (
            <EmptyState theme={theme} icon={ShoppingCart} title="Your cart is empty" text="Open the Shop, find what you need and press “Add to cart”." action={<Btn theme={theme} className="min-h-11" onClick={() => setTab('shop')}>Go to the shop</Btn>} />
          ) : (
            <div className="space-y-5">
              {cartGroups.length > 1 && <p className="text-sm text-slate-700">Your cart has products from {cartGroups.length} sellers. Each seller gets a separate order, and you pay each seller directly.</p>}
              {cartGroups.map((g) => {
                const total = g.lines.reduce((t, l) => t + l.qty * Number(l.listing.price), 0);
                const wrong = g.lines.map((l) => qtyProblem(l.listing, l.qty)).find(Boolean);
                return (
                  <section key={g.seller.seller_id} className="rounded-2xl bg-white/85 p-4 ring-1 ring-slate-900/5" aria-label={`From ${g.seller.seller_name}`}>
                    <h3 className="font-semibold text-slate-900">From {g.seller.seller_name}, {g.seller.district}</h3>
                    <ul className="mt-3 divide-y divide-slate-900/5">
                      {g.lines.map(({ listing: l, qty }) => (
                        <li key={l.id} className="flex flex-wrap items-center gap-3 py-3">
                          <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl ring-1 ring-slate-200"><ProductPhoto listing={l} className="h-16" /></div>
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-slate-900">{l.product}</p>
                            <p className="text-sm text-slate-600">{inr(l.price)} per {l.unit} · {amountOf(Number(l.quantity), l.unit)} in stock</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button type="button" aria-label={`One less ${l.product}`} onClick={() => (qty <= 1 ? remove(l.id) : setQty(l.id, Math.max(1, qty - 1)))} className="grid h-11 w-11 cursor-pointer place-items-center rounded-xl bg-slate-100 hover:bg-slate-200"><Minus className="h-4 w-4" aria-hidden /></button>
                            <label>
                              <span className="sr-only">How many {l.product}</span>
                              <input
                                type="number"
                                inputMode={WHOLE.includes(l.unit) ? 'numeric' : 'decimal'}
                                min={1}
                                step={WHOLE.includes(l.unit) ? 1 : 'any'}
                                className={`${INPUT} min-h-11 w-20 text-center font-semibold tabular-nums`}
                                value={Number.isFinite(qty) && qty > 0 ? qty : ''}
                                onChange={(e) => setQty(l.id, Number(e.target.value))}
                              />
                            </label>
                            <button type="button" aria-label={`One more ${l.product}`} onClick={() => setQty(l.id, qty + 1)} className="grid h-11 w-11 cursor-pointer place-items-center rounded-xl bg-slate-100 hover:bg-slate-200"><Plus className="h-4 w-4" aria-hidden /></button>
                            <span className="w-24 text-right font-bold tabular-nums">{inr(qty * Number(l.price))}</span>
                            <button type="button" aria-label={`Remove ${l.product}`} onClick={() => remove(l.id)} className="grid h-11 w-11 cursor-pointer place-items-center rounded-xl bg-white text-rose-700 ring-1 ring-rose-200 hover:bg-rose-50"><Trash2 className="h-4 w-4" aria-hidden /></button>
                          </div>
                        </li>
                      ))}
                    </ul>
                    {wrong && <p role="alert" className="mt-2 rounded-xl bg-rose-50 p-3 text-sm text-rose-800 ring-1 ring-rose-200">{wrong}</p>}
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-900/5 pt-3">
                      <p className="text-lg">Total <strong className="tabular-nums">{inr(total)}</strong></p>
                      <Btn
                        theme={theme}
                        icon={Package}
                        className="min-h-11"
                        onClick={() => {
                          if (wrong) return toast.error(wrong);
                          if (!account) return toast.error('Sign in again to order.');
                          setCheckoutSeller(g.seller.seller_id);
                        }}
                      >
                        Order from {g.seller.seller_name}
                      </Btn>
                    </div>
                  </section>
                );
              })}
              {gone.length > 0 && (
                <div className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-950 ring-1 ring-amber-200">
                  <p>{gone.length === 1 ? 'One product' : `${gone.length} products`} in your cart {gone.length === 1 ? 'is' : 'are'} no longer on sale (sold out or removed by the seller).</p>
                  <Btn theme={theme} variant="soft" className="mt-2 min-h-11" onClick={() => setCart((c) => c.filter((x) => byId.has(x.listing_id)))}>Remove from cart</Btn>
                </div>
              )}
              <p className="text-sm text-slate-600">You pay nothing now. The seller accepts first; then you pay the seller directly by UPI or bank. KashRoot does not hold the money.</p>
            </div>
          )}
        </Panel>
      )}

      {tab === 'orders' && (
        <Panel theme={theme} title="My orders" icon={Package}>
          {ordersError && <p role="alert" className="mb-3 rounded-2xl bg-rose-50 p-4 text-sm text-rose-800 ring-1 ring-rose-200">{ordersError}</p>}
          {account === null ? (
            <p role="alert" className="rounded-2xl bg-amber-50 p-4 text-amber-900 ring-1 ring-amber-200">Sign in again to see your orders.</p>
          ) : orders === null ? (
            <p className="flex items-center gap-2 text-slate-600"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading your orders…</p>
          ) : baskets.length === 0 ? (
            <EmptyState theme={theme} icon={Package} title="No orders yet" text="Find farm tools and inputs in the Shop, add them to the cart and order. You pay the seller after they accept." action={<Btn theme={theme} className="min-h-11" onClick={() => setTab('shop')}>Go to the shop</Btn>} />
          ) : (
            <ul className="space-y-3">
              {baskets.map((g) => (
                <OrderCard key={g[0].basket ?? g[0].id} order={g[0]} lines={g} as="buyer" seller={sellers.get(g[0].listing_id ?? '') ?? null} theme={theme} onChange={() => void loadOrders()} />
              ))}
            </ul>
          )}
        </Panel>
      )}

      {open && (
        <PhotoViewer
          listing={open}
          own={account?.id === open.seller_id}
          theme={theme}
          onClose={() => setOpen(null)}
          onAdd={() => {
            add(open);
            setOpen(null);
          }}
        />
      )}

      {checkoutGroup && account && (
        <Checkout
          lines={checkoutGroup.lines}
          account={account}
          theme={theme}
          onClose={() => setCheckoutSeller(null)}
          onPlaced={() => {
            const sent = new Set(checkoutGroup.lines.map((l) => l.listing.id));
            setCart((c) => c.filter((x) => !sent.has(x.listing_id)));
            setCheckoutSeller(null);
            setTab('orders');
            void loadOrders();
            void refresh();
          }}
        />
      )}
    </PortalShell>
  );
}
