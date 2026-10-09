'use client';

/**
 * Kissan Tools — one store for orchard equipment, agrochemicals, machinery and
 * packaging: browse by category, add to cart, place an order, follow it.
 *
 * Cart and orders live in the browser (kr_kissan_cart / kr_kissan_orders)
 * until an inputs-ordering API exists.
 */
import { useState } from 'react';
import {
  Beaker,
  Box,
  CheckCircle2,
  Minus,
  Package,
  Plus,
  ShoppingCart,
  Sprout,
  Store,
  Tractor,
  Trash2,
  Truck,
} from 'lucide-react';
import { toast } from 'sonner';

import { PortalShell } from '@/components/layout/PortalShell';
import { Badge, Btn, EmptyState, PORTAL_THEMES, Panel, inr } from '@/components/portal/kit';
import { localId, usePersistentState } from '@/lib/portal-store';

const theme = PORTAL_THEMES.kissan;

type Category = 'equipment' | 'chemicals' | 'machinery' | 'packaging';

interface Item {
  id: string;
  name: string;
  category: Category;
  price: number;
  unit: string;
  stock: 'in' | 'low' | 'out';
}

const CATALOG: Item[] = [
  { id: 'EQ-1', name: 'High-density trellis poles', category: 'equipment', price: 420, unit: 'pole', stock: 'in' },
  { id: 'EQ-2', name: 'Pruning secateurs (pro)', category: 'equipment', price: 890, unit: 'piece', stock: 'in' },
  { id: 'EQ-3', name: 'Drip irrigation line (100 m)', category: 'equipment', price: 2400, unit: 'roll', stock: 'low' },
  { id: 'EQ-4', name: 'Anti-hail net', category: 'equipment', price: 38, unit: 'm²', stock: 'in' },
  { id: 'CH-1', name: 'Urea (46% N), 45 kg', category: 'chemicals', price: 267, unit: 'bag', stock: 'in' },
  { id: 'CH-2', name: 'DAP (18-46-0), 50 kg', category: 'chemicals', price: 1350, unit: 'bag', stock: 'in' },
  { id: 'CH-3', name: 'MOP (potash), 50 kg', category: 'chemicals', price: 1700, unit: 'bag', stock: 'low' },
  { id: 'CH-4', name: 'Scab fungicide (verified batch)', category: 'chemicals', price: 640, unit: 'litre', stock: 'in' },
  { id: 'MC-1', name: 'Hydraulic orchard sprayer', category: 'machinery', price: 48500, unit: 'unit', stock: 'in' },
  { id: 'MC-2', name: 'Power weeder', category: 'machinery', price: 32000, unit: 'unit', stock: 'low' },
  { id: 'PK-1', name: 'Apple box, universal 10 kg', category: 'packaging', price: 146, unit: 'box', stock: 'in' },
  { id: 'PK-2', name: 'Telescopic apple box, 20 kg', category: 'packaging', price: 190, unit: 'box', stock: 'in' },
  { id: 'PK-3', name: 'Plastic harvest crate', category: 'packaging', price: 310, unit: 'crate', stock: 'in' },
  { id: 'PK-4', name: 'Jute sack (walnuts)', category: 'packaging', price: 55, unit: 'sack', stock: 'out' },
];

const CATEGORIES: { id: Category; label: string; icon: typeof Sprout }[] = [
  { id: 'equipment', label: 'Orchard equipment', icon: Sprout },
  { id: 'chemicals', label: 'Agrochemicals', icon: Beaker },
  { id: 'machinery', label: 'Machinery', icon: Tractor },
  { id: 'packaging', label: 'Packaging', icon: Box },
];

type CartLine = { id: string; qty: number };
type OrderStatus = 'processing' | 'shipped' | 'delivered';
interface KissanOrder {
  id: string;
  lines: { name: string; qty: number; price: number }[];
  total: number;
  status: OrderStatus;
}

const EMPTY_CART: CartLine[] = [];
const SEED_ORDERS: KissanOrder[] = [
  { id: 'KT-3301', lines: [{ name: 'Urea (46% N), 45 kg', qty: 10, price: 267 }], total: 2670, status: 'shipped' },
];

