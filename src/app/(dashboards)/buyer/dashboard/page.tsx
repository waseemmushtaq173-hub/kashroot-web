'use client';

/**
 * Buyer portal — orders placed on Price Comparison (market_orders) and the
 * way into produce and farm inputs. Orders are pay-after-delivery: nothing
 * is paid up front; once the goods arrive and are checked, the buyer pays
 * the seller directly by UPI / bank. KashRoot never holds the money.
 */
import { useCallback, useEffect, useState } from 'react';
import { Apple, Loader2, PackageCheck, Scale, ShieldCheck, ShoppingBag, ShoppingCart, Truck, TrendingUp, Warehouse } from 'lucide-react';

import { PortalShell } from '@/components/layout/PortalShell';
import { OrderCard } from '@/components/market/OrderCard';
import { Btn, EmptyState, PORTAL_THEMES, Panel, Tile } from '@/components/portal/kit';
import { loadAccount, type Account } from '@/lib/db/client';
import { buyerOrders, type MarketOrder } from '@/lib/db/market';

const theme = PORTAL_THEMES.buyer;
type Tab = 'overview' | 'orders';

export default function BuyerDashboardPage() {
  const [tab, setTab] = useState<Tab>('overview');
  const [account, setAccount] = useState<Account | null | undefined>(undefined);
  const [orders, setOrders] = useState<MarketOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const list = (items: MarketOrder[]) => (
    <ul className="space-y-3">{items.map((o) => <OrderCard key={o.id} order={o} as="buyer" theme={theme} onChange={() => void reload()} />)}</ul>
  );

  return (
    <PortalShell
      title="Source with confidence"
      description="Order fruit, produce and farm inputs — and pay the seller only after the goods reach you."
      eyebrow="Buyer portal"
      theme="buyer"
      kpis={[
        { label: 'On the way', value: String(onTheWay.length), trend: 'Ordered, accepted or shipped' },
        { label: 'To pay', value: String(toPay.length), trend: 'Received — pay the seller' },
        { label: 'Completed', value: String(done.length), trend: 'Paid and confirmed' },
      ]}
      tabs={[
        { id: 'overview', label: 'Overview', icon: ShoppingBag },
        { id: 'orders', label: 'My orders', icon: ShoppingCart, count: all.length || undefined },
      ]}
      activeTab={tab}
      onTabChange={(id) => setTab(id as Tab)}
      actions={
        <Btn theme={theme} variant="white" icon={Apple} href="/compare-prices?category=produce">
          Buy produce
        </Btn>
      }
    >
      {tab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            <Tile theme={theme} icon={Apple} label="Fruit & produce" hint="From growers" href="/compare-prices?category=produce" />
            <Tile theme={theme} icon={Scale} label="Farm inputs" hint="Dealers side by side" href="/compare-prices" />
            <Tile theme={theme} icon={ShoppingCart} label="My orders" hint="Receive & pay" onClick={() => setTab('orders')} />
            <Tile theme={theme} icon={Truck} label="Track consignment" hint="Live truck location" href="/tracking/dashboard" />
            <Tile theme={theme} icon={Warehouse} label="Cold storage" hint="Book space" href="/rental/dashboard" />
            <Tile theme={theme} icon={TrendingUp} label="Mandi rates" hint="Today’s prices" href="/mandi-weather" />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Panel theme={theme} title="Your open orders" icon={PackageCheck} className="lg:col-span-2">
              {account === undefined || orders === null ? (
                <p className="flex items-center gap-2 text-slate-600"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…</p>
              ) : error ? (
                <p role="alert" className="text-rose-800">{error}</p>
              ) : active.length === 0 ? (
                <EmptyState
                  theme={theme}
                  icon={ShoppingBag}
                  title="No open orders"
                  text="Compare prices and order — you pay only after the goods reach you."
                  action={<Btn theme={theme} href="/compare-prices?category=produce">Browse produce</Btn>}
                />
              ) : (
                list(active)
              )}
            </Panel>

            <Panel theme={theme} title="Pay after delivery" icon={ShieldCheck}>
              <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-700">
                <li>Order on Price Comparison. You pay nothing now.</li>
                <li>The seller accepts and sends it.</li>
                <li>When it arrives, check it and press “I received the goods”.</li>
                <li>Pay the seller from your UPI app and type the payment number.</li>
              </ol>
              <p className="mt-3 text-xs text-slate-500">Something wrong? Press “Report a problem” on the order before you pay.</p>
            </Panel>
          </div>
        </div>
      )}

      {tab === 'orders' && (
        <Panel theme={theme} title="My orders" icon={ShoppingCart}>
          {orders === null ? (
            <p className="flex items-center gap-2 text-slate-600"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…</p>
          ) : error ? (
            <p role="alert" className="text-rose-800">{error}</p>
          ) : all.length === 0 ? (
            <EmptyState theme={theme} icon={ShoppingCart} title="No orders yet" text="Order from Price Comparison. You pay the seller only after the goods reach you." action={<Btn theme={theme} href="/compare-prices?category=produce">Browse produce</Btn>} />
          ) : (
            list(all)
          )}
        </Panel>
      )}
    </PortalShell>
  );
}
