'use client';

/**
 * Owner hierarchy panel — the Platform Superadmin's (Founder's) multi-level
 * administration view inside /admin/dashboard:
 *   - Platform-wide KPIs across every cold storage business.
 *   - The owner onboarding & approval queue: approve, request info, suspend,
 *     reject (every decision is written to platform_audit_logs).
 *   - 1-click Authorized Oversight Mode: opens that owner's complete business
 *     dashboard at /rental/dashboard?oversightOrgId=…&oversight=1.
 *   - The global audit trail.
 * Data: GET /api/admin/hierarchy?scope=PLATFORM_SUPERADMIN.
 */
import { useCallback, useEffect, useState } from 'react';
import { Building2, ClipboardList, Crown, Eye, ShieldCheck, Snowflake, ThumbsUp, UserX, XCircle } from 'lucide-react';

import { Badge, Btn, EmptyState, Panel, Skeleton } from '@/components/portal/kit';
import { PORTAL_THEMES } from '@/components/portal/kit';

const theme = PORTAL_THEMES.admin;

interface Org {
  id: string;
  organization_code: string;
  business_name: string;
  owner_full_name: string;
  owner_email: string;
  owner_phone: string;
  headquarters_address: string;
  district: string;
  gstin_or_reg_no: string | null;
  pan_number: string | null;
  verification_notes: string | null;
  onboarding_status: string;
  facilities_count: number;
  active_bookings_count: number;
  total_capacity_crates: number;
  occupied_capacity_crates: number;
  available_capacity_crates: number;
}

interface HierarchyData {
  ok: boolean;
  summary: {
    totalOrganizations: number;
    approvedOrganizations: number;
    pendingApplications: number;
    suspendedOrRejected: number;
    totalFacilities: number;
    totalChambers: number;
    totalBins: number;
    totalCapacityCrates: number;
    occupiedCapacityCrates: number;
    availableCapacityCrates: number;
    totalBookings: number;
    totalPlatformRevenueInr: number;
  };
  organizations: Org[];
  environmentalAlerts: { id: string; chamber_code: string; alert_status: string; alert_message: string | null; recorded_at: string }[];
  auditLogs: {
    id: string;
    actor_name: string;
    actor_role: string;
    is_superadmin_oversight_action: boolean;
    action_category: string;
    action_summary: string;
    organization_id: string | null;
    created_at: string;
  }[];
}

const STATUS_TONE: Record<string, 'green' | 'amber' | 'red' | 'slate'> = {
  APPROVED_ACTIVE: 'green',
  PENDING_VERIFICATION: 'amber',
  INFO_REQUESTED: 'amber',
  REJECTED: 'red',
  SUSPENDED: 'red',
};
const STATUS_TEXT: Record<string, string> = {
  APPROVED_ACTIVE: 'Approved · Active',
  PENDING_VERIFICATION: 'Pending verification',
  INFO_REQUESTED: 'Info requested',
  REJECTED: 'Rejected',
  SUSPENDED: 'Suspended',
};

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const when = (iso: string) => {
  try {
    return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  } catch {
    return iso;
  }
};

