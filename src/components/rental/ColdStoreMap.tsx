'use client';

/**
 * The cold store drawn like the seat map of a plane: one tab per chamber,
 * column letters on top, row numbers on both sides, an aisle down the
 * middle, and every place coloured by what it is for the chosen months.
 *
 *   book   farmers tap free places to choose them
 *   owner  the owner taps a place to see who booked it, or to mark a free
 *          one as "not a place" (pillar, door, walkway)
 *   view   a farmer's own places, highlighted
 */
import { Check, Clock, X } from 'lucide-react';

import { COLUMN, placeKey, placeName, type ColdChamber, type PlaceState } from '@/lib/db/coldMap';

export const PLACE_LOOK: Record<PlaceState | 'selected', { label: string; cell: string; swatch: string }> = {
  free: { label: 'Free', cell: 'bg-sky-400/90 text-white hover:bg-sky-500 shadow-sm', swatch: 'bg-sky-400' },
  selected: { label: 'Your choice', cell: 'bg-emerald-500 text-white ring-2 ring-emerald-700 shadow-md', swatch: 'bg-emerald-500' },
  held: { label: 'Waiting for payment', cell: 'bg-amber-200 text-amber-900', swatch: 'bg-amber-200' },
  booked: { label: 'Booked', cell: 'bg-white text-slate-400 ring-1 ring-slate-300', swatch: 'bg-white ring-1 ring-slate-300' },
  mine: { label: 'Your boxes', cell: 'bg-violet-600 text-white shadow-sm', swatch: 'bg-violet-600' },
  blocked: { label: 'Not a place (pillar, door, walkway)', cell: 'bg-transparent text-slate-300 ring-1 ring-dashed ring-slate-300', swatch: 'ring-1 ring-dashed ring-slate-300' },
};

export function ChamberTabs({ chambers, active, onPick, extra }: { chambers: ColdChamber[]; active: string | null; onPick: (id: string) => void; extra?: React.ReactNode }) {
  return (
    <div role="tablist" aria-label="Chambers" className="flex flex-wrap gap-2">
      {chambers.map((c) => (
        <button
          key={c.id}
          type="button"
          role="tab"
          aria-selected={active === c.id}
          onClick={() => onPick(c.id)}
          className={`cursor-pointer rounded-xl px-4 py-2 text-sm font-semibold transition ${active === c.id ? 'bg-sky-700 text-white shadow-md ring-2 ring-sky-900/20' : 'bg-sky-100 text-sky-900 hover:bg-sky-200'}`}
        >
          {c.name}
        </button>
      ))}
      {extra}
    </div>
  );
}

export function PlaceLegend({ show }: { show: (PlaceState | 'selected')[] }) {
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-700">
      {show.map((k) => (
        <li key={k} className="flex items-center gap-2">
          <span className={`inline-block h-5 w-5 rounded-md ${PLACE_LOOK[k].swatch}`} aria-hidden />
          {PLACE_LOOK[k].label}
        </li>
      ))}
    </ul>
  );
}

export function ChamberGrid({
  chamber: c,
  stateOf,
  onPlace,
  mode,
  labelOf,
}: {
  chamber: ColdChamber;
  /** What each place is (by "chamber:3B" key). */
  stateOf: (key: string, slot: string) => PlaceState | 'selected';
  onPlace?: (key: string, slot: string, state: PlaceState | 'selected') => void;
  mode: 'book' | 'owner' | 'view';
  /** Owner: a short label on booked places (the farmer's initials). */
  labelOf?: (key: string) => string | undefined;
}) {
  // An aisle down the middle, as in a plane, once there are four or more columns.
  const aisle = c.cols >= 4 ? Math.ceil(c.cols / 2) : -1;
  const cols = Array.from({ length: c.cols }, (_, i) => i);
  const rows = Array.from({ length: c.rows }, (_, i) => i + 1);
  const cell = 'h-11 w-11 shrink-0 sm:h-12 sm:w-12';
  const Gap = () => <span aria-hidden className="w-6 shrink-0 sm:w-8" />;

  return (
    <div className="overflow-x-auto overscroll-x-contain pb-2">
      <div className="mx-auto w-max rounded-3xl bg-gradient-to-b from-slate-50 to-sky-50/60 p-4 ring-1 ring-slate-900/5" role="group" aria-label={`${c.name}: ${c.rows} rows, ${c.cols} columns, ${c.boxes_per_slot} boxes per place`}>
        <p className="mb-3 text-center text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">▲ Door / front</p>
        <div className="flex items-center gap-1.5">
          <span aria-hidden className="w-7 shrink-0" />
          {cols.map((i) => (
            <span key={i} className="contents">
              {i === aisle && <Gap />}
              <span aria-hidden className={`${cell} grid place-items-center text-base font-semibold text-slate-600`}>{COLUMN(i)}</span>
            </span>
          ))}
          <span aria-hidden className="w-7 shrink-0" />
        </div>
        {rows.map((r) => (
          <div key={r} className="mt-1.5 flex items-center gap-1.5">
            <span aria-hidden className="w-7 shrink-0 text-right text-base font-semibold text-slate-600">{r}</span>
            {cols.map((i) => {
              const slot = placeName(r, i);
              const key = placeKey(c.id, slot);
              const state = stateOf(key, slot);
              // On a farmer's own map, the other places stay quiet so theirs stand out.
              const look = mode === 'view' && state === 'free' ? { ...PLACE_LOOK.free, cell: 'bg-slate-100 text-slate-300' } : PLACE_LOOK[state];
              const clickable = mode === 'book' ? state === 'free' || state === 'selected' : mode === 'owner';
              const label = labelOf?.(key);
              return (
                <span key={i} className="contents">
                  {i === aisle && <Gap />}
                  <button
                    type="button"
                    disabled={!clickable}
                    aria-pressed={mode === 'book' ? state === 'selected' : undefined}
                    aria-label={`${c.name}, place ${slot}, ${look.label}${state === 'free' || state === 'selected' ? `, ${c.boxes_per_slot} boxes` : ''}${label ? `, ${label}` : ''}`}
                    title={`${slot} · ${look.label}${label ? ` · ${label}` : ''}`}
                    onClick={() => onPlace?.(key, slot, state)}
                    className={`${cell} relative grid place-items-center rounded-lg text-[11px] font-bold transition ${look.cell} ${clickable ? 'cursor-pointer' : 'cursor-default'} disabled:opacity-100`}
                  >
                    {state === 'selected' ? <Check className="h-5 w-5" aria-hidden /> : label && (state === 'held' || state === 'booked') ? label : state === 'booked' ? <X className="h-9 w-9 stroke-[1.25]" aria-hidden /> : state === 'held' ? <Clock className="h-4 w-4" aria-hidden /> : state === 'mine' ? (label ?? 'You') : label ?? ''}
                  </button>
                </span>
              );
            })}
            <span aria-hidden className="w-7 shrink-0 text-left text-base font-semibold text-slate-600">{r}</span>
          </div>
        ))}
        <p className="mt-3 text-center text-xs text-slate-500">{c.boxes_per_slot} boxes per place</p>
      </div>
    </div>
  );
}