const STATUS: Record<OrderStatus, { label: string; tone: 'amber' | 'blue' | 'green'; next?: OrderStatus; action?: string }> = {
  processing: { label: 'Processing', tone: 'amber', next: 'shipped', action: 'Mark shipped' },
  shipped: { label: 'Out for delivery', tone: 'blue', next: 'delivered', action: 'Confirm received' },
  delivered: { label: 'Delivered', tone: 'green' },
};

const STOCK = {
  in: <Badge tone="green">In stock</Badge>,
  low: <Badge tone="amber">Low stock</Badge>,
  out: <Badge tone="red">Out of stock</Badge>,
};

export default function KissanToolsDashboardPage() {
  const [tab, setTab] = useState<string>('shop');
  const [category, setCategory] = useState<Category>('equipment');
  const [cart, setCart] = usePersistentState<CartLine[]>('kr_kissan_cart', EMPTY_CART);
  const [orders, setOrders] = usePersistentState<KissanOrder[]>('kr_kissan_orders', SEED_ORDERS);

  const itemById = (id: string) => CATALOG.find((i) => i.id === id);
  const cartTotal = cart.reduce((sum, line) => sum + (itemById(line.id)?.price ?? 0) * line.qty, 0);
  const cartCount = cart.reduce((sum, line) => sum + line.qty, 0);

  const add = (item: Item) => {
    setCart((all) => {
      const hit = all.find((l) => l.id === item.id);
      return hit ? all.map((l) => (l.id === item.id ? { ...l, qty: l.qty + 1 } : l)) : [...all, { id: item.id, qty: 1 }];
    });
    toast.success(`${item.name} added to cart`);
  };

  const changeQty = (id: string, delta: number) =>
    setCart((all) => all.map((l) => (l.id === id ? { ...l, qty: l.qty + delta } : l)).filter((l) => l.qty > 0));

  const placeOrder = () => {
    if (cart.length === 0) return;
    const lines = cart.map((l) => {
      const item = itemById(l.id)!;
      return { name: item.name, qty: l.qty, price: item.price };
    });
    const id = localId('KT');
    setOrders((all) => [{ id, lines, total: cartTotal, status: 'processing' }, ...all]);
    setCart([]);
    setTab('orders');
    toast.success(`Order ${id} placed — ${inr.format(cartTotal)}`);
  };

  return (
    <PortalShell
      title="Kissan Tools"
      description="Verified inputs, orchard equipment, machinery and packaging — delivered to your gate."
      eyebrow="Inputs & equipment"
      theme="kissan"
      kpis={[
        { label: 'Products', value: String(CATALOG.length), trend: 'Verified suppliers' },
        { label: 'In cart', value: String(cartCount), trend: inr.format(cartTotal) },
        { label: 'Orders', value: String(orders.length), trend: `${orders.filter((o) => o.status !== 'delivered').length} on the way` },
      ]}
      tabs={[
        { id: 'shop', label: 'Shop', icon: Store },
        { id: 'cart', label: 'Cart', icon: ShoppingCart, count: cartCount },
        { id: 'orders', label: 'Orders', icon: Package, count: orders.length },
      ]}
      activeTab={tab}
      onTabChange={setTab}
      actions={
        <>
          <Btn theme={theme} variant="white" icon={ShoppingCart} onClick={() => setTab('cart')}>
            Cart ({cartCount})
          </Btn>
          <Btn theme={theme} variant="white" icon={Tractor} href="/rental/dashboard">
            Rent machinery
          </Btn>
        </>
      }
    >
      {tab === 'shop' && (
        <>
          <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label="Categories">
            {CATEGORIES.map(({ id, label, icon }) => (
              <Btn
                key={id}
                theme={theme}
                variant={category === id ? 'solid' : 'soft'}
                icon={icon}
                aria-pressed={category === id}
                onClick={() => setCategory(id)}
              >
                {label}
              </Btn>
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {CATALOG.filter((i) => i.category === category).map((item) => (
              <div key={item.id} className="flex flex-col rounded-2xl bg-white/80 p-5 ring-1 ring-slate-900/5 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-slate-900">{item.name}</p>
                  {STOCK[item.stock]}
                </div>
                <p className="mt-2 text-lg font-bold text-orange-800">
                  {inr.format(item.price)} <span className="text-sm font-normal text-slate-500">/ {item.unit}</span>
                </p>
                <div className="mt-auto flex gap-2 pt-4">
                  <Btn theme={theme} size="sm" icon={ShoppingCart} disabled={item.stock === 'out'} onClick={() => add(item)}>
                    {item.stock === 'out' ? 'Unavailable' : 'Add to cart'}
                  </Btn>
                  {item.category === 'machinery' && (
                    <Btn theme={theme} variant="soft" size="sm" href="/rental/dashboard">Rent instead</Btn>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === 'cart' && (
        <Panel theme={theme} title="Your cart" icon={ShoppingCart}>
          {cart.length === 0 ? (
            <EmptyState theme={theme} icon={ShoppingCart} title="Cart is empty" text="Add inputs or equipment from the shop." action={<Btn theme={theme} onClick={() => setTab('shop')}>Go to shop</Btn>} />
          ) : (
            <>
              <ul className="divide-y divide-slate-900/5">
                {cart.map((line) => {
                  const item = itemById(line.id);
                  if (!item) return null;
                  return (
                    <li key={line.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                      <div>
                        <p className="font-semibold text-slate-900">{item.name}</p>
                        <p className="text-sm text-slate-500">{inr.format(item.price)} / {item.unit}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Btn theme={theme} variant="soft" size="sm" icon={Minus} aria-label={`One less ${item.name}`} onClick={() => changeQty(line.id, -1)} />
                        <span className="w-8 text-center font-semibold tabular-nums">{line.qty}</span>
                        <Btn theme={theme} variant="soft" size="sm" icon={Plus} aria-label={`One more ${item.name}`} onClick={() => changeQty(line.id, 1)} />
                        <span className="w-24 text-right font-bold tabular-nums">{inr.format(item.price * line.qty)}</span>
                        <Btn theme={theme} variant="danger" size="sm" icon={Trash2} aria-label={`Remove ${item.name}`} onClick={() => changeQty(line.id, -line.qty)} />
                      </div>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-900/5 pt-5">
                <p className="text-lg">
                  Total <span className="font-bold text-orange-800">{inr.format(cartTotal)}</span>
                </p>
                <div className="flex gap-2">
                  <Btn theme={theme} variant="ghost" onClick={() => setCart([])}>Clear cart</Btn>
                  <Btn theme={theme} icon={CheckCircle2} onClick={placeOrder}>Place order</Btn>
                </div>
              </div>
            </>
          )}
        </Panel>
      )}

      {tab === 'orders' && (
        <Panel theme={theme} title="Your orders" icon={Package}>
          {orders.length === 0 ? (
            <EmptyState theme={theme} icon={Package} title="No orders yet" text="Orders you place from the cart appear here." />
          ) : (
            <ul className="space-y-3">
              {orders.map((o) => {
                const s = STATUS[o.status];
                return (
                  <li key={o.id} className="flex flex-col gap-3 rounded-2xl bg-white/70 p-4 ring-1 ring-slate-900/5 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-xs text-slate-500">{o.id}</p>
                      <p className="font-semibold text-slate-900">{o.lines.map((l) => `${l.qty} × ${l.name}`).join(', ')}</p>
                      <p className="mt-1 flex items-center gap-2 text-sm">
                        <span className="font-bold text-orange-800">{inr.format(o.total)}</span>
                        <Badge tone={s.tone}>{s.label}</Badge>
                      </p>
                    </div>
                    {s.action && (
                      <Btn
                        theme={theme}
                        size="sm"
                        icon={Truck}
                        onClick={() => {
                          setOrders((all) => all.map((x) => (x.id === o.id ? { ...x, status: s.next! } : x)));
                          toast.success(`${o.id}: ${STATUS[s.next!].label}`);
                        }}
                      >
                        {s.action}
                      </Btn>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      )}
    </PortalShell>
  );
}
