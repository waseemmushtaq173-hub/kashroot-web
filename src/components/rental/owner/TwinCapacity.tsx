'use client';

/**
 * Owner wizard, step 3 — the twin's answer (owner/TwinCapacity): beside the
 * chambers the owner sizes by hand, this panel runs those very numbers
 * through the twin's capacity engine (lib/twin/engine, a line-for-line
 * mirror of the Python pipeline) and shows what its pallet racking would
 * hold there — crate counts and tonnes, nothing estimated. It adds to the
 * form; it changes nothing in it.
 */
import { useMemo } from 'react';

import { FOOT, type SizeUnit } from '@/lib/coldLayout';
import { readNumber, type ChamberDraft } from '@/lib/coldStore';
import { TWIN_CRATE, TWIN_MAX_LOAD_KG, TWIN_PANELS, TWIN_RACK, mirrorChamberFit, tonnesOf } from '@/lib/twin/engine';

export interface TwinCapacityProps {
  drafts: ChamberDraft[];
  /** Feet or metres, as the owner typed the sizes. */
  unit: SizeUnit;
}

export const TwinCapacity = function TwinCapacity({ drafts, unit }: TwinCapacityProps) {
  const rows = useMemo(
    () =>
      drafts.map((d) => {
        const f = (s: string) => {
          const n = readNumber(s) ?? 0;
          return unit === 'ft' ? n * FOOT : n;
        };
        const fit = mirrorChamberFit({
          widthM: f(d.width),
          lengthM: f(d.length),
          heightM: f(d.height),
          doorWidthM: f(d.door.width),
          aisleWidthM: f(d.aisle),
        });
        return { d, fit };
      }),
    [drafts, unit],
  );
  const sized = rows.filter((r) => r.fit);
  const asked = (r: (typeof rows)[number]) => {
    const n = readNumber(r.d.count) ?? 0;
    return n > 0 && r.fit ? tonnesOf(n * r.fit.unit_kg) : null;
  };

  return (
    <section aria-label="What the twin engine computes for these chambers" className="rounded-2xl bg-white/90 p-4 ring-1 ring-sky-100">
      <h3 className="text-base font-semibold text-slate-900">Twin engine check</h3>
      <p className="mt-0.5 text-sm text-slate-600">
        Your sizes, run on the store&apos;s pallet racking: crates standing level by level ({TWIN_RACK.num_rack_rows} racks a level, {TWIN_CRATE.crates_per_row} crates a row × {TWIN_CRATE.rows_per_level} rows, {TWIN_RACK.num_levels} levels high).
      </p>
      {sized.length === 0 ? (
        <p className="mt-3 rounded-xl bg-sky-50 px-3 py-2 text-sm text-sky-900 ring-1 ring-sky-100">Type a chamber&apos;s length, width, height and door to see what the racking holds there.</p>
      ) : (
        <table aria-label="Crate places per chamber" className="mt-3 w-full text-left text-sm">
          <thead className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            <tr className="border-b border-slate-200">
              <th scope="col" className="py-1.5 pr-2 font-medium">Chamber</th>
              <th scope="col" className="py-1.5 pr-2 font-medium">Level</th>
              <th scope="col" className="py-1.5 pr-2 font-medium">Levels</th>
              <th scope="col" className="py-1.5 pr-2 font-medium">Places</th>
              <th scope="col" className="py-1.5 pr-2 font-medium">Your plan</th>
              <th scope="col" className="py-1.5 font-medium">Racking holds</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-800">
            {sized.map(({ d, fit }) => (
              <tr key={d.key}>
                <th scope="row" className="py-1.5 pr-2 font-semibold text-slate-900">{d.no || '?'}</th>
                <td className="py-1.5 pr-2">{fit!.crates_per_level.toLocaleString('en-IN')}</td>
                <td className="py-1.5 pr-2">{fit!.levels_per_chamber}</td>
                <td className="py-1.5 pr-2 font-semibold text-emerald-800">{fit!.crate_count.toLocaleString('en-IN')}</td>
                <td className="py-1.5 pr-2">{asked({ d, fit }) ? `${asked({ d, fit })} t of crates` : '—'}</td>
                <td className="py-1.5">{tonnesOf(fit!.actual_usable_capacity_kg)} t</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="mt-3 text-xs text-slate-500">
        Exact, not estimated: crates {TWIN_CRATE.crate_length_m}×{TWIN_CRATE.crate_width_m}×{TWIN_CRATE.crate_height_m} m at {TWIN_CRATE.weight_capacity_kg} kg; racks {TWIN_RACK.rack_length_m}×{TWIN_RACK.rack_width_m}×{TWIN_RACK.rack_height_m} m at {TWIN_RACK.floor_load_limit_kg} kg/m² a deck; chamber load cap {tonnesOf(TWIN_MAX_LOAD_KG)} t; airflow and machinery room {TWIN_PANELS.top_clearance_m + TWIN_PANELS.evaporator_height_m} m at the top. The door and aisle claim {TWIN_PANELS.door_slide_allowance_m} m + the door&apos;s width in front of the racks; a level holds as many crates as its deck&apos;s load limit allows.
      </p>
    </section>
  );
};

export default TwinCapacity;
