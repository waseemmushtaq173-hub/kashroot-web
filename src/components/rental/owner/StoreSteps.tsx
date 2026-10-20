'use client';

/**
 * Owner wizard, steps 1 and 2:
 *   1 Your cold store   name, owner and manager with their mobiles, state,
 *                       district, area / village and address.
 *   2 The building      length, width and height (feet or metres) and the
 *                       main door: which wall, how far from the left
 *                       corner, how wide and how high — drawn from above as
 *                       the owner types.
 */
import { DoorOpen, Ruler, Store } from 'lucide-react';

import { Box, Choose, UnitSwitch, WallPicker } from '@/components/rental/owner/fields';
import { StoreDrawing } from '@/components/rental/owner/StoreDrawing';
import { getField, JK, JK_DISTRICTS, STATES, switchUnit, type Issue, type StoreDraft, type StoreModel } from '@/lib/coldStore';

/** What every step gets from the wizard. */
export interface Kit {
  draft: StoreDraft;
  /** The model of what is typed now (for its problems), and a moment behind (for the drawings). */
  model: StoreModel;
  shown: StoreModel;
  /** The problems to show under a box. */
  issuesOf: (field: string) => Issue[];
  set: (field: string, value: string) => void;
  touch: (field: string) => void;
  fix: (field: string, value: string) => void;
  update: (fn: (d: StoreDraft) => StoreDraft) => void;
}

/** A box for one field of the draft. */
export function KitBox({ kit, field, label, ...rest }: { kit: Kit; field: string; label: string } & Partial<Parameters<typeof Box>[0]>) {
  return <Box name={field} label={label} value={getField(kit.draft, field)} onChange={(v) => kit.set(field, v)} onBlur={() => kit.touch(field)} issues={kit.issuesOf(field)} onFix={kit.fix} {...rest} />;
}

export function StoreStep({ kit }: { kit: Kit }) {
  const { draft } = kit;
  return (
    <div className="space-y-5">
      <p className="flex items-start gap-2 text-base text-slate-700">
        <Store className="mt-1 h-5 w-5 shrink-0 text-violet-700" aria-hidden /> Tell farmers whose cold store this is and where it is.
      </p>
      <KitBox kit={kit} field="title" label="Cold store name" autoComplete="organization" maxLength={100} />
      <div className="grid gap-5 sm:grid-cols-2">
        <KitBox kit={kit} field="ownerName" label="Owner’s name" autoComplete="name" maxLength={80} />
        <KitBox kit={kit} field="ownerPhone" label="Owner’s mobile" type="tel" number whole autoComplete="tel" hint="10 digits. Farmers call this number." />
        <KitBox kit={kit} field="managerName" label="Manager’s name (optional)" maxLength={80} />
        <KitBox kit={kit} field="managerPhone" label="Manager’s mobile" type="tel" number whole hint="If you run the store yourself, write your own number." />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <Choose
          label="State"
          name="state"
          value={draft.state}
          options={STATES}
          issues={kit.issuesOf('state')}
          onChange={(v) => kit.update((d) => ({ ...d, state: v, district: v === JK ? (JK_DISTRICTS.includes(d.district) ? d.district : '') : d.district }))}
        />
        {draft.state === JK ? (
          <Choose label="District" name="district" value={draft.district} options={JK_DISTRICTS} placeholder="Choose the district" issues={kit.issuesOf('district')} onChange={(v) => kit.set('district', v)} />
        ) : (
          <KitBox kit={kit} field="district" label="District" maxLength={80} />
        )}
        <KitBox kit={kit} field="area" label="Area or village" maxLength={80} hint="For example Lassipora, or Industrial Area Sopore." />
        <KitBox kit={kit} field="address" label="Address (optional)" maxLength={200} hint="Road or landmark, to help farmers find you." />
      </div>
    </div>
  );
}

export function BuildingStep({ kit }: { kit: Kit }) {
  const { draft } = kit;
  const u = draft.unit;
  const wall = draft.building.door.wall;
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="space-y-5">
        <p className="flex items-start gap-2 text-base text-slate-700">
          <Ruler className="mt-1 h-5 w-5 shrink-0 text-violet-700" aria-hidden /> Measure the whole cold store building from outside. The front is the side facing the road.
        </p>
        <div>
          <p className="mb-1.5 text-sm font-semibold text-slate-800">Measure in</p>
          <UnitSwitch value={u} onChange={(next) => kit.update((d) => switchUnit(d, next))} />
        </div>
        <div className="grid gap-5 sm:grid-cols-3">
          <KitBox kit={kit} field="building.length" label={`Length, along the front (${u})`} number />
          <KitBox kit={kit} field="building.width" label={`Width, front to back (${u})`} number />
          <KitBox kit={kit} field="building.height" label={`Height, ground to roof (${u})`} number />
        </div>
        <fieldset className="space-y-4 rounded-2xl bg-amber-50/70 p-4 ring-1 ring-amber-200">
          <legend className="sr-only">The main door</legend>
          <p className="flex items-center gap-2 text-base font-semibold text-amber-950"><DoorOpen className="h-5 w-5" aria-hidden /> The main door</p>
          <WallPicker label="Which wall is the main door in?" name="building.door.wall" value={wall} onChange={(w) => kit.set('building.door.wall', w)} />
          <KitBox
            kit={kit}
            field="building.door.from"
            label={`Main door: distance from the left corner (${u})`}
            number
            hint={`Stand outside, facing the ${wall} wall. Measure from the corner on your left to the edge of the door. At the corner: write 0.`}
          />
          <div className="grid gap-5 sm:grid-cols-2">
            <KitBox kit={kit} field="building.door.width" label={`Main door: width (${u})`} number />
            <KitBox kit={kit} field="building.door.height" label={`Main door: height (${u})`} number />
          </div>
        </fieldset>
      </div>
      <section aria-label="Live drawing of the building" className="space-y-2 lg:sticky lg:top-4 lg:self-start">
        <p className="text-sm font-semibold text-slate-800">Live drawing <span className="font-normal text-slate-600">— changes as you type</span></p>
        <StoreDrawing model={kit.shown} title={draft.title.trim() || undefined} />
      </section>
    </div>
  );
}
