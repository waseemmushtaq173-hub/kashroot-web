'use client';
import { Button } from "@/components/ui/Button";

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Users, ShieldCheck, ShieldAlert, BarChart3,
  Check, X, AlertTriangle, Loader2, RefreshCw,
  Globe, TrendingUp, TrendingDown, Eye, ChevronRight,
} from 'lucide-react';
import { kycApi, disputesApi, analyticsApi } from '@/lib/api/admin';
import type { KycSubmission, Dispute, AnalyticsSummary } from '@/lib/api/admin';
import { ApiError } from '@/lib/api/client';

import { PortalShell } from '@/components/layout/PortalShell';
/**
 * AdminConsolePage
 *
 * API contracts (Module 5 verified against src/modules/admin/ + src/modules/disputes/):
 *   KYC:
 *     GET  /admin/kyc?status=PENDING  → KycQueuePage
 *     POST /admin/kyc/:userId/approve  → { message }
 *     POST /admin/kyc/:userId/reject   → { message }
 *   Disputes:
 *     GET  /admin/disputes             → DisputesPage
 *     POST /disputes/:id/recommend     → Dispute  (REGIONAL_ADMIN + PLATFORM_ADMIN)
 *     POST /disputes/:id/resolve       → Dispute  (PLATFORM_ADMIN ONLY)
 *   Analytics:
 *     GET  /admin/analytics?regionId=...&startDate=...&endDate=...
 *     GET  /admin/regions
 *
 * RBAC:
 *   <!-- SECURITY: role checks here are UX only. Backend guards enforce actual access. -->
 *   REGIONAL_ADMIN : can RECOMMEND disputes, view own region analytics, manage KYC
 *   PLATFORM_ADMIN : can RESOLVE disputes, view all regions
 *   Resolve button is hidden for REGIONAL_ADMIN — backend still enforces the restriction.
 *
 * Tabs: KYC Queue | Disputes | Analytics
 * Import/Export ratio KPI is prominently surfaced in the Analytics tab.
 *
 * Accessibility:
 *   Tabs: role=tablist/tab/tabpanel + aria-selected/controls/hidden.
 *   KYC approve/reject: aria-label with user name.
 *   Dispute recommend/resolve: aria-label with dispute id.
 *   Modals: role=dialog + aria-modal + focus trap (simplified).
 *   Loading: aria-busy. Errors: role=alert.
 */

type AdminRole = 'REGIONAL_ADMIN' | 'PLATFORM_ADMIN';


const DISPUTE_STATUS_LABEL: Record<string, string> = {
  OPENED:        'Opened',
  UNDER_REVIEW:  'Under review',
  RECOMMENDED:   'Recommended',
  RESOLVED:      'Resolved',
  CLOSED:        'Closed',
};

const DISPUTE_STATUS_CLASS: Record<string, string> = {
  OPENED:        'kr-badge-pending',
  UNDER_REVIEW:  'kr-badge-pending',
  RECOMMENDED:   'kr-badge-draft',
  RESOLVED:      'kr-badge-published',
  CLOSED:        'kr-badge-draft',
};

const KYC_STATUS_CLASS: Record<string, string> = {
  PENDING:  'kr-badge-pending',
  VERIFIED: 'kr-badge-published',
  REJECTED: 'kr-badge-rejected',
};

function fmt(n: number, currency = 'INR') {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency', currency, maximumFractionDigits: 0,
  }).format(n);
}

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
  }).format(new Date(iso));
}

function apiMsg(err: unknown) {
  return err instanceof ApiError
    ? err.messages[0]
    : 'An error occurred. Please try again.';
}

// ─── Shared micro-components ───

function PanelSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading" className="space-y-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="kr-card kr-glass-amber kr-pattern-chinar space-y-2">
          <div className="kr-skeleton h-4 w-2/3 rounded" />
          <div className="kr-skeleton h-3 w-1/2 rounded" />
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
      <Button onClick={onRetry} className="kr-btn-secondary kr-btn-sm">
        <RefreshCw className="w-3 h-3" aria-hidden="true" /> Retry
      </Button>
    </div>
  );
}

// ─── KYC Panel ───

