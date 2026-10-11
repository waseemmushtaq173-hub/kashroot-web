'use client';

/**
 * Admin → Approvals: agronomists, dealers and mandi reporters who applied (role_requests)
 * with their workplace, licence number and ID photo — the admin phones them
 * and ticks "I phoned" before Approve works —
 * everyone holding a staff role (staff_roles), and farmers' reports of
 * suspicious fertiliser / pesticide batches. Approving calls kr_grant_role,
 * which only works for admins (checked in the database).
 */
import { useCallback, useEffect, useState } from 'react';
import { Check, Flag, GraduationCap, Loader2, Megaphone, Phone, ShieldCheck, Store, UserX, X, type LucideIcon } from 'lucide-react';
import { toast } from 'sonner';

import { Badge, Btn, EmptyState, Modal, PORTAL_THEMES, Panel } from '@/components/portal/kit';
import { ago, dbMessage, supabase } from '@/lib/db/client';

const theme = PORTAL_THEMES.admin ?? PORTAL_THEMES.expert;

interface RoleRequest {
  id: string;
  user_id: string;
  role: 'EXPERT' | 'DEALER' | 'REPORTER';
  full_name: string;
  phone: string | null;
  email: string | null;
  details: string | null;
  /** Added by the contributors SQL: mandi / workplace, licence number, ID photo. */
  place?: string | null;
  licence?: string | null;
  id_photo?: string | null;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

const ROLE_LOOK: Record<RoleRequest['role'], { label: string; tone: 'violet' | 'red' | 'green'; icon: LucideIcon; colour: string }> = {
  EXPERT: { label: 'Agronomist', tone: 'violet', icon: GraduationCap, colour: 'text-purple-700' },
  DEALER: { label: 'Dealer', tone: 'red', icon: Store, colour: 'text-rose-700' },
  REPORTER: { label: 'Mandi reporter', tone: 'green', icon: Megaphone, colour: 'text-emerald-700' },
};

interface StaffRole {
  user_id: string;
  role: string;
  granted_at: string;
}

interface BatchReport {
  id: number;
  batch_code: string;
  note: string;
  created_at: string;
}

export function ApprovalsPanel() {
  const [requests, setRequests] = useState<RoleRequest[] | null>(null);
  const [staff, setStaff] = useState<StaffRole[]>([]);
  const [reports, setReports] = useState<BatchReport[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [phoned, setPhoned] = useState<Set<string>>(new Set());
  const [bigPhoto, setBigPhoto] = useState<string | null>(null);

  const load = useCallback(async () => {
    // Pending applications in full (with the ID photo); everyone else only by name.
    const [r, s, b, n] = await Promise.all([
      supabase.from('role_requests').select('*').eq('status', 'pending').order('created_at', { ascending: false }).limit(100),
      supabase.from('staff_roles').select('user_id, role, granted_at').order('granted_at', { ascending: false }),
      supabase.from('batch_reports').select('id, batch_code, note, created_at').order('id', { ascending: false }).limit(50),
      supabase.from('role_requests').select('user_id, full_name').limit(1000),
    ]);
    if (r.error) {
      setError(dbMessage(r.error));
      setRequests([]);
      return;
    }
    setError(null);
    setRequests((r.data ?? []) as RoleRequest[]);
    setStaff((s.data ?? []) as StaffRole[]);
    setReports((b.data ?? []) as BatchReport[]);
    setNames(new Map(((n.data ?? []) as { user_id: string; full_name: string }[]).map((x) => [x.user_id, x.full_name])));
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

  const run = async (key: string, fn: () => PromiseLike<{ error: { message?: string; code?: string } | null }>, ok: string) => {
    setBusy(key);
    const { error: err } = await fn();
    setBusy(null);
    if (err) return toast.error(dbMessage(err));
    toast.success(ok);
    await load();
  };

  const pending = requests ?? [];

  if (requests === null) return <p className="flex items-center gap-2 p-6 text-slate-600"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…</p>;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Panel theme={theme} title="Waiting for approval" icon={ShieldCheck} className="lg:col-span-2">
        {error ? (
          <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error}</p>
        ) : pending.length === 0 ? (
          <EmptyState theme={theme} icon={ShieldCheck} title="Nobody waiting" text="Agronomists apply from the Advisory portal, dealers from the Agro-dealer portal, mandi reporters from Mandi & Weather. Their applications appear here." />
        ) : (
          <ul className="space-y-3">
            {pending.map((r) => (
              <li key={r.id} className="flex flex-col gap-3 rounded-2xl bg-white/80 p-4 ring-1 ring-slate-900/5 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-semibold text-slate-900">
                    <RoleIcon role={r.role} />
                    {r.full_name}
                    <Badge tone={ROLE_LOOK[r.role]?.tone ?? 'slate'}>{ROLE_LOOK[r.role]?.label ?? r.role}</Badge>
                    <span className="text-xs font-normal text-slate-500">{ago(r.created_at)}</span>
                  </p>
                  <p className="mt-1 text-sm text-slate-700">{r.details || 'No details given'}</p>
                  {(r.place || r.licence) && (
                    <p className="mt-1 text-sm text-slate-700">
                      {r.place && <><span className="text-slate-500">{r.role === 'REPORTER' ? 'Mandi: ' : 'Works at: '}</span>{r.place}</>}
                      {r.place && r.licence && ' · '}
                      {r.licence && <><span className="text-slate-500">Licence / ID no.: </span>{r.licence}</>}
                    </p>
                  )}
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                    {r.phone && (
                      <a href={`tel:+91${r.phone.replace(/\D/g, '').slice(-10)}`} className="inline-flex items-center gap-1 font-semibold text-sky-800">
                        <Phone className="h-3.5 w-3.5" aria-hidden /> Call {r.phone}
                      </a>
                    )}
                    {r.email && <span>{r.email}</span>}
                  </p>
                  {r.id_photo ? (
                    <button type="button" onClick={() => setBigPhoto(r.id_photo ?? null)} className="mt-2 block cursor-zoom-in" aria-label={`Open ${r.full_name}’s ID photo`}>
                      {/* eslint-disable-next-line @next/next/no-img-element -- stored data URL */}
                      <img src={r.id_photo} alt={`${r.full_name}’s licence or ID`} className="h-24 rounded-lg object-cover ring-1 ring-slate-200" />
                    </button>
                  ) : r.role !== 'DEALER' ? (
                    <p className="mt-2 text-xs font-semibold text-amber-800">No ID photo sent — ask for one before approving.</p>
                  ) : null}
                  <label className="mt-2 flex items-center gap-2 text-sm text-slate-800">
                    <input type="checkbox" checked={phoned.has(r.id)} onChange={(e) => setPhoned((all) => { const next = new Set(all); if (e.target.checked) next.add(r.id); else next.delete(r.id); return next; })} />
                    I phoned them and checked the photo
                  </label>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Btn theme={theme} size="sm" icon={Check} disabled={busy !== null || !phoned.has(r.id)} title={phoned.has(r.id) ? undefined : 'Phone them and tick the box first'} onClick={() => void run(r.id, () => supabase.rpc('kr_grant_role', { p_user: r.user_id, p_role: r.role }), `${r.full_name} approved`)}>Approve</Btn>
                  <Btn theme={theme} size="sm" variant="danger" icon={X} disabled={busy !== null} onClick={() => void run(r.id, () => supabase.rpc('kr_reject_role', { p_request: r.id }), 'Application rejected')}>Reject</Btn>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel theme={theme} title="Staff roles" icon={GraduationCap}>
        {staff.length === 0 ? (
          <p className="text-sm text-slate-600">No staff roles yet.</p>
        ) : (
          <ul className="divide-y divide-slate-900/5">
            {staff.map((s) => (
              <li key={`${s.user_id}-${s.role}`} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span className="min-w-0">
                  <span className="font-semibold text-slate-900">{names.get(s.user_id) ?? 'Account'}</span>{' '}
                  <Badge tone={s.role === 'ADMIN' ? 'blue' : ROLE_LOOK[s.role as RoleRequest['role']]?.tone ?? 'slate'}>{ROLE_LOOK[s.role as RoleRequest['role']]?.label ?? s.role}</Badge>
                  <span className="block truncate font-mono text-xs text-slate-400">{s.user_id}</span>
                </span>
                {s.role !== 'ADMIN' && (
                  <Btn theme={theme} size="sm" variant="ghost" icon={UserX} disabled={busy !== null} onClick={() => void run(`${s.user_id}${s.role}`, () => supabase.rpc('kr_revoke_role', { p_user: s.user_id, p_role: s.role }), 'Role removed')}>Remove</Btn>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel theme={theme} title="Reported batches" icon={Flag}>
        {reports.length === 0 ? (
          <p className="text-sm text-slate-600">No farmer has reported a suspicious fertiliser or pesticide batch.</p>
        ) : (
          <ul className="space-y-2">
            {reports.map((r) => (
              <li key={r.id} className="rounded-xl bg-white/80 p-3 text-sm ring-1 ring-slate-900/5">
                <span className="font-mono font-semibold text-slate-900">{r.batch_code}</span> <span className="text-xs text-slate-500">{ago(r.created_at)}</span>
                <p className="mt-1 text-slate-700">{r.note}</p>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      {bigPhoto && (
        <Modal open wide onClose={() => setBigPhoto(null)} title="Licence / ID photo">
          {/* eslint-disable-next-line @next/next/no-img-element -- stored data URL */}
          <img src={bigPhoto} alt="Licence or ID, full size" className="mx-auto max-h-[70svh] rounded-xl object-contain" />
        </Modal>
      )}
    </div>
  );
}

function RoleIcon({ role }: { role: RoleRequest['role'] }) {
  const look = ROLE_LOOK[role];
  if (!look) return null;
  const Icon = look.icon;
  return <Icon className={`h-4 w-4 ${look.colour}`} aria-hidden />;
}
