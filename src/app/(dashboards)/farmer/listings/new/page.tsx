'use client';

import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api/client';
import type { FarmerListing } from '@/lib/api/farmer';
import type { KycStatus } from '@/lib/listing-options';
import {
  ListingForm,
  EMPTY_LISTING_FORM,
  type ListingPayload,
} from '@/components/listings/ListingForm';

/**
 * ListingNewPage — create a listing.
 *
 * The form itself lives in components/listings/ListingForm, shared with
 * /farmer/listings/[id]/edit. This page owns only the two create-time
 * mutations, the page chrome, and navigation.
 *
 * API contracts (Module 2 — verified against src/modules/listings/):
 *   POST  /listings           { ...CreateListingDto } → FarmerListing (201)
 *   PATCH /listings/:id/publish                       → FarmerListing (200)
 *     └─ no KYC gate is implemented server-side yet (see ListingsService
 *        .setPublished) — the banner below is UX only, not a control.
 *
 * Draft vs Publish:
 *   Two CTAs: "Save draft" leaves status=DRAFT and goes to the edit route so the
 *   farmer can continue. "Publish" creates then publishes in one step.
 *
 * SECURITY note:
 *   The KYC gate in the UI is presentational. Nothing server-side enforces it
 *   today; hiding the Publish button is NOT a security control.
 *
 * Image uploads:
 *   POST /listings/:id/images is not implemented in Modules 1-6. The file input
 *   is present and inert.
 *
 * Accessibility:
 *   Labels, role="alert" errors, aria-invalid and aria-busy all live in the
 *   shared form component.
 */

export default function ListingNewPage() {
  const router = useRouter();

  // In production: read from the auth store / JWT claims.
  // kycStatus comes from AuthUser.kycStatus returned by /auth/login (Module 1).
  const kycStatus: KycStatus = 'VERIFIED'; // TODO: read from useAuthStore()

  // Draft save — POST /listings (status stays DRAFT)
  const draftMut = useMutation({
    mutationFn: (payload: ListingPayload) =>
      api.post<FarmerListing>('/listings', payload),
    onSuccess: (listing) =>
      router.push(`/farmer/listings/${listing.id}/edit?saved=draft`),
  });

  // Publish — POST /listings then PATCH /listings/:id/publish
  const publishMut = useMutation({
    mutationFn: async (payload: ListingPayload) => {
      const saved = await api.post<FarmerListing>('/listings', payload);
      return api.patch<FarmerListing>(`/listings/${saved.id}/publish`);
    },
    onSuccess: () => router.push('/farmer/dashboard?published=1'),
  });

  const serverError =
    (draftMut.error instanceof ApiError   ? draftMut.error.messages[0]   : null) ??
    (publishMut.error instanceof ApiError ? publishMut.error.messages[0] : null) ??
    ((draftMut.error || publishMut.error) ? 'An error occurred. Please try again.' : null);

  return (
    <main id="main-content" className="kr-container py-6 md:py-10 max-w-2xl">
      <nav aria-label="Breadcrumb" className="text-caption text-kr-text-secondary mb-4">
        <a href="/farmer/dashboard" className="hover:underline">Dashboard</a>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">New listing</span>
      </nav>

      <h1 className="font-heading text-h1 text-kr-text-primary mb-2">
        Create a listing
      </h1>
      <p className="text-body text-kr-text-secondary mb-8">
        Save as draft first, then publish once you're ready.
        Published listings are visible to buyers worldwide.
      </p>

      <ListingForm
        initialValues={EMPTY_LISTING_FORM}
        kycStatus={kycStatus}
        serverError={serverError}
        actions={[
          {
            key: 'draft',
            label: 'Save draft',
            busyLabel: 'Saving draft…',
            variant: 'secondary',
            busy: draftMut.isPending,
            onAction: (payload) => draftMut.mutate(payload),
          },
          {
            key: 'publish',
            label: 'Publish listing',
            busyLabel: 'Publishing…',
            variant: 'primary',
            icon: 'check',
            busy: publishMut.isPending,
            // UX-only gate; the backend does not enforce KYC yet.
            hidden: kycStatus !== 'VERIFIED',
            onAction: (payload) => publishMut.mutate(payload),
          },
        ]}
      />
    </main>
  );
}
