'use client';

/**
 * Admin governance console — KYC queue, expert credential checks, disputes
 * and regional analytics.
 *
 * API contracts (kashroot-api src/modules/admin + src/modules/disputes):
 *   GET  /admin/kyc?status=PENDING · POST /admin/kyc/:userId/approve|reject
 *   GET  /admin/disputes · POST /disputes/:id/recommend|resolve
 *   GET  /admin/analytics · GET /admin/regions
 *
 * When the API is unreachable (not deployed, or the module is not mounted)
 * each panel falls back to demo records kept in this browser (kr_admin_*), so
 * every button still does something visible. A banner says which mode is on.
 *
 * SECURITY: role checks here are UX only — backend guards enforce access.
 * REGIONAL_ADMIN can recommend disputes; only PLATFORM_ADMIN can resolve.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BarChart3,
  Check,
  Eye,
  Gavel,
  GraduationCap,
  Loader2,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  Users,
  WifiOff,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import { PortalShell } from '@/components/layout/PortalShell';
import { Badge, Btn, EmptyState, Field, INPUT, Modal, PORTAL_THEMES, Panel, inr } from '@/components/portal/kit';
import { analyticsApi, disputesApi, kycApi, type AnalyticsSummary, type Dispute, type KycSubmission } from '@/lib/api/admin';
import { ApiError } from '@/lib/api/client';
import { usePersistentState } from '@/lib/portal-store';

const theme = PORTAL_THEMES.admin;

type AdminRole = 'REGIONAL_ADMIN' | 'PLATFORM_ADMIN';

// ─── Demo records (used only when the API is unreachable) ───

const DEMO_KYC: KycSubmission[] = [
  {
    userId: 'demo-u1', fullName: 'Rafiq Ahmad', email: 'rafiq@example.com', role: 'FARMER', kycStatus: 'PENDING', submittedAt: '2026-10-07T09:12:00Z',
    documents: [{ type: 'AADHAAR_MASKED', url: '', uploadedAt: '2026-10-07T09:12:00Z' }, { type: 'LAND_RECORD', url: '', uploadedAt: '2026-10-07T09:13:00Z' }],
  },
  {
    userId: 'demo-u2', fullName: 'Hill Fresh Traders', email: 'buying@hillfresh.example', role: 'BUYER', kycStatus: 'PENDING', submittedAt: '2026-10-08T14:40:00Z',
    documents: [{ type: 'PAN_CARD', url: '', uploadedAt: '2026-10-08T14:40:00Z' }, { type: 'GST_CERTIFICATE', url: '', uploadedAt: '2026-10-08T14:41:00Z' }],
  },
  {
    userId: 'demo-u3', fullName: 'Shabnam Bano', email: 'shabnam@example.com', role: 'FARMER', kycStatus: 'PENDING', submittedAt: '2026-10-09T06:05:00Z',
    documents: [{ type: 'AADHAAR_MASKED', url: '', uploadedAt: '2026-10-09T06:05:00Z' }],
  },
];

const DEMO_DISPUTES: Dispute[] = [
  {
    id: 'demo-d1', orderId: 'ORD-77A1C2', listingTitle: 'Delicious apples · 400 boxes', farmerName: 'Green Valley Orchards', buyerName: 'Metro Fruit Co.',
    reason: 'Grade mismatch on arrival', description: '60 boxes graded B instead of A.', status: 'OPENED', openedAt: '2026-10-06T10:00:00Z', updatedAt: '2026-10-06T10:00:00Z',
  },
  {
    id: 'demo-d2', orderId: 'ORD-91F0B4', listingTitle: 'Walnut kernels · 300 kg', farmerName: 'Hillside Walnut Co-op', buyerName: 'Dry Fruit House',
    reason: 'Short weight', description: '12 kg short against invoice.', status: 'RECOMMENDED', recommendation: 'Refund the value of 12 kg from escrow.', openedAt: '2026-10-02T08:30:00Z', updatedAt: '2026-10-05T12:00:00Z',
  },
];

const DEMO_REGIONS = [
  { id: 'north', name: 'North orchard belt' },
  { id: 'upper', name: 'Upper valley' },
  { id: 'lake', name: 'Lakeside' },
  { id: 'river', name: 'Riverside' },
];

interface ExpertApplication {
  fullName?: string;
  email?: string;
  degree?: string;
  institution?: string;
  license?: string;
  specialization?: string;
  experience?: string;
  status?: string;
}
const NO_APPLICATION: ExpertApplication | null = null;

function demoSummary(regionId: string, start: string, end: string): AnalyticsSummary {
  const days = Math.max(1, Math.round((Date.parse(end) - Date.parse(start)) / 864e5) + 1);
  const weight = regionId ? 0.25 + (DEMO_REGIONS.findIndex((r) => r.id === regionId) + 1) * 0.06 : 1;
  const n = (perDay: number) => Math.round(perDay * days * weight);
  const exportOrders = n(5.2);
  const importOrders = Math.max(1, n(3.1));
  const totalOrders = n(14);
  return {
    regionId: regionId || 'all',
    regionName: DEMO_REGIONS.find((r) => r.id === regionId)?.name ?? 'All regions',
    period: { start, end },
    totalOrders,
    completedOrders: Math.round(totalOrders * 0.82),
    cancelledOrders: Math.round(totalOrders * 0.06),
    disputedOrders: Math.round(totalOrders * 0.02),
    grossRevenue: n(410000),
    currency: 'INR',
    exportOrders,
    importOrders,
    importExportRatio: exportOrders / importOrders,
    kycPending: 3,
    kycApproved: n(1.4),
    kycRejected: n(0.2),
    activeListings: n(9),
    newFarmers: n(2.1),
    newBuyers: n(0.9),
  };
}

const fmtDate = (iso: string) => new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso));
const apiMsg = (err: unknown) => (err instanceof ApiError ? err.messages[0] : 'The admin service did not respond.');
const label = (s: string) => s.replace(/_/g, ' ').toLowerCase();

function DemoBanner({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div role="status" className="mb-4 flex flex-col gap-3 rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200 sm:flex-row sm:items-center sm:justify-between">
      <p className="flex items-start gap-2 text-sm text-amber-900">
        <WifiOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span>
          <strong>Demo mode.</strong> {error instanceof ApiError && error.statusCode > 0 ? `${apiMsg(error).replace(/\.?$/, '.')}` : 'The admin service could not be reached.'} Showing sample records — actions here stay in this browser.
        </span>
      </p>
      <Btn theme={theme} size="sm" variant="soft" icon={RefreshCw} onClick={onRetry}>Retry live</Btn>
    </div>
  );
}

function Loading() {
  return (
    <div aria-busy="true" className="flex items-center gap-2 py-10 text-sm text-slate-500">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…
    </div>
  );
}

// ─── KYC ───

function KycPanel() {
  const qc = useQueryClient();
  const [demo, setDemo] = usePersistentState<KycSubmission[]>('kr_admin_kyc', DEMO_KYC);
  const [rejecting, setRejecting] = useState<KycSubmission | null>(null);
  const [reason, setReason] = useState('');

  const q = useQuery({ queryKey: ['admin', 'kyc', 'PENDING'], queryFn: () => kycApi.getQueue({ status: 'PENDING', limit: 20 }), retry: 1 });
  const live = !q.isError;

  const approve = useMutation({
    mutationFn: (s: KycSubmission) => (live ? kycApi.approve(s.userId) : Promise.resolve(null)),
    onSuccess: (_r, s) => {
      if (live) void qc.invalidateQueries({ queryKey: ['admin', 'kyc'] });
      else setDemo((all) => all.filter((x) => x.userId !== s.userId));
      toast.success(`${s.fullName} verified`);
    },
    onError: (err) => toast.error(apiMsg(err)),
  });

  const reject = useMutation({
    mutationFn: ({ s, why }: { s: KycSubmission; why: string }) => (live ? kycApi.reject(s.userId, why) : Promise.resolve(null)),
    onSuccess: (_r, { s }) => {
      if (live) void qc.invalidateQueries({ queryKey: ['admin', 'kyc'] });
      else setDemo((all) => all.filter((x) => x.userId !== s.userId));
      setRejecting(null);
      setReason('');
      toast.success(`${s.fullName} rejected — they will be asked to resubmit`);
    },
    onError: (err) => toast.error(apiMsg(err)),
  });

  if (q.isLoading) return <Loading />;
  const rows = live ? q.data?.data ?? [] : demo;

  return (
    <Panel theme={theme} title="KYC verification queue" icon={Users}>
      {!live && <DemoBanner error={q.error} onRetry={() => void q.refetch()} />}
      {rows.length === 0 ? (
        <EmptyState
          theme={theme}
          icon={ShieldCheck}
          title="Queue is clear"
          text="Every submission has been reviewed."
          action={!live ? <Btn theme={theme} variant="soft" onClick={() => setDemo(DEMO_KYC)}>Reload demo queue</Btn> : undefined}
        />
      ) : (
        <ul className="space-y-3">
          {rows.map((s) => (
            <li key={s.userId} className="flex flex-col gap-3 rounded-2xl bg-white/70 p-4 ring-1 ring-slate-900/5 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-slate-900">{s.fullName}</p>
                  <Badge tone="amber">{label(s.kycStatus)}</Badge>
                  <Badge tone="blue">{label(s.role)}</Badge>
                </div>
                <p className="text-sm text-slate-600">{s.email} · submitted {fmtDate(s.submittedAt)}</p>
                <p className="text-xs text-slate-500">Documents: {s.documents.map((d) => label(d.type)).join(', ') || 'none'}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {s.documents.filter((d) => d.url).map((d) => (
                  <Btn key={d.type} theme={theme} size="sm" variant="ghost" icon={Eye} href={d.url}>
                    {label(d.type).split(' ')[0]}
                  </Btn>
                ))}
                <Btn
                  theme={theme}
                  size="sm"
                  icon={approve.isPending && approve.variables?.userId === s.userId ? Loader2 : Check}
                  disabled={approve.isPending}
                  aria-label={`Approve KYC for ${s.fullName}`}
                  onClick={() => approve.mutate(s)}
                >
                  Approve
                </Btn>
                <Btn theme={theme} size="sm" variant="danger" icon={X} aria-label={`Reject KYC for ${s.fullName}`} onClick={() => { setRejecting(s); setReason(''); }}>
                  Reject
                </Btn>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={rejecting !== null}
        onClose={() => setRejecting(null)}
        title={rejecting ? `Reject ${rejecting.fullName}` : 'Reject'}
        footer={
          <>
            <Btn theme={theme} variant="ghost" onClick={() => setRejecting(null)}>Cancel</Btn>
            <Btn theme={theme} variant="danger" disabled={!reason.trim() || reject.isPending} onClick={() => rejecting && reject.mutate({ s: rejecting, why: reason.trim() })}>
              Confirm rejection
            </Btn>
          </>
        }
      >
        <Field label="Reason (shown to the user)">
          <textarea rows={3} className={INPUT} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Land record is unreadable — please upload a clearer scan." />
        </Field>
      </Modal>
    </Panel>
  );
}

// ─── Expert credentials ───

function ExpertPanel() {
  const [app, setApp] = usePersistentState<ExpertApplication | null>('expert_application', NO_APPLICATION);
  const pending = app?.status === 'PENDING_VERIFICATION';

  return (
    <Panel theme={theme} title="Expert credential verification" icon={GraduationCap}>
      {!pending || !app ? (
        <EmptyState
          theme={theme}
          icon={ShieldCheck}
          title="No applications waiting"
          text="Agronomists who register through the expert sign-up appear here for review."
          action={<Btn theme={theme} variant="soft" href="/register/expert">Open expert sign-up</Btn>}
        />
      ) : (
        <div className="flex flex-col gap-4 rounded-2xl bg-white/70 p-4 ring-1 ring-slate-900/5 lg:flex-row lg:items-start lg:justify-between">
          <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            <div className="sm:col-span-2 flex items-center gap-2"><dt className="sr-only">Name</dt><dd className="font-semibold text-slate-900">{app.fullName ?? 'Unnamed applicant'}</dd><Badge tone="amber">pending</Badge></div>
            {([
              ['Email', app.email],
              ['Degree', app.degree],
              ['Institution', app.institution],
              ['Licence no.', app.license],
              ['Specialisation', app.specialization],
              ['Experience', app.experience ? `${app.experience} years` : undefined],
            ] as const).map(([k, v]) => (
              <div key={k} className="flex gap-2"><dt className="text-slate-500">{k}:</dt><dd className="text-slate-800">{v || '—'}</dd></div>
            ))}
          </dl>
          <div className="flex gap-2">
            <Btn theme={theme} size="sm" icon={Check} onClick={() => { setApp({ ...app, status: 'VERIFIED_EXPERT' }); toast.success('Expert verified — they can now publish advisories'); }}>Approve</Btn>
            <Btn theme={theme} size="sm" variant="danger" icon={X} onClick={() => { setApp(null); toast.success('Application rejected'); }}>Reject</Btn>
          </div>
        </div>
      )}
    </Panel>
  );
}

// ─── Disputes ───

function DisputesPanel({ adminRole }: { adminRole: AdminRole }) {
  const qc = useQueryClient();
  const [demo, setDemo] = usePersistentState<Dispute[]>('kr_admin_disputes', DEMO_DISPUTES);
  const [active, setActive] = useState<{ d: Dispute; kind: 'recommend' | 'resolve' } | null>(null);
  const [text, setText] = useState('');

  const q = useQuery({ queryKey: ['admin', 'disputes'], queryFn: () => disputesApi.list({ limit: 20 }), retry: 1 });
  const live = !q.isError;

  const act = useMutation({
    mutationFn: ({ d, kind, body }: { d: Dispute; kind: 'recommend' | 'resolve'; body: string }) =>
      live ? (kind === 'recommend' ? disputesApi.recommend(d.id, body) : disputesApi.resolve(d.id, body)) : Promise.resolve(null),
    onSuccess: (_r, { d, kind, body }) => {
      if (live) void qc.invalidateQueries({ queryKey: ['admin', 'disputes'] });
      else
        setDemo((all) =>
          all.map((x) =>
            x.id === d.id
              ? { ...x, ...(kind === 'recommend' ? { recommendation: body, status: 'RECOMMENDED' } : { resolution: body, status: 'RESOLVED' }), updatedAt: new Date().toISOString() }
              : x,
          ),
        );
      setActive(null);
      setText('');
      toast.success(kind === 'recommend' ? 'Recommendation recorded' : 'Dispute resolved — both parties notified');
    },
    onError: (err) => toast.error(apiMsg(err)),
  });

  if (q.isLoading) return <Loading />;
  const rows = live ? q.data?.data ?? [] : demo;

  return (
    <Panel theme={theme} title="Trade disputes" icon={Gavel}>
      {!live && <DemoBanner error={q.error} onRetry={() => void q.refetch()} />}
      {adminRole === 'REGIONAL_ADMIN' && (
        <p className="mb-4 rounded-xl bg-indigo-50 p-3 text-sm text-indigo-900">As Regional Admin you can recommend outcomes; only Platform Admins resolve.</p>
      )}
      {rows.length === 0 ? (
        <EmptyState theme={theme} icon={ShieldCheck} title="No open disputes" text="Escrow trades are running clean." action={!live ? <Btn theme={theme} variant="soft" onClick={() => setDemo(DEMO_DISPUTES)}>Reload demo disputes</Btn> : undefined} />
      ) : (
        <ul className="space-y-3">
          {rows.map((d) => {
            const done = d.status === 'RESOLVED' || d.status === 'CLOSED';
            return (
              <li key={d.id} className="flex flex-col gap-3 rounded-2xl bg-white/70 p-4 ring-1 ring-slate-900/5 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-slate-900">#{d.orderId.slice(-6).toUpperCase()} · {d.listingTitle}</p>
                    <Badge tone={done ? 'green' : d.status === 'RECOMMENDED' ? 'violet' : 'amber'}>{label(d.status)}</Badge>
                  </div>
                  <p className="text-sm text-slate-600">{d.farmerName} ↔ {d.buyerName} · opened {fmtDate(d.openedAt)}</p>
                  <p className="text-sm text-slate-700"><strong>Reason:</strong> {d.reason}</p>
                  {d.recommendation && <p className="text-sm text-indigo-900"><strong>Recommendation:</strong> {d.recommendation}</p>}
                  {d.resolution && <p className="text-sm text-emerald-800"><strong>Resolution:</strong> {d.resolution}</p>}
                </div>
                {!done && (
                  <div className="flex flex-wrap gap-2">
                    {(d.status === 'OPENED' || d.status === 'UNDER_REVIEW') && (
                      <Btn theme={theme} size="sm" variant="soft" onClick={() => { setActive({ d, kind: 'recommend' }); setText(''); }}>Recommend</Btn>
                    )}
                    {adminRole === 'PLATFORM_ADMIN' && (
                      <Btn theme={theme} size="sm" icon={Gavel} onClick={() => { setActive({ d, kind: 'resolve' }); setText(d.recommendation ?? ''); }}>Resolve</Btn>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Modal
        open={active !== null}
        onClose={() => setActive(null)}
        title={active?.kind === 'resolve' ? 'Resolve dispute' : 'Recommend an outcome'}
        footer={
          <>
            <Btn theme={theme} variant="ghost" onClick={() => setActive(null)}>Cancel</Btn>
            <Btn theme={theme} disabled={!text.trim() || act.isPending} onClick={() => active && act.mutate({ d: active.d, kind: active.kind, body: text.trim() })}>
              {active?.kind === 'resolve' ? 'Confirm resolution' : 'Submit recommendation'}
            </Btn>
          </>
        }
      >
        {active && (
          <div className="grid gap-4">
            <p className="text-sm text-slate-600">#{active.d.orderId.slice(-6).toUpperCase()} — {active.d.farmerName} ↔ {active.d.buyerName}</p>
            {active.kind === 'resolve' && (
              <p className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> Resolving is final: escrow is released or refunded and both parties are notified.
              </p>
            )}
            <Field label={active.kind === 'resolve' ? 'Resolution statement' : 'Your recommendation'}>
              <textarea rows={4} className={INPUT} value={text} onChange={(e) => setText(e.target.value)} />
            </Field>
          </div>
        )}
      </Modal>
    </Panel>
  );
}

// ─── Analytics ───

function AnalyticsPanel({ adminRole }: { adminRole: AdminRole }) {
  const today = new Date().toISOString().slice(0, 10);
  const [start, setStart] = useState(() => new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10));
  const [end, setEnd] = useState(today);
  const [region, setRegion] = useState('');

  const regionsQ = useQuery({ queryKey: ['admin', 'regions'], queryFn: analyticsApi.listRegions, retry: 1 });
  const summaryQ = useQuery({
    queryKey: ['admin', 'analytics', region, start, end],
    queryFn: () => analyticsApi.getSummary({ regionId: region || undefined, startDate: start, endDate: end }),
    enabled: !!start && !!end,
    retry: 1,
  });

  const live = !summaryQ.isError;
  const regions = regionsQ.isError ? DEMO_REGIONS : regionsQ.data ?? [];
  const s = live ? summaryQ.data : demoSummary(region, start, end);

  const cards: { label: string; value: string; sub?: string; up?: boolean; down?: boolean }[] = s
    ? [
        { label: 'Gross revenue', value: inr.format(s.grossRevenue), up: true },
        { label: 'Total orders', value: String(s.totalOrders), sub: `${s.completedOrders} completed` },
        { label: 'Cancelled', value: String(s.cancelledOrders), sub: `${((s.cancelledOrders / (s.totalOrders || 1)) * 100).toFixed(1)}% cancel rate`, down: s.cancelledOrders > s.totalOrders * 0.1 },
        { label: 'Disputed', value: String(s.disputedOrders), down: s.disputedOrders > 10 },
        { label: 'Active listings', value: String(s.activeListings) },
        { label: 'New farmers', value: String(s.newFarmers), up: true },
        { label: 'New buyers', value: String(s.newBuyers), up: true },
        { label: 'KYC pending', value: String(s.kycPending), sub: `${s.kycApproved} approved · ${s.kycRejected} rejected` },
      ]
    : [];

  return (
    <Panel theme={theme} title="Regional analytics" icon={BarChart3}>
      {!live && <DemoBanner error={summaryQ.error} onRetry={() => { void regionsQ.refetch(); void summaryQ.refetch(); }} />}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Field label="Region" hint={adminRole === 'REGIONAL_ADMIN' ? 'Scoped to your assigned region.' : undefined}>
          <select className={INPUT} value={region} disabled={adminRole === 'REGIONAL_ADMIN'} onChange={(e) => setRegion(e.target.value)}>
            {adminRole === 'PLATFORM_ADMIN' && <option value="">All regions</option>}
            {regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </Field>
        <Field label="From">
          <input type="date" className={INPUT} value={start} max={end} onChange={(e) => setStart(e.target.value)} />
        </Field>
        <Field label="To">
          <input type="date" className={INPUT} value={end} min={start} max={today} onChange={(e) => setEnd(e.target.value)} />
        </Field>
      </div>

      {summaryQ.isLoading && <Loading />}
      {s && (
        <>
          <div className="mb-4 rounded-2xl bg-gradient-to-br from-indigo-600 to-slate-800 p-6 text-white shadow-lg">
            <p className="text-xs font-semibold uppercase tracking-widest text-indigo-200">Export / import ratio</p>
            <div className="mt-1 flex flex-wrap items-end gap-4">
              <p className="font-serif text-5xl font-semibold tabular-nums">{s.importExportRatio.toFixed(2)}×</p>
              <p className="pb-1 text-sm text-indigo-100">{s.exportOrders} exports · {s.importOrders} imports · {s.regionName} · {s.period.start} → {s.period.end}</p>
            </div>
            <p className="mt-2 text-xs text-indigo-200">Above 1 means the region sells out more than it brings in. Healthy target: above 1.5.</p>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {cards.map((c) => (
              <div key={c.label} className="rounded-2xl bg-white/80 p-4 ring-1 ring-slate-900/5">
                <p className="text-xs uppercase tracking-wider text-slate-500">{c.label}</p>
                <p className="mt-1 flex items-center gap-1 text-xl font-bold tabular-nums text-slate-900">
                  {c.value}
                  {c.up && <TrendingUp className="h-4 w-4 text-emerald-600" aria-label="trending up" />}
                  {c.down && <TrendingDown className="h-4 w-4 text-red-600" aria-label="trending down" />}
                </p>
                {c.sub && <p className="text-xs text-slate-500">{c.sub}</p>}
              </div>
            ))}
          </div>
        </>
      )}
    </Panel>
  );
}

// ─── Page ───

export default function AdminConsolePage() {
  const [tab, setTab] = useState('kyc');
  // SECURITY: UX only — read from JWT claims once the auth store exposes them.
  const adminRole: AdminRole = 'PLATFORM_ADMIN';

  const kycQ = useQuery({ queryKey: ['admin', 'kyc', 'PENDING'], queryFn: () => kycApi.getQueue({ status: 'PENDING', limit: 20 }), retry: 1 });
  const disputesQ = useQuery({ queryKey: ['admin', 'disputes'], queryFn: () => disputesApi.list({ limit: 20 }), retry: 1 });
  const [demoKyc] = usePersistentState<KycSubmission[]>('kr_admin_kyc', DEMO_KYC);
  const [demoDisputes] = usePersistentState<Dispute[]>('kr_admin_disputes', DEMO_DISPUTES);

  const kycCount = kycQ.isError ? demoKyc.length : kycQ.data?.total ?? 0;
  const disputeRows = disputesQ.isError ? demoDisputes : disputesQ.data?.data ?? [];
  const openDisputes = disputeRows.filter((d) => d.status !== 'RESOLVED' && d.status !== 'CLOSED').length;

  return (
    <PortalShell
      title="Governance console"
      description="Verify identities, settle trade disputes and watch regional trade health."
      eyebrow={adminRole === 'PLATFORM_ADMIN' ? 'Platform admin' : 'Regional admin'}
      theme="admin"
      kpis={[
        { label: 'KYC pending', value: String(kycCount), trend: kycQ.isError ? 'Demo data' : 'Live queue' },
        { label: 'Open disputes', value: String(openDisputes), trend: 'Escrow on hold' },
        { label: 'Your role', value: adminRole === 'PLATFORM_ADMIN' ? 'Platform' : 'Regional', trend: 'Backend enforces access' },
      ]}
      tabs={[
        { id: 'kyc', label: 'KYC queue', icon: Users, count: kycCount },
        { id: 'expert', label: 'Expert KYC', icon: GraduationCap },
        { id: 'disputes', label: 'Disputes', icon: Gavel, count: openDisputes },
        { id: 'analytics', label: 'Analytics', icon: BarChart3 },
      ]}
      activeTab={tab}
      onTabChange={setTab}
    >
      {tab === 'kyc' && <KycPanel />}
      {tab === 'expert' && <ExpertPanel />}
      {tab === 'disputes' && <DisputesPanel adminRole={adminRole} />}
      {tab === 'analytics' && <AnalyticsPanel adminRole={adminRole} />}
    </PortalShell>
  );
}
