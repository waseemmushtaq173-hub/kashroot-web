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
        <h2>2. Orders and payment</h2>
        <ul>
          <li>Orders are pay-after-delivery: the buyer pays the seller directly (UPI or bank transfer) after receiving and checking the goods. KashRoot does not hold, receive or release payments.</li>
          <li>Cold-store and machinery bookings are paid directly to the owner, who confirms the booking.</li>
          <li>Sellers must describe grade, quantity and packing honestly; a buyer can report a mismatch on the order before paying.</li>
          <li>KashRoot administrators can see reported orders and contact both sides, but the payment itself is between buyer and seller.</li>
        </ul>
      </section>
      <section>
        <h2>3. Listings and prices</h2>
        <p>Mandi rates and price comparisons are informational. You agree prices directly with the other party.</p>
      </section>
      <section>
        <h2>4. Prohibited use</h2>
        <p>No counterfeit agro-inputs, misbranded produce, fake reviews, or or false payment references.</p>
      </section>
      <section>
        <h2>5. Changes</h2>
        <p>We may update these terms; continued use after an update means you accept the new version.</p>
      </section>
    </InfoPage>
  );
}
