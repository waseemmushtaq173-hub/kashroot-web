'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import {
  AlertCircle, Loader2, ShieldAlert, X, PlusCircle, Check,
} from 'lucide-react';
import { CURRENCIES, UNITS, REGIONS, type KycStatus } from '@/lib/listing-options';
import type { FarmerListing } from '@/lib/api/farmer';

/**
 * ListingForm — the create/edit form for a farmer listing.
 *
 * WHY THIS IS A COMPONENT AND NOT A PAGE
 * --------------------------------------
 * /farmer/listings/new and /farmer/listings/[id]/edit need exactly the same
 * fields, validation, copy and accessibility wiring; the only differences are
 * where the initial values come from and what the buttons do. The original
 * /farmer/listings/new docblock already declared the intent — "also consumed by
 * /farmer/listings/[id]/edit via defaultValues" — but the page hardcoded its
 * defaults and POST-only mutations, so the edit route could never have been
 * built on it. Rather than copy ~350 lines of form markup (and a third copy of
 * the origin-region list, which had already drifted between two pages), the form
 * lives here and both routes are thin wrappers that supply data and handlers.
 *
 * The component owns validation and the wire payload; it does not own fetching,
 * mutations, or navigation. Callers receive a ready-to-send payload in
 * `onAction` and decide what to do with it.
 *
 * NUMERIC FIELDS ARE STRINGS HERE
 * ------------------------------
 * Every numeric field in ListingFormValues is a string because it is bound to an
 * <input>, whose DOM value is always a string. Conversion happens once, in
 * buildListingPayload. Typing them as numbers would mean fighting the DOM.
 */

export type CertField = { value: string };

export type ListingFormValues = {
  title: string;
  commodity: string;
  description: string;
  pricePerUnit: string;
  currency: string;
  unit: string;
  stockQuantity: string;
  originRegion: string;
  harvestDate: string;
  minimumOrderQuantity: string;
  certifications: CertField[];
  isOrganic: boolean;
};

/** The body sent to POST /listings and PATCH /listings/:id. */
export interface ListingPayload {
  title: string;
  commodity: string;
  description?: string;
  pricePerUnit: number;
  currency: string;
  unit: string;
  stockQuantity: number;
  originRegion: string;
  harvestDate?: string;
  minimumOrderQuantity?: number;
  certifications: string[];
  isOrganic: boolean;
}

export type ListingFormAction = {
  key: string;
  label: string;
  busyLabel: string;
  variant: 'primary' | 'secondary';
  icon?: 'check';
  busy?: boolean;
  hidden?: boolean;
  onAction: (payload: ListingPayload) => void;
};

export const EMPTY_LISTING_FORM: ListingFormValues = {
  title: '',
  commodity: '',
  description: '',
  pricePerUnit: '',
  currency: 'INR',
  unit: 'kg',
  stockQuantity: '',
  originRegion: '',
  harvestDate: '',
  minimumOrderQuantity: '',
  certifications: [],
  isOrganic: false,
};

/**
 * Turns a listing from the API into form values.
 *
 * This is the prefill mapping for the edit route. Every conversion here exists
 * for a specific reason and each is a place a naive mapping goes wrong:
 *
 *   numbers  -> String()   an <input> value must be a string; passing a number
 *                          to react-hook-form leaves the field showing the
 *                          "uncontrolled to controlled" warning path and, for
 *                          a Decimal-backed field, can show "7.5000".
 *   null     -> ''         a date input has no representation for null; ''
 *                          is what renders as an empty control. The inverse
 *                          ('' -> undefined) is handled in buildListingPayload.
 *   string[] -> {value}[]  the tag editor is a field array of objects, not a
 *                          plain string list, so it must be wrapped.
 */
export function listingToFormValues(listing: FarmerListing): ListingFormValues {
  return {
    title: listing.title,
    commodity: listing.commodity,
    description: listing.description ?? '',
    pricePerUnit: String(listing.pricePerUnit),
    currency: listing.currency,
    unit: listing.unit,
    stockQuantity: String(listing.stockQuantity),
    originRegion: listing.originRegion,
    harvestDate: listing.harvestDate ?? '',
    minimumOrderQuantity: String(listing.minimumOrderQuantity),
    certifications: (listing.certifications ?? []).map((value) => ({ value })),
    isOrganic: listing.isOrganic,
  };
}

