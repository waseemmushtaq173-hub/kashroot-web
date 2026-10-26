'use client';

/** Advisory portal: the advisory desk (components/advisory/AdvisoryDesk). */
import { Suspense } from 'react';

import { AdvisoryDesk } from '@/components/advisory/AdvisoryDesk';

export default function AdvisoryPage() {
  return (
    <Suspense>
      <AdvisoryDesk />
    </Suspense>
  );
}
