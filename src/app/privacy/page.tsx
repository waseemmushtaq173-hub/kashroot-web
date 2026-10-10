import type { Metadata } from 'next';

import { InfoPage } from '@/components/layout/InfoPage';

export const metadata: Metadata = { title: 'Privacy Policy' };

export default function PrivacyPage() {
  return (
    <InfoPage title="Privacy Policy" intro="What we collect, why, and how you stay in control.">
      <section>
        <h2>What we collect</h2>
        <ul>
          <li>Account details: name, email or phone, role.</li>
          <li>Verification: masked Aadhaar (last four digits only), PAN, and bank account last four digits with IFSC.</li>
          <li>Payment details you add under Payouts: UPI ID and/or bank account number with IFSC. They are shown only to a buyer or renter with a live order or booking with you, so they can pay you.</li>
          <li>Trade records: listings, orders, bookings, payment reference numbers and delivery events.</li>
        </ul>
      </section>
      <section>
        <h2>What we never store</h2>
        <p>Your full Aadhaar number or OTPs. Verification happens with the issuing service; we keep only the result. KashRoot never holds your money.</p>
      </section>
      <section>
        <h2>How it is used</h2>
        <p>To verify identities, connect buyers and sellers, look into reported problems and show you relevant prices. We do not sell personal data.</p>
      </section>
      <section>
        <h2>Your choices</h2>
        <p>You can download or delete your data from support at any time, subject to records we must keep by law.</p>
      </section>
    </InfoPage>
  );
}
