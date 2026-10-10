'use client';

/**
 * Admin → Platform numbers: real counts from the database (kr_admin_stats,
 * admins only) — sign-ups per portal, products, orders, cold-store bookings,
 * advisory requests, tracked loads and the batch registry. Useful while
 * testing with farmers to see what they actually used.
 */
import { useCallback, useEffect, useState } from 'react';
import { BarChart3, Loader2, RefreshCw } from 'lucide-react';

import { Btn, Panel, PORTAL_THEMES } from '@/components/portal/kit';
import { PORTALS } from '@/lib/auth/roles';
import { dbMessage, inr, supabase } from '@/lib/db/client';

const theme = PORTAL_THEMES.admin ?? PORTAL_THEMES.expert;

export interface AdminStats {
  accounts: number;
  accounts_7d: number;
  portals: Record<string, number>;
  products_on_sale: number;
  orders: Record<string, number>;
  orders_paid_value: number;
  cold_stores: number;
  machinery: number;
  bookings: Record<string, number>;
  advisory_total: number;
  advisory_waiting: number;
  consignments: number;
  consignments_live: number;
  batches: number;
  batch_reports: number;
  orchard_blocks: number;
  spray_logs: number;
}

export async function loadAdminStats(): Promise<AdminStats> {
  const { data, error } = await supabase.rpc('kr_admin_stats');
  if (error) throw new Error(dbMessage(error, 'Could not load the numbers.'));
  return data as AdminStats;
}

const sum = (r: Record<string, number>, keys?: string[]) => Object.entries(r).reduce((s, [k, n]) => s + (!keys || keys.includes(k) ? Number(n) : 0), 0);

/** Account roles are stored upper-case (FARMER); show the portal's name. */
function portalName(role: string): string {
  return Object.values(PORTALS).find((p) => p.requiredRole === role)?.label ?? role.charAt(0) + role.slice(1).toLowerCase();
}

export function PlatformNumbers() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setStats(await loadAdminStats());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the numbers.');
    }
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

  if (error) return <p role="alert" className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-800 ring-1 ring-rose-200">{error}</p>;
  if (!stats) return <p className="flex items-center gap-2 text-slate-600"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…</p>;

  const tiles: [string, string, string][] = [
    ['Accounts', String(stats.accounts), `${stats.accounts_7d} new this week`],
    ['Products on sale', String(stats.products_on_sale), 'On Price Comparison'],
    ['Orders', String(sum(stats.orders)), `${sum(stats.orders, ['placed', 'accepted', 'shipped', 'delivered', 'paid'])} open · ${stats.orders.completed ?? 0} completed`],
    ['Paid to sellers', inr(stats.orders_paid_value), 'Completed orders'],
    ['Cold stores listed', String(stats.cold_stores), `${stats.machinery} machinery`],
    ['Cold-store bookings', String(sum(stats.bookings)), `${stats.bookings.confirmed ?? 0} confirmed · ${stats.bookings.requested ?? 0} waiting`],
    ['Expert requests', String(stats.advisory_total), `${stats.advisory_waiting} waiting for an answer`],
    ['Tracked loads', String(stats.consignments), `${stats.consignments_live} on the road now`],
    ['Registered batches', String(stats.batches), `${stats.batch_reports} reported by farmers`],
    ['Orchard blocks', String(stats.orchard_blocks), `${stats.spray_logs} sprays logged`],
  ];
  const portals = Object.entries(stats.portals).sort((a, b) => Number(b[1]) - Number(a[1]));

  return (
    <div className="space-y-6">
      <Panel theme={theme} title="Platform numbers" icon={BarChart3} action={<Btn theme={theme} size="sm" variant="soft" icon={RefreshCw} onClick={() => void load()}>Refresh</Btn>}>
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
          {tiles.map(([label, value, hint]) => (
            <li key={label} className="rounded-2xl bg-white/85 p-4 ring-1 ring-slate-900/5">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
              <p className="text-xs text-slate-600">{hint}</p>
            </li>
          ))}
        </ul>
      </Panel>
      <Panel theme={theme} title="Accounts by portal" icon={BarChart3}>
        {portals.length === 0 ? (
          <p className="text-sm text-slate-600">No accounts yet.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {portals.map(([role, n]) => (
              <li key={role} className="rounded-xl bg-white/85 px-3 py-2 text-sm ring-1 ring-slate-900/5"><strong>{n}</strong> {portalName(role)}</li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
