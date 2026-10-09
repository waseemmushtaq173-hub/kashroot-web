import type { Metadata } from 'next';
import Link from 'next/link';

import { InfoPage } from '@/components/layout/InfoPage';

export const metadata: Metadata = { title: 'Support — KashRoot' };

export default function SupportPage() {
  return (
    <InfoPage title="Help & support" intro="Quick answers, and a person when you need one.">
      <section>
        <h2>Payment held in escrow?</h2>
        <p>
          Money is released when the buyer confirms delivery. Track it on the <Link className="font-semibold text-emerald-800 underline" href="/escrow">Escrow</Link> page.
        </p>
      </section>
      <section>
        <h2>Problem with an order?</h2>
        <p>Open the order and choose “Raise a dispute”. Escrow stays on hold until an administrator reviews it.</p>
      </section>
      <section>
        <h2>Crop or pest question?</h2>
        <p>
          Ask a verified agronomist from the <Link className="font-semibold text-emerald-800 underline" href="/expert">Advisory hub</Link>, or check symptoms in{' '}
          <Link className="font-semibold text-emerald-800 underline" href="/orchard-health">Orchard Health</Link>.
        </p>
      </section>
    </InfoPage>
  );
}
