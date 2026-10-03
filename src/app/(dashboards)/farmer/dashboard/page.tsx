'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Package, Calendar, ShoppingBag, Wallet,
  PlusCircle, AlertTriangle, Loader2, RefreshCw,
  ChevronRight, Check, X, Info, CloudSun, Bot, Microscope, Truck,
} from 'lucide-react';
import { listingsApi, appointmentsApi, ordersApi, payoutsApi } from '@/lib/api/farmer';
import type { FarmerListing, Appointment, FarmerOrder, ListingStatus } from '@/lib/api/farmer';
import { ApiError } from '@/lib/api/client';

type Tab = 'listings' | 'appointments' | 'orders' | 'payouts';

const LISTING_STATUS_LABEL: Record<ListingStatus, string> = {
  DRAFT:     'Draft',
  PUBLISHED: 'Published',
  SUSPENDED: 'Suspended',
};

const LISTING_STATUS_CLASS: Record<ListingStatus, string> = {
  DRAFT:     'kr-badge-draft',
  PUBLISHED: 'kr-badge-published',
  SUSPENDED: 'kr-badge-pending',
};

const ORDER_STATUS_LABEL: Record<string, string> = {
  PLACED:            'Placed',
  CONFIRMED:         'Confirmed',
  PACKED:            'Packed',
  SHIPPED:           'Shipped',
  CUSTOMS_CLEARANCE: 'Customs clearance',
  OUT_FOR_DELIVERY:  'Out for delivery',
  DELIVERED:         'Delivered',
  COMPLETED:         'Completed',
  CANCELLED:         'Cancelled',
  DISPUTED:          'Disputed',
};

const APPOINTMENT_STATUS_CLASS: Record<string, string> = {
  REQUESTED:  'kr-badge-pending',
  CONFIRMED:  'kr-badge-published',
  CANCELLED:  'kr-badge-rejected',
  COMPLETED:  'kr-badge-published',
  NO_SHOW:    'kr-badge-draft',
};

function fmt(amount: number, currency: string) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
}

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

// ---------------------------------------------------------------------------
// Sub-panels
// ---------------------------------------------------------------------------

