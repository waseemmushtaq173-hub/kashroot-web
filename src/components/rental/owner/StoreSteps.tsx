'use client';

/**
 * Owner wizard, steps 1 and 2:
 *   1 Your cold store   name, owner and manager with their mobiles, state,
 *                       district, area / village and address.
 *   2 The building      length, width and height (feet or metres), the
 *                       main door (which wall, how far from the left
 *                       corner, how wide and how high) and where the
 *                       chambers are: left, right or both sides of the
 *                       passage from the main door — drawn from above as
 *                       the owner types.
 */
import { DoorOpen, Ruler, Store, Warehouse } from 'lucide-react';

import { Box, Choose, Problems, UnitSwitch, WallPicker } from '@/components/rental/owner/fields';
import { StoreDrawing } from '@/components/rental/owner/StoreDrawing';
import { getField, JK, JK_DISTRICTS, STATES, switchUnit, type Issue, type Sides, type StoreDraft, type StoreModel } from '@/lib/coldStore';

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

const SIDE_TEXT: Record<Sides, { title: string; text: string }> = {
  left: { title: 'Left side', text: 'Chambers on your left' },
  right: { title: 'Right side', text: 'Chambers on your right' },
  both: { title: 'Both sides', text: 'Chambers left and right' },
};

/** The store from above as you walk in: the main door at the bottom, the passage up from it, chambers on one side or both. */
function SidesIcon({ sides, on }: { sides: Sides; on: boolean }) {
  const room = (x: number, y: number, door: 'l' | 'r') => (
    <g key={`${x}-${y}`}>
      <rect x={x} y={y} width="22" height="17" rx="1.5" fill={on ? '#c4b5fd' : '#bfdbfe'} stroke={on ? '#5b21b6' : '#1d4ed8'} strokeWidth="1.5" />
      <line x1={door === 'r' ? x + 22 : x} y1={y + 5} x2={door === 'r' ? x + 22 : x} y2={y + 12} stroke="#d97706" strokeWidth="3" />
    </g>
  );
  const left = sides !== 'right';
  const right = sides !== 'left';
  return (
    <svg aria-hidden width="84" height="72" viewBox="0 0 84 72">
      <rect x="4" y="3" width="76" height="60" rx="3" fill="#ffffff" stroke="#64748b" strokeWidth="2" />
      <rect x="35" y="3" width="14" height="60" fill="#fef3c7" />
      <line x1="42" y1="58" x2="42" y2="12" stroke="#b45309" strokeWidth="1.5" strokeDasharray="3 3" />
      <path d="M38 17 L42 11 L46 17" fill="none" stroke="#b45309" strokeWidth="1.5" />
      {left && [room(7, 6, 'r'), room(7, 25, 'r'), room(7, 44, 'r')]}
      {right && [room(55, 6, 'l'), room(55, 25, 'l'), room(55, 44, 'l')]}
      <line x1="34" y1="63" x2="50" y2="63" stroke="#d97706" strokeWidth="5" />
      <text x="42" y="71.5" textAnchor="middle" fontSize="7" fontWeight="700" fill="#b45309">MAIN DOOR</text>
    </svg>
  );
}

/** Where the chambers are along the passage from the main door: three big picture buttons. */
function SidesPicker({ value, onChange, issues }: { value: Sides | ''; onChange: (v: Sides) => void; issues: Issue[] }) {
  const label = 'Where are the chambers?';
  return (
    <fieldset data-field="building.sides" className="space-y-2 rounded-2xl bg-violet-50/70 p-4 ring-1 ring-violet-200">
      <legend className="sr-only">{label}</legend>
      <p className="flex items-center gap-2 text-base font-semibold text-violet-950"><Warehouse className="h-5 w-5" aria-hidden /> {label}</p>
      <p className="text-sm text-slate-700">Stand in the main door and look in. The passage starts at the main door. Are the chambers on its left, on its right, or on both sides?</p>
      <div role="radiogroup" aria-label={label} className="grid grid-cols-3 gap-2">
        {(['left', 'right', 'both'] as const).map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={value === s}
            aria-label={SIDE_TEXT[s].title}
            onClick={() => onChange(s)}
            className={`flex min-h-[124px] cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl p-2 text-center ring-2 transition ${value === s ? 'bg-violet-700 text-white shadow-md ring-violet-700' : 'bg-white text-slate-800 ring-slate-200 hover:ring-violet-300'}`}
          >
            <span className="rounded-xl bg-white p-0.5"><SidesIcon sides={s} on={value === s} /></span>
            <span className="text-base font-bold leading-tight">{SIDE_TEXT[s].title}</span>
            <span className={`hidden text-xs sm:block ${value === s ? 'text-violet-100' : 'text-slate-600'}`}>{SIDE_TEXT[s].text}</span>
          </button>
        ))}
      </div>
      <p className="text-xs text-slate-600">KashRoot puts the chambers in number order from the main door inward{value === 'both' ? ' — Chamber 1 on the left, 2 on the right, 3 on the left and so on' : ''}, each with its door facing the passage. To put a chamber somewhere else, say where it stands in step 3 (More details).</p>
      <Problems issues={issues} />
    </fieldset>
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
        <SidesPicker value={draft.building.sides ?? ''} onChange={(v) => kit.set('building.sides', v)} issues={kit.issuesOf('building.sides')} />
      </div>
      <section aria-label="Live drawing of the building" className="space-y-2 lg:sticky lg:top-4 lg:self-start">
        <p className="text-sm font-semibold text-slate-800">Live drawing <span className="font-normal text-slate-600">— changes as you type</span></p>
        <StoreDrawing model={kit.shown} title={draft.title.trim() || undefined} />
      </section>
    </div>
  );
}