/**
 * Turns form values into the API payload.
 *
 * `''` means "not provided" for the optional fields, and is omitted from the
 * payload rather than sent as null. On PATCH an absent key means "leave
 * unchanged" (the service only writes keys that are not undefined), whereas an
 * explicit null would arrive at `new Date(null)` and store 1970-01-01. The
 * trade-off is that a harvest date already on the server cannot be cleared from
 * this form yet; that needs an explicit-null convention in the API's DTO.
 */
export function buildListingPayload(
  data: ListingFormValues,
  certificationTags: string[],
): ListingPayload {
  return {
    title: data.title.trim(),
    commodity: data.commodity.trim(),
    description: data.description.trim() || undefined,
    pricePerUnit: parseFloat(data.pricePerUnit),
    currency: data.currency,
    unit: data.unit,
    stockQuantity: parseInt(data.stockQuantity, 10),
    originRegion: data.originRegion,
    harvestDate: data.harvestDate || undefined,
    /*
     * parseFloat, not parseInt. minOrderQty is Decimal(12,4) and CreateListingDto
     * accepts up to 4 decimal places, so a farmer whose minimum order is 0.5 kg
     * was having it silently truncated to 0 by the old parseInt — a minimum
     * below their intent, and one the API would then have accepted.
     */
    minimumOrderQuantity: data.minimumOrderQuantity
      ? parseFloat(data.minimumOrderQuantity)
      : undefined,
    certifications: certificationTags,
    isOrganic: data.isOrganic,
  };
}

/**
 * Keeps a value that the option list does not contain from rendering as a blank
 * control.
 *
 * The API returns whatever name is stored on the row; the option lists above are
 * the values this app offers. When the two disagree — a listing whose stored
 * origin is not among REGIONS, say — a plain <option> list selects nothing and
 * the farmer sees an empty field with no indication that a value is set. Adding
 * the stored value back as an extra option keeps it visible and keeps a
 * subsequent save from silently replacing it.
 */
function withCurrentValue(
  options: readonly string[],
  current: string | undefined,
): string[] {
  return current && !options.includes(current)
    ? [...options, current]
    : [...options];
}

// ─── KYC Gate Banner ────────────────────────────────────────────────────────

export function KycGateBanner({ status }: { status: KycStatus }) {
  const configs: Record<Exclude<KycStatus, 'VERIFIED'>, {
    title: string; body: string; cta?: string; ctaHref?: string;
  }> = {
    NOT_SUBMITTED: {
      title:   'Complete KYC to publish listings',
      body:    'Submit your farm registration and identity documents to make listings visible to buyers worldwide. You can save drafts in the meantime.',
      cta:     'Start KYC verification →',
      ctaHref: '/farmer/kyc',
    },
    PENDING: {
      title: 'KYC review in progress',
      body:  'Your documents are being reviewed (typically 1–2 business days). Save as draft — you can publish as soon as your account is approved.',
    },
    REJECTED: {
      title:   'KYC verification was not approved',
      body:    'Please re-submit your documents with the corrections noted in the rejection email.',
      cta:     'Re-submit documents →',
      ctaHref: '/farmer/kyc',
    },
  };

  if (status === 'VERIFIED') return null;
  const cfg = configs[status];

  return (
    <div
      role="alert"
      className="flex items-start gap-3 p-4 rounded-lg
                 border border-kr-warning-300 bg-kr-badge-pending-bg mb-8"
    >
      <ShieldAlert
        className="w-5 h-5 text-kr-warning-600 mt-0.5 shrink-0"
        aria-hidden="true"
      />
      <div>
        <p className="font-medium text-body-sm text-kr-badge-pending-text">{cfg.title}</p>
        <p className="text-body-sm text-kr-warning-700 mt-1">{cfg.body}</p>
        {cfg.cta && cfg.ctaHref && (
          <a
            href={cfg.ctaHref}
            className="inline-block mt-2 text-body-sm font-semibold text-kr-badge-pending-text
                       underline underline-offset-2 hover:no-underline kr-focus-ring rounded"
          >
            {cfg.cta}
          </a>
        )}
      </div>
    </div>
  );
}