function ListingsPanel() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['farmer', 'listings', page],
    queryFn:  () => listingsApi.myListings({ page, limit: 10 }),
  });

  const publishMut = useMutation({
    mutationFn: (id: string) => listingsApi.publishListing(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['farmer', 'listings'] }),
  });

  const unpublishMut = useMutation({
    mutationFn: (id: string) => listingsApi.unpublishListing(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['farmer', 'listings'] }),
  });

  if (isLoading) return <PanelSkeleton rows={4} />;
  if (isError)   return <PanelError  message={apiMsg(error)} onRetry={() => refetch()} />;

  const listings = data?.data ?? [];

  if (listings.length === 0) {
    return (
      <div className="kr-empty-state">
        <Package className="w-10 h-10 text-kr-text-disabled mx-auto" aria-hidden="true" />
        <p className="text-body text-kr-text-secondary">You have no listings yet.</p>
        <Link href="/farmer/listings/new" className="kr-btn-primary kr-btn-sm">
          <PlusCircle className="w-4 h-4" aria-hidden="true" /> Create first listing
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-body-sm text-kr-text-secondary">
          {data?.total ?? 0} listing{data?.total !== 1 ? 's' : ''}
        </p>
        <Link href="/farmer/listings/new" className="kr-btn-secondary kr-btn-sm">
          <PlusCircle className="w-4 h-4" aria-hidden="true" /> New listing
        </Link>
      </div>

      <ul className="divide-y divide-kr-neutral-200" role="list">
        {listings.map((l) => (
          <li key={l.id} className="py-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="w-14 h-14 rounded-md bg-kr-bg-sunken shrink-0 overflow-hidden" aria-hidden="true">
              {l.images[0]
                ? <img src={l.images[0]} alt={l.title} className="w-full h-full object-cover" />
                : <Package className="w-6 h-6 m-4 text-kr-text-disabled" />}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <Link href={`/farmer/listings/${l.id}/edit`} className="font-medium text-body text-kr-text-primary hover:text-kr-text-brand truncate">
                  {l.title}
                </Link>
                <span className={`kr-badge ${LISTING_STATUS_CLASS[l.status]}`} aria-label={`Status: ${LISTING_STATUS_LABEL[l.status]}`}>
                  {LISTING_STATUS_LABEL[l.status]}
                </span>
              </div>
              <p className="text-body-sm text-kr-text-secondary mt-0.5">
                {l.commodity} · {fmt(l.pricePerUnit, l.currency)}/{l.unit} · {l.stockQuantity} {l.unit} stock
              </p>
            </div>

            <div className="flex gap-2 shrink-0">
              {l.status === 'DRAFT' && (
                <button onClick={() => publishMut.mutate(l.id)} disabled={publishMut.isPending} className="kr-btn-primary kr-btn-sm">
                  Publish
                </button>
              )}
              {l.status === 'PUBLISHED' && (
                <button onClick={() => unpublishMut.mutate(l.id)} disabled={unpublishMut.isPending} className="kr-btn-secondary kr-btn-sm">
                  Unpublish
                </button>
              )}
              <Link href={`/farmer/listings/${l.id}/edit`} className="kr-btn-ghost kr-btn-sm">Edit</Link>
            </div>
          </li>
        ))}
      </ul>

      {(data?.total ?? 0) > 10 && (
        <div className="flex justify-center gap-3 mt-6">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="kr-btn-ghost kr-btn-sm">Previous</button>
          <span className="text-body-sm text-kr-text-secondary self-center">Page {page}</span>
          <button onClick={() => setPage((p) => p + 1)} disabled={(page * 10) >= (data?.total ?? 0)} className="kr-btn-ghost kr-btn-sm">Next</button>
        </div>
      )}
    </div>
  );
}

