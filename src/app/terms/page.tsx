import type { Metadata } from 'next';

import { InfoPage } from '@/components/layout/InfoPage';

export const metadata: Metadata = { title: 'Terms & Conditions' };

export default function TermsPage() {
  return (
    <InfoPage title="Terms & Conditions" intro="The rules that keep trade on KashRoot fair for growers, buyers and partners.">
      <section>
        <h2>1. Accounts and KYC</h2>
        <p>You must give accurate details and complete identity verification before you can sell, buy or receive payouts. One person or business per account.</p>
      </section>
      <section>
        <h2>2. Escrow trades</h2>
        <ul>
          <li>Buyer payments are held in escrow until delivery is confirmed or the confirmation window lapses.</li>
          <li>Sellers must describe grade, quantity and packing honestly; mismatches can be disputed.</li>
          <li>Disputes are reviewed by platform administrators, whose decision on escrow release is final.</li>
        </ul>
      </section>
      <section>
        <h2>3. Listings and prices</h2>
        <p>Mandi rates and price comparisons are informational. You agree prices directly with the other party.</p>
      </section>
      <section>
        <h2>4. Prohibited use</h2>
        <p>No counterfeit agro-inputs, misbranded produce, fake reviews, or attempts to move a trade off-platform to avoid escrow.</p>
      </section>
      <section>
        <h2>5. Changes</h2>
        <p>We may update these terms; continued use after an update means you accept the new version.</p>
      </section>
    </InfoPage>
  );
}
