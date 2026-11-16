'use client';

/**
 * The KashRoot Hub portal: for hub staff — KashRoot team members the Super
 * Admin has ticked the Orders section for. Every pickup from the orchard gate
 * to the buyer (stage, hub, vehicle, driver, live pins). Guarded three times:
 * the team pass at the door (src/proxy.ts), the admin code (AdminLock), and
 * the database, which answers only a team member who has this section
 * (kr_team_sections, kr_admin_orders). Escrow release stays with the Super Admin.
 * Live fleet: every driver, vehicle and live trip, read-only (approving vehicles and
 * certifying devices stay with the Super Admin; the server asks the database).
 */
import { useEffect, useState } from 'react';

import { AdminLock } from '@/components/admin/AdminLock';
import { AdminOrdersPanel } from '@/components/admin/AdminOrdersPanel';
import { GpsFleetPanel } from '@/components/admin/GpsFleetPanel';
import { PortalShell } from '@/components/layout/PortalShell';
import { supabase } from '@/lib/supabase';

export default function HubPage() {
  return (
    <AdminLock>
      <HubConsole />
    </AdminLock>
  );
}

function HubConsole() {
  // What the database lets this person open: ['*'] for the Super Admin, the ticked sections for a team member.
  const [sections, setSections] = useState<string[] | null>(null);
  useEffect(() => {
    let live = true;
    void supabase.rpc('kr_team_sections').then(({ data }) => {
      if (live) setSections(Array.isArray(data) ? (data as string[]) : []);
    });
    return () => {
      live = false;
    };
  }, []);
  const [view, setView] = useState<'orders' | 'fleet'>('orders');
  if (sections === null) return null;
  const orders = sections.includes('*') || sections.includes('orders');
  return (
    <PortalShell title="KashRoot Hub" description="Every pickup from the orchard gate to the buyer, live." eyebrow="Hub staff" theme="hub">
      {orders ? (
        <div className="space-y-5 lg:col-span-2">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Hub views">
            {([['orders', 'Orders and pickups'], ['fleet', 'Live fleet']] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-pressed={view === id}
                onClick={() => setView(id)}
                className={`inline-flex min-h-11 cursor-pointer items-center rounded-xl px-4 text-sm font-semibold ring-2 transition ${view === id ? 'bg-forest text-white ring-forest' : 'bg-white text-forest ring-forest-line hover:bg-forest-soft'}`}
              >
                {label}
              </button>
            ))}
          </div>
          {view === 'orders' ? <AdminOrdersPanel canRelease={false} /> : <GpsFleetPanel />}
        </div>
      ) : (
        <p className="rounded-xl bg-slate-50 p-4 text-slate-700 ring-1 ring-slate-200 lg:col-span-2">The Orders section is not ticked for you yet. The Super Admin chooses what each team member sees.</p>
      )}
    </PortalShell>
  );
}
