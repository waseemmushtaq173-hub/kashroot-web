'use client';

/**
 * Admin → Accounts: everyone who has a KashRoot account (kr_admin_accounts,
 * admins only) — name, email, mobile, the kind of account and the portals
 * they filled in, staff roles, district, when they joined and last signed
 * in, and whether the email and Aadhaar / PAN are verified. Search, filter
 * and download as a spreadsheet (CSV). Passwords are never read.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Download, Loader2, Phone, Search, Users } from 'lucide-react';

import { RefreshBtn } from '@/components/admin/RefreshBtn';
import { Badge, Btn, EmptyState, INPUT, PORTAL_THEMES, Panel } from '@/components/portal/kit';
import { ago, dbMessage, supabase } from '@/lib/db/client';

const theme = PORTAL_THEMES.admin ?? PORTAL_THEMES.expert;

interface AccountRow {
  user_id: string;
  email: string;
  full_name: string;
  phone: string;
  roles: string[];
  portals: string[];
  staff: string[];
  district: string;
  joined_at: string;
  last_sign_in_at: string | null;
  email_confirmed: boolean;
  aadhaar_verified: boolean;
  pan_verified: boolean;
  /** Newest of last sign-in and the app renewing its sign-in while used (null before the 20261018 SQL). */
  last_active_at?: string | null;
}

const KIND: Record<string, string> = { FARMER: 'Farmer', BUYER: 'Buyer', SELLER: 'Seller', PROVIDER: 'Rental / logistics', ADMIN: 'Admin', EXPERT: 'Agronomist', DEALER: 'Agro-dealer', REPORTER: 'Mandi Helper' };
const label = (r: string) => KIND[r] ?? r.charAt(0).toUpperCase() + r.slice(1).toLowerCase();
/** When they last used KashRoot: staying signed in renews the session, not the sign-in. */
const lastSeen = (r: AccountRow) => r.last_active_at ?? r.last_sign_in_at;
const date = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

function toCsv(rows: AccountRow[]) {
  const cell = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const head = ['Name', 'Email', 'Mobile', 'Account', 'Portals', 'Staff', 'District', 'Joined', 'Last active', 'Last sign-in', 'Email confirmed', 'Aadhaar verified', 'PAN verified'];
  const body = rows.map((r) =>
    [r.full_name, r.email, r.phone, r.roles.map(label).join(' / '), r.portals.join(' / '), r.staff.map(label).join(' / '), r.district, r.joined_at.slice(0, 10), lastSeen(r)?.slice(0, 16).replace('T', ' ') ?? 'never', r.last_sign_in_at?.slice(0, 16).replace('T', ' ') ?? 'never', r.email_confirmed ? 'yes' : 'no', r.aadhaar_verified ? 'yes' : 'no', r.pan_verified ? 'yes' : 'no'].map(cell).join(','),
  );
  return [head.map(cell).join(','), ...body].join('\r\n');
}

