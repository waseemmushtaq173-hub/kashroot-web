'use client';

import { Suspense, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle, Loader2, CheckCircle2, Archive, RefreshCw,
} from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import { listingsApi, type ListingStatus } from '@/lib/api/farmer';
import type { KycStatus } from '@/lib/listing-options';
import {
  ListingForm,
  listingToFormValues,
  type ListingPayload,
} from '@/components/listings/ListingForm';

/**
 * ListingEditPage — /farmer/listings/[id]/edit
 *
 * API contracts (Module 2 — verified against src/modules/listings/):
 *   GET    /listings/:id            → PublicListing (200)
 *     └─ a DRAFT is readable ONLY by its owner or an admin; everyone else gets
 *        404, not 403, so the route cannot be used to probe for other people's
 *        unpublished listings. A farmer therefore reads their own draft here
 *        purely because the api client attaches their bearer token.
 *   PATCH  /listings/:id            → PublicListing (200)
 *   PATCH  /listings/:id/publish    → PublicListing (200)
 *   PATCH  /listings/:id/unpublish  → PublicListing (200)
 *   DELETE /listings/:id            → { id, status: 'ARCHIVED', message } (200)
 *
 * WHY useParams() AND NOT THE params PROP
 * ---------------------------------------
 * Next 16 hands a page a `params` **Promise** that must be awaited (or unwrapped
 * with `use()`) before the value is readable. This page is a Client Component —
 * it needs react-query, mutations and the form's local state — and in a Client
 * Component the supported way to read a dynamic segment is the `useParams()`
 * hook, which returns the object directly with no promise to await. That is also
 * what every other dynamic route in this app does.
 *
 * WHAT IS AND IS NOT EDITABLE
 * ---------------------------
 * Every field the create form collects is editable except photos: ListingPhoto
 * rows hold a storage `fileKey` and nothing in this codebase resolves a key to a
 * URL, so the mapper returns `images: []` and the file input round-trips
 * nothing. Editing photos needs a storage convention first, not a UI change.
 *
 * FAILURE HANDLING
 * ----------------
 * A 404 here is the ordinary case, not an edge case: it is exactly what the API
 * returns for someone else's draft, for a deleted listing, and for a listing
 * whose id is malformed. It is rendered as a plain "not found" with a way back
 * rather than as an error, because from the farmer's point of view those three
 * situations are indistinguishable and none of them is retryable.
 */

export default function ListingEditPage() {
  // useSearchParams requires a Suspense boundary (see /(auth)/verify-otp).
  return (
    <Suspense fallback={<EditSkeleton />}>
      <ListingEdit />
    </Suspense>
  );
}

// ─── Status presentation ─────────────────────────────────────────────────────

const STATUS_BANNER: Record<ListingStatus, {
  title: string; body: string; tone: 'info' | 'success' | 'warning';
}> = {
  DRAFT: {
    title: 'This listing is a draft',
    body:  'It is not visible to buyers yet. Publish it when the details are final.',
    tone:  'info',
  },
  PUBLISHED: {
    title: 'This listing is live',
    body:  'Buyers can find it in the marketplace. Saving changes updates it immediately.',
    tone:  'success',
  },
  SUSPENDED: {
    title: 'This listing is on hold',
    body:  'A moderator has suspended it following a review, so it is hidden from buyers and cannot be published or unpublished from here. Contact support if you believe this is a mistake.',
    tone:  'warning',
  },
};

const TONE_CLASS: Record<'info' | 'success' | 'warning', string> = {
  info:    'border-kr-border-default bg-kr-fill-brand-subtle text-kr-text-primary',
  success: 'border-kr-border-default bg-kr-badge-published-bg text-kr-badge-published-text',
  warning: 'border-kr-warning-300 bg-kr-badge-pending-bg text-kr-badge-pending-text',
};

