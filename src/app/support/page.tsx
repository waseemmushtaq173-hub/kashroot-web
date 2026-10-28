import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';

import { InfoPage } from '@/components/layout/InfoPage';
import { SupportCenter } from '@/components/support/SupportCenter';

export const metadata: Metadata = { title: 'Help & support', description: 'Trouble signing in, a payment, an order or anything else: answers you can read or listen to, and a person from KashRoot when you need one.' };

export default function SupportPage() {
  return (
    <InfoPage title="Help & support" intro="Trouble signing in, a payment, an order or anything else: answers you can read or listen to, and a person from KashRoot when you need one.">
      {/* The language and the topic asked for come from this phone and the address: shown in the browser. */}
      <Suspense
        fallback={
          <p className="flex min-h-40 items-center justify-center gap-2 text-slate-600">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> Opening help…
          </p>
        }
      >
        <SupportCenter />
      </Suspense>
    </InfoPage>
  );
}
