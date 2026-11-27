'use client';

/**
 * Buyer portal — buying produce right here, the buyer's orders, and Escrow
 * payment: identity check (KYC) and pay-after-delivery.
 *   Buy apples & produce: the produce farmers publish from the Farmer portal
 *   (market_listings), live — a new listing shows up within 30 seconds —
 *   with photos, filters and Order (shared with Price Comparison:
 *   components/market/shop). Buyers do not need Price Comparison to buy.
 *   My orders: every order of this account, wherever it was placed.
 * Nothing is paid up front; once the goods arrive and are checked, the buyer
 * pays the farmer directly by UPI / bank. KashRoot never holds the money.
 * Mandi rates, Price Comparison and Cold Storage have their own places on
 * the home page; following a truck is in the Tracking portal.
 */
import dynamic from 'next/dynamic';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Apple, PackageCheck, ShieldCheck, ShoppingBag, ShoppingCart, Truck } from 'lucide-react';
import { toast } from '@/lib/client/toast';

import { PortalShell } from '@/components/layout/PortalShell';
import { OrderCard } from '@/components/market/OrderCard';
import { PooledLocation } from '@/components/market/PooledLocation';
import type { ShopListing } from '@/components/market/shop/useLiveListings';
import { Btn, EmptyState, Panel, PORTAL_THEMES, Skeleton, Tile } from '@/components/portal/kit';
import { loadAccount, type Account } from '@/lib/db/client';
import { buyerOrders, type MarketOrder } from '@/lib/db/market';
import { pooledLoads } from '@/lib/pooledLoads';

const theme = PORTAL_THEMES.buyer;

// The shop, the order form and Safe payment are each their own download, fetched when their tab is opened (the order form is
// asked for as soon as the shop opens, so it is ready by the time a box is chosen): the Overview does not wait for their code.
const tabLoading = () => <Skeleton label="Loading…" />;
const ListingBrowser = dynamic(() => import('@/components/market/shop/ListingBrowser').then((m) => m.ListingBrowser), { ssr: false, loading: tabLoading });
const loadOrderModal = () => import('@/components/market/shop/OrderModal').then((m) => m.OrderModal);
const OrderModal = dynamic(loadOrderModal, { ssr: false });
const SafePayment = dynamic(() => import('@/components/payments/SafePayment').then((m) => m.SafePayment), { ssr: false, loading: tabLoading });
type Tab = 'overview' | 'shop' | 'pooled' | 'orders' | 'payment';

const TABS: Tab[] = ['overview', 'shop', 'pooled', 'orders', 'payment'];

export default function BuyerDashboardPage() {
  return (
    <Suspense>
      <BuyerDashboard />
    </Suspense>
  );
}