function AppointmentsPanel() {
  const qc = useQueryClient();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['farmer', 'appointments'],
    queryFn:  () => appointmentsApi.myAppointments({ limit: 20, status: 'REQUESTED' }),
  });

  const confirmMut = useMutation({
    mutationFn: (id: string) => appointmentsApi.confirmAppointment(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['farmer', 'appointments'] }),
  });

  const cancelMut = useMutation({
    mutationFn: (id: string) => appointmentsApi.cancelAppointment(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['farmer', 'appointments'] }),
  });

  if (isLoading) return <PanelSkeleton rows={3} />;
  if (isError)   return <PanelError  message={apiMsg(error)} onRetry={() => refetch()} />;

  const appts = data?.data ?? [];

  if (appts.length === 0) {
    return (
      <div className="kr-empty-state">
        <Calendar className="w-10 h-10 text-kr-text-disabled mx-auto" aria-hidden="true" />
        <p className="text-body text-kr-text-secondary">No pending appointment requests.</p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-kr-neutral-200" role="list">
      {appts.map((appt) => (
        <li key={appt.id} className="py-4 flex flex-col sm:flex-row sm:items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-medium text-body text-kr-text-primary">{appt.buyerName}</p>
              <span className={`kr-badge ${APPOINTMENT_STATUS_CLASS[appt.status]}`} aria-label={`Status: ${appt.status.toLowerCase().replace('_', ' ')}`}>
                {appt.status.toLowerCase().replace('_', ' ')}
              </span>
            </div>
            <p className="text-body-sm text-kr-text-secondary mt-0.5">Re: {appt.listingTitle}</p>
            <p className="text-body-sm text-kr-text-secondary">
              <time dateTime={appt.scheduledAt}>{fmtDate(appt.scheduledAt)}</time> · {appt.durationMinutes} min
            </p>
            {appt.notes && <p className="text-caption text-kr-text-secondary mt-1 italic">“{appt.notes}”</p>}
          </div>

          {appt.status === 'REQUESTED' && (
            <div className="flex gap-2 shrink-0">
              <button onClick={() => confirmMut.mutate(appt.id)} disabled={confirmMut.isPending} className="kr-btn-primary kr-btn-sm">
                <Check className="w-3 h-3" aria-hidden="true" /> Confirm
              </button>
              <button onClick={() => cancelMut.mutate(appt.id)} disabled={cancelMut.isPending} className="kr-btn-ghost kr-btn-sm text-kr-text-danger hover:bg-kr-danger-50">
                <X className="w-3 h-3" aria-hidden="true" /> Decline
              </button>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

function OrdersPanel() {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['farmer', 'orders'],
    queryFn:  () => ordersApi.myOrders({ limit: 20 }),
  });

  if (isLoading) return <PanelSkeleton rows={3} />;
  if (isError)   return <PanelError  message={apiMsg(error)} onRetry={() => refetch()} />;

  const orders = data?.data ?? [];

  if (orders.length === 0) {
    return (
      <div className="kr-empty-state">
        <ShoppingBag className="w-10 h-10 text-kr-text-disabled mx-auto" aria-hidden="true" />
        <p className="text-body text-kr-text-secondary">No orders yet.</p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-kr-neutral-200" role="list">
      {orders.map((order) => (
        <li key={order.id} className="py-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-medium text-body text-kr-text-primary truncate">
                #{order.id.slice(-6).toUpperCase()} · {order.listingTitle}
              </p>
              {order.isCrossBorder && <span className="kr-badge kr-badge-cross-border">Cross-border</span>}
            </div>
            <p className="text-body-sm text-kr-text-secondary">
              {order.buyerName} · {order.quantity} {order.unit} · {fmt(order.totalAmount, order.currency)}
            </p>
            <p className="text-caption text-kr-text-secondary">
              {ORDER_STATUS_LABEL[order.status]} · {fmtDate(order.updatedAt)}
            </p>
          </div>
          <Link href={`/orders/${order.id}`} className="kr-btn-ghost kr-btn-sm shrink-0">
            Track <ChevronRight className="w-3 h-3" aria-hidden="true" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

function PayoutsPanel() {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['farmer', 'payouts'],
    queryFn:  () => payoutsApi.ledger({ limit: 20 }),
  });

  if (isLoading) return <PanelSkeleton rows={3} />;
  if (isError)   return <PanelError  message={apiMsg(error)} onRetry={() => refetch()} />;

  const orders = data?.data ?? [];
  const PLATFORM_FEE_PCT = 0.025;

  const entries = orders.map((o) => ({
    ...o,
    platformFee: +(o.totalAmount * PLATFORM_FEE_PCT).toFixed(2),
    netAmount:   +(o.totalAmount * (1 - PLATFORM_FEE_PCT)).toFixed(2),
  }));

  const totalNet = entries.reduce((sum, e) => sum + e.netAmount, 0);

  if (entries.length === 0) {
    return (
      <div className="kr-empty-state">
        <Wallet className="w-10 h-10 text-kr-text-disabled mx-auto" aria-hidden="true" />
        <p className="text-body text-kr-text-secondary">No completed orders yet.</p>
        <p className="text-body-sm text-kr-text-disabled">Payouts appear once orders are marked Completed.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-start gap-2 p-3 rounded-md bg-kr-warning-50 border border-kr-warning-300 mb-4" role="note">
        <Info className="w-4 h-4 text-kr-warning-600 mt-0.5 shrink-0" aria-hidden="true" />
        <p className="text-caption text-kr-warning-700">
          Payout data is derived from completed orders (2.5% platform fee estimated).
        </p>
      </div>

      <div className="kr-card bg-kr-fill-brand-subtle border-0 mb-6">
        <p className="text-caption text-kr-text-secondary uppercase tracking-wide">Total net earnings</p>
        <p className="font-heading text-display text-kr-primary-700 kr-amount">
          {fmt(totalNet, orders[0]?.currency ?? 'INR')}
        </p>
        <p className="text-caption text-kr-text-secondary">From {entries.length} completed order{entries.length !== 1 ? 's' : ''}</p>
      </div>

      <ul className="divide-y divide-kr-neutral-200" role="list">
        {entries.map((e) => (
          <li key={e.id} className="py-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-body-sm font-medium text-kr-text-primary truncate">{e.listingTitle}</p>
              <p className="text-caption text-kr-text-secondary">{e.buyerName} · {fmtDate(e.updatedAt)}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-body-sm font-medium text-kr-text-primary kr-amount">{fmt(e.netAmount, e.currency)}</p>
              <p className="text-caption text-kr-text-secondary">-{fmt(e.platformFee, e.currency)} fee</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PanelSkeleton({ rows }: { rows: number }) {
  return (
    <div aria-busy="true" aria-label="Loading" className="space-y-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-3 items-center">
          <div className="kr-skeleton w-14 h-14 rounded-md shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="kr-skeleton h-4 w-3/4 rounded" />
            <div className="kr-skeleton h-3 w-1/2 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

function PanelError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="kr-error-state" role="alert">
      <AlertTriangle className="w-8 h-8 text-kr-danger-500 mx-auto" aria-hidden="true" />
      <p className="text-body text-kr-text-primary">Something went wrong</p>
      <p className="text-body-sm text-kr-text-secondary">{message}</p>
      <button onClick={onRetry} className="kr-btn-secondary kr-btn-sm">
        <RefreshCw className="w-3 h-3" aria-hidden="true" /> Retry
      </button>
    </div>
  );
}

function apiMsg(err: unknown): string {
  if (err instanceof ApiError) return err.messages[0] ?? 'An error occurred';
  return 'An unexpected error occurred. Please try again.';
}

const TABS: { id: Tab; label: string; Icon: typeof Package }[] = [
  { id: 'listings',     label: 'Listings',     Icon: Package     },
  { id: 'appointments', label: 'Appointments', Icon: Calendar    },
  { id: 'orders',       label: 'Orders',       Icon: ShoppingBag },
  { id: 'payouts',      label: 'Payouts',      Icon: Wallet      },
];

export default function FarmerDashboardPage() {
  const [activeTab, setActiveTab] = useState<Tab>('listings');

  const listingsQ = useQuery({ queryKey: ['farmer', 'listings', 1], queryFn: () => listingsApi.myListings({ page: 1, limit: 1 }) });
  const apptQ     = useQuery({ queryKey: ['farmer', 'appt-count'],  queryFn: () => appointmentsApi.myAppointments({ limit: 1, status: 'REQUESTED' }) });
  const ordersQ   = useQuery({ queryKey: ['farmer', 'order-count'], queryFn: () => ordersApi.myOrders({ limit: 1 }) });

  return (
    <main id="main-content" className="kr-container py-6 md:py-10">
      <div className="bg-emerald-600 text-white p-6 md:p-8 mb-8 border-l-8 border-emerald-900 shadow-md">
        <h1 className="font-heading text-display text-white mb-2">
          Farmer Dashboard
        </h1>
        <p className="text-body-lg text-emerald-50">
          Manage your listings, appointments, and sales from one place.
        </p>
      </div>

      {/* Quick Tools Access Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        <Link href="/farmer/mandi" className="kr-card bg-blue-50/50 hover:bg-blue-50 border-blue-200 flex items-center gap-3 p-4 transition-colors">
          <CloudSun className="w-5 h-5 text-blue-600 shrink-0" />
          <div>
            <p className="text-body-sm font-medium text-blue-900">Live Mandi & Weather</p>
            <p className="text-caption text-blue-700">Local hubs + Azadpur, Jaipur</p>
          </div>
        </Link>
        <Link href="/farmer/assistant" className="kr-card bg-emerald-50/50 hover:bg-emerald-50 border-emerald-200 flex items-center gap-3 p-4 transition-colors">
          <Bot className="w-5 h-5 text-emerald-600 shrink-0" />
          <div>
            <p className="text-body-sm font-medium text-emerald-900">AI Voice Assistant</p>
            <p className="text-caption text-emerald-700">Kashmiri, Urdu & English</p>
          </div>
        </Link>
        <Link href="/farmer/tester" className="kr-card bg-purple-50/50 hover:bg-purple-50 border-purple-200 flex items-center gap-3 p-4 transition-colors">
          <Microscope className="w-5 h-5 text-purple-600 shrink-0" />
          <div>
            <p className="text-body-sm font-medium text-purple-900">AgroGuard Tester</p>
            <p className="text-caption text-purple-700">Scan QR codes & batches</p>
          </div>
        </Link>
        <Link href="/farmer/tracking" className="kr-card bg-amber-50/50 hover:bg-amber-50 border-amber-200 flex items-center gap-3 p-4 transition-colors">
          <Truck className="w-5 h-5 text-amber-600 shrink-0" />
          <div>
            <p className="text-body-sm font-medium text-amber-900">Track a Vehicle</p>
            <p className="text-caption text-amber-700">Live route & ETA by plate</p>
          </div>
        </Link>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {([
          { label: 'Total listings', value: listingsQ.data?.total, id: 'listings' },
          { label: 'Pending requests', value: apptQ.data?.total,    id: 'appointments' },
          { label: 'Active orders',    value: ordersQ.data?.total,  id: 'orders' },
          { label: 'Payout ledger',    value: null,                 id: 'payouts', cta: 'View' },
        ] as Array<{ label: string; value: number | null | undefined; id: string; cta?: string }>).map((card) => (
          <button
            key={card.id}
            onClick={() => setActiveTab(card.id as Tab)}
            className={`kr-card text-left transition-shadow hover:shadow-kr-card-md
              ${ activeTab === card.id ? 'border-kr-border-brand ring-1 ring-kr-border-brand' : '' }`}
            aria-current={activeTab === card.id ? 'true' : undefined}
          >
            <p className="text-caption text-kr-text-secondary uppercase tracking-wide mb-1">{card.label}</p>
            <p className="font-heading text-h2 text-kr-text-primary">
              {card.value != null ? card.value : card.cta ?? '—'}
            </p>
          </button>
        ))}
      </div>

      {/* Tab strip */}
      <div
        role="tablist"
        aria-label="Dashboard sections"
        className="flex gap-1 border-b border-kr-border-default mb-6 overflow-x-auto scrollbar-none"
      >
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            role="tab"
            id={`tab-${id}`}
            aria-selected={activeTab === id}
            aria-controls={`panel-${id}`}
            onClick={() => setActiveTab(id)}
            className={`
              flex items-center gap-2 px-4 py-3 text-body-sm font-medium whitespace-nowrap
              border-b-2 transition-colors kr-focus-ring
              ${ activeTab === id
                ? 'border-kr-primary-500 text-kr-primary-600'
                : 'border-transparent text-kr-text-secondary hover:text-kr-text-primary hover:border-kr-border-strong'
              }
            `}
          >
            <Icon className="w-4 h-4" aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab panels */}
      {TABS.map(({ id }) => (
        <div
          key={id}
          role="tabpanel"
          id={`panel-${id}`}
          aria-labelledby={`tab-${id}`}
          hidden={activeTab !== id}
        >
          {id === 'listings'    && <ListingsPanel />}
          {id === 'appointments' && <AppointmentsPanel />}
          {id === 'orders'      && <OrdersPanel />}
          {id === 'payouts'     && <PayoutsPanel />}
        </div>
      ))}
    </main>
  );
}