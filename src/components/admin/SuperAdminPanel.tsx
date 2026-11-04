'use client';

/**
 * Admin → Super Admin (20261113000000_super_admin.sql) — shown only to the
 * one Super Admin; the database checks it again for every call. An overview
 * of everything, the KashRoot team (20261117000000_kashroot_team.sql: add
 * people to the team, tick exactly the sections each one sees, remove them —
 * every change audited and emailed to the support inbox), the people (roles,
 * two-step sign-in, identity check status — never an Aadhaar number —, last
 * sign-in, suspension), suspend / re-enable with a reason the account owner
 * sees, an export (CSV, made here; the export itself is recorded), and the
 * audit log, which nobody can change or delete. Businesses
 * (20261115000000_business_consoles.sql): every one, its owners and size,
 * suspend / re-enable with a reason its people see.
 *
 * TeamPanel, BusinessesPanel and GateSettingsPanel are also shown on their
 * own to a team member who has that section ticked (read only for Team and
 * Businesses; the database allows nothing more).
 */
import { useCallback, useEffect, useState } from 'react';
import { Ban, Building2, Crown, Download, Hand, RotateCcw, Save, ScrollText, Search, Settings, ShieldAlert, Trash2, UserPlus, Users } from 'lucide-react';
import { toast } from 'sonner';

import { RefreshBtn } from '@/components/admin/RefreshBtn';
import { Badge, Btn, PORTAL_THEMES, Panel } from '@/components/portal/kit';
import { supabase } from '@/lib/db/client';

const theme = PORTAL_THEMES.admin ?? PORTAL_THEMES.expert;
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—');
const INPUT = 'min-h-11 w-full rounded-xl border-0 bg-white px-3 text-sm ring-1 ring-slate-300 focus:ring-2 focus:ring-emerald-700';

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
interface Business {
  id: string;
  name: string;
  kind: string;
  created_at: string;
  members: number;
  owners: string[];
  suspended: boolean;
  suspended_reason: string | null;
  has_payout: boolean;
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
interface Member {
  user_id: string;
  email: string | null;
  sections: string[];
  two_step: boolean;
  last_sign_in_at: string | null;
  added_at: string;
  added_by: string | null;
  is_super: boolean;
}

/** The Admin sections the Super Admin can tick for a team member (20261117000000_kashroot_team.sql). */
export const TEAM_SECTIONS: { id: string; label: string }[] = [
  { id: 'help', label: 'Help desk' },
  { id: 'approvals', label: 'Approvals and KYC review' },
  { id: 'accounts', label: 'Accounts' },
  { id: 'problems', label: 'Problems (reported orders)' },
  { id: 'contributors', label: 'Contributors and mandi rates' },
  { id: 'coldstores', label: 'Cold stores directory' },
  { id: 'registry', label: 'Official lists' },
  { id: 'numbers', label: 'Platform numbers' },
  { id: 'security', label: 'Security log' },
  { id: 'setup', label: 'Setup check and email' },
  { id: 'businesses', label: 'Businesses (read only)' },
  { id: 'team', label: 'Team list (read only)' },
  { id: 'settings', label: 'Settings' },
];

/** Is this signed-in session the Super Admin? (The database decides.) */
export async function isSuperAdmin(): Promise<boolean> {
  const { data, error } = await supabase.rpc('kr_is_super_admin');
  return !error && data === true;
}

/** Send the team-change email now rather than with the next one. */
const sendQueuedEmail = () => void fetch('/api/email/flush', { method: 'POST' }).catch(() => undefined);

const LABEL: Record<string, string> = {
  accounts: 'Accounts',
  accounts_7d: 'New this week',
  signed_in_7d: 'Signed in this week',
  suspended: 'Suspended',
  admins: 'KashRoot team (incl. you)',
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

      <TeamPanel manage onChanged={() => void load(search)} />

      <GateSettingsPanel />

      <Panel theme={theme} title="People" icon={Search}>
        <p className="mb-2 text-sm text-slate-600">
          Everyone with a KashRoot account. To let one of your own staff into Admin, use <strong>Team → Add to my KashRoot team</strong> above. Dealers, businesses, farmers and buyers never get Admin: a business&apos;s people are given access to <em>that business&apos;s console</em> by its owner, in My business.
        </p>
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
                {p.staff.map((r) => <Badge key={r} tone="violet">{r === 'ADMIN' ? 'KashRoot team' : r}</Badge>)}
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
              </div>
            </li>
          ))}
        </ul>
      </Panel>

      <BusinessesPanel canSuspend />

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

/**
 * The KashRoot team: who has Admin, what each one sees. `manage` (the Super
 * Admin): add, tick, remove — the database allows it to nobody else.
 */
