'use client';

import { ShareRequests, ShareWaiting } from '@/components/rental/ShareConsent';

export function ShareTestPage() {
  return (
    <main className="mx-auto max-w-2xl space-y-6 p-4">
      <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-950">Test page — nothing here is saved.</p>
      <ShareRequests />
      <section aria-label="Waiting, one farmer" className="space-y-2">
        <ShareWaiting status={{ booking_id: 'a', state: 'asked', waiting: 1 }} checking={false} onCheck={() => undefined} />
      </section>
      <section aria-label="Waiting, two farmers">
        <ShareWaiting status={{ booking_id: 'b', state: 'asked', waiting: 2 }} checking={false} onCheck={() => undefined} />
      </section>
      <section aria-label="Said no">
        <ShareWaiting status={{ booking_id: 'c', state: 'declined', waiting: 0 }} checking={false} onCheck={() => undefined} />
      </section>
      <section aria-label="Nothing to wait for">
        <ShareWaiting status={{ booking_id: 'd', state: 'allowed', waiting: 0 }} checking={false} onCheck={() => undefined} />
        <ShareWaiting status={{ booking_id: 'e', state: 'none', waiting: 0 }} checking={false} onCheck={() => undefined} />
        <ShareWaiting status={undefined} checking={false} onCheck={() => undefined} />
      </section>
    </main>
  );
}
