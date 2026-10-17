'use client';

/**
 * The cold store, drawn so anyone can find their way around it:
 *
 *   StorePlan     the whole store from above — every chamber as a room along
 *                 the corridor, with how many places are free in each. Tap a
 *                 room to open it.
 *   ChamberDiagram  one chamber up close, drawn to scale from its measured
 *                 size: walls, door, walkway, every stack where it stands,
 *                 with the measurements (components/rental/ChamberDiagram).
 *   ChamberGrid   the same for a chamber drawn only as rows × stacks: the door
 *                 at the bottom, rows counted from the door ("Row 1" is
 *                 nearest), stacks counted from the left.
 *   ColdStore3D   the same store in 3D (components/rental/ColdStore3D).
 *   ColdStoreExplorer  plan ⇄ 3D switch around all of the above.
 *
 * Modes:
 *   book   farmers tap free places to choose them
 *   owner  the owner taps a booked place to see who has it
 *   view   a farmer's own boxes, highlighted
 */
import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';
import { Box, Check, Clock, DoorOpen, Layers, Map as MapIcon } from 'lucide-react';

import { ChamberDiagram } from '@/components/rental/ChamberDiagram';
import { countLooks, PLACE_LOOK, placesOf, type Look } from '@/components/rental/placeLook';
import { planOf, showLength } from '@/lib/coldLayout';
import { placeKey, placeLabel, placeName, usablePlaces, type ColdChamber } from '@/lib/db/coldMap';

export { PLACE_LOOK, type Look };

// three.js loads only when someone opens the 3D view.
const ColdStore3D = dynamic(() => import('@/components/rental/ColdStore3D').then((m) => m.ColdStore3D), {
  ssr: false,
  loading: () => <div className="grid h-[420px] place-items-center rounded-3xl bg-slate-100 text-sm text-slate-500">Opening the 3D view…</div>,
});