function StatusBanner({ status }: { status: ListingStatus }) {
  const cfg = STATUS_BANNER[status];
  return (
    <div
      className={`flex items-start gap-3 p-4 rounded-lg border mb-6 ${TONE_CLASS[cfg.tone]}`}
    >
      {cfg.tone === 'success'
        ? <CheckCircle2 className="w-5 h-5 mt-0.5 shrink-0" aria-hidden="true" />
        : <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" aria-hidden="true" />
      }
      <div>
        <p className="font-medium text-body-sm">{cfg.title}</p>
        <p className="text-body-sm mt-1">{cfg.body}</p>
      </div>
    </div>
  );
}

function EditSkeleton() {
  return (
    <main id="main-content" className="kr-container py-6 md:py-10 max-w-2xl">
      <div className="animate-pulse space-y-4" aria-busy="true" aria-live="polite">
        <span className="sr-only">Loading listing…</span>
        <div className="h-4 w-40 bg-kr-bg-sunken rounded" />
        <div className="h-8 w-64 bg-kr-bg-sunken rounded" />
        <div className="h-24 w-full bg-kr-bg-sunken rounded" />
        <div className="h-24 w-full bg-kr-bg-sunken rounded" />
      </div>
    </main>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

function ListingEdit() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();

  // Set by the create page's "Save draft" redirect.
  const justSavedDraft = searchParams.get('saved') === 'draft';

  // In production: read from the auth store / JWT claims (see the create page).
  const kycStatus: KycStatus = 'VERIFIED'; // TODO: read from useAuthStore()

  const listingQuery = useQuery({
    queryKey: ['listing', id],
    queryFn: () => listingsApi.getListing(id),
    // A 404 is a decision, not a transient failure — retrying it just delays the
    // "not found" message the farmer is going to get either way.
    retry: (failureCount, error) =>
      !(error instanceof ApiError && error.statusCode < 500) && failureCount < 2,
  });

  const [notice, setNotice] = useState<string | null>(null);

  /**
   * Refetch after any write.
   *
   * The payload the API returns is the source of truth (the mapper derives
   * `isOrganic` from the certification list and converts Decimals), so the form
   * is re-prefilled from the server rather than from what was submitted. The
   * form is keyed on `updatedAt` below, so the refetch remounts it and the
   * farmer sees exactly what was stored.
   */
  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['listing', id] });
    queryClient.invalidateQueries({ queryKey: ['my-listings'] });
  }

  const saveMut = useMutation({
    mutationFn: (payload: ListingPayload) =>
      listingsApi.updateListing(id, payload),
    onSuccess: () => {
      setNotice('Changes saved.');
      invalidate();
    },
  });

  /**
   * Publish saves first, then transitions. The alternative — transitioning the
   * stored version while the form shows unsaved edits — would put something live
   * that the farmer never saw.
   */
  const publishMut = useMutation({
    mutationFn: async (payload: ListingPayload) => {
      await listingsApi.updateListing(id, payload);
      return listingsApi.publishListing(id);
    },
    onSuccess: () => {
      setNotice('Listing published — it is now visible to buyers.');
      invalidate();
    },
  });

  /**
   * Unpublish deliberately does NOT save first: it is a "take this down now"
   * action, and saving beforehand would briefly write edits to a live listing
   * that the farmer is in the middle of withdrawing.
   */
  const unpublishMut = useMutation({
    mutationFn: () => listingsApi.unpublishListing(id),
    onSuccess: () => {
      setNotice('Listing unpublished — it is back to a draft.');
      invalidate();
    },
  });

  const archiveMut = useMutation({
    mutationFn: () => listingsApi.deleteListing(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-listings'] });
      router.push('/farmer/dashboard?archived=1');
    },
  });

  const mutError =
    saveMut.error ?? publishMut.error ?? unpublishMut.error ?? archiveMut.error;
  const serverError =
    (mutError instanceof ApiError ? mutError.messages[0] : null) ??
    (mutError ? 'An error occurred. Please try again.' : null);

  const saving =
    saveMut.isPending ||
    publishMut.isPending ||
    unpublishMut.isPending ||
    archiveMut.isPending;

  // ── Loading ──
  if (listingQuery.isPending) return <EditSkeleton />;

  // ── Not found / unauthorized ──
  if (listingQuery.isError) {
    const err = listingQuery.error;
    const status = err instanceof ApiError ? err.statusCode : null;
    const notFound = status === 404;

    return (
      <main id="main-content" className="kr-container py-6 md:py-10 max-w-2xl">
        <div
          role="alert"
          className="kr-error-state flex flex-col items-start gap-3 text-left"
        >
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" aria-hidden="true" />
            <div>
              <p className="font-medium text-body-sm">
                {notFound ? 'Listing not found' : 'Could not load this listing'}
              </p>
              <p className="text-body-sm mt-1">
                {notFound
                  ? 'It may have been deleted, or it may belong to another account.'
                  : status === 401
                    ? 'Your session has expired. Sign in again to continue.'
                    : 'Something went wrong while loading this listing.'}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <a href="/farmer/dashboard" className="kr-btn-secondary">
              Back to dashboard
            </a>
            {!notFound && (
              <button
                type="button"
                onClick={() => listingQuery.refetch()}
                className="kr-btn-secondary"
                aria-busy={listingQuery.isFetching}
              >
                <RefreshCw className="w-4 h-4" aria-hidden="true" /> Retry
              </button>
            )}
          </div>
        </div>
      </main>
    );
  }

  // ── Loaded ──
  const listing = listingQuery.data;

  return (
    <main id="main-content" className="kr-container py-6 md:py-10 max-w-2xl">
      <nav aria-label="Breadcrumb" className="text-caption text-kr-text-secondary mb-4">
        <a href="/farmer/dashboard" className="hover:underline">Dashboard</a>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">Edit listing</span>
      </nav>

      <h1 className="font-heading text-h1 text-kr-text-primary mb-2">
        Edit listing
      </h1>
      <p className="text-body text-kr-text-secondary mb-8">
        {listing.title}
      </p>

      <StatusBanner status={listing.status} />

      {(justSavedDraft || notice) && (
        <div
          role="status"
          className="flex items-start gap-3 p-4 rounded-lg border mb-6
                     border-kr-border-default bg-kr-badge-published-bg text-kr-badge-published-text"
        >
          <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
          <p className="text-body-sm">{notice ?? 'Draft saved.'}</p>
        </div>
      )}

      {/*
        Keyed on updatedAt so a refetch remounts the form with fresh defaults:
        useForm only reads defaultValues on its first render, so without this a
        save would leave the inputs showing the pre-save values.
      */}
      <ListingForm
        key={listing.updatedAt}
        initialValues={listingToFormValues(listing)}
        kycStatus={kycStatus}
        serverError={serverError}
        actions={[
          {
            key: 'save',
            label: 'Save changes',
            busyLabel: 'Saving…',
            variant: 'secondary',
            busy: saveMut.isPending,
            onAction: (payload) => saveMut.mutate(payload),
          },
          {
            key: 'publish',
            label: 'Publish listing',
            busyLabel: 'Publishing…',
            variant: 'primary',
            icon: 'check',
            busy: publishMut.isPending,
            // Only a draft can be published, and only when KYC allows it in the
            // UI. The API independently refuses FROZEN listings; SUSPENDED is
            // the client-side rendering of exactly that state.
            hidden: listing.status !== 'DRAFT' || kycStatus !== 'VERIFIED',
            onAction: (payload) => publishMut.mutate(payload),
          },
          {
            key: 'unpublish',
            label: 'Unpublish',
            busyLabel: 'Unpublishing…',
            variant: 'primary',
            busy: unpublishMut.isPending,
            hidden: listing.status !== 'PUBLISHED',
            onAction: () => unpublishMut.mutate(),
          },
        ]}
        aside={
          <button
            type="button"
            disabled={saving}
            aria-busy={archiveMut.isPending}
            onClick={() => {
              const ok = window.confirm(
                'Archive this listing? It will be removed from your dashboard and hidden from buyers. This cannot be undone from the app.',
              );
              if (ok) archiveMut.mutate();
            }}
            className="kr-btn-danger kr-btn-lg inline-flex items-center justify-center gap-2"
          >
            {archiveMut.isPending
              ? <><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Archiving…</>
              : <><Archive className="w-4 h-4" aria-hidden="true" /> Archive</>
            }
          </button>
        }
      />
    </main>
  );
}
