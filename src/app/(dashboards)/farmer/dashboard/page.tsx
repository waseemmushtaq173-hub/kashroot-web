'use client';

/**
 * Farmer portal — overview, everything the farmer sells, orders and safe payment.
 *
 * Produce and farm inputs (what the old Seller portal did) are listed on the
 * shared marketplace (market_listings), so buyers see them on Price
 * Comparison and can order. Orders are pay-after-delivery: the buyer pays the
 * farmer directly by UPI / bank once the goods arrive. Safe payment holds the
 * identity check (KYC) and where buyers pay. Today's weather comes from
 * Open-Meteo for the farmer's district (My details).
 */
import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Activity,
  ArrowRight,
  Banknote,
  Bot,
  CalendarDays,
  CloudSun,
  Droplets,
  FlaskConical,
  Loader2,
  MessageCircleQuestion,
  Package,
  PlusCircle,
  ShieldCheck,
  Sprout,
  Store,
  Thermometer,
  TrendingUp,
  Warehouse,
} from 'lucide-react';

import { PortalShell } from '@/components/layout/PortalShell';
import { SellerDesk } from '@/components/market/SellerDesk';
import { SafePayment } from '@/components/payments/SafePayment';
import { Btn, PORTAL_THEMES, Panel, Tile } from '@/components/portal/kit';
import { inr, loadAccount, type Account } from '@/lib/db/client';
import { dryHours } from '@/lib/sprayWindow';
import type { MarketCategory, MarketListing, MarketOrder } from '@/lib/db/market';

const theme = PORTAL_THEMES.farmer;
type Tab = 'overview' | 'lots' | 'orders' | 'payouts';
const TABS: Tab[] = ['overview', 'lots', 'orders', 'payouts'];

export default function FarmerDashboardPage() {
  return (
    <Suspense>
      <FarmerDashboard />
    </Suspense>
  );
}

function FarmerDashboard() {
  const params = useSearchParams();
  const initial = params.get('tab') as Tab | null;
  const [tab, setTab] = useState<Tab>(initial && TABS.includes(initial) ? initial : 'overview');
  const [addRequest, setAddRequest] = useState(params.get('add') === '1' ? 1 : 0);
  // What "add" opens: produce from the orchard, or farm inputs for sale.
  const [addCategory, setAddCategory] = useState<MarketCategory>(params.get('sell') === 'supplies' ? 'supplies' : 'produce');
  const [account, setAccount] = useState<Account | null | undefined>(undefined);
  const [stats, setStats] = useState<{ products: MarketListing[]; orders: MarketOrder[] } | null>(null);

  useEffect(() => {
    void loadAccount().then(setAccount).catch(() => setAccount(null));
  }, []);

  const onLoaded = useCallback((products: MarketListing[], orders: MarketOrder[]) => setStats({ products, orders }), []);
  const listProduct = (category: MarketCategory) => {
    setAddCategory(category);
    setTab('lots');
    setAddRequest((n) => n + 1);
  };
  const listProduce = () => listProduct('produce');

  const products = stats?.products ?? [];
  const orders = stats?.orders ?? [];
  const toAct = orders.filter((o) => ['placed', 'accepted', 'paid'].includes(o.status)).length;
  const received = orders.filter((o) => o.status === 'completed').reduce((s, o) => s + Number(o.amount), 0);
  const onSale = products.filter((p) => p.active && Number(p.quantity) > 0).length;

  return (
    <PortalShell
      title={account?.name ? `Welcome, ${account.name.split(' ')[0]}` : 'Welcome back'}
      description="Sell your harvest and farm inputs, get paid safely after delivery, and check today’s weather before you spray."
      eyebrow="Farmer portal"
      theme="farmer"
      kpis={[
        { label: 'Money received', value: inr(received), trend: 'Paid to you directly' },
        { label: 'Orders to act on', value: String(toAct), trend: 'Accept, ship, confirm payment' },
        { label: 'On sale', value: String(onSale), trend: 'Produce and farm inputs' },
      ]}
      tabs={[
        { id: 'overview', label: 'Overview', icon: Sprout },
        { id: 'lots', label: 'What I sell', icon: Store, count: products.length || undefined },
        { id: 'orders', label: 'Orders', icon: Package, count: toAct || undefined },
        { id: 'payouts', label: 'Safe payment', icon: ShieldCheck },
      ]}
      activeTab={tab}
      onTabChange={(id) => setTab(id as Tab)}
      actions={
        <Btn theme={theme} variant="white" icon={PlusCircle} onClick={listProduce}>
          List produce
        </Btn>
      }
    >
      {tab === 'overview' && (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Tile theme={theme} icon={PlusCircle} label="Sell produce" hint="List apples, walnuts…" onClick={listProduce} />
              <Tile theme={theme} icon={Store} label="Sell farm inputs" hint="Fertiliser, sprays, tools…" onClick={() => listProduct('supplies')} />
              <Tile theme={theme} icon={ShieldCheck} label="Safe payment" hint="Verify & get paid" onClick={() => setTab('payouts')} />
              <Tile theme={theme} icon={Warehouse} label="Cold storage" hint="Choose your place" href="/rental/dashboard" />
              <Tile theme={theme} icon={MessageCircleQuestion} label="Ask an expert" hint="Agronomist answers" href="/expert" />
              <Tile theme={theme} icon={Activity} label="Orchard health" hint="Scab map, photo check" href="/orchard-health" />
              <Tile theme={theme} icon={CalendarDays} label="Season planner" hint="Tasks & costs" href="/season-planner" />
              <Tile theme={theme} icon={TrendingUp} label="Mandi rates" hint="Today’s prices" href="/mandi-weather" />
              <Tile theme={theme} icon={FlaskConical} label="Test inputs" hint="Spot fake batches" href="/supplies/tester" />
            </div>

            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-emerald-700 via-emerald-600 to-amber-600 p-7 text-white shadow-lg">
              <h3 className="font-sans text-2xl font-bold">Ready to harvest?</h3>
              <p className="mt-1 max-w-md text-white/90">
                List apples, walnuts or saffron with your price. Buyers order on Price Comparison and pay you directly by UPI once the goods reach them.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <Btn theme={theme} variant="white" icon={PlusCircle} onClick={listProduce}>
                  List your produce
                </Btn>
                <Btn theme={theme} variant="white" icon={Bot} href="/farmer/assistant">
                  Ask the assistant
                </Btn>
              </div>
            </div>

            <Panel
              theme={theme}
              title="Orders"
              icon={Package}
              action={
                <Btn theme={theme} variant="ghost" size="sm" onClick={() => setTab('orders')}>
                  View all <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </Btn>
              }
            >
              {toAct ? (
                <p className="text-slate-700"><strong>{toAct}</strong> order{toAct === 1 ? '' : 's'} need you. Open <button type="button" onClick={() => setTab('orders')} className="cursor-pointer font-semibold text-emerald-800 underline">Orders</button> to accept, ship or confirm payment.</p>
              ) : (
                <p className="text-slate-600">No orders need you right now. When a buyer orders your produce, it appears in Orders.</p>
              )}
            </Panel>
          </div>

          <div className="space-y-6">
            <TodayWeather district={account?.district} />
            <Panel theme={theme} title="Safe payment" icon={Banknote}>
              <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-700">
                <li>A buyer orders. Nothing is paid up front.</li>
                <li>You accept and send it.</li>
                <li>The buyer checks it and pays you directly by UPI / bank.</li>
                <li>You press “Money received”.</li>
              </ol>
              <Btn theme={theme} variant="soft" className="mt-4 w-full" onClick={() => setTab('payouts')}>
                Verify yourself & add UPI / bank
              </Btn>
            </Panel>
          </div>
        </div>
      )}

      {/* Kept mounted so the KPIs above stay current on every tab. */}
      {account === undefined ? (
        tab !== 'overview' && <p className="flex items-center gap-2 text-slate-600"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…</p>
      ) : account === null ? (
        tab !== 'overview' && <p role="alert" className="rounded-2xl bg-amber-50 p-4 text-amber-900 ring-1 ring-amber-200">Sign in again to manage your produce.</p>
      ) : (
        <div className={tab === 'overview' ? 'hidden' : 'space-y-6'}>
          {tab === 'payouts' && <SafePayment as="farmer" account={account} theme={theme} />}
          <SellerDesk
            account={account}
            theme={theme}
            category={addCategory}
            mixed
            show={tab === 'lots' ? 'products' : tab === 'payouts' ? 'payouts' : 'orders'}
            addRequest={addRequest}
            onLoaded={onLoaded}
          />
        </div>
      )}
    </PortalShell>
  );
}

