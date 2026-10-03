'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  ShoppingCart, Truck, CreditCard, AlertTriangle, Info,
  Loader2, CheckCircle2, ChevronLeft, Globe, ShieldAlert,
} from 'lucide-react';
import { buyerListingsApi } from '@/lib/api/buyer';
import { api, ApiError } from '@/lib/api/client';

/**
 * CheckoutPage
 *
 * API contracts (Module 4 — verified against src/modules/orders/):
 *   POST /orders
 *     { listingId, quantity, shippingAddress: AddressDto, paymentMethod: 'stripe'|'razorpay' }
 *     → { orderId, clientSecret?, paymentUrl? }  (201)
 *     → 422 REGION_PAIR_DISABLED if buyer/seller region pair is not enabled
 *       { message: 'REGION_PAIR_DISABLED', detail: string }
 *       → surfaced as named RegionBlockedBanner — NOT a generic error
 *
 *   GET /orders/estimate
 *     { listingId, quantity, destinationCountry }
 *     → { subtotal, shippingFee, customsDuty?, platformFee, total,
 *          currency, isCrossBorder, estimatedDeliveryDays }
 *
 * Cross-border:
 *   When estimate.isCrossBorder === true:
 *     - CustomsDisclosurePanel is shown with duty estimate
 *     - "Cross-border" badge shown on order summary
 *   NEVER infer isCrossBorder from any other field — always use backend-returned value.
 *
 * Region-pair block:
 *   When POST /orders returns 422 with message === 'REGION_PAIR_DISABLED':
 *     - RegionBlockedBanner renders with the detail message from the backend
 *     - This is NOT a generic "Order failed" error
 *
 * Payment:
 *   Razorpay for INR; Stripe for USD/EUR/GBP.
 *   This page creates the order and receives a clientSecret (Stripe) or
 *   paymentUrl (Razorpay). Actual payment SDK calls are stubs —
 *   TODO: integrate Razorpay.checkout.open / Stripe Elements once SDK is loaded.
 *
 * Steps: Review → Shipping estimate → Payment
 *
 * Accessibility:
 *   Step indicator: ol with aria-current on active step.
 *   Error banners: role="alert". Info panels: role="note".
 *   Form fields: label+htmlFor + aria-invalid + aria-describedby.
 *   Success screen: role="status" aria-live="polite".
 */

type Step = 'review' | 'shipping' | 'payment' | 'success';

type AddressForm = {
  fullName: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  phone: string;
};

const BLANK_ADDRESS: AddressForm = {
  fullName: '', line1: '', line2: '',
  city: '', state: '', postalCode: '',
  country: 'IN', phone: '',
};

const COUNTRIES = [
  { code: 'IN', name: 'India' },
  { code: 'US', name: 'United States' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'AE', name: 'UAE' },
  { code: 'SA', name: 'Saudi Arabia' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'AU', name: 'Australia' },
];

const PAYMENT_METHODS = [
  { id: 'razorpay', label: 'Razorpay', hint: 'UPI, Net Banking, Cards, Wallets (INR)' },
  { id: 'stripe',   label: 'Stripe',   hint: 'International cards (USD / EUR / GBP)' },
];

type EstimateResult = {
  subtotal: number;
  shippingFee: number;
  customsDuty?: number;
  platformFee: number;
  total: number;
  currency: string;
  isCrossBorder: boolean;
  estimatedDeliveryDays: number;
};

function fmt(n: number, currency: string) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency', currency, maximumFractionDigits: 0,
  }).format(n);
}

// ─── Step indicator ───

const STEPS: { id: Step; label: string }[] = [
  { id: 'review',   label: 'Review' },
  { id: 'shipping', label: 'Shipping' },
  { id: 'payment',  label: 'Payment' },
];

