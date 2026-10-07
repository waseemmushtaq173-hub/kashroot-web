'use client';

import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Star, Loader2, AlertTriangle, RefreshCw, CheckCircle2 } from 'lucide-react';
import { api, ApiError } from '@/lib/api/client';

/**
 * ReviewsPage — Two-way order reviews
 *
 * API contract (Module 4 — verified against src/modules/reviews/):
 *   GET /reviews?orderId=:orderId
 *     → Review[]
 *
 *   POST /reviews
 *     body: { orderId, rating: 1–5, comment: string }
 *     → Review
 *
 *   Review shape:
 *     { id, orderId, authorId, authorName, authorRole: 'FARMER'|'BUYER',
 *       targetId, targetName, targetRole, rating: 1–5, comment: string,
 *       createdAt: string }
 *
 * Two-way logic:
 *   - Both farmer AND buyer can leave a review for each other on a COMPLETED order.
 *   - Each user can submit exactly one review per order (backend enforces; UI disables after submission).
 *   - Reviews are shown as two separate cards: farmer’s review of buyer, buyer’s review of farmer.
 *
 * States:
 *   - Loading skeleton
 *   - Error + Retry
 *   - Already reviewed: shows submitted review, no form
 *   - Can review: shows star picker + comment form
 *   - Success banner after submission
 *
 * Accessibility:
 *   - Star picker: role=radiogroup + role=radio, keyboard nav (arrow keys), aria-label per star.
 *   - Review cards: article + header + aria-label with reviewer name.
 *   - Error: role=alert.
 *   - Success: role=status aria-live=polite.
 */

type ReviewAuthorRole = 'FARMER' | 'BUYER';

interface Review {
  id: string;
  orderId: string;
  authorId: string;
  authorName: string;
  authorRole: ReviewAuthorRole;
  targetId: string;
  targetName: string;
  targetRole: ReviewAuthorRole;
  rating: number;
  comment: string;
  createdAt: string;
}

type CreateReviewDto = {
  orderId: string;
  rating: number;
  comment: string;
};

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
  }).format(new Date(iso));
}

// ─── Star Rating Picker ───

