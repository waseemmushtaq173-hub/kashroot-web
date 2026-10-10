'use client';

/**
 * Seller portal — the seller's products on Price Comparison, orders from
 * buyers and farmers, and the UPI / bank details buyers pay into.
 *
 * Everything is shared through the database (market_listings /
 * market_orders), so a product added here appears on /compare-prices for
 * every buyer straight away. Orders are pay-after-delivery: the buyer pays
 * the seller directly once the goods arrive; KashRoot never holds the money.
 */
import { useCallback, useEffect, useState } from 'react';
import { Banknote, Boxes, Loader2, Package, Scale, Store } from 'lucide-react';

import { PortalShell } from '@/components/layout/PortalShell';
import { SellerDesk } from '@/components/market/SellerDesk';
import { PORTAL_THEMES, Tile } from '@/components/portal/kit';
import { inr, loadAccount, type Account } from '@/lib/db/client';
import type { MarketListing, MarketOrder } from '@/lib/db/market';

const theme = PORTAL_THEMES.seller;
type Tab = 'orders' | 'products' | 'payouts';

export default function SellerDashboardPage() {
  const [tab, setTab] = useState<Tab>('orders');
  const [account, setAccount] = useState<Account | null | undefined>(undefined);
  const [stats, setStats] = useState<{ products: MarketListing[]; orders: MarketOrder[] } | null>(null);

  useEffect(() => {
    void loadAccount().then(setAccount).catch(() => setAccount(null));
  }, []);

  const onLoaded = useCallback((products: MarketListing[], orders: MarketOrder[]) => setStats({ products, orders }), []);

  const products = stats?.products ?? [];
  const orders = stats?.orders ?? [];
  const toAct = orders.filter((o) => ['placed', 'accepted', 'paid'].includes(o.status)).length;
  const received = orders.filter((o) => o.status === 'completed').reduce((s, o) => s + Number(o.amount), 0);

  return (
    <PortalShell
      title="Grow your agri-business"
      description="Your products on Price Comparison, orders from farmers and buyers, and where they pay you."
      eyebrow="Seller portal"
      theme="seller"
      kpis={[
        { label: 'Products', value: String(products.length), trend: `${products.filter((p) => p.active && Number(p.quantity) > 0).length} on Price Comparison` },
        { label: 'Orders to act on', value: String(toAct), trend: 'Accept, ship, confirm payment' },
        { label: 'Money received', value: inr(received), trend: 'Paid to you directly' },
      ]}
      tabs={[
        { id: 'orders', label: 'Orders', icon: Package, count: toAct || undefined },
        { id: 'products', label: 'My products', icon: Boxes, count: products.length || undefined },
        { id: 'payouts', label: 'Payouts', icon: Banknote },
      ]}
      activeTab={tab}
      onTabChange={(id) => setTab(id as Tab)}
    >
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile theme={theme} icon={Package} label="Orders" hint="Accept & ship" onClick={() => setTab('orders')} />
        <Tile theme={theme} icon={Boxes} label="My products" hint="Price & stock" onClick={() => setTab('products')} />
        <Tile theme={theme} icon={Banknote} label="Payouts" hint="Your UPI / bank" onClick={() => setTab('payouts')} />
        <Tile theme={theme} icon={Scale} label="Price Comparison" hint="Where buyers see you" href="/compare-prices" />
      </div>

      {account === undefined ? (
        <p className="flex items-center gap-2 text-slate-600"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…</p>
      ) : account === null ? (
        <p role="alert" className="flex items-center gap-2 rounded-2xl bg-amber-50 p-4 text-amber-900 ring-1 ring-amber-200"><Store className="h-5 w-5" aria-hidden /> Sign in again to manage your products.</p>
      ) : (
        <SellerDesk account={account} theme={theme} show={tab} onLoaded={onLoaded} />
      )}
    </PortalShell>
  );
}