export function TeamPanel({ manage = false, onChanged }: { manage?: boolean; onChanged?: () => void }) {
  const [team, setTeam] = useState<Member[] | null>(null);
  const [ticks, setTicks] = useState<Record<string, string[]>>({});
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('kr_super_team');
    const list = error ? null : ((data ?? []) as Member[]);
    setTeam(list);
    setTicks(Object.fromEntries((list ?? []).map((m) => [m.user_id, m.sections])));
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

  const act = async (key: string, work: () => PromiseLike<{ error: { message: string } | null }>, done: string) => {
    setBusy(key);
    const { error } = await work();
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success(done);
    sendQueuedEmail();
    await load();
    onChanged?.();
  };

  const add = () => {
    const who = email.trim();
    if (!who) return;
    if (
      !window.confirm(
        `Add ${who} to your KashRoot team?\n\nThis is for your OWN KashRoot staff only. They will be able to open the Admin portal and see the sections you tick for them (none until you tick). Never use this for a dealer, a business, a farmer or a buyer — to let someone into a business, its owner uses My business → Give access to this business.`,
      )
    )
      return;
    void act('add', () => supabase.rpc('kr_super_team_add', { p_email: who }), `${who} is in the KashRoot team. Tick what they may see, then Save.`).then(() => setEmail(''));
  };
  const toggle = (id: string, section: string) =>
    setTicks((t) => ({ ...t, [id]: (t[id] ?? []).includes(section) ? (t[id] ?? []).filter((s) => s !== section) : [...(t[id] ?? []), section] }));

  return (
    <Panel theme={theme} title="KashRoot team (Admin access)" icon={Users} action={<RefreshBtn onRefresh={load} />}>
      {team === null ? (
        <p className="text-sm text-amber-900">Not available yet: run supabase/RUN_THIS_ONCE.sql (Setup check row 39).</p>
      ) : (
        <div className="grid gap-3" data-team>
          <p className="text-sm text-slate-700">
            Only the people listed here can open Admin, and each one sees only what is ticked — after two-step sign-in and their admin code. Everyone else (dealers, businesses, farmers, buyers) never sees Admin.
          </p>
          {manage && (
            <form
              className="rounded-xl bg-amber-50 p-3 ring-1 ring-amber-200"
              onSubmit={(e) => {
                e.preventDefault();
                add();
              }}
            >
              <p className="flex items-center gap-2 text-sm font-semibold text-amber-950"><ShieldAlert className="h-4 w-4" aria-hidden /> Add to my KashRoot team — your own staff only</p>
              <p className="mt-1 text-xs text-amber-900">They will see the Admin sections you tick. For a business&apos;s people, the business owner uses My business → Give access to this business instead.</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <label className="min-w-0 flex-1">
                  <span className="sr-only">Email of their KashRoot account</span>
                  <input className={INPUT} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email of their KashRoot account" autoComplete="off" />
                </label>
                <Btn theme={theme} type="submit" icon={UserPlus} className="min-h-11" disabled={busy !== null || !email.trim()}>Add to my KashRoot team</Btn>
              </div>
            </form>
          )}
          <ul className="space-y-2">
            {team.map((m) => (
              <li key={m.user_id} className="rounded-xl bg-white p-3 text-sm ring-1 ring-slate-200" data-team-member>
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="break-all text-slate-900">{m.email ?? m.user_id}</strong>
                  {m.is_super ? <Badge tone="violet">Super Admin — sees everything</Badge> : m.sections.length === 0 ? <Badge tone="slate">nothing ticked</Badge> : null}
                  {m.two_step ? <Badge tone="green">two-step on</Badge> : <Badge tone="red">two-step off</Badge>}
                </div>
                <p className="mt-1 text-xs text-slate-600">
                  added {when(m.added_at)}{m.added_by ? ` by ${m.added_by}` : ''} · last sign-in {when(m.last_sign_in_at)}
                </p>
                {!m.is_super && (
                  <>
                    <fieldset className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2" disabled={!manage || busy !== null}>
                      <legend className="sr-only">What {m.email} may see</legend>
                      {TEAM_SECTIONS.map((s) => (
                        <label key={s.id} className="flex min-h-11 items-center gap-2 rounded-lg px-2 hover:bg-slate-50">
                          <input type="checkbox" className="h-5 w-5" checked={(ticks[m.user_id] ?? []).includes(s.id)} onChange={() => toggle(m.user_id, s.id)} />
                          <span>{s.label}</span>
                        </label>
                      ))}
                    </fieldset>
                    {manage && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Btn theme={theme} icon={Save} className="min-h-11" disabled={busy !== null} onClick={() => void act(m.user_id, () => supabase.rpc('kr_super_team_set', { p_user: m.user_id, p_sections: ticks[m.user_id] ?? [] }), 'Saved.')}>
                          Save what they see
                        </Btn>
                        <Btn
                          theme={theme}
                          variant="ghost"
                          icon={Trash2}
                          className="min-h-11 text-rose-800"
                          disabled={busy !== null}
                          onClick={() => window.confirm(`Remove ${m.email} from the KashRoot team? They lose all Admin access at once.`) && void act(m.user_id, () => supabase.rpc('kr_super_team_remove', { p_user: m.user_id }), 'Removed from the team.')}
                        >
                          Remove from the team
                        </Btn>
                      </div>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
          <p className="text-xs text-slate-500">Every change is in the audit log and emailed to the support inbox.</p>
        </div>
      )}
    </Panel>
  );
}

/** Every business; `canSuspend` (the Super Admin) adds Suspend / Re-enable. */
export function BusinessesPanel({ canSuspend = false }: { canSuspend?: boolean }) {
  const [businesses, setBusinesses] = useState<Business[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(async () => {
    const b = await supabase.rpc('kr_super_orgs');
    // null: the businesses migration is not run yet (Setup check row 37).
    setBusinesses(b.error ? null : ((b.data ?? []) as Business[]));
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

  const suspendBusiness = async (b: Business, on: boolean) => {
    const reason = on
      ? window.prompt(`Suspend the business “${b.name}”? Write the reason — its people see it. Nothing in it can change until you re-enable it.`)
      : (window.prompt(`Re-enable “${b.name}”? A note for the audit log (optional).`) ?? '');
    if (on && (!reason || reason.trim().length < 3)) return;
    setBusy(b.id);
    const { error } = await supabase.rpc('kr_super_suspend_org', { p_org: b.id, p_reason: (reason ?? '').trim(), p_suspend: on });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success(on ? 'Business suspended.' : 'Business re-enabled.');
    await load();
  };

  return (
    <Panel theme={theme} title="Businesses" icon={Building2} action={<RefreshBtn onRefresh={load} />}>
      {businesses === null ? (
        <p className="text-sm text-amber-900">Not available yet: run supabase/RUN_THIS_ONCE.sql (Setup check row 37).</p>
      ) : (
        <ul className="space-y-2" data-super-businesses>
          {businesses.length === 0 && <li className="text-sm text-slate-500">No businesses yet.</li>}
          {businesses.map((b) => (
            <li key={b.id} className="rounded-xl bg-white p-3 text-sm ring-1 ring-slate-200">
              <div className="flex flex-wrap items-center gap-2">
                <strong className="text-slate-900">{b.name}</strong>
                <Badge tone="slate">{b.kind.replace('_', ' ')}</Badge>
                {b.has_payout ? <Badge tone="green">bank / UPI set</Badge> : <Badge tone="slate">no bank / UPI</Badge>}
                {b.suspended && <Badge tone="red">suspended</Badge>}
              </div>
              <p className="mt-1 break-all text-xs text-slate-600">
                {b.members} {b.members === 1 ? 'person' : 'people'} · owner {b.owners.join(', ') || '—'} · since {when(b.created_at)}
                {b.suspended_reason && <> · reason: {b.suspended_reason}</>}
              </p>
              {canSuspend && (
                <div className="mt-2">
                  {b.suspended ? (
                    <Btn theme={theme} variant="ghost" icon={RotateCcw} className="min-h-11" disabled={busy === b.id} onClick={() => void suspendBusiness(b, false)}>Re-enable</Btn>
                  ) : (
                    <Btn theme={theme} variant="ghost" icon={Ban} className="min-h-11 text-rose-800" disabled={busy === b.id} onClick={() => void suspendBusiness(b, true)}>Suspend</Btn>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/** Settings: "Ask everyone to tap the box" (20261114000000_gate_tap.sql). */
export function GateSettingsPanel() {
  const [tap, setTap] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
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
  const flip = async () => {
    setBusy(true);
    const { error } = await supabase.rpc('kr_super_set_gate_tap', { p_on: !tap });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(tap ? 'Off: Cloudflare decides when to ask for a tap.' : 'On: everyone taps to confirm.');
    await load();
  };
  return (
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
        <Btn theme={theme} variant={tap ? 'solid' : 'ghost'} icon={Hand} className="min-h-11" disabled={tap === null || busy} aria-pressed={Boolean(tap)} onClick={() => void flip()}>
          {tap ? 'On — tap to switch off' : 'Off — tap to switch on'}
        </Btn>
      </div>
    </Panel>
  );
}
