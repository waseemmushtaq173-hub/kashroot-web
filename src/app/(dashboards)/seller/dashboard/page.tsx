'use client';

/**
 * Seller portal — product catalogue, orders and payout settings.
 *
 * Catalogue and orders live in the browser (kr_seller_products /
 * kr_seller_orders). "Publish" copies a product into the Price Comparison
 * page's dealer listings (kr_mock_dealer_listings), so it shows up there for
 * buyers. Payout details keep only the account's last four digits.
 */
import { useState } from 'react';
import {
  Banknote,
  Boxes,
  CheckCircle2,
  LayoutDashboard,
  Minus,
  Package,
  PackageCheck,
  Plus,
  PlusCircle,
  Scale,
  Send,
  ShieldCheck,
  Trash2,
  Truck,
} from 'lucide-react';
import { toast } from 'sonner';

import { PortalShell } from '@/components/layout/PortalShell';
import { Badge, Btn, EmptyState, Field, INPUT, Modal, PORTAL_THEMES, Panel, Tile, inr } from '@/components/portal/kit';
import { PayoutPanel } from '@/components/portal/PayoutPanel';
import { DEALER_LISTINGS_KEY, DEFAULT_LISTINGS, type DealerListing } from '@/lib/dealer-listings';
import { localId, usePersistentState } from '@/lib/portal-store';

const theme = PORTAL_THEMES.seller;

interface Product {
  id: string;
  name: string;
  category: string;
  price: number;
  stock: number;
  published: boolean;
}

type Stage = 'new' | 'packed' | 'shipped' | 'delivered';
interface SellerOrder {
  id: string;
  product: string;
  qty: number;
  buyer: string;
  amount: number;
  stage: Stage;
}

const SEED_PRODUCTS: Product[] = [
  { id: 'PRD-1', name: 'Apple Corrugated Box (10kg)', category: 'Packaging', price: 146, stock: 3200, published: false },
  { id: 'PRD-2', name: 'Pruning Secateurs (Pro)', category: 'Machinery', price: 890, stock: 140, published: false },
  { id: 'PRD-3', name: 'Anti-Hail Net (per m²)', category: 'Supplies', price: 38, stock: 9000, published: false },
];

const SEED_ORDERS: SellerOrder[] = [
  { id: 'SO-5512', product: 'Apple Corrugated Box (10kg)', qty: 500, buyer: 'Green Valley Orchards', amount: 73000, stage: 'new' },
  { id: 'SO-5507', product: 'Pruning Secateurs (Pro)', qty: 12, buyer: 'Orchard Traders', amount: 10680, stage: 'packed' },
];

const STAGES: Record<Stage, { label: string; tone: 'amber' | 'blue' | 'violet' | 'green'; next?: Stage; action?: string }> = {
  new: { label: 'New order', tone: 'amber', next: 'packed', action: 'Accept & pack' },
  packed: { label: 'Packed', tone: 'violet', next: 'shipped', action: 'Mark shipped' },
  shipped: { label: 'Shipped', tone: 'blue', next: 'delivered', action: 'Mark delivered' },
  delivered: { label: 'Delivered', tone: 'green' },
};

const EMPTY_PRODUCT = { name: '', category: 'Packaging', price: '', stock: '' };

