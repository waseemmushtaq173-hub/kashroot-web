'use client';

/** KashRoot TrueScan (public): is this fertiliser or pesticide genuine? Official lists, label photo, FCO lab-report comparison. */
import { useEffect, useState } from 'react';
import { FlaskConical } from 'lucide-react';

import { FertilizerChecker } from '@/components/fertilizer/FertilizerChecker';
import { PortalShell } from '@/components/layout/PortalShell';
import { FCO_PRODUCTS } from '@/lib/fertilizer/fco';
import { registryStats, type RegistryStats } from '@/lib/db/registry';

export default function FertilizerTesterPage() {
  // undefined: loading; null: the official lists are not set up on this site.
  const [stats, setStats] = useState<RegistryStats | null | undefined>(undefined);
  useEffect(() => {
    void registryStats().then(setStats).catch(() => setStats(null));
  }, []);
  const held = stats?.total ?? 0;

  return (
    <PortalShell
      standalone
      theme="dealer"
      eyebrow="KashRoot TrueScan"
      title="KashRoot TrueScan — is it genuine?"
      description="Fertilisers and pesticides: type the registration number or the name from the label to check it against the Government list of registered products. Or photograph the label, or compare a lab report with the Fertiliser (Control) Order."
      kpis={[
        {
          label: 'Registered products on file',
          value: stats === undefined ? '…' : held ? held.toLocaleString('en-IN') : 'Not yet',
          trend: held && stats?.last_import ? `From the Government lists · updated ${new Date(stats.last_import).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}` : stats === undefined ? 'Loading' : 'The Government list is not loaded yet',
        },
        { label: 'Fertiliser types with FCO standards', value: String(FCO_PRODUCTS.length), trend: 'Urea, DAP, MOP, SSP, NPKs, micronutrients' },
      ]}
      actions={<span className="inline-flex items-center gap-2 rounded-xl bg-white/20 px-3 py-2 text-sm font-semibold text-white ring-1 ring-white/40 backdrop-blur"><FlaskConical className="h-4 w-4" aria-hidden /> Free for everyone</span>}
    >
      <FertilizerChecker />
    </PortalShell>
  );
}
