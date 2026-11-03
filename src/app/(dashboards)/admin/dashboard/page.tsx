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
 *   Official lists:   the Government lists of registered products that
 *                     KashRoot TrueScan checks labels against — import a
 *                     CSV (CIB&RC, FCO…), see counts, remove a list.
 *   Platform numbers: real counts (kr_admin_stats) — sign-ups per portal,
 *                     orders, cold-store bookings, expert requests…
 *   Setup check:      which database setup files have been run in Supabase
 *                     (kr_setup_status), and how to run a missing one.
 *
 * Who may enter: the Super Admin and the KashRoot team they add
 * (20261117000000_kashroot_team.sql). The page itself is served only with the
 * team pass (proxy.ts, lib/server/teamPass); each team member sees only the
 * tabs ticked for them (kr_team_sections), and every query above is checked
 * again in the database, section by section. The pass is renewed every 5
 * minutes while the page is open; when the database stops confirming it (the
 * Admin lock, removed from the team), the page closes.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { BarChart3, Building2, Crown, DatabaseZap, GraduationCap, LifeBuoy, ListChecks, LockKeyhole, PackageX, Settings, Snowflake, UserCog, Users, Wallet } from 'lucide-react';

import { AccountsPanel } from '@/components/admin/AccountsPanel';
import { AdminLock } from '@/components/admin/AdminLock';
import { ApprovalsPanel } from '@/components/admin/ApprovalsPanel';
import { ColdDirectoryPanel } from '@/components/admin/ColdDirectoryPanel';
import { ContributorsPanel } from '@/components/admin/ContributorsPanel';
import { HelpDeskPanel } from '@/components/admin/HelpDeskPanel';
import { PlatformNumbers, loadAdminStats } from '@/components/admin/PlatformNumbers';
import { RegistryPanel } from '@/components/admin/RegistryPanel';
import { ReportedOrders, loadReportedOrders } from '@/components/admin/ReportedOrders';
import { SecurityPanel } from '@/components/admin/SecurityPanel';
import { SetupCheckPanel } from '@/components/admin/SetupCheckPanel';
import { BusinessesPanel, GateSettingsPanel, SuperAdminPanel, TeamPanel } from '@/components/admin/SuperAdminPanel';
import { PortalShell } from '@/components/layout/PortalShell';
import { authFetch } from '@/lib/auth-fetch';
import { supabase } from '@/lib/db/client';

type Tab = 'super' | 'approvals' | 'accounts' | 'problems' | 'help' | 'contributors' | 'coldstores' | 'registry' | 'numbers' | 'security' | 'setup' | 'team' | 'businesses' | 'settings';

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

/** The team pass is renewed this often while the page is open (it lasts 15 minutes). */
const RENEW_MS = 5 * 60_000;

function AdminConsole() {
  // What the database lets this person open: ['*'] for the Super Admin, the ticked sections for a team member.
  const [sections, setSections] = useState<string[] | null>(null);
  useEffect(() => {
    let live = true;
    void supabase.rpc('kr_team_sections').then(({ data }) => live && setSections(Array.isArray(data) ? (data as string[]) : []));
    const renew = window.setInterval(() => {
      void authFetch('/api/team/session', { method: 'POST' }).then((r) => {
        if (r.status === 403 || r.status === 401) window.location.replace('/team/unlock?next=/admin/dashboard');
      });
    }, RENEW_MS);
    return () => {
      live = false;
      window.clearInterval(renew);
    };
  }, []);
  if (sections === null) return null;
  if (sections.length === 0) return <NothingTicked />;
  return <Console sections={sections} />;
}

function NothingTicked() {
  return (
    <PortalShell title="Governance console" description="" eyebrow="Platform admin" theme="admin">
      <p className="rounded-xl bg-slate-50 p-4 text-slate-700 ring-1 ring-slate-200 lg:col-span-2">Nothing is ticked for you yet. The Super Admin chooses what each team member sees.</p>
    </PortalShell>
  );
}

interface TabInfo {
  id: Tab;
  label: string;
  icon: typeof Crown;
  section: string;
}

