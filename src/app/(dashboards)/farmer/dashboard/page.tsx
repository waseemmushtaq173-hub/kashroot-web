'use client';

/**
 * Farmer portal — overview, produce lots and orders.
 *
 * Lots and orders have no farmer-scoped API yet, so they live in the browser
 * via usePersistentState (keys kr_farmer_lots / kr_farmer_orders). Every
 * control acts on that data or links to a page that exists.
 */
import { useState } from 'react';
import {
  Activity,
  ArrowRight,
  Bot,
  CalendarDays,
  CheckCircle2,
  CloudSun,
  Droplets,
  FlaskConical,
  IndianRupee,
  Package,
  Pause,
  Pencil,
  Play,
  PlusCircle,
  ShieldCheck,
  ShoppingCart,
  Sprout,
  Store,
  Trash2,
  TrendingUp,
  Truck,
  Warehouse,
  MessageCircleQuestion,
} from 'lucide-react';
import { toast } from 'sonner';

import { PortalShell } from '@/components/layout/PortalShell';
import {
  Badge,
  Btn,
  EmptyState,
  Field,
  INPUT,
  Modal,
  PORTAL_THEMES,
  Panel,
  Tile,
  inr,
} from '@/components/portal/kit';
import { FARMER_LOTS_KEY, SEED_LOTS, type Lot } from '@/lib/farmer-lots';
import { usePersistentState } from '@/lib/portal-store';

const theme = PORTAL_THEMES.farmer;


type OrderStage = 'awaiting' | 'dispatched' | 'delivered' | 'paid';

interface Order {
  id: string;
  item: string;
  buyer: string;
  amount: number;
  stage: OrderStage;
}


const SEED_ORDERS: Order[] = [
  { id: 'ORD-9921', item: '200 boxes Grade-A Delicious', buyer: 'Fresh Valley Retail', amount: 145000, stage: 'awaiting' },
  { id: 'ORD-9918', item: '50 kg Premium Walnut', buyer: 'NutriMart Wholesale', amount: 82500, stage: 'dispatched' },
  { id: 'ORD-9907', item: '120 boxes Gala', buyer: 'Metro Fruit Co.', amount: 96000, stage: 'paid' },
];

const STAGES: Record<OrderStage, { label: string; tone: 'amber' | 'blue' | 'violet' | 'green'; next?: OrderStage; action?: string }> = {
  awaiting: { label: 'Awaiting dispatch', tone: 'amber', next: 'dispatched', action: 'Mark dispatched' },
  dispatched: { label: 'In transit', tone: 'blue', next: 'delivered', action: 'Mark delivered' },
  delivered: { label: 'Buyer inspecting', tone: 'violet', next: 'paid', action: 'Confirm payout' },
  paid: { label: 'Paid out', tone: 'green' },
};