function StarPicker({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  const [hovered, setHovered] = useState(0);

  return (
    <div
      role="radiogroup"
      aria-label="Rating out of 5"
      className="flex gap-1"
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} star${n !== 1 ? 's' : ''}`}
          disabled={disabled}
          onClick={() => !disabled && onChange(n)}
          onMouseEnter={() => !disabled && setHovered(n)}
          onMouseLeave={() => setHovered(0)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight' && value < 5) onChange(value + 1);
            if (e.key === 'ArrowLeft'  && value > 1) onChange(value - 1);
          }}
          className={`text-2xl transition-colors kr-focus-ring rounded ${
            disabled ? 'cursor-default opacity-60' : 'cursor-pointer'
          }`}
        >
          <Star
            className={`w-7 h-7 ${
              n <= (hovered || value)
                ? 'fill-kr-warning-400 text-kr-warning-400'
                : 'text-kr-border-default'
            }`}
            aria-hidden="true"
          />
        </button>
      ))}
    </div>
  );
}

// ─── Static review card ───

function ReviewCard({ review }: { review: Review }) {
  return (
    <article
      aria-label={`Review by ${review.authorName}`}
      className="kr-card space-y-3"
    >
      <header className="flex items-center justify-between gap-3">
        <div>
          <p className="font-medium text-body text-kr-text-primary">
            {review.authorName}
          </p>
          <p className="text-caption text-kr-text-secondary">
            {review.authorRole === 'FARMER' ? 'Farmer' : 'Buyer'}
            &nbsp;&middot;&nbsp;
            <time dateTime={review.createdAt}>{fmtDate(review.createdAt)}</time>
          </p>
        </div>
        <div className="flex gap-0.5" aria-label={`${review.rating} out of 5 stars`}>
          {[1, 2, 3, 4, 5].map((n) => (
            <Star
              key={n}
              className={`w-4 h-4 ${
                n <= review.rating
                  ? 'fill-kr-warning-400 text-kr-warning-400'
                  : 'text-kr-border-default'
              }`}
              aria-hidden="true"
            />
          ))}
        </div>
      </header>
      <p className="text-body-sm text-kr-text-primary">{review.comment}</p>
    </article>
  );
}

// ─── Review form (for the current user’s outgoing review) ───

function ReviewForm({
  orderId,
  targetName,
  targetRole,
  existingReview,
}: {
  orderId: string;
  targetName: string;
  targetRole: ReviewAuthorRole;
  existingReview?: Review;
}) {
  const qc = useQueryClient();
  const [rating, setRating] = useState(existingReview?.rating ?? 0);
  const [comment, setComment] = useState(existingReview?.comment ?? '');
  const [submitted, setSubmitted] = useState(!!existingReview);

  const mutation = useMutation({
    mutationFn: (dto: CreateReviewDto) => api.post<Review>('/reviews', dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reviews', orderId] });
      setSubmitted(true);
    },
  });

  const errMsg = mutation.error instanceof ApiError
    ? mutation.error.messages[0]
    : mutation.isError ? 'Could not submit review. Please try again.' : null;

  if (submitted || existingReview) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex items-center gap-3 p-4 rounded-lg
                   border border-kr-border-default bg-kr-badge-published-bg"
      >
        <CheckCircle2 className="w-5 h-5 text-kr-success-500 shrink-0" aria-hidden="true" />
        <div>
          <p className="font-medium text-body-sm text-kr-badge-published-text">Review submitted</p>
          <p className="text-caption text-kr-success-700">
            You rated {targetName} {existingReview?.rating ?? rating}/5.
          </p>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!rating || !comment.trim()) return;
        mutation.mutate({ orderId, rating, comment: comment.trim() });
      }}
      className="kr-card space-y-4"
      aria-label={`Leave a review for ${targetName}`}
    >
      <h3 className="font-heading text-h4 text-kr-text-primary">
        Review {targetName} ({targetRole === 'FARMER' ? 'Farmer' : 'Buyer'})
      </h3>

      <div>
        <p className="kr-label mb-2">Your rating</p>
        <StarPicker value={rating} onChange={setRating} disabled={mutation.isPending} />
      </div>

      <div>
        <label htmlFor="review-comment" className="kr-label">
          Your review
          <span aria-hidden="true" className="text-kr-text-danger"> *</span>
        </label>
        <textarea
          id="review-comment"
          rows={4}
          placeholder={`Share your experience trading with ${targetName}…`}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          disabled={mutation.isPending}
          className="kr-input resize-y mt-1"
          required
          minLength={20}
          aria-describedby={errMsg ? 'review-error' : undefined}
        />
        <p className="text-caption text-kr-text-secondary mt-1">
          Minimum 20 characters.
        </p>
      </div>

      {errMsg && (
        <div id="review-error" role="alert" className="kr-error-msg">
          <AlertTriangle className="w-3 h-3" aria-hidden="true" /> {errMsg}
        </div>
      )}

      <button
        type="submit"
        disabled={!rating || comment.trim().length < 20 || mutation.isPending}
        aria-busy={mutation.isPending}
        className="kr-btn-primary"
      >
        {mutation.isPending
          ? <><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Submitting…</>
          : 'Submit review'
        }
      </button>
    </form>
  );
}

// ─── Page ───

export default function ReviewsPage() {
  const { orderId } = useParams<{ orderId: string }>();

  // In production, read from auth store
  // SECURITY: RBAC check here is UX only. Backend /reviews enforces that
  // a user can only submit one review per order for the correct counterparty.
  const currentUserId = ''; // TODO: useAuthStore().user.id
  const currentRole = 'BUYER' as 'FARMER' | 'BUYER'; // TODO: useAuthStore().user.role

  const { data: reviews = [], isLoading, isError, error, refetch } = useQuery<Review[]>({
    queryKey: ['reviews', orderId],
    queryFn:  () => api.get<Review[]>(`/reviews?orderId=${orderId}`),
  });

  const farmerReview = reviews.find((r) => r.authorRole === 'FARMER');
  const buyerReview  = reviews.find((r) => r.authorRole === 'BUYER');

  // The review that the current user already submitted (if any)
  const myExistingReview = reviews.find((r) => r.authorId === currentUserId);

  // The counterparty to review
  const counterparty = reviews.find((r) => r.authorRole !== currentRole)
    ?? reviews.find((r) => r.targetRole === currentRole);

  const errMsg = error instanceof ApiError
    ? error.messages[0]
    : 'Could not load reviews.';

  return (
    <main id="main-content" className="kr-container py-6 md:py-10 max-w-2xl">
      <h1 className="font-heading text-h1 text-kr-text-primary mb-2">
        Reviews
      </h1>
      <p className="text-body text-kr-text-secondary mb-8">
        Order #{orderId.slice(-8).toUpperCase()} · Both parties review each other after delivery.
      </p>

      {isLoading && (
        <div aria-busy="true" aria-label="Loading reviews" className="space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="kr-card space-y-3">
              <div className="flex justify-between">
                <div className="space-y-2">
                  <div className="kr-skeleton h-4 w-32 rounded" />
                  <div className="kr-skeleton h-3 w-24 rounded" />
                </div>
                <div className="kr-skeleton h-5 w-24 rounded" />
              </div>
              <div className="kr-skeleton h-12 rounded" />
            </div>
          ))}
        </div>
      )}

      {isError && (
        <div role="alert" className="kr-error-state">
          <AlertTriangle className="w-8 h-8 text-kr-danger-500 mx-auto" aria-hidden="true" />
          <p className="text-body text-kr-text-primary">Could not load reviews</p>
          <p className="text-body-sm text-kr-text-secondary">{errMsg}</p>
          <button onClick={() => refetch()} className="kr-btn-secondary kr-btn-sm">
            <RefreshCw className="w-3 h-3" aria-hidden="true" /> Retry
          </button>
        </div>
      )}

      {!isLoading && !isError && (
        <div className="space-y-8">
          {/* Review form for current user */}
          {currentRole === 'BUYER' && counterparty && (
            <section aria-labelledby="your-review-heading">
              <h2 id="your-review-heading" className="font-heading text-h3 text-kr-text-primary mb-4">
                Your review
              </h2>
              <ReviewForm
                orderId={orderId}
                targetName={counterparty.authorName}
                targetRole="FARMER"
                existingReview={myExistingReview}
              />
            </section>
          )}

          {currentRole === 'FARMER' && counterparty && (
            <section aria-labelledby="your-review-heading">
              <h2 id="your-review-heading" className="font-heading text-h3 text-kr-text-primary mb-4">
                Your review
              </h2>
              <ReviewForm
                orderId={orderId}
                targetName={counterparty.authorName}
                targetRole="BUYER"
                existingReview={myExistingReview}
              />
            </section>
          )}

          {/* Posted reviews */}
          {(farmerReview || buyerReview) && (
            <section aria-labelledby="all-reviews-heading">
              <h2 id="all-reviews-heading" className="font-heading text-h3 text-kr-text-primary mb-4">
                {farmerReview && buyerReview ? 'Both reviews' : 'Submitted review'}
              </h2>
              <div className="space-y-4">
                {farmerReview && <ReviewCard review={farmerReview} />}
                {buyerReview  && <ReviewCard review={buyerReview}  />}
              </div>
            </section>
          )}

          {reviews.length === 0 && (
            <div className="kr-empty-state">
              <Star className="w-10 h-10 text-kr-border-default mx-auto" aria-hidden="true" />
              <p className="text-body text-kr-text-secondary">No reviews yet</p>
              <p className="text-body-sm text-kr-text-disabled">
                Reviews can be submitted once the order is marked as complete.
              </p>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
