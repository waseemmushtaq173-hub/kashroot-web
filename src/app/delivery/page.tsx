import Link from 'next/link';
import type { Metadata } from 'next';

import { InfoPage } from '@/components/layout/InfoPage';
import { NEVER_ASKS } from '@/lib/supportEmail';

export const metadata: Metadata = { title: 'Shipping & Delivery Policy', description: 'How goods travel from the seller to the buyer, how delivery is confirmed, and what to do if something is wrong on arrival.' };

export default function DeliveryPage() {
  return (
    <InfoPage title="Shipping & Delivery Policy" intro="How goods travel from the seller to the buyer, how delivery is confirmed, and what to do if something is wrong on arrival.">
      <p className="text-sm text-slate-500">Last updated 27 November 2026</p>
      <section>
        <h2>1. How goods travel</h2>
        <p>Goods go either straight from the seller, or through a KashRoot hub: a hub collects boxes from orchards near it and sends them to the buyer together. The order shows which, and where the goods are.</p>
      </section>
      <section>
        <h2>2. From order to delivery</h2>
        <ol className="list-decimal space-y-1 pl-5">
          <li>The buyer places the order and shares their location for the delivery.</li>
          <li>The seller accepts, packs, and dispatches. Live GPS follows the trip, and the buyer sees the position on the order.</li>
          <li>The goods arrive. The buyer checks grade, quantity and packing.</li>
          <li>The buyer presses “Confirm Delivery Received” (or “I received the goods”). Only then is the order complete.</li>
        </ol>
      </section>
      <section>
        <h2>3. Delivery time</h2>
        <p>KashRoot does not set or guarantee a delivery time. The order shows each step and the live position as the load moves, and the tracking page shows it to anyone who has the tracking code or link.</p>
      </section>
      <section>
        <h2>4. Freight</h2>
        <p>When goods travel from a hub to you, the freight is worked out from the real distance and shown on the order. If the distance cannot be worked out, no freight is shown, never a guess.</p>
      </section>
      <section>
        <h2>5. If something is wrong on arrival</h2>
        <p>Do not confirm delivery until you have checked the goods. If they are wrong, damaged or missing, press “Report a problem” on the order. What happens next is in the <Link className="font-semibold text-forest-deep underline" href="/refunds">Cancellation &amp; Refund Policy</Link>.</p>
      </section>
      <section>
        <h2>6. Nothing to ship</h2>
        <p>Cold-store bookings are for space at the owner’s store, and KashRoot does not deliver them. Mandi rates, TrueScan checks and expert advice are online services, available as soon as you open them.</p>
      </section>
      <section>
        <h2>7. Contact</h2>
        <p>Use <Link className="font-semibold text-forest-deep underline" href="/support">Help &amp; support</Link> — at the top of every page — to ask about an order. {NEVER_ASKS} See also the <Link className="font-semibold text-forest-deep underline" href="/terms">Terms</Link>.</p>
      </section>
    </InfoPage>
  );
}
