'use client';

/**
 * The KashRoot Hub portal: for hub staff — KashRoot team members the Super
 * Admin has ticked the Orders section for. Every pickup from the orchard gate
 * to the buyer (stage, hub, vehicle, driver, live pins). Guarded three times:
 * the team pass at the door (src/proxy.ts), the admin code (AdminLock), and
 * the database, which answers only a team member who has this section
 * (kr_team_sections, kr_admin_orders). Escrow release stays with the Super Admin.
 */
import { useEffect, useState } from 'react';

import { AdminLock } from '@/components/admin/AdminLock';
import { AdminOrdersPanel } from '@/components/admin/AdminOrdersPanel';
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
  if (sections === null) return null;
  const orders = sections.includes('*') || sections.includes('orders');
  return (
    <PortalShell title="KashRoot Hub" description="Every pickup from the orchard gate to the buyer, live." eyebrow="Hub staff" theme="hub">
      {orders ? (
        <AdminOrdersPanel canRelease={false} />
      ) : (
        <p className="rounded-xl bg-slate-50 p-4 text-slate-700 ring-1 ring-slate-200 lg:col-span-2">The Orders section is not ticked for you yet. The Super Admin chooses what each team member sees.</p>
      )}
    </PortalShell>
  );
}