export function PlaceLegend({ show }: { show: Look[] }) {
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

/**
 * The whole store from above: one room per chamber, side by side along the
 * corridor, each with a small picture of its places and what is free.
 */
export function StorePlan({ chambers, stateOf, active, onPick, mode }: { chambers: ColdChamber[]; stateOf: (c: ColdChamber, slot: string) => Look; active: string | null; onPick: (id: string) => void; mode: 'book' | 'owner' | 'view' }) {
  // Measured chambers share one scale, so a bigger chamber looks bigger.
  const sized = chambers.filter((c) => c.size);
  const scale = sized.length ? Math.min(160 / Math.max(...sized.map((c) => c.size!.length)), 190 / Math.max(...sized.map((c) => c.size!.width))) : 0;
  return (
    <div className="rounded-3xl bg-gradient-to-b from-slate-100 to-slate-50 p-3 ring-1 ring-slate-900/10 sm:p-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">The whole store · tap a chamber to open it</p>
      <ul className="flex flex-wrap items-end gap-3">
        {chambers.map((c) => {
          const n = countLooks(c, stateOf);
          const cell = Math.max(4, Math.min(10, Math.floor(150 / Math.max(c.cols, c.rows))));
          const on = active === c.id;
          return (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onPick(c.id)}
                aria-pressed={on}
                aria-label={`${c.name}: ${n.free} free places${n.mine ? `, ${n.mine} yours` : ''}${n.selected ? `, ${n.selected} chosen` : ''}. Open this chamber.`}
                className={`group flex cursor-pointer flex-col items-center rounded-2xl border-[3px] bg-white p-2.5 pb-0 text-left transition ${on ? 'border-sky-700 shadow-lg' : 'border-slate-400 hover:border-sky-500 hover:shadow-md'}`}
              >
                <span className="flex w-full items-center justify-between gap-3 text-sm font-semibold text-slate-900">
                  {c.name}
                  {on && <span className="rounded-full bg-sky-700 px-2 py-0.5 text-[10px] font-bold uppercase text-white">Open</span>}
                </span>
                <span className="mt-0.5 block w-full text-xs text-slate-600">
                  <strong className="text-sky-800">{n.free}</strong> free of {usablePlaces(c)}
                  {mode === 'book' && n.selected > 0 && <> · <strong className="text-emerald-700">{n.selected} chosen</strong></>}
                  {n.mine > 0 && <> · <strong className="text-violet-700">{n.mine} yours</strong></>}
                </span>
                {c.size ? (
                  <MiniToScale chamber={c} k={scale} stateOf={stateOf} />
                ) : (
                  <svg aria-hidden width={c.cols * cell + 2} height={c.rows * cell + 2} className="mt-2" role="presentation">
                    {placesOf(c).map(([r, i, slot]) => (
                      // Row 1 (nearest the door) at the bottom, as you walk in.
                      <rect key={slot} x={1 + i * cell} y={1 + (c.rows - r) * cell} width={cell - 1} height={cell - 1} rx={cell > 6 ? 1.5 : 0.5} fill={PLACE_LOOK[stateOf(c, slot)].mini} />
                    ))}
                  </svg>
                )}
                {c.size && <span className="mt-1 block text-[10px] font-medium text-slate-500">{showLength(c.size.length, c.size.unit)} × {showLength(c.size.width, c.size.unit)} × {showLength(c.size.height, c.size.unit)}</span>}
                <span className="mt-1 flex h-4 w-12 items-end justify-center rounded-t-md bg-amber-100 text-[9px] font-bold uppercase leading-none text-amber-900">door</span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="mt-0 flex items-center justify-center gap-2 rounded-xl bg-amber-50 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-amber-900 ring-1 ring-amber-200">
        <DoorOpen className="h-4 w-4" aria-hidden /> Corridor · loading bay
      </p>
    </div>
  );
}

/** A measured chamber in the whole-store plan, to scale: walkway and stacks where they stand. */
function MiniToScale({ chamber: c, k, stateOf }: { chamber: ColdChamber; k: number; stateOf: (c: ColdChamber, slot: string) => Look }) {
  const size = c.size!;
  const plan = planOf(size);
  const w = size.width * k;
  const h = size.length * k;
  const Y = (z: number) => 1 + (size.length - z) * k;
  return (
    <svg aria-hidden width={w + 2} height={h + 2} className="mt-2" role="presentation">
      <rect x={1} y={1} width={w} height={h} fill="#f8fafc" stroke="#94a3b8" />
      {plan.aisleX && <rect x={1 + plan.aisleX[0] * k} y={1} width={(plan.aisleX[1] - plan.aisleX[0]) * k} height={h} fill="#fef3c7" />}
      {placesOf(c)
        .filter(([r, i]) => r <= plan.rows && i < plan.cols)
        .map(([r, i, slot]) => (
          <rect key={slot} x={1 + plan.colX[i] * k} y={Y(plan.rowZ[r - 1] + plan.placeD)} width={Math.max(1, plan.placeW * k)} height={Math.max(1, plan.placeD * k)} rx={0.8} fill={PLACE_LOOK[stateOf(c, slot)].mini} />
        ))}
    </svg>
  );
}

/**
 * One chamber up close, as you see it walking in: the door at the bottom,
 * Row 1 nearest the door, stacks numbered from the left.
 */
export function ChamberGrid({
  chamber: c,
  stateOf,
  onPlace,
  mode,
  labelOf,
}: {
  chamber: ColdChamber;
  stateOf: (c: ColdChamber, slot: string) => Look;
  onPlace?: (c: ColdChamber, slot: string, look: Look) => void;
  mode: 'book' | 'owner' | 'view';
  /** Owner: a short label on booked places (the farmer's initials). */
  labelOf?: (key: string) => string | undefined;
}) {
  const cols = Array.from({ length: c.cols }, (_, i) => i);
  // Back wall at the top, Row 1 at the bottom by the door.
  const rows = Array.from({ length: c.rows }, (_, i) => c.rows - i);
  const cell = 'h-12 w-12 shrink-0';

  return (
    <div className="overflow-x-auto overscroll-x-contain pb-2">
      <div className="mx-auto w-max" role="group" aria-label={`${c.name}: ${c.rows} rows from the door, ${c.cols} stacks in each row, ${c.boxes_per_slot} boxes in each place`}>
        <p className="mb-1 text-center text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Back wall</p>
        <div className="rounded-2xl border-[6px] border-b-0 border-slate-500 bg-slate-50 px-3 pb-3 pt-2 shadow-inner">
          <div className="flex items-center gap-1.5">
            <span className="w-16 shrink-0 text-right text-[11px] font-semibold uppercase text-slate-500">Stack →</span>
            {cols.map((i) => (
              <span key={i} aria-hidden className={`${cell} grid h-6 place-items-center text-sm font-bold text-slate-600`}>{i + 1}</span>
            ))}
          </div>
          {rows.map((r) => (
            <div key={r} className="mt-1.5 flex items-center gap-1.5">
              <span aria-hidden className="w-16 shrink-0 text-right text-sm font-semibold text-slate-700">Row {r}</span>
              {cols.map((i) => {
                const slot = placeName(r, i);
                const key = placeKey(c.id, slot);
                const look = stateOf(c, slot);
                const style = mode === 'view' && look === 'free' ? 'bg-white text-slate-300 ring-1 ring-slate-200' : PLACE_LOOK[look].cell;
                const clickable = mode === 'book' ? look === 'free' || look === 'selected' : mode === 'owner';
                const label = labelOf?.(key);
                const name = `${placeLabel(slot)}`;
                return (
                  <button
                    key={i}
                    type="button"
                    disabled={!clickable}
                    aria-pressed={mode === 'book' ? look === 'selected' : undefined}
                    aria-label={`${c.name}, ${name}: ${PLACE_LOOK[look].label}${look === 'free' || look === 'selected' ? `, ${c.boxes_per_slot} boxes` : ''}${label ? `, ${label}` : ''}`}
                    title={`${name} · ${PLACE_LOOK[look].label}${label ? ` · ${label}` : ''}`}
                    onClick={() => onPlace?.(c, slot, look)}
                    className={`${cell} grid place-items-center rounded-lg text-[11px] font-bold transition ${style} ${clickable ? 'cursor-pointer' : 'cursor-default'} disabled:opacity-100`}
                  >
                    {look === 'selected' ? (
                      <Check className="h-5 w-5" aria-hidden />
                    ) : label && (look === 'held' || look === 'booked') ? (
                      label
                    ) : look === 'booked' ? (
                      <Box className="h-5 w-5" aria-hidden />
                    ) : look === 'held' ? (
                      <Clock className="h-4 w-4" aria-hidden />
                    ) : look === 'mine' ? (
                      label ?? 'You'
                    ) : look === 'free' && mode === 'book' ? (
                      <span aria-hidden className="text-lg font-normal leading-none">+</span>
                    ) : (
                      label ?? ''
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        {/* The front wall, with the door in the middle. */}
        <div aria-hidden className="flex items-stretch">
          <span className="h-1.5 flex-1 rounded-bl-md bg-slate-500" />
          <span className="-mb-5 flex w-28 items-start justify-center pt-0.5 text-[11px] font-bold uppercase tracking-[0.18em] text-amber-800">
            <DoorOpen className="mr-1 h-4 w-4" /> Door
          </span>
          <span className="h-1.5 flex-1 rounded-br-md bg-slate-500" />
        </div>
        <p className="mt-6 text-center text-xs text-slate-500">{c.boxes_per_slot} boxes fit in each place · Row 1 is nearest the door</p>
      </div>
    </div>
  );
}

/**
 * The whole store, plan or 3D, with the open chamber up close underneath
 * the plan. `stateOf` must be stable (useCallback) for the 3D view.
 */
export function ColdStoreExplorer({
  chambers,
  stateOf,
  mode,
  onPlace,
  labelOf,
  legend,
  active,
  onActive,
  single = false,
}: {
  chambers: ColdChamber[];
  stateOf: (c: ColdChamber, slot: string) => Look;
  mode: 'book' | 'owner' | 'view';
  onPlace?: (c: ColdChamber, slot: string, look: Look) => void;
  labelOf?: (key: string) => string | undefined;
  legend: Look[];
  active: string | null;
  onActive: (id: string) => void;
  /** One chamber on its own (the owner's preview): no whole-store overview. */
  single?: boolean;
}) {
  const [view, setView] = useState<'plan' | '3d'>('plan');
  const chamber = chambers.find((c) => c.id === active) ?? chambers[0];
  const totals = useMemo(() => chambers.reduce((s, c) => {
    const n = countLooks(c, stateOf);
    return { free: s.free + n.free, all: s.all + usablePlaces(c) };
  }, { free: 0, all: 0 }), [chambers, stateOf]);
  const tab = (id: 'plan' | '3d', label: string, Icon: typeof MapIcon) => (
    <button
      type="button"
      role="tab"
      aria-selected={view === id}
      onClick={() => setView(id)}
      className={`inline-flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition sm:flex-none ${view === id ? 'bg-sky-700 text-white shadow' : 'text-sky-900 hover:bg-sky-100'}`}
    >
      <Icon className="h-4 w-4" aria-hidden /> {label}
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="How to see the store" className="flex w-full gap-1 rounded-2xl bg-sky-50 p-1 ring-1 ring-sky-200 sm:w-auto">
          {tab('plan', 'Floor plan', MapIcon)}
          {tab('3d', '3D view', Layers)}
        </div>
        <p className="text-sm text-slate-700">
          {chambers.length} chamber{chambers.length === 1 ? '' : 's'} · <strong className="text-sky-800">{totals.free}</strong> of {totals.all} places free
        </p>
      </div>

      {view === '3d' ? (
        <ColdStore3D chambers={chambers} stateOf={stateOf} mode={mode} onPlace={onPlace} active={chamber?.id ?? null} onActive={onActive} />
      ) : (
        <>
          {!single && <StorePlan chambers={chambers} stateOf={stateOf} active={chamber?.id ?? null} onPick={onActive} mode={mode} />}
          {chamber && (
            <section aria-label={chamber.name} className="space-y-2">
              <h3 className="text-base font-semibold text-slate-900">{chamber.name} <span className="font-normal text-slate-500">· {chamber.size ? 'drawn to scale' : 'up close'}</span></h3>
              {chamber.size ? (
                <ChamberDiagram chamber={chamber} size={chamber.size} stateOf={stateOf} onPlace={onPlace} mode={mode} labelOf={labelOf} />
              ) : (
                <ChamberGrid chamber={chamber} stateOf={stateOf} onPlace={onPlace} mode={mode} labelOf={labelOf} />
              )}
            </section>
          )}
        </>
      )}
      <PlaceLegend show={legend} />
    </div>
  );
}

