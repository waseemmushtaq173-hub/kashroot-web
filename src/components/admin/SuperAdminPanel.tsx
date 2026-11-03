'use client';

/**
 * Admin → Super Admin (20261113000000_super_admin.sql) — shown only to the
 * one Super Admin; the database checks it again for every call. An overview
 * of everything, the people (roles, two-step sign-in, identity check status —
 * never an Aadhaar number —, last sign-in, suspension), suspend / re-enable
 * with a reason the account owner sees, give / take Admin, an export (CSV,
 * made here; the export itself is recorded), and the audit log, which nobody
 * can change or delete.
 */
import { useCallback, useEffect, useState } from 'react';
import { Ban, Crown, Download, Hand, RotateCcw, ScrollText, Search, Settings, ShieldCheck, ShieldOff } from 'lucide-react';
import { toast } from 'sonner';

import { RefreshBtn } from '@/components/admin/RefreshBtn';
import { Badge, Btn, PORTAL_THEMES, Panel } from '@/components/portal/kit';
import { supabase } from '@/lib/db/client';

const theme = PORTAL_THEMES.admin ?? PORTAL_THEMES.expert;
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—');
const INPUT = 'min-h-11 w-full rounded-xl border-0 bg-white px-3 text-sm ring-1 ring-slate-300 focus:ring-2 focus:ring-sky-600';

interface Person {
  id: string;
  email: string | null;
  phone: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  portals: string[] | null;
  staff: string[];
  two_step: boolean;
  identity: string | null;
  suspended: boolean;
  suspended_reason: string | null;
}
interface AuditRow {
  id: number;
  at: string;
  actor_email: string | null;
  action: string;
  target: string | null;
  before: unknown;
  after: unknown;
  reason: string | null;
}

/** Is this signed-in session the Super Admin? (The database decides.) */
export async function isSuperAdmin(): Promise<boolean> {
  const { data, error } = await supabase.rpc('kr_is_super_admin');
  return !error && data === true;
}

const LABEL: Record<string, string> = {
  accounts: 'Accounts',
  accounts_7d: 'New this week',
  signed_in_7d: 'Signed in this week',
  suspended: 'Suspended',
  admins: 'Admins',
  two_step: 'With two-step sign-in',
  help_open: 'Help requests waiting',
  market_listings: 'Listings',
  market_orders: 'Orders',
  rental_listings: 'Cold stores and machines',
  rental_bookings: 'Bookings',
  cold_slot_bookings: 'Cold store places booked',
  identity_checks: 'Identity checks',
  consignments: 'Consignments',
  advisory_requests: 'Advisory requests',
};

function csv(rows: Person[]): string {
  const cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = ['email', 'phone', 'created', 'last sign-in', 'portals', 'staff roles', 'two-step sign-in', 'identity check', 'suspended', 'suspension reason'];
  return [head.map(cell).join(','), ...rows.map((p) => [p.email, p.phone, p.created_at, p.last_sign_in_at, (p.portals ?? []).join(' '), p.staff.join(' '), p.two_step ? 'yes' : 'no', p.identity ?? '', p.suspended ? 'yes' : 'no', p.suspended_reason ?? ''].map(cell).join(','))].join('\n');
}

