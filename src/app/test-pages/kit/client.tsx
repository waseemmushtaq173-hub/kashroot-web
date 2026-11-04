'use client';

import { useState } from 'react';
import { Package, ShoppingBag, Snowflake, Truck, Wallet } from 'lucide-react';
import { toast } from 'sonner';

import { Badge, Btn, EmptyState, Field, INPUT, KpiTile, Modal, PORTAL_THEMES, PageHeader, Panel, Skeleton, TABLE, Tile, inr } from '@/components/portal/kit';

const theme = PORTAL_THEMES.farmer;

export function KitTestPage() {
  const [open, setOpen] = useState(false);
  return (
    <main className={`kr-light min-h-screen ${theme.canvas} text-slate-900`}>
      <div className="mx-auto max-w-5xl space-y-5 p-4">
        <p className="rounded-xl bg-amber-100 px-3 py-2 text-sm font-semibold text-amber-950">Test page — the portal kit.</p>
        <PageHeader theme={theme} eyebrow="Farmer" title="Your orchard, sales and payments" description="Every portal's title row: the eyebrow, the title, one line, the main buttons." actions={<Btn theme={theme}>Sell produce</Btn>} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiTile label="Orders" value="12" hint="3 waiting for you" icon={Package} />
          <KpiTile label="Paid to you" value={inr.format(184500)} hint="This season" icon={Wallet} />
          <KpiTile label="Boxes in store" value="1,240" />
          <KpiTile label="On the way" value="2" />
        </div>
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
            <Btn theme={theme} variant="outline">Details</Btn>
            <Btn theme={theme} variant="soft">Message</Btn>
            <Btn theme={theme} variant="ghost">Decline</Btn>
            <Btn theme={theme} variant="danger">Cancel order</Btn>
          </div>
        </Panel>
        <Panel theme={theme} title="A table">
          <div className={TABLE.wrap}>
            <table className={TABLE.table}>
              <thead className={TABLE.head}>
                <tr>
                  <th className={TABLE.th}>Market</th>
                  <th className={`${TABLE.th} text-right`}>Boxes</th>
                  <th className={`${TABLE.th} text-right`}>Price</th>
                </tr>
              </thead>
              <tbody className={TABLE.body}>
                <tr className={TABLE.row}>
                  <td className={TABLE.td}>Example market A</td>
                  <td className={`${TABLE.td} text-right`}>120</td>
                  <td className={`${TABLE.td} text-right`}>{inr.format(1100)}</td>
                </tr>
                <tr className={TABLE.row}>
                  <td className={TABLE.td}>Example market B</td>
                  <td className={`${TABLE.td} text-right`}>48</td>
                  <td className={`${TABLE.td} text-right`}>{inr.format(980)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel theme={theme} title="A form">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Your name">
              <input className={INPUT} defaultValue="" placeholder="As on your bank account" />
            </Field>
            <Field label="Village" hint="Where your orchard is">
              <input className={INPUT} placeholder="Village or town" />
            </Field>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Btn theme={theme} onClick={() => setOpen(true)}>Open a pop-up</Btn>
            <Btn theme={theme} variant="outline" onClick={() => toast.success('Saved')}>Show a message</Btn>
          </div>
        </Panel>
        <Panel theme={theme} title="While it loads">
          <Skeleton label="Loading your orders…" height="h-24" />
        </Panel>
        <Panel theme={theme} title="Nothing yet">
          <EmptyState theme={theme} icon={Package} title="No orders yet" text="Find farm tools and inputs in the Shop, add them to the cart and order." />
        </Panel>
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title="A pop-up" footer={<Btn theme={theme} onClick={() => setOpen(false)}>Done</Btn>}>
        <p className="text-sm text-slate-700">On a phone it rises from the bottom as a sheet.</p>
      </Modal>
    </main>
  );
}
