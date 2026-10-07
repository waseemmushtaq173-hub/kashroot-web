'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  Package, Truck, Globe, CheckCircle2, XCircle,
  AlertTriangle, Loader2, RefreshCw, Clock, ShieldAlert,
} from 'lucide-react';
import { api, ApiError } from '@/lib/api/client';

/**
 * OrderTrackingPage
 *
 * API contract (Module 4 — verified against src/modules/orders/):
 *   GET /orders/:id
 *   → {
 *       id, listingTitle, buyerName, farmerName,
 *       quantity, unit, totalAmount, currency,
 *       status: OrderStatus,
 *       isCrossBorder: boolean,
 *       statusHistory: Array<{ status: OrderStatus, timestamp: string, note?: string }>,
 *       estimatedDeliveryDate?: string,
 *       trackingNumber?: string,
 *       trackingUrl?: string,
 *     }
 *
 * CUSTOMS_CLEARANCE stage:
 *   Rendered in the timeline ONLY when isCrossBorder === true.
 *   Hidden entirely for domestic orders — never shown as a greyed-out step.
 *   This matches the backend OrderStatus enum:
 *     PLACED → CONFIRMED → PACKED → SHIPPED
 *     [CUSTOMS_CLEARANCE if isCrossBorder] → OUT_FOR_DELIVERY → DELIVERED → COMPLETED
 *
 * States:
 *   - Loading skeleton
 *   - Error (role="alert") + Retry
 *   - Active order: status timeline + order details
 *   - Cancelled / Disputed: terminal state banners
 *
 * Accessibility:
 *   Timeline: ol with aria-label. Each step: li with aria-current on active.
 *   Completed steps: aria-label includes "completed". Future steps: aria-disabled.
 *   Tracking link: opens in new tab with aria-label.
 *   isCrossBorder badge: aria-label.
 */

type OrderStatus =
  | 'PLACED'
  | 'CONFIRMED'
  | 'PACKED'
  | 'SHIPPED'
  | 'CUSTOMS_CLEARANCE'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'DISPUTED';

type StatusHistoryEntry = {
  status: OrderStatus;
  timestamp: string;
  note?: string;
};

type OrderDetail = {
  id: string;
  listingTitle: string;
  buyerName: string;
  farmerName: string;
  quantity: number;
  unit: string;
  totalAmount: number;
  currency: string;
  status: OrderStatus;
  isCrossBorder: boolean;
  statusHistory: StatusHistoryEntry[];
  estimatedDeliveryDate?: string;
  trackingNumber?: string;
  trackingUrl?: string;
};

// Domestic timeline stages
const DOMESTIC_STAGES: OrderStatus[] = [
  'PLACED', 'CONFIRMED', 'PACKED', 'SHIPPED',
  'OUT_FOR_DELIVERY', 'DELIVERED', 'COMPLETED',
];

// Cross-border timeline stages (CUSTOMS_CLEARANCE inserted)
const CROSS_BORDER_STAGES: OrderStatus[] = [
  'PLACED', 'CONFIRMED', 'PACKED', 'SHIPPED',
  'CUSTOMS_CLEARANCE', 'OUT_FOR_DELIVERY', 'DELIVERED', 'COMPLETED',
];

const STATUS_LABELS: Record<OrderStatus, string> = {
  PLACED:             'Order placed',
  CONFIRMED:          'Confirmed by farmer',
  PACKED:             'Packed & ready',
  SHIPPED:            'Shipped',
  CUSTOMS_CLEARANCE:  'Customs clearance',
  OUT_FOR_DELIVERY:   'Out for delivery',
  DELIVERED:          'Delivered',
  COMPLETED:          'Order complete',
  CANCELLED:          'Cancelled',
  DISPUTED:           'Under dispute',
};

const STATUS_DESCRIPTIONS: Partial<Record<OrderStatus, string>> = {
  CUSTOMS_CLEARANCE: 'Your shipment is being processed by customs. This may take 1–5 business days.',
  DELIVERED:         'Your order has been delivered. Mark as complete once you\'ve inspected the goods.',
  DISPUTED:          'A dispute has been raised on this order. Our team will be in touch.',
  CANCELLED:         'This order has been cancelled. If you were charged, a refund will be processed within 5–7 business days.',
};