export default function FarmerDashboard() {
  const [tab, setTab] = useState('overview');
  const [lots, setLots] = usePersistentState<Lot[]>(FARMER_LOTS_KEY, SEED_LOTS);
  const [orders, setOrders] = usePersistentState<Order[]>('kr_farmer_orders', SEED_ORDERS);
  const [editing, setEditing] = useState<Lot | null>(null);
  const [price, setPrice] = useState('');

  const received = orders.filter((o) => o.stage === 'paid').reduce((sum, o) => sum + o.amount, 0);
  const inEscrow = orders.filter((o) => o.stage !== 'paid').reduce((sum, o) => sum + o.amount, 0);
  const liveLots = lots.filter((l) => l.status === 'live').length;

  const advance = (order: Order) => {
    const next = STAGES[order.stage].next;
    if (!next) return;
    setOrders((all) => all.map((o) => (o.id === order.id ? { ...o, stage: next } : o)));
    toast.success(`${order.id}: ${STAGES[next].label}`);
  };

  const savePrice = () => {
    const value = Number(price);
    if (!editing || !Number.isFinite(value) || value <= 0) return;
    setLots((all) => all.map((l) => (l.id === editing.id ? { ...l, price: value } : l)));
    toast.success(`${editing.crop} now ${inr.format(value)} / ${editing.unit}`);
    setEditing(null);
  };

  return (
    <PortalShell
      title="Salaam, welcome back"
      description="Your orchard at a glance — lots on the market, orders in escrow and today’s spray window."
      eyebrow="Farmer portal"
      theme="farmer"
      kpis={[
        { label: 'Total received', value: inr.format(received), trend: 'Released from escrow' },
        { label: 'In escrow', value: inr.format(inEscrow), trend: `${orders.filter((o) => o.stage !== 'paid').length} open orders` },
        { label: 'Live lots', value: String(liveLots), trend: `${lots.reduce((s, l) => s + l.interest, 0)} buyer enquiries` },
        { label: 'Orchard grade', value: 'A+', trend: 'Residue test passed' },
      ]}
      tabs={[
        { id: 'overview', label: 'Overview', icon: Sprout },
        { id: 'lots', label: 'My lots', icon: Store, count: lots.length },
        { id: 'orders', label: 'Orders', icon: Package, count: orders.length },
      ]}
      activeTab={tab}
      onTabChange={setTab}
      actions={
        <Btn theme={theme} variant="white" icon={PlusCircle} href="/farmer/listings/new">
          List produce
        </Btn>
      }
    >
      {tab === 'overview' && (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Tile theme={theme} icon={PlusCircle} label="Sell produce" hint="Create a new lot" href="/farmer/listings/new" />
              <Tile theme={theme} icon={Warehouse} label="Cold storage" hint="Rent CA space & machinery" href="/rental/dashboard" />
              <Tile theme={theme} icon={ShoppingCart} label="Buy inputs" hint="Verified supplies" href="/supplies" />
              <Tile theme={theme} icon={MessageCircleQuestion} label="Ask an expert" hint="Agronomist answers" href="/expert" />
              <Tile theme={theme} icon={Activity} label="Orchard health" hint="Risk map & sprays" href="/orchard-health" />
              <Tile theme={theme} icon={CalendarDays} label="Season planner" hint="Tasks & ROI" href="/season-planner" />
              <Tile theme={theme} icon={TrendingUp} label="Mandi rates" hint="Live prices" href="/mandi-weather" />
              <Tile theme={theme} icon={FlaskConical} label="Test inputs" hint="Spot fake batches" href="/farmer/tester" />
            </div>

            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-emerald-700 via-emerald-600 to-amber-600 p-7 text-white shadow-lg">
              <h3 className="font-sans text-2xl font-bold">Ready to harvest?</h3>
              <p className="mt-1 max-w-md text-white/90">
                List apples, walnuts or saffron and reach verified buyers across India — payment held in escrow until delivery.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <Btn theme={theme} variant="white" icon={PlusCircle} href="/farmer/listings/new">
                  List your product
                </Btn>
                <Btn theme={theme} variant="white" icon={Bot} href="/farmer/assistant">
                  Ask the assistant
                </Btn>
              </div>
            </div>

            <Panel
              theme={theme}
              title="Orders needing you"
              icon={Package}
              action={
                <Btn theme={theme} variant="ghost" size="sm" onClick={() => setTab('orders')}>
                  View all <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </Btn>
              }
            >
              <OrderList orders={orders.filter((o) => o.stage !== 'paid')} onAdvance={advance} />
            </Panel>
          </div>

          <div className="space-y-6">
            <Panel theme={theme} title="Today in the orchard" icon={CloudSun}>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-amber-50 p-4 text-center ring-1 ring-amber-100">
                  <CloudSun className="mx-auto h-7 w-7 text-amber-600" aria-hidden />
                  <p className="mt-1 text-2xl font-bold">24°C</p>
                  <p className="text-xs text-slate-600">Mostly sunny</p>
                </div>
                <div className="rounded-2xl bg-teal-50 p-4 text-center ring-1 ring-teal-100">
                  <Droplets className="mx-auto h-7 w-7 text-teal-600" aria-hidden />
                  <p className="mt-1 text-2xl font-bold">Low</p>
                  <p className="text-xs text-slate-600">Scab risk</p>
                </div>
              </div>
              <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-center text-sm font-medium text-emerald-800 ring-1 ring-emerald-100">
                Best spray window: 4:00 PM – 7:00 PM
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Btn theme={theme} variant="soft" size="sm" href="/weather-alerts">Weather alerts</Btn>
                <Btn theme={theme} variant="soft" size="sm" href="/orchard-health">Log a spray</Btn>
              </div>
            </Panel>

            <Panel theme={theme} title="Escrow protection" icon={ShieldCheck}>
              <p className="text-sm text-slate-600">
                Every order’s money is locked before you dispatch, and released when the buyer confirms delivery.
              </p>
              <Btn theme={theme} variant="soft" className="mt-4 w-full" href="/escrow">
                Open escrow tracker
              </Btn>
            </Panel>
          </div>
        </div>
      )}

      {tab === 'lots' && (
        <Panel
          theme={theme}
          title="My produce lots"
          icon={Store}
          action={<Btn theme={theme} icon={PlusCircle} href="/farmer/listings/new">New lot</Btn>}
        >
          {lots.length === 0 ? (
            <EmptyState
              theme={theme}
              icon={Store}
              title="No lots yet"
              text="Create your first lot to start receiving buyer enquiries."
              action={<Btn theme={theme} href="/farmer/listings/new">Create a lot</Btn>}
            />
          ) : (
            <ul className="divide-y divide-slate-900/5">
              {lots.map((lot) => (
                <li key={lot.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs text-slate-500">{lot.id}</p>
                    <p className="font-semibold text-slate-900">
                      {lot.crop} <span className="font-normal text-slate-500">· Grade {lot.grade} · {lot.quantity}</span>
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-bold text-emerald-800">{inr.format(lot.price)} / {lot.unit}</span>
                      {lot.status === 'live' ? <Badge tone="green">Live</Badge> : <Badge>Paused</Badge>}
                      <Badge tone="blue">{lot.interest} enquiries</Badge>
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Btn
                      theme={theme}
                      variant="soft"
                      size="sm"
                      icon={Pencil}
                      onClick={() => {
                        setEditing(lot);
                        setPrice(String(lot.price));
                      }}
                    >
                      Edit price
                    </Btn>
                    <Btn
                      theme={theme}
                      variant="soft"
                      size="sm"
                      icon={lot.status === 'live' ? Pause : Play}
                      onClick={() => {
                        setLots((all) => all.map((l) => (l.id === lot.id ? { ...l, status: l.status === 'live' ? 'paused' : 'live' } : l)));
                        toast.success(lot.status === 'live' ? `${lot.crop} paused` : `${lot.crop} is live again`);
                      }}
                    >
                      {lot.status === 'live' ? 'Pause' : 'Resume'}
                    </Btn>
                    <Btn
                      theme={theme}
                      variant="danger"
                      size="sm"
                      icon={Trash2}
                      onClick={() => {
                        setLots((all) => all.filter((l) => l.id !== lot.id));
                        toast.success(`${lot.crop} removed`);
                      }}
                    >
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
        <Panel theme={theme} title="All orders" icon={Package}>
          <OrderList orders={orders} onAdvance={advance} />
        </Panel>
      )}

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing ? `Price for ${editing.crop}` : 'Edit price'}
        footer={
          <>
            <Btn theme={theme} variant="ghost" onClick={() => setEditing(null)}>Cancel</Btn>
            <Btn theme={theme} icon={IndianRupee} onClick={savePrice}>Save price</Btn>
          </>
        }
      >
        <Field label={`Price per ${editing?.unit ?? 'unit'} (₹)`}>
          <input
            type="number"
            min={1}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className={INPUT}
          />
        </Field>
      </Modal>
    </PortalShell>
  );
}

function OrderList({ orders, onAdvance }: { orders: Order[]; onAdvance: (o: Order) => void }) {
  if (orders.length === 0) {
    return <EmptyState theme={theme} icon={CheckCircle2} title="All caught up" text="No orders need your attention right now." />;
  }
  return (
    <ul className="space-y-3">
      {orders.map((order) => {
        const stage = STAGES[order.stage];
        return (
          <li
            key={order.id}
            className="flex flex-col gap-3 rounded-2xl bg-white/70 p-4 ring-1 ring-slate-900/5 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <p className="text-xs text-slate-500">{order.id} · {order.buyer}</p>
              <p className="font-semibold text-slate-900">{order.item}</p>
              <p className="mt-1 flex items-center gap-2 text-sm">
                <span className="font-bold text-emerald-800">{inr.format(order.amount)}</span>
                <Badge tone={stage.tone}>{stage.label}</Badge>
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {stage.action && (
                <Btn theme={theme} size="sm" icon={Truck} onClick={() => onAdvance(order)}>
                  {stage.action}
                </Btn>
              )}
              <Btn theme={theme} variant="soft" size="sm" href="/escrow">Escrow</Btn>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