export default function SellerDashboardPage() {
  const [tab, setTab] = useState('catalog');
  const [products, setProducts] = usePersistentState<Product[]>('kr_seller_products', SEED_PRODUCTS);
  const [orders, setOrders] = usePersistentState<SellerOrder[]>('kr_seller_orders', SEED_ORDERS);
  const [, setDealerListings] = usePersistentState<DealerListing[]>(DEALER_LISTINGS_KEY, DEFAULT_LISTINGS);
  const [addOpen, setAddOpen] = useState(false);
  const [draft, setDraft] = useState(EMPTY_PRODUCT);

  const revenue = orders.filter((o) => o.stage === 'delivered').reduce((s, o) => s + o.amount, 0);

  const addProduct = () => {
    const price = Number(draft.price);
    const stock = Number(draft.stock);
    if (!draft.name.trim() || !(price > 0) || !(stock >= 0)) return toast.error('Name, price and stock are required.');
    setProducts((all) => [{ id: localId('PRD'), name: draft.name.trim(), category: draft.category, price, stock, published: false }, ...all]);
    setDraft(EMPTY_PRODUCT);
    setAddOpen(false);
    toast.success('Product added to your catalogue');
  };

  const publish = (p: Product) => {
    setDealerListings((all) => [
      { id: p.id, category: p.category, item: p.name, name: 'Your store', location: 'Your town', price: String(p.price), verified: true, updated: 'Just now', stock: String(p.stock) },
      ...all.filter((l) => l.id !== p.id),
    ]);
    setProducts((all) => all.map((x) => (x.id === p.id ? { ...x, published: true } : x)));
    toast.success(`${p.name} is now on Price Comparison`);
  };

  return (
    <PortalShell
      title="Grow your agri-business"
      description="Your catalogue, incoming orders and escrow payouts in one place."
      eyebrow="Seller portal"
      theme="seller"
      kpis={[
        { label: 'Products', value: String(products.length), trend: `${products.filter((p) => p.published).length} published` },
        { label: 'Open orders', value: String(orders.filter((o) => o.stage !== 'delivered').length), trend: 'To fulfil' },
        { label: 'Delivered revenue', value: inr.format(revenue), trend: 'Released from escrow' },
      ]}
      tabs={[
        { id: 'catalog', label: 'Catalogue', icon: Boxes, count: products.length },
        { id: 'orders', label: 'Orders', icon: Package, count: orders.length },
        { id: 'payouts', label: 'Payouts', icon: Banknote },
      ]}
      activeTab={tab}
      onTabChange={setTab}
      actions={
        <Btn theme={theme} variant="white" icon={PlusCircle} onClick={() => setAddOpen(true)}>
          Add product
        </Btn>
      }
    >
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile theme={theme} icon={LayoutDashboard} label="Catalogue" hint="Products & stock" onClick={() => setTab('catalog')} />
        <Tile theme={theme} icon={Package} label="Orders" hint="Pack & ship" onClick={() => setTab('orders')} />
        <Tile theme={theme} icon={Scale} label="Price Comparison" hint="Where buyers see you" href="/compare-prices" />
        <Tile theme={theme} icon={ShieldCheck} label="Escrow" hint="Track payments" href="/escrow" />
      </div>

      {tab === 'catalog' && (
        <Panel theme={theme} title="Catalogue" icon={Boxes} action={<Btn theme={theme} icon={PlusCircle} onClick={() => setAddOpen(true)}>Add product</Btn>}>
          {products.length === 0 ? (
            <EmptyState theme={theme} icon={Boxes} title="Your catalogue is empty" text="Add your first product to start selling." action={<Btn theme={theme} onClick={() => setAddOpen(true)}>Add product</Btn>} />
          ) : (
            <ul className="divide-y divide-slate-900/5">
              {products.map((p) => (
                <li key={p.id} className="flex flex-col gap-3 py-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-xs text-slate-500">{p.category}</p>
                    <p className="font-semibold text-slate-900">{p.name}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-bold text-amber-800">{inr.format(p.price)}</span>
                      <Badge tone={p.stock < 50 ? 'red' : 'slate'}>{p.stock} in stock</Badge>
                      {p.published && <Badge tone="green">On Price Comparison</Badge>}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Btn theme={theme} variant="soft" size="sm" icon={Minus} aria-label={`Reduce ${p.name} stock by 10`}
                      onClick={() => setProducts((all) => all.map((x) => (x.id === p.id ? { ...x, stock: Math.max(0, x.stock - 10) } : x)))}>
                      10
                    </Btn>
                    <Btn theme={theme} variant="soft" size="sm" icon={Plus} aria-label={`Add 10 to ${p.name} stock`}
                      onClick={() => setProducts((all) => all.map((x) => (x.id === p.id ? { ...x, stock: x.stock + 10 } : x)))}>
                      10
                    </Btn>
                    <Btn theme={theme} size="sm" icon={Send} disabled={p.published} onClick={() => publish(p)}>
                      {p.published ? 'Published' : 'Publish'}
                    </Btn>
                    <Btn theme={theme} variant="danger" size="sm" icon={Trash2}
                      onClick={() => { setProducts((all) => all.filter((x) => x.id !== p.id)); toast.success(`${p.name} removed`); }}>
                      Remove
                    </Btn>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}

      {tab === 'orders' && (
        <Panel theme={theme} title="Orders" icon={Package}>
          {orders.length === 0 ? (
            <EmptyState theme={theme} icon={Package} title="No orders yet" text="Publish products to Price Comparison to start receiving orders." />
          ) : (
            <ul className="space-y-3">
              {orders.map((o) => {
                const stage = STAGES[o.stage];
                return (
                  <li key={o.id} className="flex flex-col gap-3 rounded-2xl bg-white/70 p-4 ring-1 ring-slate-900/5 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-xs text-slate-500">{o.id} · {o.buyer}</p>
                      <p className="font-semibold text-slate-900">{o.qty} × {o.product}</p>
                      <p className="mt-1 flex items-center gap-2 text-sm">
                        <span className="font-bold text-amber-800">{inr.format(o.amount)}</span>
                        <Badge tone={stage.tone}>{stage.label}</Badge>
                      </p>
                    </div>
                    {stage.action ? (
                      <Btn theme={theme} size="sm" icon={o.stage === 'packed' ? Truck : PackageCheck}
                        onClick={() => {
                          setOrders((all) => all.map((x) => (x.id === o.id ? { ...x, stage: stage.next! } : x)));
                          toast.success(`${o.id}: ${STAGES[stage.next!].label}`);
                        }}>
                        {stage.action}
                      </Btn>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700">
                        <CheckCircle2 className="h-4 w-4" aria-hidden /> Complete
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      )}

      {tab === 'payouts' && <PayoutPanel theme={theme} storageKey="kr_seller_payout" />}

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add a product"
        footer={
          <>
            <Btn theme={theme} variant="ghost" onClick={() => setAddOpen(false)}>Cancel</Btn>
            <Btn theme={theme} icon={PlusCircle} onClick={addProduct}>Add product</Btn>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Product name">
              <input className={INPUT} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Plastic harvest crate" />
            </Field>
          </div>
          <Field label="Category">
            <select className={INPUT} value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>
              <option>Packaging</option>
              <option>Agrochemicals</option>
              <option>Machinery</option>
              <option>Supplies</option>
            </select>
          </Field>
          <Field label="Price per unit (₹)">
            <input type="number" min={1} className={INPUT} value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} />
          </Field>
          <Field label="Stock">
            <input type="number" min={0} className={INPUT} value={draft.stock} onChange={(e) => setDraft({ ...draft, stock: e.target.value })} />
          </Field>
        </div>
      </Modal>
    </PortalShell>
  );
}
