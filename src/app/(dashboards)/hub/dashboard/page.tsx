'use client';

/**
 * The KashRoot Hub portal: for KashRoot staff the Super Admin chose. What a person sees follows the sections the
 * Super Admin ticked for them (the Super Admin sees all):
 *   Orders      → the pickups from the orchard gate to the buyer (step, hub, vehicle, driver, both live pins, the pooled
 *                 load at each hub) and the live fleet, read-only;
 *   Accounts    → everyone who has joined (farmers, buyers, dealers, drivers, experts, business owners);
 *   Businesses  → every business and its owners (read only), and every soil and lab test booking (no phones or addresses);
 *   Cold stores → the cold-store directory.
 * Guarded three times: the team pass at the door (src/proxy.ts), the admin code (AdminLock), and the database, which
 * answers a team member only for a section that is ticked for them (kr_team_sections, kr_team_can). Escrow release,
 * approving vehicles, certifying devices and suspending a business stay with the Super Admin.
 */
import { useEffect, useState } from 'react';
import { Building2, FlaskConical, Satellite, Snowflake, Truck, Users } from 'lucide-react';

import { AccountsPanel } from '@/components/admin/AccountsPanel';
import { AdminLock } from '@/components/admin/AdminLock';
import { AdminOrdersPanel } from '@/components/admin/AdminOrdersPanel';
import { ColdDirectoryPanel } from '@/components/admin/ColdDirectoryPanel';
import { GpsFleetPanel } from '@/components/admin/GpsFleetPanel';
import { LabOversightPanel } from '@/components/admin/LabOversightPanel';
import { BusinessesPanel } from '@/components/admin/SuperAdminPanel';
import { PortalShell } from '@/components/layout/PortalShell';
import { supabase } from '@/lib/supabase';

type View = 'orders' | 'fleet' | 'people' | 'businesses' | 'labs' | 'coldstores';

/** Each view and the team section that opens it ('*' = the Super Admin opens all). */
const VIEWS: { id: View; label: string; icon: typeof Truck; section: string }[] = [
  { id: 'orders', label: 'Orders & pickups', icon: Truck, section: 'orders' },
  { id: 'fleet', label: 'Live fleet', icon: Satellite, section: 'orders' },
  { id: 'people', label: 'People who joined', icon: Users, section: 'accounts' },
  { id: 'businesses', label: 'Business owners', icon: Building2, section: 'businesses' },
  { id: 'labs', label: 'Soil & lab tests', icon: FlaskConical, section: 'businesses' },
  { id: 'coldstores', label: 'Cold stores', icon: Snowflake, section: 'coldstores' },
];

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
  const [picked, setPicked] = useState<View | null>(null);
  if (sections === null) return null;
  const allowed = VIEWS.filter((v) => sections.includes('*') || sections.includes(v.section));
  const view = allowed.find((v) => v.id === picked) ?? allowed[0] ?? null;
  return (
    <PortalShell
      title="KashRoot Hub"
      description="Orders from the orchard gate to the buyer, the people and businesses on KashRoot, and the live fleet — each part only if the Super Admin ticked it for you."
      eyebrow="Hub staff"
      theme="hub"
      tabs={allowed.map((v) => ({ id: v.id, label: v.label, icon: v.icon }))}
      activeTab={view?.id}
      onTabChange={(id) => setPicked(id as View)}
    >
      {view === null && <p className="rounded-xl bg-slate-50 p-4 text-slate-700 ring-1 ring-slate-200 lg:col-span-2">Nothing is ticked for you yet. The Super Admin chooses what each team member sees.</p>}
      {view?.id === 'orders' && <AdminOrdersPanel canRelease={false} />}
      {view?.id === 'fleet' && <GpsFleetPanel />}
      {view?.id === 'people' && <AccountsPanel />}
      {view?.id === 'businesses' && <BusinessesPanel />}
      {view?.id === 'labs' && <LabOversightPanel />}
      {view?.id === 'coldstores' && <ColdDirectoryPanel />}
    </PortalShell>
  );
}