function KycPanel() {
  const qc = useQueryClient();
  const [rejectingUserId, setRejectingUserId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['admin', 'kyc', 'PENDING'],
    queryFn: () => kycApi.getQueue({ status: 'PENDING', limit: 20 }),
  });

  const approveMut = useMutation({
    mutationFn: (userId: string) => kycApi.approve(userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'kyc'] }),
  });

  const rejectMut = useMutation({
    mutationFn: ({ userId, reason }: { userId: string; reason: string }) =>
      kycApi.reject(userId, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'kyc'] });
      setRejectingUserId(null);
      setRejectReason('');
    },
  });

  if (isLoading) return <PanelSkeleton />;
  if (isError)   return <PanelError message={apiMsg(error)} onRetry={() => refetch()} />;

  const submissions = data?.data ?? [];

  if (submissions.length === 0) {
    return (
      <div className="kr-empty-state">
        <ShieldCheck className="w-10 h-10 text-kr-success-500 mx-auto" aria-hidden="true" />
        <p className="text-body text-kr-text-secondary">KYC queue is empty</p>
        <p className="text-body-sm text-kr-text-disabled">All submissions have been reviewed.</p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-body-sm text-kr-text-secondary mb-4">
        {data?.total} pending submission{data?.total !== 1 ? 's' : ''}
      </p>

      <ul className="space-y-4" role="list">
        {submissions.map((sub) => (
          <li key={sub.userId} className="kr-card kr-glass-amber kr-pattern-chinar">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium text-body text-kr-text-primary">{sub.fullName}</p>
                  <span
                    className={`kr-badge ${KYC_STATUS_CLASS[sub.kycStatus]}`}
                    aria-label={`KYC status: ${sub.kycStatus.toLowerCase()}`}
                  >
                    {sub.kycStatus.toLowerCase()}
                  </span>
                  <span className="kr-badge kr-badge-draft">{sub.role}</span>
                </div>
                <p className="text-body-sm text-kr-text-secondary">{sub.email}</p>
                <p className="text-caption text-kr-text-secondary">
                  Submitted {fmtDate(sub.submittedAt)}
                </p>
                <p className="text-body-sm text-kr-text-secondary mt-1">
                  {sub.documents.length} document{sub.documents.length !== 1 ? 's' : ''} attached:
                  {sub.documents.map((d) => d.type.replace(/_/g, ' ')).join(', ')}
                </p>
              </div>

              <div className="flex gap-2 shrink-0">
                {/* View documents */}
                {sub.documents.map((doc) => (
                  <a
                    key={doc.type}
                    href={doc.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="kr-btn-ghost kr-btn-sm"
                    aria-label={`View ${doc.type.replace(/_/g, ' ')} document for ${sub.fullName}`}
                  >
                    <Eye className="w-3 h-3" aria-hidden="true" />
                    {doc.type.split('_')[0]}
                  </a>
                ))}

                {/* Approve */}
                <Button
                  onClick={() => approveMut.mutate(sub.userId)}
                  disabled={approveMut.isPending && approveMut.variables === sub.userId}
                  aria-busy={approveMut.isPending && approveMut.variables === sub.userId}
                  aria-label={`Approve KYC for ${sub.fullName}`}
                  className="kr-btn-primary kr-btn-sm"
                >
                  {approveMut.isPending && approveMut.variables === sub.userId
                    ? <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />
                    : <Check className="w-3 h-3" aria-hidden="true" />
                  }
                  Approve
                </Button>

                {/* Reject */}
                <Button
                  onClick={() => { setRejectingUserId(sub.userId); setRejectReason(''); }}
                  aria-label={`Reject KYC for ${sub.fullName}`}
                  className="kr-btn-ghost kr-btn-sm text-kr-text-danger
                             hover:bg-kr-badge-rejected-bg"
                >
                  <X className="w-3 h-3" aria-hidden="true" /> Reject
                </Button>
              </div>
            </div>

            {/* Reject reason inline form */}
            {rejectingUserId === sub.userId && (
              <div
                className="mt-4 pt-4 border-t border-kr-neutral-200 space-y-3"
                role="dialog"
                aria-label={`Reject KYC for ${sub.fullName}`}
              >
                <label htmlFor={`reject-reason-${sub.userId}`} className="kr-label">
                  Rejection reason <span aria-hidden="true" className="text-kr-text-danger">*</span>
                </label>
                <textarea
                  id={`reject-reason-${sub.userId}`}
                  rows={3}
                  placeholder="Explain why the documents are insufficient…"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  className="kr-input resize-y"
                  autoFocus
                />
                <div className="flex gap-2">
                  <Button
                    onClick={() =>
                      rejectReason.trim() &&
                      rejectMut.mutate({ userId: sub.userId, reason: rejectReason.trim() })
                    }
                    disabled={!rejectReason.trim() || rejectMut.isPending}
                    aria-busy={rejectMut.isPending}
                    className="kr-btn-danger kr-btn-sm"
                  >
                    {rejectMut.isPending
                      ? <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />
                      : null
                    }
                    Confirm rejection
                  </Button>
                  <Button
                    onClick={() => setRejectingUserId(null)}
                    className="kr-btn-ghost kr-btn-sm"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Disputes Panel ───

function DisputesPanel({ adminRole }: { adminRole: AdminRole }) {
  const qc = useQueryClient();
  const [activeDispute, setActiveDispute] = useState<Dispute | null>(null);
  const [actionText, setActionText] = useState('');
  const [actionType, setActionType] = useState<'recommend' | 'resolve' | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['admin', 'disputes'],
    queryFn: () => disputesApi.list({ limit: 20 }),
  });

  const recommendMut = useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) =>
      disputesApi.recommend(id, text),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'disputes'] });
      setActiveDispute(null);
      setActionText('');
      setActionType(null);
    },
  });

  const resolveMut = useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) =>
      disputesApi.resolve(id, text),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'disputes'] });
      setActiveDispute(null);
      setActionText('');
      setActionType(null);
    },
  });

  if (isLoading) return <PanelSkeleton />;
  if (isError)   return <PanelError message={apiMsg(error)} onRetry={() => refetch()} />;

  const disputes = data?.data ?? [];

  if (disputes.length === 0) {
    return (
      <div className="kr-empty-state">
        <ShieldCheck className="w-10 h-10 text-kr-success-500 mx-auto" aria-hidden="true" />
        <p className="text-body text-kr-text-secondary">No open disputes</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* RBAC note for REGIONAL_ADMIN */}
      {adminRole === 'REGIONAL_ADMIN' && (
        <div role="note" className="flex items-start gap-2 p-3 rounded-md
                                    bg-kr-fill-brand-subtle border border-kr-border-brand">
          {/* SECURITY: Resolve button is hidden for REGIONAL_ADMIN (UX only).
              Backend DisputeGuard enforces the actual role restriction. */}
          <ShieldAlert className="w-4 h-4 text-kr-primary-600 mt-0.5 shrink-0" aria-hidden="true" />
          <p className="text-caption text-kr-text-brand">
            As Regional Admin, you can <strong>recommend</strong> outcomes.
            Only Platform Admins can <strong>resolve</strong> disputes.
          </p>
        </div>
      )}

      <ul className="space-y-3" role="list">
        {disputes.map((dispute) => (
          <li key={dispute.id} className="kr-card kr-glass-amber kr-pattern-chinar">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <p className="font-medium text-body text-kr-text-primary">
                    #{dispute.orderId.slice(-6).toUpperCase()} · {dispute.listingTitle}
                  </p>
                  <span
                    className={`kr-badge ${DISPUTE_STATUS_CLASS[dispute.status]}`}
                    aria-label={`Dispute status: ${DISPUTE_STATUS_LABEL[dispute.status]}`}
                  >
                    {DISPUTE_STATUS_LABEL[dispute.status]}
                  </span>
                </div>
                <p className="text-body-sm text-kr-text-secondary">
                  {dispute.farmerName} ↔ {dispute.buyerName}
                </p>
                <p className="text-body-sm text-kr-text-secondary mt-1">
                  <strong>Reason:</strong> {dispute.reason}
                </p>
                <p className="text-caption text-kr-text-secondary">
                  Opened {fmtDate(dispute.openedAt)}
                </p>
                {dispute.recommendation && (
                  <p className="text-body-sm text-kr-text-secondary mt-1">
                    <strong>Recommendation:</strong> {dispute.recommendation}
                  </p>
                )}
                {dispute.resolution && (
                  <p className="text-body-sm text-kr-success-700 mt-1">
                    <strong>Resolution:</strong> {dispute.resolution}
                  </p>
                )}
              </div>

              <div className="flex gap-2 shrink-0 flex-wrap">
                {/* Recommend — REGIONAL_ADMIN + PLATFORM_ADMIN */}
                {/* SECURITY: UX gating only — backend DisputeGuard enforces role */}
                {['OPENED', 'UNDER_REVIEW'].includes(dispute.status) && (
                  <Button
                    onClick={() => {
                      setActiveDispute(dispute);
                      setActionType('recommend');
                      setActionText('');
                    }}
                    aria-label={`Recommend outcome for dispute ${dispute.id.slice(-6).toUpperCase()}`}
                    className="kr-btn-secondary kr-btn-sm"
                  >
                    Recommend
                  </Button>
                )}

                {/* Resolve — PLATFORM_ADMIN ONLY */}
                {/* SECURITY: hidden for REGIONAL_ADMIN (UX only); backend enforces via DisputeGuard */}
                {adminRole === 'PLATFORM_ADMIN' &&
                  ['OPENED', 'UNDER_REVIEW', 'RECOMMENDED'].includes(dispute.status) && (
                  <Button
                    onClick={() => {
                      setActiveDispute(dispute);
                      setActionType('resolve');
                      setActionText('');
                    }}
                    aria-label={`Resolve dispute ${dispute.id.slice(-6).toUpperCase()}`}
                    className="kr-btn-primary kr-btn-sm"
                  >
                    Resolve
                  </Button>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>

      {/* Action modal (recommend / resolve) */}
      {activeDispute && actionType && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          role="dialog"
          aria-modal="true"
          aria-label={`${actionType === 'recommend' ? 'Recommend' : 'Resolve'} dispute`}
        >
          <div className="bg-kr-bg-surface rounded-xl p-6 w-full max-w-md shadow-kr-overlay space-y-4">
            <h2 className="font-heading text-h3 text-kr-text-primary">
              {actionType === 'recommend' ? 'Recommend outcome' : 'Resolve dispute'}
            </h2>
            <p className="text-body-sm text-kr-text-secondary">
              Dispute #{activeDispute.orderId.slice(-6).toUpperCase()}
              {' '}&mdash; {activeDispute.farmerName} ↔ {activeDispute.buyerName}
            </p>

            {actionType === 'resolve' && (
              <div role="note" className="flex items-start gap-2 p-3 rounded-md
                                          bg-kr-badge-pending-bg border border-kr-warning-300">
                <ShieldAlert className="w-4 h-4 text-kr-warning-600 mt-0.5 shrink-0" aria-hidden="true" />
                <p className="text-caption text-kr-badge-pending-text">
                  Resolving is final. This will close the dispute and notify both parties.
                </p>
              </div>
            )}

            <label
              htmlFor="action-text"
              className="kr-label"
            >
              {actionType === 'recommend' ? 'Your recommendation' : 'Resolution statement'}
              <span aria-hidden="true" className="text-kr-text-danger"> *</span>
            </label>
            <textarea
              id="action-text"
              rows={4}
              placeholder={
                actionType === 'recommend'
                  ? 'Summarise the situation and suggest a fair outcome…'
                  : 'State the final decision and next steps…'
              }
              value={actionText}
              onChange={(e) => setActionText(e.target.value)}
              className="kr-input resize-y"
              autoFocus
            />

            <div className="flex gap-3">
              <Button
                onClick={() => {
                  if (!actionText.trim()) return;
                  if (actionType === 'recommend') {
                    recommendMut.mutate({ id: activeDispute.id, text: actionText.trim() });
                  } else {
                    resolveMut.mutate({ id: activeDispute.id, text: actionText.trim() });
                  }
                }}
                disabled={!actionText.trim() || recommendMut.isPending || resolveMut.isPending}
                aria-busy={recommendMut.isPending || resolveMut.isPending}
                className={`flex-1 kr-btn-lg ${
                  actionType === 'resolve' ? 'kr-btn-primary' : 'kr-btn-secondary'
                }`}
              >
                {(recommendMut.isPending || resolveMut.isPending)
                  ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                  : null
                }
                {actionType === 'recommend' ? 'Submit recommendation' : 'Confirm resolution'}
              </Button>
              <Button
                onClick={() => { setActiveDispute(null); setActionType(null); }}
                className="kr-btn-ghost"
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Expert Verification Panel ───

function ExpertPanel() {
  const [applications, setApplications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Read from our mock localStorage store
    if (typeof window !== 'undefined') {
      const appStr = localStorage.getItem('expert_application');
      if (appStr) {
        const app = JSON.parse(appStr);
        if (app.status === 'PENDING_VERIFICATION') {
          setApplications([app]);
        }
      }
      setLoading(false);
    }
  }, []);

  const handleApprove = (email: string) => {
    if (typeof window !== 'undefined') {
      const appStr = localStorage.getItem('expert_application');
      if (appStr) {
        const app = JSON.parse(appStr);
        app.status = 'VERIFIED_EXPERT';
        localStorage.setItem('expert_application', JSON.stringify(app));
        setApplications([]);
      }
    }
  };

  const handleReject = (email: string) => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('expert_application');
      setApplications([]);
    }
  };

  if (loading) return <PanelSkeleton />;

  if (applications.length === 0) {
    return (
      <div className="kr-empty-state">
        <ShieldCheck className="w-10 h-10 text-kr-success-500 mx-auto" aria-hidden="true" />
        <p className="text-body text-kr-text-secondary">Expert queue is empty</p>
        <p className="text-body-sm text-kr-text-disabled">All expert applications have been reviewed.</p>
      </div>
    );
  }

  return (
    <ul className="space-y-4" role="list">
      {applications.map((sub, i) => (
        <li key={i} className="kr-card kr-glass-amber kr-pattern-chinar">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <p className="font-medium text-body text-kr-text-primary">{sub.fullName}</p>
                <span className="kr-badge kr-badge-pending">PENDING</span>
              </div>
              <p className="text-body-sm text-kr-text-secondary mb-1">
                <strong>Email:</strong> {sub.email}
              </p>
              <p className="text-body-sm text-kr-text-secondary mb-1">
                <strong>Degree:</strong> {sub.degree}
              </p>
              <p className="text-body-sm text-kr-text-secondary mb-1">
                <strong>Institution:</strong> {sub.institution}
              </p>
              <p className="text-body-sm text-kr-text-secondary mb-1">
                <strong>License No:</strong> {sub.license}
              </p>
              <p className="text-body-sm text-kr-text-secondary mb-1">
                <strong>Specialization:</strong> {sub.specialization}
              </p>
              <p className="text-body-sm text-kr-text-secondary mt-1">
                <strong>Experience:</strong> {sub.experience} Years
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button
                onClick={() => handleApprove(sub.email)}
                className="kr-btn-primary kr-btn-sm"
              >
                <Check className="w-3 h-3" aria-hidden="true" /> Approve
              </Button>
              <Button
                onClick={() => handleReject(sub.email)}
                className="kr-btn-ghost kr-btn-sm text-kr-text-danger hover:bg-kr-badge-rejected-bg"
              >
                <X className="w-3 h-3" aria-hidden="true" /> Reject
              </Button>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}


// ─── Analytics Panel ───

function AnalyticsPanel({ adminRole }: { adminRole: AdminRole }) {
  const today = new Date().toISOString().slice(0, 10);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);

  const [startDate, setStartDate] = useState(thirtyDaysAgo);
  const [endDate, setEndDate]     = useState(today);
  const [selectedRegion, setSelectedRegion] = useState<string>('');

  const regionsQ = useQuery({
    queryKey: ['admin', 'regions'],
    queryFn: analyticsApi.listRegions,
  });

  const analyticsQ = useQuery({
    queryKey: ['admin', 'analytics', selectedRegion, startDate, endDate],
    queryFn: () =>
      analyticsApi.getSummary({
        regionId: selectedRegion || undefined,
        startDate,
        endDate,
      }),
    enabled: !!startDate && !!endDate,
  });

  const summary = analyticsQ.data;

  function KpiCard({
    label, value, sub, highlight = false,
    trend,
  }: {
    label: string;
    value: string | number;
    sub?: string;
    highlight?: boolean;
    trend?: 'up' | 'down' | 'neutral';
  }) {
    return (
      <div
        className={`kr-card space-y-1 ${
          highlight ? 'border-kr-border-brand bg-kr-fill-brand-subtle' : ''
        }`}
      >
        <p className="text-caption text-kr-text-secondary uppercase tracking-wide">{label}</p>
        <div className="flex items-end gap-2">
          <p className="font-heading text-h2 text-kr-text-primary kr-amount">{value}</p>
          {trend === 'up'   && <TrendingUp   className="w-4 h-4 text-kr-success-500 mb-1" aria-label="trending up" />}
          {trend === 'down' && <TrendingDown  className="w-4 h-4 text-kr-danger-500 mb-1"  aria-label="trending down" />}
        </div>
        {sub && <p className="text-caption text-kr-text-secondary">{sub}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap gap-4 items-end">
        {/* Region selector — REGIONAL_ADMIN sees own region only (UX) */}
        {/* SECURITY: backend filters by scoped region from JWT; this UI filter is additive UX */}
        <div>
          <label htmlFor="analytics-region" className="kr-label mb-1">Region</label>
          <select
            id="analytics-region"
            value={selectedRegion}
            onChange={(e) => setSelectedRegion(e.target.value)}
            className="kr-input"
            disabled={adminRole === 'REGIONAL_ADMIN'}
            aria-describedby={adminRole === 'REGIONAL_ADMIN' ? 'region-note' : undefined}
          >
            {adminRole === 'PLATFORM_ADMIN' && <option value="">All regions</option>}
            {(regionsQ.data ?? []).map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
          {adminRole === 'REGIONAL_ADMIN' && (
            <p id="region-note" className="kr-hint">
              Scoped to your assigned region.
            </p>
          )}
        </div>

        <div>
          <label htmlFor="analytics-start" className="kr-label mb-1">From</label>
          <input
            id="analytics-start"
            type="date"
            value={startDate}
            max={endDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="kr-input"
          />
        </div>

        <div>
          <label htmlFor="analytics-end" className="kr-label mb-1">To</label>
          <input
            id="analytics-end"
            type="date"
            value={endDate}
            min={startDate}
            max={today}
            onChange={(e) => setEndDate(e.target.value)}
            className="kr-input"
          />
        </div>
      </div>

      {analyticsQ.isLoading && (
        <div aria-busy="true" aria-label="Loading analytics"
             className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="kr-card kr-glass-amber kr-pattern-chinar space-y-2">
              <div className="kr-skeleton h-3 w-3/4 rounded" />
              <div className="kr-skeleton h-7 w-1/2 rounded" />
            </div>
          ))}
        </div>
      )}

      {analyticsQ.isError && (
        <PanelError message={apiMsg(analyticsQ.error)} onRetry={() => analyticsQ.refetch()} />
      )}

      {summary && (
        <>
          {/* ★ IMPORT/EXPORT RATIO — Prominent KPI */}
          <div
            className="kr-card kr-glass-amber kr-pattern-chinar border-2 border-kr-primary-400 bg-kr-fill-brand-subtle p-6 space-y-2"
            aria-label="Import to export ratio KPI"
          >
            <p className="text-caption text-kr-primary-700 uppercase tracking-widest font-semibold">
              ★ Import / Export Ratio
            </p>
            <div className="flex items-end gap-4 flex-wrap">
              <p className="font-heading text-display text-kr-primary-700 kr-amount">
                {summary.importExportRatio.toFixed(2)}x
              </p>
              <div className="space-y-0.5">
                <p className="text-body-sm text-kr-text-secondary">
                  {summary.exportOrders} exports · {summary.importOrders} imports
                </p>
                <p className="text-body-sm text-kr-text-secondary">
                  {summary.regionName} · {summary.period.start} to {summary.period.end}
                </p>
              </div>
            </div>
            <p className="text-caption text-kr-primary-700">
              Ratio &gt; 1 means the region exports more than it imports.
              Target: &gt; 1.5 for healthy trade balance.
            </p>
          </div>

          {/* KPI grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            <KpiCard
              label="Gross Revenue"
              value={fmt(summary.grossRevenue, summary.currency)}
              trend="up"
            />
            <KpiCard
              label="Total Orders"
              value={summary.totalOrders}
              sub={`${summary.completedOrders} completed`}
            />
            <KpiCard
              label="Cancelled"
              value={summary.cancelledOrders}
              sub={`${((summary.cancelledOrders / (summary.totalOrders || 1)) * 100).toFixed(1)}% cancel rate`}
              trend={summary.cancelledOrders > summary.totalOrders * 0.1 ? 'down' : 'neutral'}
            />
            <KpiCard
              label="Disputed"
              value={summary.disputedOrders}
              trend={summary.disputedOrders > 10 ? 'down' : 'neutral'}
            />
            <KpiCard
              label="Active Listings"
              value={summary.activeListings}
            />
            <KpiCard
              label="New Farmers"
              value={summary.newFarmers}
              trend="up"
            />
            <KpiCard
              label="New Buyers"
              value={summary.newBuyers}
              trend="up"
            />
            <KpiCard
              label="KYC Pending"
              value={summary.kycPending}
              sub={`${summary.kycApproved} approved, ${summary.kycRejected} rejected`}
            />
          </div>
        </>
      )}
    </div>
  );
}

// ─── Page ───

type Tab = 'kyc' | 'expert' | 'disputes' | 'analytics';

const TABS: { id: Tab; label: string; Icon: any }[] = [
  { id: 'kyc',       label: 'KYC Queue',  Icon: Users       },
  { id: 'expert',    label: 'Expert KYC', Icon: ShieldCheck },
  { id: 'disputes',  label: 'Disputes',   Icon: ShieldAlert },
  { id: 'analytics', label: 'Analytics',  Icon: BarChart3   },
];

export default function AdminConsolePage() {
  const [activeTab, setActiveTab] = useState<Tab>('kyc');

  // In production: read from auth store / JWT claims
  // SECURITY: role check here is UX only — backend enforces actual access control
  const adminRole: AdminRole = 'PLATFORM_ADMIN'; // TODO: useAuthStore().user.role

  const kycCountQ = useQuery({
    queryKey: ['admin', 'kyc', 'PENDING'],
    queryFn: () => kycApi.getQueue({ status: 'PENDING', limit: 1 }),
  });

  const disputesCountQ = useQuery({
    queryKey: ['admin', 'disputes'],
    queryFn: () => disputesApi.list({ limit: 1 }),
  });

  return (
    <PortalShell theme="admin" title="Platform Administration" description="Monitor platform activity, resolve disputes, and verify KYC." kpis={[]}>
      <div className="kr-hero-premium kr-pattern-chinar rounded-xl p-6 md:p-8 mb-8 border-l-8 border-kr-border-brand shadow-md">
        <div className="flex items-center gap-3 mb-2">
          <h1 className="font-heading text-display text-white">Admin console</h1>
          <span
            className={`kr-badge ${
              adminRole === 'PLATFORM_ADMIN' ? 'bg-slate-700 text-slate-100 border-none' : 'kr-badge-draft'
            }`}
            aria-label={`Admin role: ${adminRole.replace('_', ' ').toLowerCase()}`}
          >
            {adminRole === 'PLATFORM_ADMIN' ? 'Platform Admin' : 'Regional Admin'}
          </span>
        </div>
        <p className="text-body-lg text-slate-300">
          Review KYC submissions, manage disputes, and monitor region analytics.
        </p>
      </div>

      {/* Tab strip */}
      <div
        role="tablist"
        aria-label="Admin console sections"
        className="flex gap-1 border-b border-kr-border-default mb-6 overflow-x-auto scrollbar-none"
      >
        {TABS.map(({ id, label, Icon }) => {
          // Badge counts on tabs
          const count =
            id === 'kyc'      ? kycCountQ.data?.total :
            id === 'disputes' ? disputesCountQ.data?.total :
            undefined;

          return (
            <Button
              key={id}
              role="tab"
              id={`admin-tab-${id}`}
              aria-selected={activeTab === id}
              aria-controls={`admin-panel-${id}`}
              onClick={() => setActiveTab(id)}
              className={`
                flex items-center gap-2 px-4 py-3 text-body-sm font-medium whitespace-nowrap
                border-b-2 transition-colors kr-focus-ring
                ${ activeTab === id
                  ? 'border-kr-primary-500 text-kr-primary-600'
                  : 'border-transparent text-kr-text-secondary hover:text-kr-text-primary'
                }
              `}
            >
              <Icon className="w-4 h-4" aria-hidden="true" />
              {label}
              {count != null && count > 0 && (
                <span
                  className="inline-flex items-center justify-center
                             w-5 h-5 rounded-full bg-kr-danger-500 text-white text-caption"
                  aria-label={`${count} pending`}
                >
                  {count > 99 ? '99+' : count}
                </span>
              )}
            </Button>
          );
        })}
      </div>

      {/* Tab panels */}
      {TABS.map(({ id }) => (
        <div
          key={id}
          role="tabpanel"
          id={`admin-panel-${id}`}
          aria-labelledby={`admin-tab-${id}`}
          hidden={activeTab !== id}
        >
          {id === 'kyc'       && <KycPanel />}
          {id === 'expert'    && <ExpertPanel />}
          {id === 'disputes'  && <DisputesPanel adminRole={adminRole} />}
          {id === 'analytics' && <AnalyticsPanel adminRole={adminRole} />}
        </div>
      ))}
    </PortalShell>
  );
}
