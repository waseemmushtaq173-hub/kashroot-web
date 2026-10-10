'use client';

/**
 * Admin → Approvals: agronomists and dealers who applied (role_requests),
 * everyone holding a staff role (staff_roles), farmers' reports of
 * suspicious fertiliser / pesticide batches, and orders a buyer reported a
 * problem with (market_orders, status "disputed"). Approving calls kr_grant_role,
 * which only works for admins (checked in the database).
 */
import { useCallback, useEffect, useState } from 'react';
import { Check, Flag, GraduationCap, Loader2, PackageX, Phone, ShieldCheck, Store, UserX, X } from 'lucide-react';
import { toast } from 'sonner';

import { Badge, Btn, EmptyState, PORTAL_THEMES, Panel } from '@/components/portal/kit';
import { ago, dbMessage, inr, supabase } from '@/lib/db/client';

const theme = PORTAL_THEMES.admin ?? PORTAL_THEMES.expert;

interface RoleRequest {
  id: string;
  user_id: string;
  role: 'EXPERT' | 'DEALER';
  full_name: string;
  phone: string | null;
  email: string | null;
  details: string | null;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

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

interface ReportedOrder {
  id: string;
  product: string;
  quantity: number;
  unit: string;
  amount: number;
  buyer_name: string;
  buyer_phone: string;
  buyer_note: string | null;
  delivery_address: string;
  created_at: string;
  market_listings: { seller_name: string; phone: string } | null;
}

export function ApprovalsPanel() {
  const [requests, setRequests] = useState<RoleRequest[] | null>(null);
  const [staff, setStaff] = useState<StaffRole[]>([]);
  const [reports, setReports] = useState<BatchReport[]>([]);
  const [disputes, setDisputes] = useState<ReportedOrder[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [r, s, b, d] = await Promise.all([
      supabase.from('role_requests').select('*').order('created_at', { ascending: false }).limit(200),
      supabase.from('staff_roles').select('user_id, role, granted_at').order('granted_at', { ascending: false }),
      supabase.from('batch_reports').select('id, batch_code, note, created_at').order('id', { ascending: false }).limit(50),
      supabase.from('market_orders').select('id, product, quantity, unit, amount, buyer_name, buyer_phone, buyer_note, delivery_address, created_at, market_listings(seller_name, phone)').eq('status', 'disputed').order('created_at', { ascending: false }).limit(50),
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
    setDisputes((d.data ?? []) as unknown as ReportedOrder[]);
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

  const names = new Map((requests ?? []).map((r) => [r.user_id, r.full_name]));
  const pending = (requests ?? []).filter((r) => r.status === 'pending');

  if (requests === null) return <p className="flex items-center gap-2 p-6 text-slate-600"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…</p>;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Panel theme={theme} title="Waiting for approval" icon={ShieldCheck} className="lg:col-span-2">
        {error ? (
          <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error}</p>
        ) : pending.length === 0 ? (
          <EmptyState theme={theme} icon={ShieldCheck} title="Nobody waiting" text="Agronomists apply from the Advisory portal, dealers from the Agro-dealer portal. Their applications appear here." />
        ) : (
          <ul className="space-y-3">
            {pending.map((r) => (
              <li key={r.id} className="flex flex-col gap-3 rounded-2xl bg-white/80 p-4 ring-1 ring-slate-900/5 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-semibold text-slate-900">
                    {r.role === 'EXPERT' ? <GraduationCap className="h-4 w-4 text-purple-700" aria-hidden /> : <Store className="h-4 w-4 text-rose-700" aria-hidden />}
                    {r.full_name}
                    <Badge tone={r.role === 'EXPERT' ? 'violet' : 'red'}>{r.role === 'EXPERT' ? 'Agronomist' : 'Dealer'}</Badge>
                    <span className="text-xs font-normal text-slate-500">{ago(r.created_at)}</span>
                  </p>
                  <p className="mt-1 text-sm text-slate-700">{r.details || 'No details given'}</p>
                  <p className="mt-1 text-xs text-slate-500">{[r.phone, r.email].filter(Boolean).join(' · ')}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Btn theme={theme} size="sm" icon={Check} disabled={busy !== null} onClick={() => void run(r.id, () => supabase.rpc('kr_grant_role', { p_user: r.user_id, p_role: r.role }), `${r.full_name} approved`)}>Approve</Btn>
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
                  <Badge tone={s.role === 'ADMIN' ? 'blue' : s.role === 'EXPERT' ? 'violet' : 'red'}>{s.role}</Badge>
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

      <Panel theme={theme} title="Orders with a problem" icon={PackageX} className="lg:col-span-2">
        {disputes.length === 0 ? (
          <p className="text-sm text-slate-600">No buyer has reported a problem with an order.</p>
        ) : (
          <ul className="space-y-2">
            {disputes.map((o) => (
              <li key={o.id} className="rounded-xl bg-white/80 p-3 text-sm ring-1 ring-slate-900/5">
                <p className="font-semibold text-slate-900">{o.quantity} {o.unit} · {o.product} · {inr(o.amount)} <span className="text-xs font-normal text-slate-500">{ago(o.created_at)}</span></p>
                {o.buyer_note && <p className="mt-1 text-rose-800">“{o.buyer_note}”</p>}
                <p className="mt-1 text-slate-700">
                  Buyer: {o.buyer_name} · <a href={`tel:${o.buyer_phone}`} className="inline-flex items-center gap-1 font-semibold text-sky-800"><Phone className="h-3.5 w-3.5" aria-hidden /> {o.buyer_phone}</a>
                  {o.market_listings && (
                    <> · Seller: {o.market_listings.seller_name} · <a href={`tel:${o.market_listings.phone}`} className="inline-flex items-center gap-1 font-semibold text-sky-800"><Phone className="h-3.5 w-3.5" aria-hidden /> {o.market_listings.phone}</a></>
                  )}
                </p>
                <p className="text-xs text-slate-500">Deliver to: {o.delivery_address}</p>
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
    </div>
  );
}