// ─── Certification Tags ──────────────────────────────────────────────────────

export function CertTagsInput({
  tags, onAdd, onRemove,
}: {
  tags: string[];
  onAdd: (v: string) => void;
  onRemove: (i: number) => void;
}) {
  const [input, setInput] = useState('');

  function commit() {
    const v = input.trim();
    if (v && !tags.includes(v)) onAdd(v);
    setInput('');
  }

  return (
    <div>
      <div
        className="flex flex-wrap gap-2 min-h-[2.75rem] p-2
                   border border-kr-border-default rounded-md bg-kr-bg-surface
                   focus-within:border-kr-border-focus focus-within:shadow-kr-brand
                   transition-shadow"
        role="group"
        aria-label="Certification tags"
      >
        {tags.map((tag, i) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded
                       bg-kr-fill-brand-subtle text-kr-primary-700 text-body-sm font-medium"
          >
            {tag}
            <button
              type="button"
              onClick={() => onRemove(i)}
              aria-label={`Remove ${tag} certification`}
              className="hover:text-kr-primary-900 kr-focus-ring rounded"
            >
              <X className="w-3 h-3" aria-hidden="true" />
            </button>
          </span>
        ))}
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } }}
          placeholder={tags.length ? 'Add more…' : 'e.g. Organic, GlobalGAP, FSSAI, APEDA…'}
          className="flex-1 min-w-[12rem] bg-transparent outline-none
                     text-body-sm text-kr-text-primary placeholder:text-kr-text-disabled"
          aria-label="Type a certification and press Enter to add"
        />
      </div>
      <p id="cert-hint" className="kr-hint">Press Enter after each certification.</p>
    </div>
  );
}

// ─── Form ────────────────────────────────────────────────────────────────────