function BuyerDashboard() {
  const initial = useSearchParams().get('tab') as Tab | null;
  const [tab, setTab] = useState<Tab>(initial && TABS.includes(initial) ? initial : 'overview');
  // The open tab lives in the address too: a refresh stays on it, and the
  // portal frame hides its identity-check banner on the Safe payment tab.
  useEffect(() => {
    window.history.replaceState(null, '', tab === 'overview' ? window.location.pathname : `${window.location.pathname}?tab=${tab}`);
  }, [tab]);
  // Opening the shop: the order form's code starts travelling, so it is there when a box is chosen.
  useEffect(() => {
    if (tab === 'shop') void loadOrderModal().catch(() => undefined);
  }, [tab]);
  const [account, setAccount] = useState<Account | null | undefined>(undefined);
  const [orders, setOrders] = useState<MarketOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ordering, setOrdering] = useState<ShopListing | null>(null);
  /** The boxes the buyer put on the truck for the listing being ordered (the order form opens with it). */
  const [orderingBoxes, setOrderingBoxes] = useState<number | undefined>(undefined);

  useEffect(() => {
    const none = () => {
      setAccount(null);
      setOrders([]);
    };
    void loadAccount().then((a) => (a ? setAccount(a) : none())).catch(none);
  }, []);

  const reload = useCallback(async () => {
    if (!account) return;
    try {
      setOrders(await buyerOrders(account.id));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your orders.');
      setOrders([]);
    }
  }, [account]);

  useEffect(() => {
    let live = true;
    const run = async () => {
      if (live) await reload();
    };
    void run();
    const id = window.setInterval(() => void run(), 30000);
    return () => {
      live = false;
      window.clearInterval(id);
    };
  }, [reload]);

  const all = orders ?? [];
  const onTheWay = all.filter((o) => ['placed', 'accepted', 'shipped'].includes(o.status));
  const toPay = all.filter((o) => o.status === 'delivered');
  const done = all.filter((o) => o.status === 'completed');
  // Open orders, the ones waiting on the buyer first.
  const rank = (o: MarketOrder) => (o.status === 'delivered' ? 0 : o.status === 'shipped' ? 1 : 2);
  const active = all.filter((o) => !['completed', 'cancelled', 'rejected'].includes(o.status)).sort((a, b) => rank(a) - rank(b));

  // Orders that are part of a pooled location (the Pooled location tab).
  const poolLines = pooledLoads(all).reduce((n, l) => n + l.lines.length, 0);

  const list = (items: MarketOrder[]) => (
    <ul className="space-y-3">{items.map((o) => <OrderCard key={o.id} order={o} as="buyer" theme={theme} onChange={() => void reload()} />)}</ul>
  );
  const shopButton = (
    <Btn theme={theme} icon={Apple} className="min-h-11" onClick={() => setTab('shop')}>Buy apples & produce</Btn>
  );

  return (
    <PortalShell
      title="Source with confidence"
      description="Buy apples and other produce straight from farmers, and pay the farmer only after the goods reach you."
      eyebrow="Buyer portal"
      theme="buyer"
      kpis={[
        { label: 'On the way', value: String(onTheWay.length), trend: 'Ordered, accepted or shipped' },
        { label: 'To pay', value: String(toPay.length), trend: 'Received — pay the seller' },
        { label: 'Completed', value: String(done.length), trend: 'Paid and confirmed' },
      ]}
      tabs={[
        { id: 'overview', label: 'Overview', icon: ShoppingBag },
        { id: 'shop', label: 'Buy apples & produce', icon: Apple },
        { id: 'pooled', label: 'Pooled location', icon: Truck, count: poolLines || undefined },
        { id: 'orders', label: 'My orders', icon: ShoppingCart, count: all.length || undefined },
        { id: 'payment', label: 'Escrow payment', icon: ShieldCheck, count: toPay.length || undefined },
      ]}
      activeTab={tab}
      onTabChange={(id) => setTab(id as Tab)}
    >
      {tab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Tile theme={theme} icon={Apple} label="Buy apples & produce" hint="From farmers, with photos" onClick={() => setTab('shop')} />
            <Tile theme={theme} icon={ShoppingCart} label="My orders" hint="Receive & pay" onClick={() => setTab('orders')} />
            <Tile theme={theme} icon={ShieldCheck} label="Escrow payment" hint="Pay after delivery" onClick={() => setTab('payment')} />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Panel theme={theme} title="Your open orders" icon={PackageCheck} className="lg:col-span-2">
              {account === undefined || orders === null ? (
                <Skeleton label="Loading…" />
              ) : error ? (
                <p role="alert" className="text-rose-800">{error}</p>
              ) : active.length === 0 ? (
                <EmptyState
                  theme={theme}
                  icon={ShoppingBag}
                  title="No open orders"
                  text="Open Buy apples & produce and press Order. You pay after the goods reach you."
                  action={shopButton}
                />
              ) : (
                list(active)
              )}
            </Panel>

            <Panel theme={theme} title="Pay after delivery" icon={ShieldCheck}>
              <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-700">
                <li>Order in Buy apples & produce. You pay nothing now.</li>
                <li>The farmer dispatches; live GPS follows the trip.</li>
                <li>When it arrives, check it and press “✅ Confirm Delivery Received”.</li>
                <li>Pay the farmer by UPI and type the payment number.</li>
              </ol>
              <p className="mt-3 text-xs text-slate-500">Something wrong? Press “Report a problem” before you confirm.</p>
            </Panel>
          </div>
        </div>
      )}

      {tab === 'shop' && (
        <div className="space-y-5">
          <p className="flex items-start gap-2 rounded-2xl bg-forest-soft p-4 text-sm text-forest-pine ring-1 ring-forest-line">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-forest" aria-hidden />
            <span><strong>Pay after delivery.</strong> Order now; when the goods reach you, press “✅ Confirm Delivery Received”, then pay the farmer by UPI.</span>
          </p>
          <ListingBrowser
            category="produce"
            theme={theme}
            accountId={account?.id}
            cluster
            onOrder={(l, boxes) => {
              if (!account) return void toast.error('Please sign in to the Buyer portal again to order.');
              setOrderingBoxes(boxes);
              setOrdering(l);
            }}
            // Only real produce from real farmers — nothing made up.
            empty={
              <EmptyState
                theme={theme}
                icon={Apple}
                title="No produce listed yet"
                text="When farmers list produce, it shows here by itself."
              />
            }
          />
        </div>
      )}

      {tab === 'payment' && account && (
        <SafePayment as="buyer" account={account} theme={theme}>
          <Panel theme={theme} title="Waiting for your payment" icon={ShieldCheck}>
            {toPay.length === 0 ? (
              <p className="text-sm text-slate-600">Nothing to pay right now. When goods reach you, press “✅ Confirm Delivery Received” on the order.</p>
            ) : (
              list(toPay)
            )}
          </Panel>
        </SafePayment>
      )}

      {tab === 'pooled' && <PooledLocation orders={orders} onOpenOrders={() => setTab('orders')} onShop={() => setTab('shop')} />}

      {tab === 'orders' && (
        <Panel theme={theme} title="My orders" icon={ShoppingCart}>
          {orders === null ? (
            <Skeleton label="Loading…" />
          ) : error ? (
            <p role="alert" className="text-rose-800">{error}</p>
          ) : all.length === 0 ? (
            <EmptyState theme={theme} icon={ShoppingCart} title="No orders yet" text="Open Buy apples & produce and press Order. You pay after the goods reach you." action={shopButton} />
          ) : (
            list(all)
          )}
        </Panel>
      )}

      {ordering && account && (
        <OrderModal
          listing={ordering}
          account={account}
          theme={theme}
          initialQuantity={orderingBoxes}
          settlement
          onClose={() => setOrdering(null)}
          onPlaced={() => {
            setOrdering(null);
            setTab('orders');
            void reload();
          }}
        />
      )}
    </PortalShell>
  );
}
