import { Button } from "@/components/ui/Button";
'use client';

import { useState, useCallback } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Search, SlidersHorizontal, X, Leaf, Award,
  ShoppingCart, Calendar, AlertTriangle, RefreshCw, ChevronRight,
} from 'lucide-react';
import { buyerListingsApi } from '@/lib/api/buyer';
import type { PublicListing, ListingSearchParams, TrustGate } from '@/lib/api/buyer';
import { ApiError } from '@/lib/api/client';
import { REGIONS } from '@/lib/listing-options';

/**
 * BuyerDiscoverPage
 *
 * API contract (Module 2 verified against src/modules/listings/):
 *   GET /listings { q?, commodity?, originRegion?, minPrice?, maxPrice?,
 *                   currency?, isOrganic?, certifications?, trustGate?,
 *                   page?, limit? }
 *   → { data: PublicListing[], total, page, limit }
 *
 * Trust-gate:
 *   Each listing has `trustGate: 'buy_now' | 'request_appointment'`
 *   computed by the backend. The UI renders:
 *     buy_now             → "Buy now" CTA  → /checkout/:listingId
 *     request_appointment → "Request appointment" CTA → /appointments/book/:listingId
 *   NEVER infer this from listing data — always use the backend-returned value.
 *
 * SECURITY note:
 *   <!-- Trust-gate CTA choice is UX only. Backend enforces real gate on POST /orders. -->
 *
 * Accessibility:
 *   Filter sidebar: <aside role="complementary" aria-label="Filters">
 *   Skip-to-results link. Results grid: <ul role="list">
 *   Each card: article with aria-label. Badges aria-label.
 *   Loading: aria-busy. Error: role="alert".
 *   Mobile: sidebar in an overlay drawer on sm, static aside on lg.
 */

/*
 * REGIONS was declared here as a 12-state list while the farmer form declared a
 * 14-state one, so Andhra Pradesh and Uttar Pradesh were selectable as a listing
 * origin but not filterable by a buyer — listings a buyer could not surface. The
 * list now comes from lib/listing-options so the two ends of the marketplace
 * cannot drift apart again.
 */

const COMMON_CERTS = ['Organic', 'GlobalGAP', 'FSSAI', 'APEDA', 'ISO 22000', 'Fair Trade'];

const TRUST_GATE_LABEL: Record<TrustGate, string> = {
  buy_now:              'Buy now',
  request_appointment:  'Request appointment',
};

function fmt(amount: number, currency: string) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency', currency, maximumFractionDigits: 0,
  }).format(amount);
}

// ─── Filter Sidebar ───────────────────────────────────────────────────────

type Filters = {
  originRegion: string;
  isOrganic: boolean;
  certifications: string[];
  minPrice: string;
  maxPrice: string;
  trustGate: TrustGate | '';
};

const DEFAULT_FILTERS: Filters = {
  originRegion: '',
  isOrganic: false,
  certifications: [],
  minPrice: '',
  maxPrice: '',
  trustGate: '',
};