export function OwnerHierarchyPanel() {
  const [data, setData] = useState<HierarchyData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/hierarchy?scope=PLATFORM_SUPERADMIN', { cache: 'no-store' });
      const body = await res.json();
      if (!body.ok) throw new Error(body.error || 'Could not load the hierarchy.');
      setData(body as HierarchyData);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the hierarchy.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const review = async (org: Org, decisionStatus: string, reviewNotes: string) => {
    setBusyId(org.id);
    try {
      const res = await fetch('/api/admin/hierarchy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'SUPERADMIN_REVIEW_OWNER', organizationId: org.id, decisionStatus, reviewNotes }),
      });
      const body = await res.json();
      if (!body.ok) throw new Error(body.error || 'The decision could not be saved.');
      setNote(`${org.business_name}: ${STATUS_TEXT[decisionStatus] ?? decisionStatus}. Audit-logged.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The decision could not be saved.');
    } finally {
      setBusyId(null);
    }
  };

  if (error && !data) {
    return <Panel theme={theme} title="Owner businesses" icon={Building2}><p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-800 ring-1 ring-rose-200">{error}</p></Panel>;
  }
  if (!data) {
    return <Panel theme={theme} title="Owner businesses" icon={Building2}><Skeleton label="Loading the owner hierarchy…" rows={4} height="h-24" /></Panel>;
  }

  const s = data.summary;
  const kpis: { label: string; value: string; hint: string }[] = [
    { label: 'Cold storage businesses', value: String(s.totalOrganizations), hint: `${s.approvedOrganizations} approved · ${s.pendingApplications} pending` },
    { label: 'Facilities · Chambers · Bins', value: `${s.totalFacilities} · ${s.totalChambers} · ${s.totalBins}`, hint: 'Across every owner organization' },
    { label: 'Storage capacity', value: `${s.totalCapacityCrates.toLocaleString('en-IN')} crates`, hint: `${s.occupiedCapacityCrates.toLocaleString('en-IN')} occupied · ${s.availableCapacityCrates.toLocaleString('en-IN')} available` },
    { label: 'Bookings', value: String(s.totalBookings), hint: 'Latest 100 on the platform' },
    { label: 'Collected revenue', value: inr(s.totalPlatformRevenueInr), hint: 'Paid, verified transactions' },
    { label: 'Environmental alerts', value: String(data.environmentalAlerts.length), hint: 'Latest warning / critical readings' },
  ];

  return (
    <div className="space-y-5">
      <Panel theme={theme} title="Platform-wide numbers" icon={Crown}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {kpis.map((k) => (
            <div key={k.label} className="rounded-2xl bg-white/80 p-4 ring-1 ring-[#E8A317]/25">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{k.label}</p>
              <p className="mt-1 font-display text-xl font-bold text-slate-900">{k.value}</p>
              <p className="mt-1 text-[11px] text-slate-600">{k.hint}</p>
            </div>
          ))}
        </div>
        {note && <p className="mt-3 rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-800 ring-1 ring-emerald-200">{note}</p>}
        {error && <p role="alert" className="mt-3 rounded-xl bg-rose-50 px-4 py-2.5 text-sm text-rose-800 ring-1 ring-rose-200">{error}</p>}
      </Panel>

      <Panel
        theme={theme}
        title="Cold storage owner onboarding & approval queue"
        icon={ShieldCheck}
        action={<Btn theme={theme} variant="soft" size="sm" icon={ClipboardList} href="/rental/dashboard?as=owner&tab=bizadmin">Owner onboarding & business admin</Btn>}
      >
        <p className="mb-4 text-sm text-slate-600">
          Every registered cold storage business. Approve, request information, suspend or reject —
          each decision is written to the immutable platform audit log. Open any owner's complete
          business dashboard in Authorized Oversight Mode; every action you take there is audit-logged too.
        </p>
        {(data.organizations ?? []).length === 0 ? (
          <EmptyState theme={theme} icon={Building2} title="No owner business registered yet" text="Cold storage owners register from the rental portal's Business admin tab; their application lands in this queue for your decision." />
        ) : (
          <ul className="space-y-4">
            {(data.organizations ?? []).map((org) => (
              <li key={org.id} className="rounded-2xl bg-white/80 p-4 ring-1 ring-slate-200">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-slate-900">{org.business_name}</h3>
                      <Badge tone={STATUS_TONE[org.onboarding_status] ?? 'slate'}>{STATUS_TEXT[org.onboarding_status] ?? org.onboarding_status}</Badge>
                      <Badge tone="slate">{org.organization_code}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">
                      {org.owner_full_name} · {org.owner_email} · {org.owner_phone} · {org.district}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {org.facilities_count} facilit{org.facilities_count === 1 ? 'y' : 'ies'} · {org.active_bookings_count} bookings · capacity {org.total_capacity_crates.toLocaleString('en-IN')} crates ({org.occupied_capacity_crates.toLocaleString('en-IN')} occupied)
                      {org.gstin_or_reg_no ? ` · GSTIN/Reg: ${org.gstin_or_reg_no}` : ''}
                      {org.pan_number ? ` · PAN: ${org.pan_number}` : ''}
                    </p>
                    {org.verification_notes && <p className="mt-1 text-xs text-slate-500">Verification notes: {org.verification_notes}</p>}
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <Btn theme={theme} variant="soft" size="sm" icon={Eye} href={`/rental/dashboard?oversightOrgId=${org.id}&oversight=1`}>
                      Inspect Owner Admin Portal (Authorized Oversight Mode)
                    </Btn>
                    {org.onboarding_status !== 'APPROVED_ACTIVE' && (
                      <Btn theme={theme} size="sm" icon={ThumbsUp} disabled={busyId === org.id} onClick={() => void review(org, 'APPROVED_ACTIVE', 'Approved by Platform Superadmin')}>
                        Approve
                      </Btn>
                    )}
                    {org.onboarding_status !== 'INFO_REQUESTED' && (
                      <Btn theme={theme} variant="soft" size="sm" icon={ClipboardList} disabled={busyId === org.id} onClick={() => void review(org, 'INFO_REQUESTED', 'Information requested by Platform Superadmin.')}>
                        Request info
                      </Btn>
                    )}
                    {org.onboarding_status !== 'SUSPENDED' && (
                      <Btn theme={theme} variant="soft" size="sm" icon={UserX} disabled={busyId === org.id} onClick={() => void review(org, 'SUSPENDED', 'Suspended by Platform Superadmin.')}>
                        Suspend
                      </Btn>
                    )}
                    {org.onboarding_status !== 'REJECTED' && (
                      <Btn theme={theme} variant="soft" size="sm" icon={XCircle} disabled={busyId === org.id} onClick={() => void review(org, 'REJECTED', 'Rejected by Platform Superadmin.')}>
                        Reject
                      </Btn>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel theme={theme} title="Global audit trail" icon={Snowflake}>
        {(data.auditLogs ?? []).length === 0 ? (
          <EmptyState theme={theme} icon={ClipboardList} title="No administrative actions logged yet" text="Every approval, staff change, financial entry and oversight inspection appears here, oldest actions last." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-3">When</th>
                  <th className="py-2 pr-3">Actor</th>
                  <th className="py-2 pr-3">Role</th>
                  <th className="py-2 pr-3">Category</th>
                  <th className="py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {(data.auditLogs ?? []).map((log) => (
                  <tr key={log.id} className="border-b border-slate-100 align-top">
                    <td className="py-2.5 pr-3 whitespace-nowrap text-slate-600">{when(log.created_at)}</td>
                    <td className="py-2.5 pr-3 text-slate-800">{log.actor_name}</td>
                    <td className="py-2.5 pr-3">
                      <Badge tone={log.is_superadmin_oversight_action ? 'amber' : 'slate'}>{log.actor_role}</Badge>
                    </td>
                    <td className="py-2.5 pr-3 text-xs text-slate-600">{log.action_category}</td>
                    <td className="py-2.5 text-slate-700">{log.action_summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