interface Weather {
  place: { name: string };
  current: { time: string; temperature: number; humidity: number; precipitation: number; wind: number };
  hourly: { time: string; precipitationProbability: number }[];
  daily: { date: string; max: number; min: number; precipitation: number }[];
}

function TodayWeather({ district }: { district?: string }) {
  const place = district?.trim() || 'Srinagar';
  const [w, setW] = useState<Weather | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch(`/api/weather?q=${encodeURIComponent(place)}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? 'Weather is not available right now.');
        if (live) setW(j as Weather);
      })
      .catch((err) => live && setError(err instanceof Error ? err.message : 'Weather is not available right now.'));
    return () => {
      live = false;
    };
  }, [place]);

  const dry = w ? dryHours(w.current.time, w.hourly) : null;
  const rainToday = w?.daily[0]?.precipitation ?? 0;

  return (
    <Panel theme={theme} title={`Today in ${w?.place.name ?? place}`} icon={CloudSun}>
      {error ? (
        <p className="text-sm text-slate-600">{error}</p>
      ) : !w ? (
        <p className="flex items-center gap-2 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading weather…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-amber-50 p-4 text-center ring-1 ring-amber-100">
              <Thermometer className="mx-auto h-7 w-7 text-amber-600" aria-hidden />
              <p className="mt-1 text-2xl font-bold">{Math.round(w.current.temperature)}°C</p>
              <p className="text-xs text-slate-600">{Math.round(w.daily[0]?.min ?? 0)}° / {Math.round(w.daily[0]?.max ?? 0)}° today</p>
            </div>
            <div className="rounded-2xl bg-teal-50 p-4 text-center ring-1 ring-teal-100">
              <Droplets className="mx-auto h-7 w-7 text-teal-600" aria-hidden />
              <p className="mt-1 text-2xl font-bold">{rainToday.toFixed(1)} mm</p>
              <p className="text-xs text-slate-600">Rain today · humidity {Math.round(w.current.humidity)}%</p>
            </div>
          </div>
          <p className={`mt-4 rounded-xl p-3 text-center text-sm font-medium ring-1 ${dry ? 'bg-emerald-50 text-emerald-800 ring-emerald-100' : 'bg-amber-50 text-amber-900 ring-amber-100'}`}>
            {dry ? `Dry hours for spraying today: ${dry}` : 'Rain likely for the rest of today — better not to spray.'}
          </p>
          <p className="mt-2 text-center text-xs text-slate-500">Open-Meteo forecast{district ? '' : ' · add your district in My details for your own village'}</p>
        </>
      )}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Btn theme={theme} variant="soft" size="sm" href="/orchard-health">Scab risk map</Btn>
        <Btn theme={theme} variant="soft" size="sm" href="/orchard-health">Log a spray</Btn>
      </div>
    </Panel>
  );
}
