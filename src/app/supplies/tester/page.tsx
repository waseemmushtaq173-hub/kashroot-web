'use client';

/** Public fertiliser check: batch registry + FCO lab-report comparison. */
import { FlaskConical } from 'lucide-react';

import { FertilizerChecker } from '@/components/fertilizer/FertilizerChecker';
import { PortalShell } from '@/components/layout/PortalShell';

export default function FertilizerTesterPage() {
  return (
    <PortalShell
      standalone
      theme="dealer"
      eyebrow="Fertiliser testing"
      title="Is this fertiliser genuine?"
      description="Check a bag's batch number against the dealer registry, or compare a lab report with the Fertiliser (Control) Order."
      kpis={[
        { label: 'Products with FCO specs', value: '12', trend: 'Urea, DAP, MOP, SSP, NPKs, micronutrients' },
        { label: 'Registry', value: 'Live', trend: 'Filled by approved dealers' },
      ]}
      actions={<span className="inline-flex items-center gap-2 rounded-xl bg-white/20 px-3 py-2 text-sm font-semibold text-white ring-1 ring-white/40 backdrop-blur"><FlaskConical className="h-4 w-4" aria-hidden /> Free for every grower</span>}
    >
      <FertilizerChecker />
    </PortalShell>
  );
}
