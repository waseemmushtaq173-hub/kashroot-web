import Link from 'next/link';
import type { Metadata } from 'next';

import { InfoPage } from '@/components/layout/InfoPage';
import { NEVER_ASKS } from '@/lib/supportEmail';

export const metadata: Metadata = { title: 'Cancellation & Refund Policy', description: 'How to cancel an order or a cold-store booking, what to do when something is wrong, and how money is returned.' };

export default function RefundsPage() {
  return (
    <InfoPage title="Cancellation & Refund Policy" intro="How to cancel an order or a cold-store booking, what to do when something is wrong, and how money is returned.">
      <p className="text-sm text-slate-500">Last updated 27 November 2026</p>
      <section>
        <h2>1. Who returns the money</h2>
        <p>KashRoot does not hold, receive or release payments. You pay the seller or the cold-store owner directly by UPI or bank transfer, so a refund is made directly by the person who was paid, to the account you paid from. KashRoot keeps the order record, and its administrators can see a reported problem and contact both sides.</p>
      </section>
      <section>
        <h2>2. Produce orders (Buy apples &amp; produce, Price Comparison)</h2>
        <ul>
          <li>You pay only after the goods reach you and you have checked them. An order that is cancelled or declined has no payment to refund.</li>
          <li>The buyer can cancel from My orders until the seller accepts the order. The seller can decline an order and tell the buyer why.</li>
          <li>After the seller accepts, if something is wrong (wrong item, damaged, not delivered), press “Report a problem” on the order before you pay.</li>
          <li>If you have already paid, press “Report a problem” too and give the payment number. The seller is expected to return the money.</li>
        </ul>
      </section>
      <section>
        <h2>3. Kissan Tools shop orders (paid before shipping)</h2>
        <ul>
          <li>The buyer can cancel before paying; no money has moved.</li>
          <li>After the seller accepts, the buyer pays the seller and enters the payment number. The seller confirms the money arrived and then ships.</li>
          <li>If you have paid and the order cannot be supplied, press “Report a problem”. The seller is expected to return the full amount.</li>
          <li>The seller ships only after the money has arrived. A seller who does not receive it can tell the buyer and report a problem.</li>
        </ul>
      </section>
      <section>
        <h2>4. Cold-store bookings</h2>
        <ul>
          <li>You can cancel a booking from My bookings until the owner confirms it. Your places are given up.</li>
          <li>If you already paid, ask the owner to send the money back. The refund is between you and the owner.</li>
          <li>After the owner confirms, any change is agreed with the owner; the booking receipt shows what was booked.</li>
        </ul>
      </section>
      <section>
        <h2>5. Time and help</h2>
        <p>The seller or owner makes the refund, so KashRoot does not set or guarantee a refund time. If money you are owed has not come back, tell us in <Link className="font-semibold text-forest-deep underline" href="/support">Help &amp; support</Link> with the order or booking and the payment number, and we will contact both sides. {NEVER_ASKS}</p>
      </section>
      <section>
        <h2>6. Not covered</h2>
        <p>Mandi rates, TrueScan checks and expert advice are information services with no payment on KashRoot, so there is nothing to refund. See also the <Link className="font-semibold text-forest-deep underline" href="/delivery">Shipping &amp; Delivery Policy</Link>, the <Link className="font-semibold text-forest-deep underline" href="/terms">Terms</Link> and the <Link className="font-semibold text-forest-deep underline" href="/privacy">Privacy Policy</Link>.</p>
      </section>
    </InfoPage>
  );
}
