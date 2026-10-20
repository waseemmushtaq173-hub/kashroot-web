'use client';

/**
 * Owner wizard, step 5 — check and publish: the whole store in plain words
 * (who, where, the building, each chamber floor by floor with its rent, and
 * where farmers pay), anything still worth checking, and the store drawn
 * and in 3D exactly as farmers will see it.
 */
import { useState, type ReactNode } from 'react';
import { Building2, Landmark, Layers, Map as MapIcon, Store, TriangleAlert, Warehouse } from 'lucide-react';

import { floorText } from '@/components/rental/owner/ChamberSide';
import { Preview3D } from '@/components/rental/owner/Preview3D';
import { buildingText, StoreDrawing } from '@/components/rental/owner/StoreDrawing';
import { FOOT } from '@/lib/coldLayout';
import { bankOf, nice, unitWord, type Issue, type StoreModel } from '@/lib/coldStore';
import type { PayoutAccount } from '@/lib/db/rentals';

const WALL = { front: 'front', back: 'back', left: 'left', right: 'right' } as const;
const phone = (p: string | null) => (p ? `${p.slice(0, 5)} ${p.slice(5)}` : '');

export function ReviewStep({ model, payout, listingId, warnings }: { model: StoreModel; payout: PayoutAccount | null | undefined; listingId: string; warnings: Issue[] }) {
  const [view, setView] = useState<'drawing' | '3d'>('drawing');
  const [selected, setSelected] = useState<string | null>(model.chambers[0]?.key ?? null);
  const s = model.store;
  const u = model.building?.unit ?? 'ft';
  const len = (m: number) => `${nice(Math.round((m / (u === 'ft' ? FOOT : 1)) * 10) / 10)} ${u}`;
  const row = (Icon: typeof Store, title: string, body: ReactNode, key?: string) => (
    <div key={key} className="flex gap-3 rounded-2xl bg-white/90 p-4 ring-1 ring-slate-900/5">
      <Icon className="mt-0.5 h-5 w-5 shrink-0 text-violet-700" aria-hidden />
      <div className="min-w-0 text-base text-slate-800">
        <p className="font-semibold text-slate-900">{title}</p>
        {body}
      </div>
    </div>
  );
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <section aria-label="Your cold store in words" className="min-w-0 space-y-3">
        {row(Store, s.title, (
          <p>
            {[s.area, s.address, s.district, s.state].filter(Boolean).join(', ')}. Owner {s.owner_name} ({phone(s.phone)}){s.manager_phone ? `, manager ${s.manager_name ? `${s.manager_name} ` : ''}(${phone(s.manager_phone)})` : ''}.
          </p>
        ))}
        {model.building && row(Building2, 'The building', <p>{buildingText(model.building)}.</p>)}
        {model.chambers.map((mc) =>
          row(Warehouse, mc.name, (
            <>
              <p>
                {mc.count.toLocaleString('en-IN')} {unitWord(mc.storage, mc.count)} of {nice(mc.kg)} kg ({nice(mc.tonnes)} tonnes) · {len(mc.outline.length)} × {len(mc.outline.width)} × {len(mc.outline.height)} ·{' '}
                {mc.outline.door ? `door in the ${WALL[mc.outline.door.wall]} wall, ${len(mc.outline.door.from)} from the left corner` : ''}
              </p>
              <ul className="mt-1 list-disc pl-5 text-sm text-slate-700">
                {mc.floors.map((f) => <li key={f.floor}>{floorText(mc, f)}</li>)}
              </ul>
              <p className="mt-1 text-sm font-semibold text-slate-900">Rent ₹{nice(mc.rate)} for one {unitWord(mc.storage, 1)} a month</p>
            </>
          ), mc.key),
        )}
        {row(Landmark, 'Farmers pay you', payout ? (
          <p>
            {payout.account_name}
            {payout.account_number ? ` · ${payout.bank_name || bankOf(payout.ifsc ?? '') || 'Bank'} account ending ${payout.account_number.slice(-4)} (IFSC ${payout.ifsc})` : ''}
            {payout.upi_id ? ` · UPI ${payout.upi_id}` : ''}. Straight to you — KashRoot never holds the money.
          </p>
        ) : <p className="text-rose-800">Not added yet — go back to Payment details.</p>)}
        {warnings.length > 0 && (
          <div role="status" className="space-y-1.5 rounded-2xl bg-amber-50 p-4 text-sm text-amber-950 ring-1 ring-amber-300">
            <p className="flex items-center gap-2 font-semibold"><TriangleAlert className="h-4 w-4" aria-hidden /> Please check before you publish</p>
            <ul className="list-disc space-y-1 pl-5">{warnings.map((w) => <li key={w.message}>{w.message}</li>)}</ul>
          </div>
        )}
      </section>
      <section aria-label="Your cold store as farmers will see it" className="min-w-0 space-y-3 lg:sticky lg:top-4 lg:self-start">
        <div role="tablist" aria-label="See your store" className="flex w-fit gap-1 rounded-2xl bg-sky-50 p-1 ring-1 ring-sky-200">
          {([['drawing', 'Drawing', MapIcon], ['3d', '3D view', Layers]] as const).map(([id, label, Icon]) => (
            <button key={id} type="button" role="tab" aria-selected={view === id} onClick={() => setView(id)} className={`inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl px-4 text-sm font-semibold transition ${view === id ? 'bg-sky-700 text-white shadow' : 'text-sky-900 hover:bg-sky-100'}`}>
              <Icon className="h-4 w-4" aria-hidden /> {label}
            </button>
          ))}
        </div>
        {view === 'drawing' ? <StoreDrawing model={model} selected={selected} onPick={setSelected} title={s.title} /> : <Preview3D model={model} listingId={listingId} selected={selected} onPick={setSelected} />}
      </section>
    </div>
  );
}
