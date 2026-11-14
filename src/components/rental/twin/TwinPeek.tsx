'use client';

/**
 * The farmer's door into the real store (twin/TwinPeek): a "See inside in 3D"
 * button on a KashRoot ColdStore card that opens the digital twin
 * (components/rental/ColdStoreTwin) in a wide sheet, with that farmer able
 * to light up their own grower's crates. It only adds a door; everything on
 * the card stays as it is.
 */
import dynamic from 'next/dynamic';
import { X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { cratesText, tonnesOf } from '@/lib/twin/engine';
import { fetchTwinMeta, growersOf, type TwinMetadata } from '@/lib/twin/metadata';

/** three.js loads only when the sheet opens. */
const ColdStoreTwin = dynamic(() => import('@/components/rental/ColdStoreTwin').then((m) => m.ColdStoreTwin), {
  ssr: false,
  loading: () => <div className="grid h-[420px] place-items-center rounded-3xl bg-slate-100 text-sm text-slate-500">Opening the twin…</div>,
});

export interface TwinPeekProps {
  /** The listing's title: the twin rides on the KashRoot Cold Store only. */
  store: string;
}

export const TwinPeek = function TwinPeek({ store }: TwinPeekProps) {
  const [open, setOpen] = useState(false);
  const [meta, setMeta] = useState<TwinMetadata | null>(null);
  const [grower, setGrower] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let gone = false;
    fetchTwinMeta()
      .then((m) => {
        if (!gone) setMeta(m);
      })
      .catch(() => undefined);
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', esc);
    document.body.style.overflow = 'hidden';
    return () => {
      gone = true;
      window.removeEventListener('keydown', esc);
      document.body.style.overflow = '';
    };
  }, [open]);

  if (!/kashroot/i.test(store)) return null;
  const growers = meta ? growersOf(meta) : [];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 inline-flex min-h-[48px] cursor-pointer items-center gap-2 rounded-2xl bg-sky-50 px-4 text-sm font-semibold text-sky-900 ring-2 ring-sky-200 hover:bg-sky-100"
      >
        See inside in 3D — the store&apos;s digital twin
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="The KashRoot cold store digital twin in 3D"
          className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 p-3 backdrop-blur-sm sm:p-6"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="mx-auto max-w-5xl space-y-3 rounded-3xl bg-white p-3 shadow-xl sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="font-display text-lg font-semibold text-slate-900">The real cold store, in 3D</h2>
                {meta && (
                  <p className="text-sm text-slate-600">
                    {cratesText(meta.totals.total_crate_count)} on racks · {cratesText(meta.totals.booked_crate_count)} booked · {tonnesOf(meta.totals.occupied_capacity_kg)} t stored now
                  </p>
                )}
              </div>
              <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="min-h-[44px] cursor-pointer rounded-xl px-3 text-sm font-semibold text-slate-600 ring-2 ring-slate-200 hover:bg-slate-50">
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>

            {growers.length > 0 && (
              <div className="rounded-2xl bg-sky-50/70 p-3 ring-1 ring-sky-200">
                <p className="text-sm font-semibold text-sky-900">Light up a grower&apos;s crates</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {growers.map((g) => (
                    <button
                      key={g.grower_id}
                      type="button"
                      aria-pressed={grower === g.grower_id}
                      onClick={() => setGrower(grower === g.grower_id ? null : g.grower_id)}
                      className={`min-h-[40px] cursor-pointer rounded-xl px-3 text-xs font-semibold ring-2 transition ${grower === g.grower_id ? 'bg-sky-700 text-white ring-sky-700' : 'bg-white text-sky-900 ring-sky-200 hover:bg-sky-100'}`}
                    >
                      {g.name.split(' - ')[0]} · {g.product_type}
                    </button>
                  ))}
                  {grower && (
                    <button type="button" onClick={() => setGrower(null)} className="min-h-[40px] cursor-pointer rounded-xl px-3 text-xs font-semibold text-slate-600 ring-2 ring-slate-200 hover:bg-slate-50">
                      Show all
                    </button>
                  )}
                </div>
                {growers.find((g) => g.grower_id === grower)?.note && (
                  <p className="mt-2 text-xs text-amber-800">{growers.find((g) => g.grower_id === grower)!.note}</p>
                )}
              </div>
            )}

            <ColdStoreTwin grower={grower} />
          </div>
        </div>
      )}
    </>
  );
};

export default TwinPeek;