function StepIndicator({ current }: { current: Step }) {
  const idx = STEPS.findIndex((s) => s.id === current);
  return (
    <ol className="flex items-center gap-0 mb-8" aria-label="Checkout steps">
      {STEPS.map((step, i) => {
        const done    = i < idx;
        const active  = i === idx;
        return (
          <li key={step.id} className="flex items-center">
            <div
              className={`
                flex items-center justify-center w-8 h-8 rounded-full
                text-body-sm font-medium border-2 transition-colors
                ${ active ? 'bg-kr-primary-500 border-kr-primary-500 text-white'
                  : done  ? 'bg-kr-success-500 border-kr-success-500 text-white'
                  :         'bg-transparent border-kr-border-default text-kr-text-secondary'
                }
              `}
              aria-current={active ? 'step' : undefined}
            >
              {done ? <CheckCircle2 className="w-4 h-4" aria-hidden="true" /> : i + 1}
            </div>
            <span
              className={`ml-2 text-body-sm ${
                active ? 'font-semibold text-kr-text-primary' : 'text-kr-text-secondary'
              }`}
            >
              {step.label}
            </span>
            {i < STEPS.length - 1 && (
              <div
                className={`mx-3 h-0.5 w-10 ${
                  done ? 'bg-kr-success-500' : 'bg-kr-border-default'
                }`}
                aria-hidden="true"
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

// ─── Cross-border customs disclosure ───

function CustomsDisclosurePanel({
  estimate,
}: {
  estimate: EstimateResult;
}) {
  return (
    <div
      role="note"
      aria-label="Cross-border customs disclosure"
      className="border border-kr-warning-300 bg-kr-warning-50 rounded-lg p-4"
    >
      <div className="flex items-start gap-3">
        <Globe className="w-5 h-5 text-kr-warning-600 mt-0.5 shrink-0" aria-hidden="true" />
        <div>
          <p className="font-medium text-body-sm text-kr-warning-800">
            This is a cross-border shipment — customs &amp; duties apply
          </p>
          <p className="text-body-sm text-kr-warning-700 mt-1">
            Estimated customs duty of{' '}
            <strong>{fmt(estimate.customsDuty ?? 0, estimate.currency)}</strong>{' '}
            has been included in your total. Actual duty is assessed by your
            country’s customs authority and may differ.
          </p>
          <ul className="mt-2 space-y-1 text-caption text-kr-warning-700 list-disc list-inside">
            <li>Allow up to {estimate.estimatedDeliveryDays} days for delivery including customs clearance.</li>
            <li>You may be contacted by your local customs office for additional documentation.</li>
            <li>KashRoot is not liable for duties beyond the estimate shown.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

// ─── Region-pair blocked banner ───

function RegionBlockedBanner({ detail }: { detail: string }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 p-4 rounded-lg
                 border border-kr-border-danger bg-kr-danger-50"
    >
      <ShieldAlert className="w-5 h-5 text-kr-danger-600 mt-0.5 shrink-0" aria-hidden="true" />
      <div>
        <p className="font-medium text-body-sm text-kr-danger-800">
          Trade route not available
        </p>
        <p className="text-body-sm text-kr-danger-700 mt-1">{detail}</p>
        <p className="text-caption text-kr-danger-600 mt-2">
          Please contact{' '}
          <a href="/support" className="underline hover:no-underline">support</a>{' '}
          if you believe this is an error.
        </p>
      </div>
    </div>
  );
}

// ─── Page ───

export default function CheckoutPage() {
  const { listingId } = useParams<{ listingId: string }>();
  const router = useRouter();

  const [step, setStep]               = useState<Step>('review');
  const [quantity, setQuantity]       = useState(1);
  const [address, setAddress]         = useState<AddressForm>(BLANK_ADDRESS);
  const [paymentMethod, setPaymentMethod] = useState<'razorpay' | 'stripe'>('razorpay');
  const [addrErrors, setAddrErrors]   = useState<Partial<Record<keyof AddressForm, string>>>({});
  const [regionBlockDetail, setRegionBlockDetail] = useState<string | null>(null);
  const [placedOrderId, setPlacedOrderId] = useState<string | null>(null);

  // Load listing details
  const listingQ = useQuery({
    queryKey: ['listing', listingId],
    queryFn:  () => buyerListingsApi.getOne(listingId),
  });

  // Shipping estimate (fetched when address.country is known)
  const estimateQ = useQuery({
    queryKey: ['estimate', listingId, quantity, address.country],
    queryFn:  () =>
      api.get<EstimateResult>('/orders/estimate', {
        params: { listingId, quantity, destinationCountry: address.country },
      }),
    enabled: step === 'shipping' && !!address.country,
  });

  // Place order
  const orderMut = useMutation({
    mutationFn: () =>
      api.post<{ orderId: string; clientSecret?: string; paymentUrl?: string }>('/orders', {
        listingId,
        quantity,
        shippingAddress: address,
        paymentMethod,
      }),
    onSuccess: (data) => {
      setPlacedOrderId(data.orderId);
      // TODO: complete payment
      // Razorpay: Razorpay.checkout.open({ key, order_id, ... })
      // Stripe:   stripe.confirmPayment({ clientSecret: data.clientSecret, ... })
      // For now, navigate to success — replace with SDK call in production
      setStep('success');
    },
    onError: (err) => {
      if (err instanceof ApiError && err.messages[0] === 'REGION_PAIR_DISABLED') {
        // Named region-pair error — not a generic error banner
        setRegionBlockDetail(
          (err as any).detail ??
          'Your buyer region and the seller\'s region are not enabled for trade on KashRoot.'
        );
      }
    },
  });

  function validateAddress(): boolean {
    const errs: typeof addrErrors = {};
    if (!address.fullName.trim()) errs.fullName = 'Full name is required';
    if (!address.line1.trim())    errs.line1    = 'Address line 1 is required';
    if (!address.city.trim())     errs.city     = 'City is required';
    if (!address.state.trim())    errs.state    = 'State / province is required';
    if (!address.postalCode.trim()) errs.postalCode = 'Postal / ZIP code is required';
    if (!address.phone.trim())    errs.phone    = 'Phone number is required';
    setAddrErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function addrField(key: keyof AddressForm, label: string, props?: React.InputHTMLAttributes<HTMLInputElement>) {
    const err = addrErrors[key];
    return (
      <div>
        <label htmlFor={`addr-${key}`} className="kr-label">{label}</label>
        <input
          id={`addr-${key}`}
          type="text"
          value={address[key]}
          onChange={(e) => setAddress((a) => ({ ...a, [key]: e.target.value }))}
          aria-invalid={!!err}
          aria-describedby={err ? `addr-${key}-err` : undefined}
          className={`kr-input ${err ? 'kr-input-error' : ''}`}
          {...props}
        />
        {err && <p id={`addr-${key}-err`} className="kr-error-msg" role="alert">{err}</p>}
      </div>
    );
  }

  const listing = listingQ.data;

  // ─── Success ───
  if (step === 'success') {
    return (
      <main id="main-content" className="kr-container py-10 max-w-lg">
        <div role="status" aria-live="polite" className="text-center space-y-4 py-12">
          <CheckCircle2 className="w-14 h-14 text-kr-success-500 mx-auto" aria-hidden="true" />
          <h1 className="font-heading text-h2 text-kr-text-primary">Order placed!</h1>
          <p className="text-body text-kr-text-secondary">
            Your order has been received. The farmer will confirm shortly.
          </p>
          {placedOrderId && (
            <button
              onClick={() => router.push(`/orders/${placedOrderId}`)}
              className="kr-btn-primary"
            >
              Track order
            </button>
          )}
        </div>
      </main>
    );
  }

  return (
    <main id="main-content" className="kr-container py-6 md:py-10 max-w-2xl">
      <button
        onClick={() =>
          step === 'review'   ? router.back()
          : step === 'shipping' ? setStep('review')
          : setStep('shipping')
        }
        className="flex items-center gap-1 text-body-sm text-kr-text-secondary
                   hover:text-kr-text-primary mb-6 kr-focus-ring rounded"
      >
        <ChevronLeft className="w-4 h-4" aria-hidden="true" /> Back
      </button>

      <h1 className="font-heading text-h1 text-kr-text-primary mb-6">Checkout</h1>

      <StepIndicator current={step} />

      {/* Region-pair blocked — named, specific message */}
      {regionBlockDetail && <RegionBlockedBanner detail={regionBlockDetail} />}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-8 items-start">
        {/* Main content */}
        <div>

          {/* ── Step 1: Review ── */}
          {step === 'review' && (
            <section aria-labelledby="step-review-heading">
              <h2 id="step-review-heading" className="font-heading text-h3 text-kr-text-primary mb-4">
                Review your order
              </h2>

              {listingQ.isLoading && (
                <div className="kr-card space-y-3 animate-pulse">
                  <div className="kr-skeleton h-5 w-2/3 rounded" />
                  <div className="kr-skeleton h-4 w-1/2 rounded" />
                </div>
              )}

              {listing && (
                <div className="kr-card space-y-4">
                  <div className="flex items-start gap-4">
                    <div className="w-16 h-16 rounded-md bg-kr-bg-sunken overflow-hidden shrink-0">
                      {listing.images[0]
                        ? <img src={listing.images[0]} alt={listing.title} className="w-full h-full object-cover" />
                        : <ShoppingCart className="w-6 h-6 m-5 text-kr-text-disabled" aria-hidden="true" />}
                    </div>
                    <div>
                      <p className="font-medium text-body text-kr-text-primary">{listing.title}</p>
                      <p className="text-body-sm text-kr-text-secondary">
                        by {listing.farmerName} · {listing.originRegion}
                      </p>
                      <p className="text-body-sm font-medium text-kr-text-primary mt-1">
                        {fmt(listing.pricePerUnit, listing.currency)} / {listing.unit}
                      </p>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="quantity" className="kr-label">Quantity ({listing.unit})</label>
                    <input
                      id="quantity"
                      type="number"
                      min="1"
                      max={listing.stockQuantity}
                      value={quantity}
                      onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
                      className="kr-input w-32"
                      aria-describedby="qty-hint"
                    />
                    <p id="qty-hint" className="kr-hint">
                      {listing.stockQuantity} {listing.unit} available
                    </p>
                  </div>

                  <p className="text-body-sm font-medium text-kr-text-primary">
                    Subtotal:{' '}
                    <span className="kr-amount">
                      {fmt(listing.pricePerUnit * quantity, listing.currency)}
                    </span>
                  </p>
                </div>
              )}

              <button
                onClick={() => setStep('shipping')}
                disabled={!listing}
                className="kr-btn-primary w-full mt-6"
              >
                Continue to shipping
              </button>
            </section>
          )}

          {/* ── Step 2: Shipping ── */}
          {step === 'shipping' && (
            <section aria-labelledby="step-shipping-heading">
              <h2 id="step-shipping-heading" className="font-heading text-h3 text-kr-text-primary mb-4">
                Shipping address
              </h2>

              <div className="space-y-4">
                {addrField('fullName', 'Full name', { autoComplete: 'name' })}
                {addrField('phone', 'Phone number', { type: 'tel', autoComplete: 'tel' })}
                {addrField('line1', 'Address line 1', { autoComplete: 'address-line1' })}
                {addrField('line2', 'Address line 2 (optional)', { autoComplete: 'address-line2', required: false } as any)}

                <div className="grid grid-cols-2 gap-4">
                  {addrField('city', 'City', { autoComplete: 'address-level2' })}
                  {addrField('state', 'State / Province', { autoComplete: 'address-level1' })}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {addrField('postalCode', 'Postal / ZIP code', { autoComplete: 'postal-code' })}
                  <div>
                    <label htmlFor="addr-country" className="kr-label">Country</label>
                    <select
                      id="addr-country"
                      value={address.country}
                      onChange={(e) => setAddress((a) => ({ ...a, country: e.target.value }))}
                      className="kr-input"
                      autoComplete="country"
                    >
                      {COUNTRIES.map((c) => (
                        <option key={c.code} value={c.code}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Estimate panel (auto-loads when country is set) */}
              {estimateQ.isLoading && (
                <div className="mt-6 kr-card animate-pulse space-y-2">
                  <div className="kr-skeleton h-4 w-full rounded" />
                  <div className="kr-skeleton h-4 w-3/4 rounded" />
                  <div className="kr-skeleton h-4 w-1/2 rounded" />
                </div>
              )}

              {estimateQ.data && (
                <div className="mt-6 space-y-4">
                  {/* Cross-border customs disclosure */}
                  {estimateQ.data.isCrossBorder && (
                    <CustomsDisclosurePanel estimate={estimateQ.data} />
                  )}

                  <div className="kr-card space-y-2 text-body-sm">
                    <p className="font-heading text-h4 text-kr-text-primary mb-3">Estimated costs</p>
                    <div className="flex justify-between">
                      <span className="text-kr-text-secondary">Subtotal</span>
                      <span className="kr-amount">{fmt(estimateQ.data.subtotal, estimateQ.data.currency)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-kr-text-secondary">Shipping</span>
                      <span className="kr-amount">{fmt(estimateQ.data.shippingFee, estimateQ.data.currency)}</span>
                    </div>
                    {estimateQ.data.isCrossBorder && estimateQ.data.customsDuty !== undefined && (
                      <div className="flex justify-between">
                        <span className="text-kr-text-secondary flex items-center gap-1">
                          <Globe className="w-3 h-3" aria-hidden="true" /> Estimated customs duty
                        </span>
                        <span className="kr-amount">{fmt(estimateQ.data.customsDuty, estimateQ.data.currency)}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-kr-text-secondary">Platform fee</span>
                      <span className="kr-amount">{fmt(estimateQ.data.platformFee, estimateQ.data.currency)}</span>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-kr-neutral-200 font-semibold text-body">
                      <span className="text-kr-text-primary">Total</span>
                      <span className="kr-amount text-kr-text-primary">
                        {fmt(estimateQ.data.total, estimateQ.data.currency)}
                      </span>
                    </div>
                    <p className="text-caption text-kr-text-secondary">
                      Estimated delivery: {estimateQ.data.estimatedDeliveryDays} days
                    </p>
                  </div>
                </div>
              )}

              <button
                onClick={() => { if (validateAddress()) setStep('payment'); }}
                className="kr-btn-primary w-full mt-6"
              >
                Continue to payment
              </button>
            </section>
          )}

          {/* ── Step 3: Payment ── */}
          {step === 'payment' && (
            <section aria-labelledby="step-payment-heading">
              <h2 id="step-payment-heading" className="font-heading text-h3 text-kr-text-primary mb-4">
                Payment
              </h2>

              <fieldset className="space-y-3 mb-6">
                <legend className="kr-label">Select payment method</legend>
                {PAYMENT_METHODS.map((pm) => (
                  <label
                    key={pm.id}
                    className={`
                      flex items-start gap-3 p-4 rounded-lg border cursor-pointer
                      transition-colors kr-focus-ring
                      ${ paymentMethod === pm.id
                        ? 'border-kr-border-brand bg-kr-fill-brand-subtle'
                        : 'border-kr-border-default bg-kr-bg-surface hover:border-kr-border-brand'
                      }
                    `}
                  >
                    <input
                      type="radio"
                      name="paymentMethod"
                      value={pm.id}
                      checked={paymentMethod === pm.id}
                      onChange={() => setPaymentMethod(pm.id as 'razorpay' | 'stripe')}
                      className="mt-0.5 accent-kr-primary-500"
                      aria-describedby={`pm-hint-${pm.id}`}
                    />
                    <div>
                      <p className="text-body-sm font-medium text-kr-text-primary">{pm.label}</p>
                      <p id={`pm-hint-${pm.id}`} className="kr-hint">{pm.hint}</p>
                    </div>
                  </label>
                ))}
              </fieldset>

              <div
                role="note"
                className="flex items-start gap-2 p-3 rounded-md
                           bg-kr-fill-brand-subtle border border-kr-border-brand mb-6"
              >
                <Info className="w-4 h-4 text-kr-primary-600 mt-0.5 shrink-0" aria-hidden="true" />
                <p className="text-caption text-kr-primary-800">
                  Payment SDK integration is a TODO — clicking "Place order" will create the order
                  record and receive a payment token but will not complete the charge in this build.
                  Integrate Razorpay.checkout.open() or Stripe Elements with the returned token.
                </p>
              </div>

              {orderMut.error && !regionBlockDetail && (
                <div role="alert" className="kr-error-state mb-4 flex items-start gap-3 text-left">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                  <p className="text-body-sm">
                    {orderMut.error instanceof ApiError
                      ? orderMut.error.messages[0]
                      : 'Order placement failed. Please try again.'}
                  </p>
                </div>
              )}

              <button
                onClick={() => orderMut.mutate()}
                disabled={orderMut.isPending}
                aria-busy={orderMut.isPending}
                className="kr-btn-primary w-full kr-btn-lg"
              >
                {orderMut.isPending
                  ? <><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Placing order…</>
                  : <><CreditCard className="w-4 h-4" aria-hidden="true" /> Place order</>
                }
              </button>
            </section>
          )}
        </div>

        {/* Order summary sidebar */}
        {listing && (
          <aside aria-label="Order summary" className="kr-card sticky top-6">
            <h2 className="font-heading text-h4 text-kr-text-primary mb-4">Order summary</h2>
            <div className="space-y-2 text-body-sm">
              <p className="text-kr-text-secondary truncate">{listing.title}</p>
              <p className="text-kr-text-secondary">
                {quantity} {listing.unit} × {fmt(listing.pricePerUnit, listing.currency)}
              </p>
              <p className="font-semibold text-body text-kr-text-primary pt-2 border-t border-kr-neutral-200 kr-amount">
                {fmt(listing.pricePerUnit * quantity, listing.currency)}
              </p>
              <p className="text-caption text-kr-text-secondary">+ shipping &amp; fees at next step</p>
              {estimateQ.data?.isCrossBorder && (
                <span className="kr-badge kr-badge-cross-border">Cross-border</span>
              )}
            </div>
          </aside>
        )}
      </div>
    </main>
  );
}
