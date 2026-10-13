'use client';

/**
 * Admin portal — runs on the shared database only:
 *   Approvals:        agronomists / dealers who applied, staff roles,
 *                     farmers' reports of suspicious batches.
 *   Accounts:         everyone with an account — who, which portal, joined,
 *                     last signed in, verified (kr_admin_accounts).
 *   Problems:         orders a buyer pressed "Report a problem" on.
 *   Contributors:     mandi rates and expert answers to check, pay per
 *                     accepted contribution, who is owed and "Mark paid".
 *   Security:         admin code, identity-check (KYC) rules, protections.
 *   Platform numbers: real counts (kr_admin_stats) — sign-ups per portal,
 *                     orders, cold-store bookings, expert requests…
 *
 * Who may enter is decided by staff_roles (kr_make_admin / kr_grant_role),
 * and every query above is limited to admins in the database itself.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { BarChart3, GraduationCap, LockKeyhole, PackageX, Users, Wallet } from 'lucide-react';

import { AccountsPanel } from '@/components/admin/AccountsPanel';
import { AdminLock } from '@/components/admin/AdminLock';
import { ApprovalsPanel } from '@/components/admin/ApprovalsPanel';
import { ContributorsPanel } from '@/components/admin/ContributorsPanel';
import { PlatformNumbers, loadAdminStats } from '@/components/admin/PlatformNumbers';
import { ReportedOrders, loadReportedOrders } from '@/components/admin/ReportedOrders';
import { SecurityPanel } from '@/components/admin/SecurityPanel';
import { PortalShell } from '@/components/layout/PortalShell';
import { supabase } from '@/lib/db/client';

type Tab = 'approvals' | 'accounts' | 'problems' | 'contributors' | 'numbers' | 'security';

interface Counts {
  waiting: number;
  problems: number;
  accounts: number;
  accounts7d: number;
  /** Accounts used during the last 7 days (null if unknown). */
  active7d: number | null;
}

export default function AdminConsolePage() {
  // Signed in is not enough: the admin's own code opens the console.
  return (
    <AdminLock>
      <AdminConsole />
    </AdminLock>
  );
}

function AdminConsole() {
  const [tab, setTab] = useState<Tab>('approvals');
  // Becomes true once the admin picks a tab, so loading never switches it.
  const opened = useRef(false);
  const [counts, setCounts] = useState<Counts | null>(null);

  const load = useCallback(async () => {
    const [requests, problems, stats, accounts] = await Promise.all([
      supabase.from('role_requests').select('id').eq('status', 'pending'),
      loadReportedOrders().catch(() => []),
      loadAdminStats().catch(() => null),
      supabase.rpc('kr_admin_accounts'),
    ]);
    const now = Date.now();
    const signedIn = accounts.error ? null : ((accounts.data ?? []) as { last_sign_in_at: string | null; last_active_at?: string | null }[]).filter((a) => {
      const t = a.last_active_at ?? a.last_sign_in_at;
      return t && now - Date.parse(t) < 7 * 86_400_000;
    }).length;
    setCounts({ waiting: requests.data?.length ?? 0, problems: problems.length, accounts: stats?.accounts ?? 0, accounts7d: stats?.accounts_7d ?? 0, active7d: signedIn });
    // Nothing waiting for approval: open on the list of accounts.
    if (!requests.data?.length) setTab((t) => (t === 'approvals' && !opened.current ? 'accounts' : t));
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
  const show = (id: Tab) => {
    opened.current = true;
    setTab(id);
    void load();
    // On a phone the tab content is below the cards: bring it into view.
    window.setTimeout(() => document.querySelector('nav[aria-label$="sections"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  return (
    <PortalShell
      title="Governance console"
      description="Approve agronomists, dealers and Mandi Helpers, help with reported orders, and see how KashRoot is being used."
      eyebrow="Platform admin"
      theme="admin"
      kpis={[
        { label: 'Waiting for approval', value: n(counts?.waiting), trend: 'Agronomists, dealers, Mandi Helpers', onClick: () => show('approvals') },
        { label: 'Orders with a problem', value: n(counts?.problems), trend: 'Reported by buyers', onClick: () => show('problems') },
        {
          label: 'Accounts',
          value: n(counts?.accounts),
          trend: counts ? `${counts.accounts7d} new this week${counts.active7d !== null ? ` · ${counts.active7d} active this week` : ''} — tap to see who` : 'Loading',
          onClick: () => show('accounts'),
        },
      ]}
      tabs={[
        { id: 'approvals', label: 'Approvals', icon: GraduationCap, count: counts?.waiting || undefined },
        { id: 'accounts', label: 'Accounts', icon: Users, count: counts?.accounts || undefined },
        { id: 'problems', label: 'Problems', icon: PackageX, count: counts?.problems || undefined },
        { id: 'contributors', label: 'Contributors', icon: Wallet },
        { id: 'numbers', label: 'Platform numbers', icon: BarChart3 },
        { id: 'security', label: 'Security', icon: LockKeyhole },
      ]}
      activeTab={tab}
      onTabChange={(id) => show(id as Tab)}
    >
      {tab === 'approvals' && <ApprovalsPanel />}
      {tab === 'accounts' && <AccountsPanel onRefreshed={load} />}
      {tab === 'problems' && <ReportedOrders />}
      {tab === 'contributors' && <ContributorsPanel />}
      {tab === 'numbers' && <PlatformNumbers onRefreshed={load} />}
      {tab === 'security' && <SecurityPanel />}
    </PortalShell>
  );
}
