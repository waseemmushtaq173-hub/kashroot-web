'use client';

/**
 * Admin portal — runs on the shared database only:
 *   Approvals:        agronomists / dealers who applied, staff roles,
 *                     farmers' reports of suspicious batches.
 *   Problems:         orders a buyer pressed "Report a problem" on.
 *   Platform numbers: real counts (kr_admin_stats) — sign-ups per portal,
 *                     orders, cold-store bookings, expert requests…
 *
 * Who may enter is decided by staff_roles (kr_make_admin / kr_grant_role),
 * and every query above is limited to admins in the database itself.
 */
import { useCallback, useEffect, useState } from 'react';
import { BarChart3, GraduationCap, PackageX } from 'lucide-react';

import { ApprovalsPanel } from '@/components/admin/ApprovalsPanel';
import { PlatformNumbers, loadAdminStats } from '@/components/admin/PlatformNumbers';
import { ReportedOrders, loadReportedOrders } from '@/components/admin/ReportedOrders';
import { PortalShell } from '@/components/layout/PortalShell';
import { supabase } from '@/lib/db/client';

type Tab = 'approvals' | 'problems' | 'numbers';

interface Counts {
  waiting: number;
  problems: number;
  accounts: number;
  accounts7d: number;
}

export default function AdminConsolePage() {
  const [tab, setTab] = useState<Tab>('approvals');
  const [counts, setCounts] = useState<Counts | null>(null);

  const load = useCallback(async () => {
    const [requests, problems, stats] = await Promise.all([
      supabase.from('role_requests').select('id').eq('status', 'pending'),
      loadReportedOrders().catch(() => []),
      loadAdminStats().catch(() => null),
    ]);
    setCounts({ waiting: requests.data?.length ?? 0, problems: problems.length, accounts: stats?.accounts ?? 0, accounts7d: stats?.accounts_7d ?? 0 });
  }, []);

  useEffect(() => {
    let live = true;
    const run = async () => {
      if (live) await load();
    };
    void run();
    return () => {
      live = false;
    };
  }, [load]);

  const n = (v?: number) => (counts ? String(v ?? 0) : '…');

  return (
    <PortalShell
      title="Governance console"
      description="Approve agronomists and dealers, help with reported orders, and see how KashRoot is being used."
      eyebrow="Platform admin"
      theme="admin"
      kpis={[
        { label: 'Waiting for approval', value: n(counts?.waiting), trend: 'Agronomists and dealers' },
        { label: 'Orders with a problem', value: n(counts?.problems), trend: 'Reported by buyers' },
        { label: 'Accounts', value: n(counts?.accounts), trend: counts ? `${counts.accounts7d} new this week` : 'Loading' },
      ]}
      tabs={[
        { id: 'approvals', label: 'Approvals', icon: GraduationCap, count: counts?.waiting || undefined },
        { id: 'problems', label: 'Problems', icon: PackageX, count: counts?.problems || undefined },
        { id: 'numbers', label: 'Platform numbers', icon: BarChart3 },
      ]}
      activeTab={tab}
      onTabChange={(id) => {
        setTab(id as Tab);
        void load();
      }}
    >
      {tab === 'approvals' && <ApprovalsPanel />}
      {tab === 'problems' && <ReportedOrders />}
      {tab === 'numbers' && <PlatformNumbers />}
    </PortalShell>
  );
}