/** onRefreshed: also update the console's counts when Refresh is pressed. */
export function AccountsPanel({ onRefreshed }: { onRefreshed?: () => Promise<unknown> } = {}) {
  const [rows, setRows] = useState<AccountRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('all');
  const [when, setWhen] = useState<'any' | 'week' | 'never'>('any');
  const [loadedAt, setLoadedAt] = useState(0);

  const load = useCallback(async () => {
    const { data, error: e } = await supabase.rpc('kr_admin_accounts');
    if (e) {
      setError(/kr_admin_accounts|schema cache|does not exist/i.test(e.message ?? '') ? 'Run the accounts SQL file (20261016000000_admin_accounts.sql) in Supabase first.' : dbMessage(e, 'Could not load the accounts.'));
      setRows([]);
      return false;
    }
    setError(null);
    setLoadedAt(Date.now());
    setRows((data ?? []) as AccountRow[]);
    return true;
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

  const active = useCallback((r: AccountRow) => { const t = lastSeen(r); return Boolean(t && loadedAt - Date.parse(t) < 7 * 86_400_000); }, [loadedAt]);
  const kinds = useMemo(() => [...new Set((rows ?? []).flatMap((r) => [...r.roles, ...r.staff]))].sort(), [rows]);
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (rows ?? []).filter(
      (r) =>
        (kind === 'all' || r.roles.includes(kind) || r.staff.includes(kind)) &&
        (when === 'any' || (when === 'never' ? !lastSeen(r) : active(r))) &&
        (!t || `${r.full_name} ${r.email} ${r.phone} ${r.district}`.toLowerCase().includes(t)),
    );
  }, [rows, q, kind, when, active]);
  const active7d = (rows ?? []).filter(active).length;

  const download = () => {
    const url = URL.createObjectURL(new Blob(['﻿' + toCsv(shown)], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `kashroot-accounts-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Panel
      theme={theme}
      title={rows ? `Accounts (${rows.length})` : 'Accounts'}
      icon={Users}
      action={
        <div className="flex flex-wrap gap-2">
          <RefreshBtn
            onRefresh={async () => {
              const [loaded] = await Promise.all([load(), onRefreshed?.()]);
              if (!loaded) throw new Error('not loaded');
            }}
          />
          <Btn theme={theme} size="sm" variant="soft" icon={Download} disabled={!shown.length} onClick={download}>Download (CSV)</Btn>
        </div>
      }
    >
      {rows === null ? (
        <p className="flex items-center gap-2 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading accounts…</p>
      ) : error ? (
        <p role="alert" className="text-sm text-amber-900">{error}</p>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">{active7d} used KashRoot in the last 7 days. Newest activity first.</p>
          <div className="flex flex-wrap gap-2">
            <label className="relative min-w-[14rem] flex-1">
              <span className="sr-only">Search accounts</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
              <input className={`${INPUT} pl-9`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, mobile or district" />
            </label>
            <label>
              <span className="sr-only">Kind of account</span>
              <select className={INPUT} value={kind} onChange={(e) => setKind(e.target.value)}>
                <option value="all">All kinds</option>
                {kinds.map((k) => <option key={k} value={k}>{label(k)}</option>)}
              </select>
            </label>
            <label>
              <span className="sr-only">Last active</span>
              <select className={INPUT} value={when} onChange={(e) => setWhen(e.target.value as 'any' | 'week' | 'never')}>
                <option value="any">Any time</option>
                <option value="week">Active this week</option>
                <option value="never">Never used</option>
              </select>
            </label>
          </div>
          {shown.length === 0 ? (
            <EmptyState theme={theme} icon={Users} title={rows.length ? 'No account matches' : 'No accounts yet'} text={rows.length ? 'Try another name or kind.' : 'People who create an account on any portal appear here.'} />
          ) : (
            <ul className="divide-y divide-slate-200 rounded-2xl ring-1 ring-slate-200">
              {shown.map((r) => {
                const tel = r.phone.replace(/\D/g, '').slice(-10);
                return (
                  <li key={r.user_id} className="grid gap-2 px-4 py-3 text-sm sm:grid-cols-[1fr_auto]">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-slate-900">{r.full_name || r.email.split('@')[0]}</span>
                        {r.roles.map((k) => <Badge key={k} tone="blue">{label(k)}</Badge>)}
                        {r.staff.map((k) => <Badge key={`s-${k}`} tone="violet">{label(k)}</Badge>)}
                        {r.aadhaar_verified && <Badge tone="green">Aadhaar ✓</Badge>}
                        {r.pan_verified && <Badge tone="green">PAN ✓</Badge>}
                      </p>
                      <p className="mt-0.5 truncate text-slate-600">
                        {r.email}
                        {r.email_confirmed && <CheckCircle2 className="ml-1 inline h-3.5 w-3.5 text-emerald-600" aria-label="email confirmed" />}
                        {r.district ? ` · ${r.district}` : ''}
                        {r.portals.length ? ` · details in: ${r.portals.join(', ')}` : ''}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 sm:justify-end sm:text-right">
                      <span>Joined {date(r.joined_at)}</span>
                      <span className={lastSeen(r) ? 'font-semibold text-slate-800' : ''}>{lastSeen(r) ? `Active ${ago(lastSeen(r)!)}` : 'Not signed in yet'}</span>
                      {/^[6-9]\d{9}$/.test(tel) && (
                        <a href={`tel:+91${tel}`} className="inline-flex items-center gap-1 font-semibold text-indigo-700 no-underline hover:underline">
                          <Phone className="h-3.5 w-3.5" aria-hidden /> {tel}
                        </a>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </Panel>
  );
}
