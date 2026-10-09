'use client';

/** Fertiliser check inside the farmer portal. */
import { FertilizerChecker } from '@/components/fertilizer/FertilizerChecker';
import { PortalShell } from '@/components/layout/PortalShell';

export default function FarmerTesterPage() {
  return (
    <PortalShell theme="farmer" eyebrow="Farmer portal" title="Fertiliser testing" description="Verify a batch number with the dealer registry, or check a lab report against the Fertiliser (Control) Order.">
      <FertilizerChecker />
    </PortalShell>
  );
}
