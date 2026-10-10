import type { Metadata } from 'next';
import Link from 'next/link';

import { InfoPage } from '@/components/layout/InfoPage';

export const metadata: Metadata = { title: 'Support' };

export default function SupportPage() {
  return (
    <InfoPage title="Help & support" intro="Quick answers, and a person when you need one.">
      <section>
        <h2>How do I pay?</h2>
        <p>
          Buyers pay the seller directly by UPI after the goods arrive; KashRoot does not hold money. See how on the <Link className="font-semibold text-emerald-800 underline" href="/escrow">Safe payments</Link> page.
        </p>
      </section>
      <section>
        <h2>Problem with an order?</h2>
        <p>Open it in My orders and press “Report a problem” before you pay. The seller and KashRoot’s team see your note and can call you.</p>
      </section>
      <section>
        <h2>Crop or pest question?</h2>
        <p>
          Ask a verified agronomist from the <Link className="font-semibold text-emerald-800 underline" href="/expert">Advisory hub</Link>, or check symptoms in{' '}
          <Link className="font-semibold text-emerald-800 underline" href="/orchard-health">Orchard Health</Link>.
        </p>
      </section>
      <section>
        <h2>Contact us</h2>
        <p>
          Still stuck? Email{' '}
          <a className="font-semibold text-emerald-800 underline" href="mailto:support@kashroot.com">
            support@kashroot.com
          </a>{' '}
          and include your order number if your question is about an order.
        </p>
      </section>
    </InfoPage>
  );
}