export function ListingForm({
  initialValues = EMPTY_LISTING_FORM,
  kycStatus,
  serverError,
  actions,
  aside,
  beforeForm,
}: {
  initialValues?: ListingFormValues;
  kycStatus: KycStatus;
  serverError: string | null;
  actions: ListingFormAction[];
  /** Destructive or non-validating controls (e.g. Archive), rendered with the actions. */
  aside?: ReactNode;
  /** Slot above the form — used by the edit route for its status banner. */
  beforeForm?: ReactNode;
}) {
  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors },
  } = useForm<ListingFormValues>({ defaultValues: initialValues });

  const { fields, append, remove } = useFieldArray({ control, name: 'certifications' });
  const certTags = fields.map((f) => f.value);

  const saving = actions.some((a) => a.busy);

  // A stored value that is not in the configured list is appended rather than
  // dropped, so the control shows what is actually set. See withCurrentValue.
  const currencyValue = watch('currency');
  const unitValue = watch('unit');
  const regionValue = watch('originRegion');
  const currencyOptions = useMemo(
    () => withCurrentValue(CURRENCIES, currencyValue),
    [currencyValue],
  );
  const unitOptions = useMemo(() => withCurrentValue(UNITS, unitValue), [unitValue]);
  const regionOptions = useMemo(
    () => withCurrentValue(REGIONS, regionValue),
    [regionValue],
  );

  return (
    <form noValidate className="space-y-8">
      {beforeForm}

      {/* KYC gate — contextual, actionable message instead of a generic 403 */}
      <KycGateBanner status={kycStatus} />

      {serverError && (
        <div
          role="alert"
          className="kr-error-state flex items-start gap-3 text-left"
        >
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
          <p className="text-body-sm">{serverError}</p>
        </div>
      )}

      {/* ── Product details ── */}
      <fieldset className="space-y-5">
        <legend className="font-heading text-h3 text-kr-text-primary
                           border-b border-kr-neutral-200 pb-2 w-full">
          Product details
        </legend>

        {/* Title */}
        <div>
          <label htmlFor="title" className="kr-label">
            Listing title <span aria-hidden="true" className="text-kr-text-danger">*</span>
          </label>
          <input
            id="title"
            type="text"
            placeholder="e.g. Grade-A Walnuts — Harvest 2026"
            aria-required="true"
            aria-describedby={errors.title ? 'title-err' : 'title-hint'}
            aria-invalid={!!errors.title}
            className={`kr-input ${errors.title ? 'kr-input-error' : ''}`}
            {...register('title', {
              required: 'Title is required',
              minLength: { value: 5, message: 'At least 5 characters' },
            })}
          />
          {errors.title
            ? <p id="title-err" className="kr-error-msg" role="alert">
                <AlertCircle className="w-3 h-3" aria-hidden="true" />{errors.title.message}
              </p>
            : <p id="title-hint" className="kr-hint">Be specific — buyers search by crop, grade, and region.</p>
          }
        </div>

        {/* Commodity */}
        <div>
          <label htmlFor="commodity" className="kr-label">
            Commodity / crop type <span aria-hidden="true" className="text-kr-text-danger">*</span>
          </label>
          <input
            id="commodity"
            type="text"
            placeholder="e.g. Walnuts, Saffron, Apples, Rice"
            aria-required="true"
            aria-invalid={!!errors.commodity}
            className={`kr-input ${errors.commodity ? 'kr-input-error' : ''}`}
            {...register('commodity', { required: 'Commodity is required' })}
          />
          {errors.commodity && (
            <p className="kr-error-msg" role="alert">
              <AlertCircle className="w-3 h-3" aria-hidden="true" />{errors.commodity.message}
            </p>
          )}
        </div>

        {/* Description */}
        <div>
          <label htmlFor="description" className="kr-label">Description</label>
          <textarea
            id="description"
            rows={4}
            placeholder="Quality, grading, moisture content, packaging, storage conditions…"
            aria-describedby="desc-hint"
            className="kr-input resize-y"
            {...register('description')}
          />
          <p id="desc-hint" className="kr-hint">
            Include variety, grade standard (e.g. IS-1642), and any quality certifications.
          </p>
        </div>
      </fieldset>

      {/* ── Pricing ── */}
      <fieldset className="space-y-5">
        <legend className="font-heading text-h3 text-kr-text-primary
                           border-b border-kr-neutral-200 pb-2 w-full">
          Pricing &amp; quantity
        </legend>

        {/* Price + currency + unit */}
        <div className="grid grid-cols-[1fr_auto_auto] gap-3 items-start">
          <div>
            <label htmlFor="pricePerUnit" className="kr-label">
              Price per unit <span aria-hidden="true" className="text-kr-text-danger">*</span>
            </label>
            <input
              id="pricePerUnit"
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              aria-required="true"
              aria-invalid={!!errors.pricePerUnit}
              className={`kr-input ${errors.pricePerUnit ? 'kr-input-error' : ''}`}
              {...register('pricePerUnit', {
                required: 'Price is required',
                min: { value: 0.01, message: 'Must be greater than 0' },
              })}
            />
            {errors.pricePerUnit && (
              <p className="kr-error-msg" role="alert">
                <AlertCircle className="w-3 h-3" aria-hidden="true" />{errors.pricePerUnit.message}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="currency" className="kr-label">Currency</label>
            <select id="currency" className="kr-input" {...register('currency')}>
              {currencyOptions.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div>
            <label htmlFor="unit" className="kr-label">Per</label>
            <select id="unit" className="kr-input" {...register('unit')}>
              {unitOptions.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
        </div>

        {/* Stock qty */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="stockQuantity" className="kr-label">
              Available stock <span aria-hidden="true" className="text-kr-text-danger">*</span>
            </label>
            <input
              id="stockQuantity"
              type="number"
              min="1"
              placeholder="0"
              aria-required="true"
              aria-invalid={!!errors.stockQuantity}
              className={`kr-input ${errors.stockQuantity ? 'kr-input-error' : ''}`}
              {...register('stockQuantity', {
                required: 'Stock quantity is required',
                min: { value: 1, message: 'Must be at least 1' },
              })}
            />
            {errors.stockQuantity && (
              <p className="kr-error-msg" role="alert">
                <AlertCircle className="w-3 h-3" aria-hidden="true" />{errors.stockQuantity.message}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="moq" className="kr-label">Minimum order qty</label>
            <input
              id="moq"
              type="number"
              min="0"
              step="any"
              placeholder="Optional"
              className="kr-input"
              {...register('minimumOrderQuantity')}
            />
          </div>
        </div>
      </fieldset>

      {/* ── Origin & harvest ── */}
      <fieldset className="space-y-5">
        <legend className="font-heading text-h3 text-kr-text-primary
                           border-b border-kr-neutral-200 pb-2 w-full">
          Origin &amp; certifications
        </legend>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="originRegion" className="kr-label">
              Origin region <span aria-hidden="true" className="text-kr-text-danger">*</span>
            </label>
            <select
              id="originRegion"
              aria-required="true"
              aria-invalid={!!errors.originRegion}
              className={`kr-input ${errors.originRegion ? 'kr-input-error' : ''}`}
              {...register('originRegion', { required: 'Origin region is required' })}
            >
              <option value="">Select state / UT</option>
              {regionOptions.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            {errors.originRegion && (
              <p className="kr-error-msg" role="alert">
                <AlertCircle className="w-3 h-3" aria-hidden="true" />{errors.originRegion.message}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="harvestDate" className="kr-label">Harvest date</label>
            <input
              id="harvestDate"
              type="date"
              className="kr-input"
              {...register('harvestDate')}
            />
          </div>
        </div>

        {/* Organic toggle */}
        <div className="flex items-center gap-3">
          <input
            id="isOrganic"
            type="checkbox"
            className="w-4 h-4 accent-kr-primary-500 kr-focus-ring rounded"
            {...register('isOrganic')}
          />
          <label htmlFor="isOrganic" className="text-body-sm text-kr-text-primary cursor-pointer">
            This produce is organically grown
          </label>
        </div>

        {/* Certifications */}
        <div>
          <label className="kr-label" id="cert-label">Certifications</label>
          <CertTagsInput
            tags={certTags}
            onAdd={(v) => append({ value: v })}
            onRemove={(i) => remove(i)}
          />
        </div>
      </fieldset>

      {/* ── Images ── */}
      <fieldset className="space-y-3">
        <legend className="font-heading text-h3 text-kr-text-primary
                           border-b border-kr-neutral-200 pb-2 w-full">
          Photos
        </legend>
        <p className="text-body-sm text-kr-text-secondary">
          Clear photos improve buyer trust. Add up to 8 images.
        </p>
        {/* TODO: wire to POST /listings/:id/images once endpoint is implemented */}
        <label
          htmlFor="images"
          className="flex flex-col items-center justify-center gap-2
                     border-2 border-dashed border-kr-border-default rounded-lg
                     p-8 cursor-pointer hover:border-kr-border-brand
                     transition-colors group"
        >
          <PlusCircle
            className="w-8 h-8 text-kr-text-disabled group-hover:text-kr-primary-500
                       transition-colors"
            aria-hidden="true"
          />
          <span className="text-body-sm text-kr-text-secondary">
            Click to upload images (JPG, PNG, WebP — max 5 MB each)
          </span>
          <input
            id="images"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="sr-only"
            aria-label="Upload product photos"
          />
        </label>
        <p className="text-caption text-kr-text-disabled">
          Image upload endpoint (POST /listings/:id/images) is not yet implemented in Modules 1–6.
          Files selected here will be stored locally until the endpoint is available.
        </p>
      </fieldset>

      {/* ── Actions ── */}
      <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-kr-neutral-200">
        {actions.filter((a) => !a.hidden).map((action) => (
          <button
            key={action.key}
            type="button"
            disabled={saving}
            aria-busy={action.busy}
            onClick={handleSubmit((data) =>
              action.onAction(buildListingPayload(data, certTags)),
            )}
            className={
              action.variant === 'primary'
                ? 'kr-btn-primary kr-btn-lg flex-1'
                : 'kr-btn-secondary kr-btn-lg flex-1'
            }
          >
            {action.busy
              ? <><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> {action.busyLabel}</>
              : <>
                  {action.icon === 'check' && <Check className="w-4 h-4" aria-hidden="true" />}
                  {action.label}
                </>
            }
          </button>
        ))}
        {aside}
      </div>
    </form>
  );
}
