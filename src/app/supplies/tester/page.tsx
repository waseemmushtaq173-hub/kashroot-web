'use client';

/** KashRoot TrueScan (public): is this fertiliser or pesticide genuine? Official lists, label photo, FCO lab-report comparison. */
import { useEffect, useState } from 'react';
import { FlaskConical } from 'lucide-react';

import { DataGovLatest } from '@/components/fertilizer/DataGovLatest';
import { FertilizerChecker } from '@/components/fertilizer/FertilizerChecker';
import { PortalShell } from '@/components/layout/PortalShell';
import { CIBRC_META } from '@/lib/cibrcOfficial';
import { FCO_PRODUCTS } from '@/lib/fertilizer/fco';
import { registryStats, type RegistryStats } from '@/lib/db/registry';

export default function FertilizerTesterPage() {
  // undefined: loading; null: the official lists are not set up on this site.
  const [stats, setStats] = useState<RegistryStats | null | undefined>(undefined);
  useEffect(() => {
    void registryStats().then(setStats).catch(() => setStats(null));
  }, []);
  // What is on file: the CIB&RC lists that ship with the app (always there, as printed by the Government), plus any rows
  // imported in Admin → Official lists. The card used to count only the imported rows and so said "Not yet" under a page that
  // listed 1,531 registered entries.
  const lists = CIBRC_META.lists;
  const bundled = lists.pesticides.count + lists.formulations.count;
  const held = stats?.total ?? 0;
  const banned = lists.banned.banned + lists.banned.banned_for_export_only + lists.banned.withdrawn + lists.banned.refused;
  // Lists the server re-reads from the official file every day, and when the newest look was.
  const auto = stats?.lists.filter((l) => l.auto && l.checked_at) ?? [];
  const checked = auto.map((l) => l.checked_at as string).sort().at(-1);
  const day = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <PortalShell
      standalone
      theme="dealer"
      eyebrow="KashRoot TrueScan"
      title="KashRoot TrueScan — is it genuine?"
      description="Fertilisers and pesticides: type the registration number or the name from the label to check it against the Government list of registered products. Or photograph the label, or compare a lab report with the Fertiliser (Control) Order."
      kpis={[
        {
          label: 'Registered on file',
          value: (bundled + held).toLocaleString('en-IN'),
          trend: `CIB&RC: ${lists.pesticides.count} chemicals + ${lists.formulations.count.toLocaleString('en-IN')} formulations (as on ${lists.pesticides.as_on}); ${banned} banned, withdrawn or refused${held ? ` · +${held.toLocaleString('en-IN')} imported rows${stats?.last_import ? `, updated ${day(stats.last_import)}` : ''}${checked ? `, checked against the official file ${day(checked)}` : ''}` : ''}`,
        },
        { label: 'Fertiliser types with FCO standards', value: String(FCO_PRODUCTS.length), trend: 'Urea, DAP, MOP, SSP, NPKs, micronutrients' },
      ]}
      actions={<span className="inline-flex items-center gap-2 rounded-xl bg-white/20 px-3 py-2 text-sm font-semibold text-white ring-1 ring-white/40 backdrop-blur"><FlaskConical className="h-4 w-4" aria-hidden /> Free for everyone</span>}
    >
      <FertilizerChecker />
      <DataGovLatest />
    </PortalShell>
  );
}
