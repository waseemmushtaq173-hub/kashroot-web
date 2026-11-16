'use client';

import { Suspense, useState } from 'react';

import { ListingBrowser } from '@/components/market/shop/ListingBrowser';
import { PORTAL_THEMES } from '@/components/portal/kit';

export function ClusterTestPage() {
  const [asked, setAsked] = useState<string | null>(null);
  return (
    <main className="kr-light min-h-screen text-slate-900">
      <div className="mx-auto max-w-6xl space-y-4 p-4">
        <p className="rounded-xl bg-amber-100 px-3 py-2 text-sm font-semibold text-amber-950">Test page — the Buyer portal’s produce shop on the real listings. Nothing is ordered from here.</p>
        <h1 className="text-xl font-bold">Buy apples &amp; produce — pooled locations (KashRoot hubs)</h1>
        {asked && <p role="status">Order asked for: {asked}</p>}
        <Suspense fallback={null}>
          <ListingBrowser category="produce" theme={PORTAL_THEMES.buyer} cluster onOrder={(l, boxes) => setAsked(`${l.product} from ${l.seller_name} × ${boxes ?? 'no number'}`)} empty={<p>No produce is listed right now.</p>} />
        </Suspense>
      </div>
    </main>
  );
}
