'use client';

import { Package, ShoppingBag, Snowflake, Truck } from 'lucide-react';

import { Badge, Btn, EmptyState, PORTAL_THEMES, Panel, Skeleton, Tile } from '@/components/portal/kit';

const theme = PORTAL_THEMES.farmer;

export function KitTestPage() {
  return (
    <main className={`kr-light min-h-screen ${theme.canvas} text-slate-900`}>
      <div className="mx-auto max-w-5xl space-y-5 p-4">
        <p className="rounded-xl bg-amber-100 px-3 py-2 text-sm font-semibold text-amber-950">Test page — the portal kit.</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <Tile theme={theme} icon={ShoppingBag} label="Shop" hint="Farm tools and inputs" />
          <Tile theme={theme} icon={Snowflake} label="Cold storage" hint="Book your own place" />
          <Tile theme={theme} icon={Truck} label="Tracking" hint="Where your lorry is" />
        </div>
        <Panel theme={theme} title="Orders" icon={Package} action={<Btn theme={theme} size="sm">Refresh</Btn>}>
          <div className="flex flex-wrap gap-2">
            <Badge tone="green">Accepted</Badge>
            <Badge tone="amber">Waiting for payment</Badge>
            <Badge tone="red">Problem reported</Badge>
            <Badge tone="blue">On the way</Badge>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Btn theme={theme}>Accept</Btn>
            <Btn theme={theme} variant="ghost">Decline</Btn>
          </div>
        </Panel>
        <Panel theme={theme} title="While it loads">
          <Skeleton label="Loading your orders…" height="h-24" />
        </Panel>
        <Panel theme={theme} title="Nothing yet">
          <EmptyState theme={theme} icon={Package} title="No orders yet" text="Find farm tools and inputs in the Shop, add them to the cart and order." />
        </Panel>
      </div>
    </main>
  );
}