export function SuperAdminPanel() {
  const [overview, setOverview] = useState<Record<string, number> | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // "Ask everyone to tap the box" (20261114000000_gate_tap.sql).
  const [tap, setTap] = useState<boolean | null>(null);

  const load = useCallback(async (q = '') => {
    const [o, p, a] = await Promise.all([
      supabase.rpc('kr_super_overview'),
      supabase.rpc('kr_super_people', { p_search: q, p_limit: 200 }),
      supabase.from('audit_log').select('id, at, actor_email, action, target, before, after, reason').order('at', { ascending: false }).limit(100),
    ]);
    setError(o.error ? 'Not available: run supabase/RUN_THIS_ONCE.sql (Setup check row 35), set yourself as Super Admin by SQL, then sign in again.' : null);
    setOverview((o.data as Record<string, number> | null) ?? null);
    setPeople(((p.data ?? []) as Person[]).map((x) => ({ ...x, portals: Array.isArray(x.portals) ? x.portals : [] })));
    setAudit((a.data ?? []) as AuditRow[]);
    const gate = (await fetch('/api/gate', { cache: 'no-store' }).then((r) => r.json()).catch(() => ({}))) as { tap?: boolean };
    setTap(Boolean(gate.tap));
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

  const act = async (id: string, work: () => Promise<{ error: { message: string } | null }>, done: string) => {
    setBusy(id);
    const { error: err } = await work();
    setBusy(null);
    if (err) return toast.error(err.message);
    toast.success(done);
    await load(search);
  };

  const suspend = (p: Person) => {
    const reason = window.prompt(`Suspend ${p.email ?? p.phone}? Write the reason — the account owner sees it.`);
    if (!reason || reason.trim().length < 3) return;
    void act(p.id, async () => supabase.rpc('kr_super_suspend', { p_user: p.id, p_reason: reason.trim() }), 'Suspended. Their sessions have ended.');
  };
  const reenable = (p: Person) => {
    const reason = window.prompt(`Re-enable ${p.email ?? p.phone}? A note for the audit log (optional).`) ?? '';
    void act(p.id, async () => supabase.rpc('kr_super_reenable', { p_user: p.id, p_reason: reason }), 'Re-enabled.');
  };
  const setAdmin = (p: Person, admin: boolean) => {
    if (!window.confirm(admin ? `Give Admin to ${p.email}? They will need two-step sign-in and an access code.` : `Take Admin from ${p.email}?`)) return;
    void act(p.id, async () => supabase.rpc('kr_super_set_admin', { p_user: p.id, p_admin: admin, p_reason: null }), admin ? 'Admin given.' : 'Admin taken away.');
  };
  const exportCsv = async () => {
    const file = new Blob([csv(people)], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(file);
    link.download = `kashroot-people-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    await supabase.rpc('kr_super_note_export', { p_what: `people${search ? ` matching "${search}"` : ''}`, p_rows: people.length });
    await load(search);
  };

  return (
    <div className="grid gap-4 lg:col-span-2" data-super-admin>
      <Panel theme={theme} title="Super Admin — everything" icon={Crown} action={<RefreshBtn onRefresh={() => load(search)} />}>
        {error && <p role="alert" className="text-sm text-amber-900">{error}</p>}
        {overview && (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-super-overview>
            {Object.entries(overview).map(([k, v]) => (
              <li key={k} className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
                <p className="text-xs text-slate-500">{LABEL[k] ?? k}</p>
                <p className="text-xl font-bold text-slate-900">{Number(v).toLocaleString('en-IN')}</p>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel theme={theme} title="Settings" icon={Settings}>
        <div className="flex flex-wrap items-start justify-between gap-3" data-gate-tap-setting>
          <div className="min-w-0 flex-1 text-sm text-slate-700">
            <p className="font-semibold text-slate-900">Ask everyone to tap the box</p>
            <p className="mt-1">
              <strong>Off (recommended):</strong> Cloudflare checks every sign-in, sign-up, reset and help form, and asks for a tap only when it is unsure — most people pass in a second or two. People always see its box go “Verifying…” → “Success!”.
            </p>
            <p className="mt-1">
              <strong>On:</strong> everyone also presses “Tap to confirm you’re human”. People notice it, but it is not a stronger proof — Cloudflare’s check, verified on KashRoot’s server, is the proof either way — and it costs a moment and a tap for farmers on small screens, slow phones and patchy data.
            </p>
          </div>
          <Btn
            theme={theme}
            variant={tap ? 'solid' : 'ghost'}
            icon={Hand}
            className="min-h-11"
            disabled={tap === null || busy === 'tap'}
            aria-pressed={Boolean(tap)}
            onClick={() => void act('tap', async () => supabase.rpc('kr_super_set_gate_tap', { p_on: !tap }), tap ? 'Off: Cloudflare decides when to ask for a tap.' : 'On: everyone taps to confirm.')}
          >
            {tap ? 'On — tap to switch off' : 'Off — tap to switch on'}
          </Btn>
        </div>
      </Panel>

      <Panel theme={theme} title="People" icon={Search}>
        <form
          className="mb-3 flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void load(search);
          }}
        >
          <label className="min-w-0 flex-1">
            <span className="sr-only">Search by email or phone</span>
            <input className={INPUT} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by email or phone" />
          </label>
          <Btn theme={theme} type="submit" icon={Search} className="min-h-11">Search</Btn>
          <Btn theme={theme} variant="ghost" icon={Download} className="min-h-11" onClick={() => void exportCsv()} disabled={!people.length}>
            Export CSV
          </Btn>
        </form>
        <ul className="space-y-2" data-super-people>
          {people.map((p) => (
            <li key={p.id} className="rounded-xl bg-white p-3 text-sm ring-1 ring-slate-200">
              <div className="flex flex-wrap items-center gap-2">
                <strong className="break-all text-slate-900">{p.email ?? p.phone ?? p.id}</strong>
                {p.staff.map((r) => <Badge key={r} tone="violet">{r}</Badge>)}
                {p.two_step ? <Badge tone="green">two-step on</Badge> : <Badge tone="slate">two-step off</Badge>}
                {p.identity && <Badge tone="blue">identity {p.identity}</Badge>}
                {p.suspended && <Badge tone="red">suspended</Badge>}
              </div>
              <p className="mt-1 text-xs text-slate-600">
                {(p.portals ?? []).join(', ') || 'no portal yet'} · joined {when(p.created_at)} · last sign-in {when(p.last_sign_in_at)}
                {p.suspended_reason && <> · reason: {p.suspended_reason}</>}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {p.suspended ? (
                  <Btn theme={theme} variant="ghost" icon={RotateCcw} className="min-h-11" disabled={busy === p.id} onClick={() => reenable(p)}>Re-enable</Btn>
                ) : (
                  <Btn theme={theme} variant="ghost" icon={Ban} className="min-h-11 text-rose-800" disabled={busy === p.id} onClick={() => suspend(p)}>Suspend</Btn>
                )}
                {p.staff.includes('ADMIN') ? (
                  <Btn theme={theme} variant="ghost" icon={ShieldOff} className="min-h-11" disabled={busy === p.id} onClick={() => setAdmin(p, false)}>Take Admin</Btn>
                ) : (
                  <Btn theme={theme} variant="ghost" icon={ShieldCheck} className="min-h-11" disabled={busy === p.id} onClick={() => setAdmin(p, true)}>Give Admin</Btn>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel theme={theme} title="Audit log (nobody can change or delete it)" icon={ScrollText}>
        <ul className="space-y-1 text-xs" data-audit-log>
          {audit.length === 0 && <li className="text-slate-500">Nothing yet.</li>}
          {audit.map((a) => (
            <li key={a.id} className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-slate-800">
              {when(a.at)} · <strong>{a.action}</strong> {a.target ? <>· {a.target}</> : null} · by {a.actor_email ?? '—'}
              {a.reason && <> · “{a.reason}”</>}
              {(a.before != null || a.after != null) && (
                <span className="text-slate-500"> · {JSON.stringify(a.before)} → {JSON.stringify(a.after)}</span>
              )}
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