function Console({ sections }: { sections: string[] }) {
  const superAdmin = sections.includes('*');
  const can = useCallback((section: string) => sections.includes('*') || sections.includes(section), [sections]);
  const allTabs = ([
    { id: 'approvals', label: 'Approvals', icon: GraduationCap, section: 'approvals' },
    { id: 'accounts', label: 'Accounts', icon: Users, section: 'accounts' },
    { id: 'problems', label: 'Problems', icon: PackageX, section: 'problems' },
    { id: 'help', label: 'Help desk', icon: LifeBuoy, section: 'help' },
    { id: 'contributors', label: 'Contributors', icon: Wallet, section: 'contributors' },
    { id: 'coldstores', label: 'Cold stores', icon: Snowflake, section: 'coldstores' },
    { id: 'registry', label: 'Official lists', icon: ListChecks, section: 'registry' },
    { id: 'numbers', label: 'Platform numbers', icon: BarChart3, section: 'numbers' },
    { id: 'security', label: 'Security', icon: LockKeyhole, section: 'security' },
    { id: 'setup', label: 'Setup check', icon: DatabaseZap, section: 'setup' },
    // The Super Admin has these inside the Super Admin tab; a team member gets them on their own when ticked.
    ...(superAdmin
      ? []
      : ([
          { id: 'team', label: 'Team', icon: UserCog, section: 'team' },
          { id: 'businesses', label: 'Businesses', icon: Building2, section: 'businesses' },
          { id: 'settings', label: 'Settings', icon: Settings, section: 'settings' },
        ] as TabInfo[])),
  ] as TabInfo[]).filter((t) => can(t.section));
  const [tab, setTab] = useState<Tab>(superAdmin ? 'approvals' : (allTabs[0]?.id ?? 'approvals'));
  // Becomes true once the admin picks a tab, so loading never switches it.
  const opened = useRef(false);
  const [counts, setCounts] = useState<Counts | null>(null);

  const load = useCallback(async () => {
    // Only what this person may open (the database refuses the rest anyway).
    const [requests, problems, stats, accounts] = await Promise.all([
      can('approvals') ? supabase.from('role_requests').select('id').eq('status', 'pending') : Promise.resolve({ data: null }),
      can('problems') ? loadReportedOrders().catch(() => []) : Promise.resolve([]),
      can('numbers') ? loadAdminStats().catch(() => null) : Promise.resolve(null),
      can('accounts') ? supabase.rpc('kr_admin_accounts') : Promise.resolve({ data: null, error: { message: 'not ticked' } }),
    ]);
    const now = Date.now();
    const signedIn = accounts.error ? null : ((accounts.data ?? []) as { last_sign_in_at: string | null; last_active_at?: string | null }[]).filter((a) => {
      const t = a.last_active_at ?? a.last_sign_in_at;
      return t && now - Date.parse(t) < 7 * 86_400_000;
    }).length;
    setCounts({ waiting: requests.data?.length ?? 0, problems: problems.length, accounts: stats?.accounts ?? 0, accounts7d: stats?.accounts_7d ?? 0, active7d: signedIn });
    // Nothing waiting for approval: open on the list of accounts.
    if (!requests.data?.length && can('accounts')) setTab((t) => (t === 'approvals' && !opened.current ? 'accounts' : t));
  }, [can]);

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
        ...(can('approvals') ? [{ label: 'Waiting for approval', value: n(counts?.waiting), trend: 'Agronomists, dealers, Mandi Helpers', onClick: () => show('approvals') }] : []),
        ...(can('problems') ? [{ label: 'Orders with a problem', value: n(counts?.problems), trend: 'Reported by buyers', onClick: () => show('problems') }] : []),
        ...(can('accounts') && can('numbers')
          ? [
              {
                label: 'Accounts',
                value: n(counts?.accounts),
                trend: counts ? `${counts.accounts7d} new this week${counts.active7d !== null ? ` · ${counts.active7d} active this week` : ''} — tap to see who` : 'Loading',
                onClick: () => show('accounts'),
              },
            ]
          : []),
      ]}
      tabs={[
        // The one Super Admin only (the database checks it again for every call).
        ...(superAdmin ? [{ id: 'super', label: 'Super Admin', icon: Crown }] : []),
        ...allTabs.map((t) => ({
          id: t.id,
          label: t.label,
          icon: t.icon,
          count: t.id === 'approvals' ? counts?.waiting || undefined : t.id === 'accounts' ? counts?.accounts || undefined : t.id === 'problems' ? counts?.problems || undefined : undefined,
        })),
      ]}
      activeTab={tab}
      onTabChange={(id) => show(id as Tab)}
    >
      {tab === 'super' && superAdmin && <SuperAdminPanel />}
      {tab === 'approvals' && can('approvals') && <ApprovalsPanel />}
      {tab === 'accounts' && can('accounts') && <AccountsPanel onRefreshed={load} />}
      {tab === 'problems' && can('problems') && <ReportedOrders />}
      {tab === 'help' && can('help') && <HelpDeskPanel />}
      {tab === 'contributors' && can('contributors') && <ContributorsPanel />}
      {tab === 'coldstores' && can('coldstores') && <ColdDirectoryPanel />}
      {tab === 'registry' && can('registry') && <RegistryPanel />}
      {tab === 'numbers' && can('numbers') && <PlatformNumbers onRefreshed={load} />}
      {tab === 'security' && can('security') && <SecurityPanel />}
      {tab === 'setup' && can('setup') && <SetupCheckPanel />}
      {tab === 'team' && can('team') && !superAdmin && <TeamPanel />}
      {tab === 'businesses' && can('businesses') && !superAdmin && <BusinessesPanel />}
      {tab === 'settings' && can('settings') && !superAdmin && <GateSettingsPanel />}
    </PortalShell>
  );
}