function FilterSidebar({
  filters, onChange, onClear,
}: {
  filters: Filters;
  onChange: (next: Filters) => void;
  onClear: () => void;
}) {
  const activeCount = [
    filters.originRegion,
    filters.isOrganic,
    filters.certifications.length > 0,
    filters.minPrice,
    filters.maxPrice,
    filters.trustGate,
  ].filter(Boolean).length;

  function toggleCert(cert: string) {
    const next = filters.certifications.includes(cert)
      ? filters.certifications.filter((c) => c !== cert)
      : [...filters.certifications, cert];
    onChange({ ...filters, certifications: next });
  }

  return (
    <aside
      aria-label="Search filters"
      className="space-y-6 p-4 bg-kr-bg-surface rounded-xl border border-kr-border-default"
    >
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-h3 text-kr-text-primary">
          Filters
          {activeCount > 0 && (
            <span
              className="ml-2 inline-flex items-center justify-center
                         w-5 h-5 rounded-full bg-kr-primary-500 text-white text-caption"
              aria-label={`${activeCount} active filter${activeCount > 1 ? 's' : ''}`}
            >
              {activeCount}
            </span>
          )}
        </h2>
        {activeCount > 0 && (
          <Button
            onClick={onClear}
            className="text-caption text-kr-text-brand hover:underline kr-focus-ring rounded"
          >
            Clear all
          </Button>
        )}
      </div>

      {/* Origin region */}
      <div>
        <label htmlFor="filter-region" className="kr-label mb-2">Origin region</label>
        <select
          id="filter-region"
          value={filters.originRegion}
          onChange={(e) => onChange({ ...filters, originRegion: e.target.value })}
          className="kr-input"
        >
          <option value="">All regions</option>
          {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>

      {/* Trust gate */}
      <div>
        <label htmlFor="filter-gate" className="kr-label mb-2">Purchase type</label>
        <select
          id="filter-gate"
          value={filters.trustGate}
          onChange={(e) => onChange({ ...filters, trustGate: e.target.value as TrustGate | '' })}
          className="kr-input"
        >
          <option value="">Any</option>
          <option value="buy_now">Buy now (direct)</option>
          <option value="request_appointment">Appointment first</option>
        </select>
      </div>

      {/* Price range */}
      <fieldset>
        <legend className="kr-label mb-2">Price range (INR / unit)</legend>
        <div className="grid grid-cols-2 gap-2">
          <input
            type="number"
            min="0"
            placeholder="Min"
            aria-label="Minimum price"
            value={filters.minPrice}
            onChange={(e) => onChange({ ...filters, minPrice: e.target.value })}
            className="kr-input"
          />
          <input
            type="number"
            min="0"
            placeholder="Max"
            aria-label="Maximum price"
            value={filters.maxPrice}
            onChange={(e) => onChange({ ...filters, maxPrice: e.target.value })}
            className="kr-input"
          />
        </div>
      </fieldset>

      {/* Organic */}
      <div className="flex items-center gap-2">
        <input
          id="filter-organic"
          type="checkbox"
          checked={filters.isOrganic}
          onChange={(e) => onChange({ ...filters, isOrganic: e.target.checked })}
          className="w-4 h-4 accent-kr-primary-500 kr-focus-ring rounded"
        />
        <label htmlFor="filter-organic" className="text-body-sm text-kr-text-primary cursor-pointer">
          <Leaf className="inline w-3 h-3 mr-1 text-kr-success-500" aria-hidden="true" />
          Organically grown only
        </label>
      </div>

      {/* Certifications */}
      <div>
        <p className="kr-label mb-2" id="cert-filter-label">Certifications</p>
        <div
          role="group"
          aria-labelledby="cert-filter-label"
          className="flex flex-wrap gap-2"
        >
          {COMMON_CERTS.map((cert) => {
            const selected = filters.certifications.includes(cert);
            return (
              <Button
                key={cert}
                type="button"
                onClick={() => toggleCert(cert)}
                aria-pressed={selected}
                className={`
                  px-3 py-1 rounded-full text-body-sm font-medium border transition-colors
                  kr-focus-ring
                  ${ selected
                    ? 'bg-kr-primary-500 text-white border-kr-primary-500'
                    : 'bg-transparent text-kr-text-secondary border-kr-border-default hover:border-kr-primary-500 hover:text-kr-primary-600'
                  }
                `}
              >
                {cert}
              </Button>
            );
          })}
        </div>
      </div>
    </aside>
  );
}

// ─── Listing Card ──────────────────────────────────────────────────────────

function ListingCard({ listing }: { listing: PublicListing }) {
  const isBuyNow = listing.trustGate === 'buy_now';

  return (
    <article
      className="kr-card kr-glass-amber kr-pattern-chinar kr-card-interactive flex flex-col h-full"
      aria-label={`${listing.title} by ${listing.farmerName}`}
    >
      {/* Image */}
      <div
        className="relative w-full aspect-[4/3] rounded-md overflow-hidden
                   bg-kr-bg-sunken mb-3 shrink-0"
      >
        {listing.images[0] ? (
          <Image
            src={listing.images[0]}
            alt={`Product photo of ${listing.title}`}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover"
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <ShoppingCart className="w-8 h-8 text-kr-text-disabled" aria-hidden="true" />
          </div>
        )}

        {/* Organic badge overlay */}
        {listing.isOrganic && (
          <span
            className="absolute top-2 left-2 inline-flex items-center gap-1
                       px-2 py-0.5 rounded-full
                       bg-kr-success-500 text-white text-caption font-medium"
            aria-label="Organically grown"
          >
            <Leaf className="w-3 h-3" aria-hidden="true" /> Organic
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex flex-col flex-1 gap-2">
        <div>
          <h3 className="font-heading text-h4 text-kr-text-primary line-clamp-2 leading-snug">
            {listing.title}
          </h3>
          <p className="text-body-sm text-kr-text-secondary mt-0.5">
            by {listing.farmerName}
            {listing.farmerRating !== null && (
              <span className="ml-1" aria-label={`Farmer rating: ${listing.farmerRating} out of 5`}>
                ⭐ {listing.farmerRating.toFixed(1)}
              </span>
            )}
          </p>
        </div>

        {/* Origin + certs */}
        <div className="flex flex-wrap gap-1.5">
          <span
            className="kr-badge kr-badge-draft"
            aria-label={`Origin: ${listing.originRegion}`}
          >
            {listing.originRegion}
          </span>
          {listing.certifications.slice(0, 2).map((cert) => (
            <span
              key={cert}
              className="kr-badge kr-badge-published"
              aria-label={`Certified: ${cert}`}
            >
              <Award className="w-3 h-3 mr-0.5" aria-hidden="true" />{cert}
            </span>
          ))}
          {listing.certifications.length > 2 && (
            <span
              className="kr-badge kr-badge-draft"
              aria-label={`${listing.certifications.length - 2} more certifications`}
            >
              +{listing.certifications.length - 2} more
            </span>
          )}
        </div>

        {/* Price */}
        <p className="font-heading text-h3 text-kr-text-primary kr-amount">
          {fmt(listing.pricePerUnit, listing.currency)}
          <span className="text-body-sm font-normal text-kr-text-secondary">/{listing.unit}</span>
        </p>

        <p className="text-caption text-kr-text-secondary">
          {listing.stockQuantity} {listing.unit} available
        </p>

        {/* CTA — driven by backend-returned trustGate field */}
        {/* SECURITY: trust-gate CTA is UX only. Backend enforces real gate on POST /orders. */}
        <div className="mt-auto pt-3">
          {isBuyNow ? (
            <Link
              href={`/buyer/checkout/${listing.id}`}
              className="kr-btn-primary kr-btn-sm w-full justify-center"
              aria-label={`Buy ${listing.title} now`}
            >
              <ShoppingCart className="w-4 h-4" aria-hidden="true" />
              Buy now
            </Link>
          ) : (
            <Link
              href={`/buyer/appointments/book/${listing.id}`}
              className="kr-btn-secondary kr-btn-sm w-full justify-center"
              aria-label={`Request appointment for ${listing.title}`}
            >
              <Calendar className="w-4 h-4" aria-hidden="true" />
              Request appointment
            </Link>
          )}
          <Link
            href={`/buyer/listings/${listing.id}`}
            className="mt-1.5 flex items-center justify-center gap-1
                       text-caption text-kr-text-secondary hover:text-kr-text-primary transition-colors"
          >
            View details <ChevronRight className="w-3 h-3" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </article>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────────

export default function BuyerDiscoverPage() {
  const [query, setQuery] = useState('');
  const [committedQuery, setCommittedQuery] = useState('');
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  const searchParams: ListingSearchParams = {
    q:              committedQuery || undefined,
    originRegion:   filters.originRegion || undefined,
    isOrganic:      filters.isOrganic || undefined,
    certifications: filters.certifications.length ? filters.certifications : undefined,
    minPrice:       filters.minPrice ? Number(filters.minPrice) : undefined,
    maxPrice:       filters.maxPrice ? Number(filters.maxPrice) : undefined,
    trustGate:      filters.trustGate || undefined,
    page,
    limit: 12,
  };

  const { data, isLoading, isError, error, isFetching } = useQuery({
    queryKey: ['buyer', 'listings', searchParams],
    queryFn:  () => buyerListingsApi.search(searchParams),
    placeholderData: (prev) => prev,
  });

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setCommittedQuery(query);
    setPage(1);
  }

  function handleFiltersChange(next: Filters) {
    setFilters(next);
    setPage(1);
  }

  const listings   = data?.data ?? [];
  const totalPages = data ? Math.ceil(data.total / 12) : 0;

  const errorMsg = error instanceof ApiError
    ? error.messages[0]
    : 'Failed to load listings. Please try again.';

  return (
    <>
      {/* Skip to results */}
      <a
        href="#results"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4
                   focus:z-50 focus:px-4 focus:py-2 focus:bg-kr-bg-surface
                   focus:rounded focus:shadow-kr-card-md focus:text-body-sm"
      >
        Skip to results
      </a>

      <main id="main-content" className="kr-container py-6 md:py-10">
        {/* Search bar */}
        <form
          onSubmit={handleSearch}
          role="search"
          aria-label="Search listings"
          className="flex gap-2 mb-6"
        >
          <div className="relative flex-1">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4
                         text-kr-text-disabled pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="search"
              placeholder="Search by crop, commodity, or region…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search listings"
              className="kr-input pl-9 pr-4"
            />
          </div>
          <Button type="submit" className="kr-btn-primary kr-btn-sm px-5">
            Search
          </Button>
          {/* Mobile filter toggle */}
          <Button
            type="button"
            onClick={() => setShowMobileFilters(true)}
            className="lg:hidden kr-btn-secondary kr-btn-sm"
            aria-expanded={showMobileFilters}
            aria-controls="mobile-filters"
          >
            <SlidersHorizontal className="w-4 h-4" aria-hidden="true" />
            Filters
          </Button>
        </form>

        {/* Active filter chips */}
        {(filters.originRegion || filters.isOrganic || filters.certifications.length > 0
          || filters.minPrice || filters.maxPrice || filters.trustGate) && (
          <div
            className="flex flex-wrap gap-2 mb-4"
            role="list"
            aria-label="Active filters"
          >
            {filters.originRegion && (
              <FilterChip
                label={filters.originRegion}
                onRemove={() => handleFiltersChange({ ...filters, originRegion: '' })}
              />
            )}
            {filters.isOrganic && (
              <FilterChip
                label="Organic only"
                onRemove={() => handleFiltersChange({ ...filters, isOrganic: false })}
              />
            )}
            {filters.trustGate && (
              <FilterChip
                label={TRUST_GATE_LABEL[filters.trustGate]}
                onRemove={() => handleFiltersChange({ ...filters, trustGate: '' })}
              />
            )}
            {filters.certifications.map((cert) => (
              <FilterChip
                key={cert}
                label={cert}
                onRemove={() =>
                  handleFiltersChange({
                    ...filters,
                    certifications: filters.certifications.filter((c) => c !== cert),
                  })
                }
              />
            ))}
          </div>
        )}

        <div className="flex gap-6 items-start">
          {/* Sidebar — static on lg, hidden on mobile */}
          <div className="hidden lg:block w-64 shrink-0 sticky top-6">
            <FilterSidebar
              filters={filters}
              onChange={handleFiltersChange}
              onClear={() => { setFilters(DEFAULT_FILTERS); setPage(1); }}
            />
          </div>

          {/* Results grid */}
          <div className="flex-1 min-w-0">
            {/* Result count */}
            <div className="flex items-center justify-between mb-4" aria-live="polite">
              <p className="text-body-sm text-kr-text-secondary">
                {isLoading ? 'Searching…' : (
                  data ? `${data.total.toLocaleString()} listing${data.total !== 1 ? 's' : ''}` : ''
                )}
              </p>
              {isFetching && !isLoading && (
                <span className="text-caption text-kr-text-secondary" aria-live="polite">
                  Updating…
                </span>
              )}
            </div>

            {/* Loading */}
            {isLoading && (
              <div
                aria-busy="true"
                aria-label="Loading listings"
                id="results"
                className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4"
              >
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="kr-card kr-glass-amber kr-pattern-chinar space-y-3">
                    <div className="kr-skeleton aspect-[4/3] rounded-md" />
                    <div className="kr-skeleton h-4 w-3/4 rounded" />
                    <div className="kr-skeleton h-3 w-1/2 rounded" />
                    <div className="kr-skeleton h-8 w-full rounded-md" />
                  </div>
                ))}
              </div>
            )}

            {/* Error */}
            {isError && (
              <div id="results" role="alert" className="kr-error-state">
                <AlertTriangle className="w-8 h-8 text-kr-danger-500 mx-auto" aria-hidden="true" />
                <p className="text-body text-kr-text-primary">Could not load listings</p>
                <p className="text-body-sm text-kr-text-secondary">{errorMsg}</p>
              </div>
            )}

            {/* Empty */}
            {!isLoading && !isError && listings.length === 0 && (
              <div id="results" className="kr-empty-state">
                <Search className="w-10 h-10 text-kr-text-disabled mx-auto" aria-hidden="true" />
                <p className="text-body text-kr-text-secondary">
                  No listings match your search.
                </p>
                <Button
                  onClick={() => { setFilters(DEFAULT_FILTERS); setCommittedQuery(''); setQuery(''); }}
                  className="kr-btn-secondary kr-btn-sm"
                >
                  <X className="w-3 h-3" aria-hidden="true" /> Clear all filters
                </Button>
              </div>
            )}

            {/* Grid */}
            {!isLoading && !isError && listings.length > 0 && (
              <>
                <ul
                  id="results"
                  role="list"
                  aria-label="Listing results"
                  className={`
                    grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 mb-6
                    ${ isFetching ? 'opacity-60 pointer-events-none' : '' }
                  `}
                >
                  {listings.map((listing) => (
                    <li key={listing.id}>
                      <ListingCard listing={listing} />
                    </li>
                  ))}
                </ul>

                {/* Pagination */}
                {totalPages > 1 && (
                  <nav aria-label="Search results pagination" className="flex justify-center gap-2">
                    <Button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="kr-btn-ghost kr-btn-sm"
                      aria-label="Previous page"
                    >
                      Previous
                    </Button>
                    <span className="text-body-sm text-kr-text-secondary self-center px-2">
                      Page {page} of {totalPages}
                    </span>
                    <Button
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page >= totalPages}
                      className="kr-btn-ghost kr-btn-sm"
                      aria-label="Next page"
                    >
                      Next
                    </Button>
                  </nav>
                )}
              </>
            )}
          </div>
        </div>
      </main>

      {/* Mobile filter drawer */}
      {showMobileFilters && (
        <div
          id="mobile-filters"
          role="dialog"
          aria-modal="true"
          aria-label="Filters"
          className="fixed inset-0 z-50 flex lg:hidden"
        >
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setShowMobileFilters(false)}
            aria-hidden="true"
          />
          <div className="relative ml-auto w-80 max-w-full h-full bg-kr-bg-surface
                          overflow-y-auto shadow-kr-overlay p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-heading text-h3 text-kr-text-primary">Filters</h2>
              <Button
                onClick={() => setShowMobileFilters(false)}
                className="text-kr-text-secondary hover:text-kr-text-primary kr-focus-ring rounded"
                aria-label="Close filters"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>
            <FilterSidebar
              filters={filters}
              onChange={(next) => { handleFiltersChange(next); }}
              onClear={() => { setFilters(DEFAULT_FILTERS); setPage(1); }}
            />
            <Button
              onClick={() => setShowMobileFilters(false)}
              className="kr-btn-primary w-full mt-6"
            >
              Show results
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span
      role="listitem"
      className="inline-flex items-center gap-1 px-3 py-1 rounded-full
                 bg-kr-fill-brand-subtle text-kr-primary-700 text-body-sm font-medium
                 border border-kr-primary-200"
    >
      {label}
      <Button
        type="button"
        onClick={onRemove}
        aria-label={`Remove filter: ${label}`}
        className="hover:text-kr-primary-900 kr-focus-ring rounded-full"
      >
        <X className="w-3 h-3" aria-hidden="true" />
      </Button>
    </span>
  );
}
