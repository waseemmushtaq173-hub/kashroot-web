'use client';

/**
 * Ask an expert from inside the Farmer portal: the same advisory desk as the
 * Advisory portal, so the farmer is not sent to another portal's sign-in.
 */
import { Suspense } from 'react';

import { AdvisoryDesk } from '@/components/advisory/AdvisoryDesk';

export default function FarmerAskExpertPage() {
  return (
    <Suspense>
      <AdvisoryDesk farmerView />
    </Suspense>
  );
}