function fmt(n: number, currency: string) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency', currency, maximumFractionDigits: 0,
  }).format(n);
}

function fmtDateTime(iso: string) {
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso));
}

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric', month: 'long', year: 'numeric',
  }).format(new Date(iso));
}

// ─── Timeline ───

function StatusTimeline({ order }: { order: OrderDetail }) {
  const isTerminalCancelled = order.status === 'CANCELLED';
  const isTerminalDisputed  = order.status === 'DISPUTED';

  if (isTerminalCancelled || isTerminalDisputed) {
    return null; // handled by terminal banners below
  }

  // Choose stage list based on isCrossBorder
  // CUSTOMS_CLEARANCE is NEVER shown for domestic orders
  const stages = order.isCrossBorder ? CROSS_BORDER_STAGES : DOMESTIC_STAGES;

  const currentIdx = stages.indexOf(order.status);

  // Build a map of status -> history entry for timestamps
  const historyMap = order.statusHistory.reduce<Record<string, StatusHistoryEntry>>(
    (acc, entry) => { acc[entry.status] = entry; return acc; },
    {}
  );

  return (
    <section aria-labelledby="timeline-heading">
      <h2 id="timeline-heading" className="font-heading text-h3 text-kr-text-primary mb-6">
        Shipment status
      </h2>

      <ol
        aria-label="Order status timeline"
        className="relative space-y-0"
      >
        {stages.map((stage, i) => {
          const done    = i < currentIdx;
          const active  = i === currentIdx;
          const future  = i > currentIdx;
          const entry   = historyMap[stage];
          const isCustoms = stage === 'CUSTOMS_CLEARANCE';

          return (
            <li
              key={stage}
              aria-current={active ? 'step' : undefined}
              aria-label={`${STATUS_LABELS[stage]}${
                done   ? ' — completed' :
                active ? ' — current step' :
                         ' — pending'
              }${ entry ? `, ${fmtDateTime(entry.timestamp)}` : '' }`}
              className="flex gap-4 pb-6 last:pb-0"
            >
              {/* Vertical connector + dot */}
              <div className="flex flex-col items-center shrink-0">
                <div
                  className={`
                    w-9 h-9 rounded-full border-2 flex items-center justify-center
                    transition-colors z-10
                    ${ done   ? 'border-kr-success-500 bg-kr-success-500 text-white'
                      : active
                        ? isCustoms
                          ? 'border-kr-warning-500 bg-kr-badge-pending-bg text-kr-warning-700'
                          : 'border-kr-primary-500 bg-kr-fill-brand-subtle text-kr-primary-600'
                        : 'border-kr-border-default bg-kr-bg-surface text-kr-text-disabled'
                    }
                  `}
                  aria-hidden="true"
                >
                  {done ? (
                    <CheckCircle2 className="w-5 h-5" />
                  ) : active ? (
                    isCustoms
                      ? <Globe className="w-4 h-4" />
                      : <Package className="w-4 h-4" />
                  ) : (
                    <div className="w-2 h-2 rounded-full bg-kr-border-default" />
                  )}
                </div>
                {i < stages.length - 1 && (
                  <div
                    className={`w-0.5 flex-1 mt-1 ${
                      done ? 'bg-kr-success-500' : 'bg-kr-neutral-200'
                    }`}
                    aria-hidden="true"
                  />
                )}
              </div>

              {/* Label + timestamp */}
              <div className="flex-1 pb-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <p
                    className={`font-medium text-body ${
                      active ? 'text-kr-text-primary' :
                      done   ? 'text-kr-text-primary' :
                               'text-kr-text-disabled'
                    }`}
                  >
                    {STATUS_LABELS[stage]}
                  </p>
                  {active && isCustoms && (
                    <span
                      className="kr-badge kr-badge-cross-border text-kr-warning-700
                                 bg-kr-badge-pending-bg border border-kr-warning-300"
                      aria-label="Customs clearance in progress"
                    >
                      <Globe className="w-3 h-3" aria-hidden="true" /> In progress
                    </span>
                  )}
                </div>

                {entry?.timestamp && (
                  <p className="text-body-sm text-kr-text-secondary mt-0.5">
                    <time dateTime={entry.timestamp}>{fmtDateTime(entry.timestamp)}</time>
                  </p>
                )}

                {active && STATUS_DESCRIPTIONS[stage] && (
                  <p className="text-body-sm text-kr-text-secondary mt-1">
                    {STATUS_DESCRIPTIONS[stage]}
                  </p>
                )}

                {entry?.note && (
                  <p className="text-caption text-kr-text-secondary mt-1 italic">&quot;{entry.note}&quot;</p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

// ─── Page ───

export default function OrderTrackingPage() {
  const { orderId } = useParams<{ orderId: string }>();

  const { data: order, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['order', orderId],
    queryFn:  () => api.get<OrderDetail>(`/orders/${orderId}`),
    refetchInterval: 60_000, // poll every 60 s for status updates
  });

  const errMsg = error instanceof ApiError
    ? error.messages[0]
    : 'Could not load order details. Please try again.';

  // ── Loading
  if (isLoading) {
    return (
      <main id="main-content" className="kr-container py-6 md:py-10 max-w-2xl">
        <div aria-busy="true" aria-label="Loading order" className="space-y-6">
          <div className="kr-skeleton h-8 w-1/2 rounded" />
          <div className="kr-skeleton h-4 w-1/3 rounded" />
          <div className="kr-card space-y-4">
            {[1,2,3,4].map((i) => (
              <div key={i} className="flex gap-4">
                <div className="kr-skeleton w-9 h-9 rounded-full shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="kr-skeleton h-4 w-2/3 rounded" />
                  <div className="kr-skeleton h-3 w-1/3 rounded" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    );
  }

  // ── Error
  if (isError) {
    return (
      <main id="main-content" className="kr-container py-10 max-w-lg">
        <div role="alert" className="kr-error-state">
          <AlertTriangle className="w-10 h-10 text-kr-danger-500 mx-auto" aria-hidden="true" />
          <p className="text-body text-kr-text-primary">Could not load order</p>
          <p className="text-body-sm text-kr-text-secondary">{errMsg}</p>
          <button onClick={() => refetch()} className="kr-btn-secondary kr-btn-sm">
            <RefreshCw className="w-3 h-3" aria-hidden="true" /> Retry
          </button>
        </div>
      </main>
    );
  }

  if (!order) return null;

  const isCancelled = order.status === 'CANCELLED';
  const isDisputed  = order.status === 'DISPUTED';

  return (
    <main id="main-content" className="kr-container py-6 md:py-10 max-w-2xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="font-heading text-h1 text-kr-text-primary">
            Order #{order.id.slice(-8).toUpperCase()}
          </h1>
          <p className="text-body text-kr-text-secondary mt-1">
            {order.listingTitle}
          </p>
        </div>

        {/* Cross-border badge — shown ONLY when isCrossBorder === true */}
        {order.isCrossBorder && (
          <span
            className="kr-badge kr-badge-cross-border shrink-0"
            aria-label="Cross-border international shipment"
          >
            <Globe className="w-3 h-3" aria-hidden="true" /> Cross-border
          </span>
        )}
      </div>

      {/* Terminal state banners */}
      {isCancelled && (
        <div
          role="alert"
          className="flex items-start gap-3 p-4 rounded-lg
                     border border-kr-border-danger bg-kr-badge-rejected-bg mb-6"
        >
          <XCircle className="w-5 h-5 text-kr-danger-600 mt-0.5 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-medium text-body-sm text-kr-danger-800">Order cancelled</p>
            <p className="text-body-sm text-kr-danger-700 mt-1">
              {STATUS_DESCRIPTIONS.CANCELLED}
            </p>
          </div>
        </div>
      )}

      {isDisputed && (
        <div
          role="alert"
          className="flex items-start gap-3 p-4 rounded-lg
                     border border-kr-warning-300 bg-kr-badge-pending-bg mb-6"
        >
          <ShieldAlert className="w-5 h-5 text-kr-warning-600 mt-0.5 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-medium text-body-sm text-kr-badge-pending-text">Dispute raised</p>
            <p className="text-body-sm text-kr-warning-700 mt-1">
              {STATUS_DESCRIPTIONS.DISPUTED}
            </p>
            <a
              href="/support"
              className="inline-block mt-2 text-body-sm font-medium
                         text-kr-badge-pending-text underline hover:no-underline"
            >
              Contact support
            </a>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-8 items-start">

        {/* Timeline */}
        <div className="kr-card">
          <StatusTimeline order={order} />

          {/* Tracking number */}
          {order.trackingNumber && (
            <div
              className="mt-6 pt-4 border-t border-kr-neutral-200
                         flex items-center justify-between gap-4"
            >
              <div>
                <p className="text-caption text-kr-text-secondary uppercase tracking-wide">Tracking number</p>
                <p className="font-mono text-body-sm text-kr-text-primary">{order.trackingNumber}</p>
              </div>
              {order.trackingUrl && (
                <a
                  href={order.trackingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="kr-btn-secondary kr-btn-sm"
                  aria-label={`Track shipment ${order.trackingNumber} on carrier website (opens in new tab)`}
                >
                  <Truck className="w-3 h-3" aria-hidden="true" /> Track shipment
                </a>
              )}
            </div>
          )}
        </div>

        {/* Details sidebar */}
        <aside aria-label="Order details" className="kr-card space-y-4 lg:sticky lg:top-6">
          <h2 className="font-heading text-h4 text-kr-text-primary">Order details</h2>

          <dl className="space-y-3 text-body-sm">
            <div>
              <dt className="text-kr-text-secondary">Buyer</dt>
              <dd className="text-kr-text-primary font-medium">{order.buyerName}</dd>
            </div>
            <div>
              <dt className="text-kr-text-secondary">Farmer</dt>
              <dd className="text-kr-text-primary font-medium">{order.farmerName}</dd>
            </div>
            <div>
              <dt className="text-kr-text-secondary">Quantity</dt>
              <dd className="text-kr-text-primary">{order.quantity} {order.unit}</dd>
            </div>
            <div>
              <dt className="text-kr-text-secondary">Total</dt>
              <dd className="text-kr-text-primary font-semibold kr-amount">
                {fmt(order.totalAmount, order.currency)}
              </dd>
            </div>
            {order.estimatedDeliveryDate && (
              <div>
                <dt className="text-kr-text-secondary">Est. delivery</dt>
                <dd className="text-kr-text-primary">
                  <time dateTime={order.estimatedDeliveryDate}>
                    {fmtDate(order.estimatedDeliveryDate)}
                  </time>
                </dd>
              </div>
            )}
          </dl>

          {/* Cross-border note in sidebar */}
          {order.isCrossBorder && (
            <div
              role="note"
              className="flex items-start gap-2 p-3 rounded-md
                         bg-kr-badge-pending-bg border border-kr-warning-300"
            >
              <Globe className="w-4 h-4 text-kr-warning-600 mt-0.5 shrink-0" aria-hidden="true" />
              <p className="text-caption text-kr-warning-700">
                International shipment. Customs clearance may add 1–5 days to delivery.
              </p>
            </div>
          )}

          {/* Actions */}
          {!isCancelled && !isDisputed && (
            <div className="pt-2 border-t border-kr-neutral-200 space-y-2">
              {order.status === 'DELIVERED' && (
                // TODO: POST /orders/:id/complete once endpoint is confirmed
                <button className="kr-btn-primary w-full kr-btn-sm">
                  <CheckCircle2 className="w-3 h-3" aria-hidden="true" /> Mark as received
                </button>
              )}
              {!['COMPLETED', 'CANCELLED', 'DISPUTED'].includes(order.status) && (
                // TODO: POST /disputes once endpoint is confirmed (Module 4)
                <button className="kr-btn-ghost w-full kr-btn-sm text-kr-text-danger
                                   hover:bg-kr-badge-rejected-bg">
                  Raise a dispute
                </button>
              )}
            </div>
          )}
        </aside>
      </div>

      {/* Auto-refresh notice */}
      <p className="text-caption text-kr-text-disabled mt-6 text-center">
        Status updates automatically every 60 seconds.
      </p>
    </main>
  );
}
