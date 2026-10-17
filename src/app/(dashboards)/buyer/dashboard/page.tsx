'use client';

/**
 * Buyer portal — the buyer's orders (placed on Price Comparison, which is its
 * own portal) and Safe payment: identity check (KYC) and pay-after-delivery.
 * Nothing is paid up front; once the goods arrive and are checked, the buyer
 * pays the farmer directly by UPI / bank. KashRoot never holds the money.
 * Following a truck is in the Tracking portal.
 */
import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2, PackageCheck, ShieldCheck, ShoppingBag, ShoppingCart, TrendingUp, Warehouse } from 'lucide-react';

import { PortalShell } from '@/components/layout/PortalShell';
import { OrderCard } from '@/components/market/OrderCard';
import { SafePayment } from '@/components/payments/SafePayment';
import { EmptyState, PORTAL_THEMES, Panel, Tile } from '@/components/portal/kit';
import { loadAccount, type Account } from '@/lib/db/client';
import { buyerOrders, type MarketOrder } from '@/lib/db/market';

const theme = PORTAL_THEMES.buyer;
type Tab = 'overview' | 'orders' | 'payment';

const TABS: Tab[] = ['overview', 'orders', 'payment'];

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
      description="Your orders, and safe payment: verify once, and pay the farmer only after the goods reach you."
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
        { id: 'payment', label: 'Safe payment', icon: ShieldCheck, count: toPay.length || undefined },
      ]}
      activeTab={tab}
      onTabChange={(id) => setTab(id as Tab)}
    >
      {tab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Tile theme={theme} icon={ShoppingCart} label="My orders" hint="Receive & pay" onClick={() => setTab('orders')} />
            <Tile theme={theme} icon={ShieldCheck} label="Safe payment" hint="Verify & pay after delivery" onClick={() => setTab('payment')} />
            <Tile theme={theme} icon={Warehouse} label="Cold storage" hint="Choose your place" href="/rental/dashboard" />
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
                  text="Orders you place on Price Comparison (on the home page) appear here — you pay only after the goods reach you."
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

      {tab === 'payment' && account && (
        <SafePayment as="buyer" account={account} theme={theme}>
          <Panel theme={theme} title="Waiting for your payment" icon={ShieldCheck}>
            {toPay.length === 0 ? (
              <p className="text-sm text-slate-600">Nothing to pay right now. When goods reach you and you press “I received the goods”, the order appears here with the farmer’s UPI / bank details.</p>
            ) : (
              list(toPay)
            )}
          </Panel>
        </SafePayment>
      )}

      {tab === 'orders' && (
        <Panel theme={theme} title="My orders" icon={ShoppingCart}>
          {orders === null ? (
            <p className="flex items-center gap-2 text-slate-600"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…</p>
          ) : error ? (
            <p role="alert" className="text-rose-800">{error}</p>
          ) : all.length === 0 ? (
            <EmptyState theme={theme} icon={ShoppingCart} title="No orders yet" text="Orders you place on Price Comparison (on the home page) appear here. You pay the farmer only after the goods reach you." />
          ) : (
            list(all)
          )}
        </Panel>
      )}
    </PortalShell>
  );
}
