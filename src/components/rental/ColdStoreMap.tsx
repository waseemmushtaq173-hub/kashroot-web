'use client';

/**
 * The cold store, drawn so anyone can find their way around it — all from
 * the owner's own numbers (three/storeScene), so the drawing, the 3D view
 * and the walk inside show the very same store:
 *
 *   Drawing       the whole store from above to scale (three/StoreTopView):
 *                 the building, the main door, the passage, every chamber
 *                 where it stands with its door, and the places of one floor
 *                 (a floor switcher when chambers have floors). Tap a chamber
 *                 to open it; underneath, the open chamber's floor up close.
 *   ChamberFacts  what one chamber floor holds: size, places, bins / crates /
 *                 boxes on each place and in all, how many are free.
 *   ChamberDiagram  one chamber floor up close, drawn to scale: walls, door,
 *                 walkway, every stack where it stands, with measurements
 *                 (components/rental/ChamberDiagram).
 *   ChamberGrid   the same for a chamber drawn only as rows × stacks: the door
 *                 at the bottom, rows counted from the door ("Row 1" is
 *                 nearest), stacks counted from the left.
 *   3D view       the whole store in 3D; Walk inside: a visitor at eye
 *                 height walking in through the main door
 *                 (components/rental/ColdStore3D, loaded only when opened).
 *   ColdStoreExplorer  Drawing ⇄ 3D view ⇄ Walk inside around all of the above.
 *
 * A place can be shared: farmers book just the bins, crates or boxes they
 * have, and a place with some on it ("part") still takes more until it is
 * full. `roomOf` says how many still fit on each place.
 *
 * Modes:
 *   book   farmers tap free or shared places to choose them
 *   owner  the owner taps a booked place to see who has it
 *   view   a farmer's own boxes, highlighted
 */
import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Box, Check, Clock, DoorOpen, Footprints, Hand, Layers, Map as MapIcon } from 'lucide-react';

import { ChamberDiagram } from '@/components/rental/ChamberDiagram';
import { lookLabel, PLACE_LOOK, placesOf, type Look } from '@/components/rental/placeLook';
import { StoreTopView, type ChamberCount } from '@/components/rental/three/StoreTopView';
import { buildScene } from '@/components/rental/three/storeScene';
import { layersText, planOf, showLength } from '@/lib/coldLayout';
import { asBuilding, countText, unitsText, unitWord, type Building, type Storage } from '@/lib/coldStore';
import { supabase } from '@/lib/db/client';
import { placeKey, placeLabel, placeName, usablePlaces, type ColdChamber } from '@/lib/db/coldMap';

export { PLACE_LOOK, type Look };

// three.js loads only when someone opens the 3D view or walks inside.
const ColdStore3D = dynamic(() => import('@/components/rental/ColdStore3D').then((m) => m.ColdStore3D), {
  ssr: false,
  loading: () => <div className="grid h-[420px] place-items-center rounded-3xl bg-slate-100 text-sm text-slate-500">Opening the 3D view…</div>,
});

/** "4,480" — Indian grouping. */
const boxes = (n: number) => n.toLocaleString('en-IN');

export type RoomOf = (c: ColdChamber, slot: string) => number;
/** Room on a place from its look alone: a free place takes a full stack, anything else none. */
export const roomByLook = (stateOf: (c: ColdChamber, slot: string) => Look): RoomOf => (c, slot) => (stateOf(c, slot) === 'free' ? c.boxes_per_slot : 0);

/** Boxes a chamber holds, the boxes still free on it, and how many places have room. */
export function chamberBoxes(c: ColdChamber, roomOf: RoomOf) {
  let free = 0;
  let open = 0;
  for (const [, , slot] of placesOf(c)) {
    if (c.blocked.includes(slot)) continue;
    const r = roomOf(c, slot);
    free += r;
    if (r > 0) open++;
  }
  return { holds: usablePlaces(c) * c.boxes_per_slot, free, open, places: usablePlaces(c) };
}

/**
 * What one chamber floor holds, as its owner set it up: its size, the
 * places on it, the bins, crates or boxes on each place and in all, and how
 * many are free.
 */
export function ChamberFacts({ chamber: c, roomOf, mode }: { chamber: ColdChamber; roomOf: RoomOf; mode: 'book' | 'owner' | 'view' }) {
  const b = chamberBoxes(c, roomOf);
  const size = c.size;
  const plan = size ? planOf(size) : null;
  const st: Storage = c.storage;
  const floors = size?.floors ?? 1;
  const counted = Boolean(size?.places);
  const fact = (label: string, value: string, sub?: string, strong = false) => (
    <div className={`rounded-2xl p-3 ring-1 ${strong ? 'bg-sky-700 text-white ring-sky-800' : 'bg-white ring-slate-900/5'}`}>
      <dt className={`text-[11px] font-semibold uppercase tracking-[0.12em] ${strong ? 'text-sky-100' : 'text-slate-500'}`}>{label}</dt>
      <dd className={`mt-0.5 text-lg font-bold tabular-nums ${strong ? 'text-white' : 'text-slate-900'}`}>{value}</dd>
      {sub && <dd className={`text-xs ${strong ? 'text-sky-100' : 'text-slate-600'}`}>{sub}</dd>}
    </div>
  );
  const sizeFact = () => {
    if (!size || !plan) return fact('Places', String(b.places), `${c.rows} rows × ${c.cols} stacks`);
    if (!counted) return fact('Size', `${showLength(size.length, size.unit)} × ${showLength(size.width, size.unit)}`, `length × breadth · ${showLength(size.height, size.unit)} high`);
    // Owner wizard: measured from its door; each floor is the chamber's height ÷ its floors.
    return fact('Size', `${showLength(size.width, size.unit)} × ${showLength(size.length, size.unit)}`, `wide × deep from its door · ${showLength(size.height, size.unit)} high${floors > 1 ? `, floor ${size.floor ?? 1} of ${floors} (${showLength(plan.floorH ?? size.height / floors, size.unit)} each)` : ''}`);
  };
  return (
    <div className="space-y-2">
      <dl aria-label={`${c.name}: what it holds`} className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {sizeFact()}
        {size && plan ? fact('Places', String(b.places), `${c.rows} rows × ${c.cols} stacks${plan.aisleAfter !== null ? ' + walkway' : ''}`) : null}
        {fact('Each place holds', countText(c.boxes_per_slot, st), plan ? `${layersText(plan)} · ${showLength(plan.stackHeight, size!.unit)} high` : undefined)}
        {fact(floors > 1 ? `Floor ${size?.floor ?? 1} holds` : 'Chamber holds', countText(b.holds, st), mode === 'view' ? undefined : `${boxes(b.free)} free · room on ${b.open} of ${b.places} places`, true)}
      </dl>
      {mode === 'book' && (
        <p className="flex items-start gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-950 ring-1 ring-emerald-200">
          <Hand className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            You choose: tap any place with room where you want your {unitWord(st)} — any number, small or big. A place in {c.name} takes up to {countText(c.boxes_per_slot, st)}; a part-filled place takes the rest, and you pay only for your own {unitWord(st)}.
          </span>
        </p>
      )}
    </div>
  );
}

/** What each colour means, in the words of what the store holds (`units`: "bins and crates"; boxes when not given). */
export function PlaceLegend({ show, units }: { show: Look[]; units?: string }) {
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-700">
      {show.map((k) => (
        <li key={k} className="flex items-center gap-2">
          <span className={`inline-block h-5 w-5 rounded-md ${PLACE_LOOK[k].swatch}`} aria-hidden />
          {lookLabel(k, units)}
        </li>
      ))}
    </ul>
  );
}

/**
 * One chamber up close, as you see it walking in: the door at the bottom,
 * Row 1 nearest the door, stacks numbered from the left.
 */
export function ChamberGrid({
  chamber: c,
  stateOf,
  roomOf = roomByLook(stateOf),
  onPlace,
  mode,
  labelOf,
}: {
  chamber: ColdChamber;
  stateOf: (c: ColdChamber, slot: string) => Look;
  roomOf?: RoomOf;
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
                const clickable = mode === 'book' ? look === 'free' || look === 'part' || look === 'selected' : mode === 'owner';
                const label = labelOf?.(key);
                const name = `${placeLabel(slot)}`;
                const room = look === 'part' ? roomOf(c, slot) : 0;
                return (
                  <button
                    key={i}
                    type="button"
                    disabled={!clickable}
                    aria-pressed={mode === 'book' ? look === 'selected' : undefined}
                    aria-label={`${c.name}, ${name}: ${PLACE_LOOK[look].label}${look === 'free' ? `, ${c.boxes_per_slot} boxes` : look === 'part' ? `, room for ${room} of ${c.boxes_per_slot} boxes` : ''}${label ? `, ${label}` : ''}`}
                    title={`${name} · ${PLACE_LOOK[look].label}${look === 'part' ? ` · room for ${room} boxes` : ''}${label ? ` · ${label}` : ''}`}
                    onClick={() => onPlace?.(c, slot, look)}
                    style={look === 'part' ? ({ '--full': `${Math.round((1 - room / c.boxes_per_slot) * 100)}%` } as CSSProperties) : undefined}
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
                    ) : look === 'part' ? (
                      label ?? <span aria-hidden className="rounded bg-white/80 px-1 leading-tight">{room}</span>
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
        <p className="mt-6 text-center text-xs text-slate-500">Up to {c.boxes_per_slot} boxes on each place · Row 1 is nearest the door</p>
      </div>
    </div>
  );
}

/**
 * The store's building and rent, read once when the explorer opens without
 * them (stores listed before the wizard have no building). `wizard`: the
 * store has chambers from the owner wizard, so it has a building — until it
 * is read the whole store is not drawn (it would jump from one layout to
 * another); older stores are drawn at once.
 */
function useStoreDetails(listingId: string | undefined, building: Building | null | undefined, rate: number | null | undefined, wizard: boolean) {
  const [read, setRead] = useState<{ id: string; building: Building | null; rate: number | null } | null>(null);
  const need = building === undefined || rate === undefined;
  const readable = need && Boolean(listingId) && /^[0-9a-f-]{36}$/i.test(listingId ?? '');
  useEffect(() => {
    if (!readable || !listingId) return;
    let on = true;
    void supabase
      .from('rental_listings')
      .select('building, rate')
      .eq('id', listingId)
      .maybeSingle()
      .then(
        ({ data }) => on && setRead({ id: listingId, building: asBuilding((data as { building?: unknown } | null)?.building ?? null), rate: Number((data as { rate?: unknown } | null)?.rate) || null }),
        // Not read (no network): the chambers are still drawn, side by side.
        () => on && setRead({ id: listingId, building: null, rate: null }),
      );
    return () => {
      on = false;
    };
  }, [readable, listingId]);
  const mine = read?.id === listingId ? read : null;
  return {
    building: building !== undefined ? building : (mine?.building ?? null),
    rate: rate !== undefined ? rate : (mine?.rate ?? null),
    // The building is still being read.
    waiting: wizard && building === undefined && readable && !mine,
  };
}

/** "80 bins, 3,000 crates and 480 boxes" — or "600 boxes" for one kind. */
function mixText(by: Partial<Record<Storage, number>>): string {
  const parts = (['bins', 'crates', 'boxes'] as const).filter((k) => by[k] !== undefined).map((k) => countText(by[k] ?? 0, k));
  if (parts.length < 2) return parts[0] ?? countText(0, 'boxes');
  return `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
}

export type ExplorerView = 'drawing' | '3d' | 'walk';

/**
 * The whole store: the Drawing (to scale, a floor at a time, with the open
 * chamber up close underneath), the 3D view, and the walk inside — the same
 * store in all three, built from the owner's numbers. `stateOf` and `roomOf`
 * must be stable (useCallback) for the 3D view. `building` and `rate` are
 * the store's (rental_listings); when not given they are read once.
 */
export function ColdStoreExplorer({
  chambers,
  stateOf,
  roomOf: roomOfProp,
  mode,
  onPlace,
  labelOf,
  legend,
  active,
  onActive,
  single = false,
  building: buildingProp,
  rate: rateProp,
}: {
  chambers: ColdChamber[];
  stateOf: (c: ColdChamber, slot: string) => Look;
  /** Boxes that still fit on each place (stable, like stateOf); by default a free place takes a full stack. */
  roomOf?: RoomOf;
  mode: 'book' | 'owner' | 'view';
  onPlace?: (c: ColdChamber, slot: string, look: Look) => void;
  labelOf?: (key: string) => string | undefined;
  legend: Look[];
  active: string | null;
  onActive: (id: string) => void;
  /** One chamber on its own (the owner's preview): no whole-store overview. */
  single?: boolean;
  /** The store's building (rental_listings.building); null: none. Read from the store when not given. */
  building?: Building | null;
  /** The store's rent for chambers without their own; read from the store when not given. */
  rate?: number | null;
}) {
  const [view, setView] = useState<ExplorerView>('drawing');
  const { building, rate, waiting } = useStoreDetails(
    chambers[0]?.listing_id,
    buildingProp,
    rateProp,
    chambers.some((c) => c.chamber_no !== null),
  );
  const chamber = chambers.find((c) => c.id === active) ?? chambers[0];
  const byLook = useMemo(() => roomByLook(stateOf), [stateOf]);
  const roomOf = roomOfProp ?? byLook;
  const scene = useMemo(() => buildScene(chambers, building), [chambers, building]);
  // What each chamber (all its floors) holds and has free.
  const counts = useMemo<ChamberCount[]>(
    () =>
      scene.chambers.map((sc) =>
        sc.group.floors.reduce<ChamberCount>((s, row) => {
          const n = chamberBoxes(row, roomOf);
          return { holds: s.holds + n.holds, free: s.free + n.free, open: s.open + n.open, places: s.places + n.places };
        }, { holds: 0, free: 0, open: 0, places: 0 }),
      ),
    [scene, roomOf],
  );
  const totals = useMemo(() => {
    const holds: Partial<Record<Storage, number>> = {};
    const free: Partial<Record<Storage, number>> = {};
    scene.chambers.forEach((sc, i) => {
      holds[sc.storage] = (holds[sc.storage] ?? 0) + counts[i].holds;
      free[sc.storage] = (free[sc.storage] ?? 0) + counts[i].free;
    });
    return { holds, free };
  }, [scene, counts]);
  const openIndex = scene.chambers.findIndex((sc) => sc.group.floors.some((r) => r.id === chamber?.id));
  const floor = chamber?.floor ?? 1;
  const floorsUp = scene.floors;
  // Another floor: the open chamber's own row on it, else the first chamber that has it.
  const toFloor = (n: number) => {
    const open = scene.chambers[openIndex];
    const row = open?.group.floors.find((r) => r.floor === n) ?? scene.chambers.find((sc) => sc.group.floors.some((r) => r.floor === n))?.group.floors.find((r) => r.floor === n);
    if (row) onActive(row.id);
  };
  // Open a chamber at the floor being looked at (or its top floor).
  const openChamber = (i: number) => {
    const g = scene.chambers[i]?.group;
    if (!g) return;
    const row = g.floors.find((r) => r.floor === floor) ?? g.floors.at(-1);
    if (row) onActive(row.id);
  };
  const tab = (id: ExplorerView, label: string, Icon: typeof MapIcon) => (
    <button
      type="button"
      role="tab"
      aria-selected={view === id}
      onClick={() => setView(id)}
      className={`inline-flex min-h-[44px] flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold transition sm:flex-none sm:px-4 ${view === id ? 'bg-sky-700 text-white shadow' : 'text-sky-900 hover:bg-sky-100'}`}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden /> {label}
    </button>
  );
  const groups = scene.chambers.length;
  // Until the building is read the whole store is not drawn, so it never jumps from one layout to another.
  const drawingSoon = <p className="grid min-h-[280px] place-items-center rounded-3xl bg-slate-50 text-sm text-slate-500 ring-1 ring-slate-900/5">Drawing the cold store…</p>;
  const anyFree = Object.values(totals.free).some((n) => n);
  const freeText = Object.keys(totals.free).length < 2 ? boxes(Object.values(totals.free)[0] ?? 0) : mixText(totals.free);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="How to see the store" className="flex w-full gap-1 rounded-2xl bg-sky-50 p-1 ring-1 ring-sky-200 sm:w-auto">
          {tab('drawing', 'Drawing', MapIcon)}
          {tab('3d', '3D view', Layers)}
          {tab('walk', 'Walk inside', Footprints)}
        </div>
        <p className="text-sm text-slate-700">
          {groups} chamber{groups === 1 ? '' : 's'} · holds <strong className="text-slate-900">{mixText(totals.holds)}</strong> · <strong className={anyFree ? 'text-sky-800' : 'text-slate-900'}>{freeText}</strong> free
        </p>
      </div>

      {view !== 'drawing' ? (
        <>
          {waiting ? (
            drawingSoon
          ) : (
            <ColdStore3D
              chambers={chambers}
              stateOf={stateOf}
              roomOf={roomOf}
              mode={mode}
              onPlace={onPlace}
              active={chamber?.id ?? null}
              onActive={onActive}
              building={building}
              rate={rate}
              view={view === 'walk' ? 'walk' : 'orbit'}
              onView={(v) => setView(v === 'walk' ? 'walk' : '3d')}
            />
          )}
          {chamber && (
            <section aria-label={`${chamber.name} in numbers`} className="space-y-2">
              <h3 className="text-base font-semibold text-slate-900">{chamber.name}</h3>
              <ChamberFacts chamber={chamber} roomOf={roomOf} mode={mode} />
            </section>
          )}
        </>
      ) : (
        <>
          {!single && (
            <section aria-label="The whole store from above" className="space-y-2">
              {floorsUp > 1 && (
                <div role="radiogroup" aria-label="Which floor to show" className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-slate-800">Floor:</span>
                  {Array.from({ length: floorsUp }, (_, i) => i + 1).map((n) => (
                    <button
                      key={n}
                      type="button"
                      role="radio"
                      aria-checked={floor === n}
                      onClick={() => toFloor(n)}
                      className={`min-h-[44px] min-w-[44px] cursor-pointer rounded-xl px-4 text-sm font-bold transition ${floor === n ? 'bg-sky-700 text-white shadow' : 'bg-white text-sky-900 ring-1 ring-sky-200 hover:bg-sky-50'}`}
                    >
                      {`Floor ${n}`}
                    </button>
                  ))}
                </div>
              )}
              {waiting ? drawingSoon : <StoreTopView scene={scene} floor={floor} stateOf={stateOf} counts={counts} active={openIndex} onPick={openChamber} mode={mode} />}
              {scene.problems.length > 0 && (
                <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-950 ring-1 ring-amber-300">
                  {mode === 'owner' ? scene.problems.slice(0, 3).join(' ') : 'As the owner measured them, some chambers do not fit inside the building, so they are drawn where they would stand (in red).'}
                </p>
              )}
            </section>
          )}
          {chamber && (
            <section aria-label={chamber.name} className="space-y-2">
              <h3 className="text-base font-semibold text-slate-900">
                {chamber.name} <span className="font-normal text-slate-500">· {chamber.size ? 'drawn to scale' : 'up close'}</span>
              </h3>
              <ChamberFacts chamber={chamber} roomOf={roomOf} mode={mode} />
              {chamber.size ? (
                <ChamberDiagram chamber={chamber} size={chamber.size} stateOf={stateOf} roomOf={roomOf} onPlace={onPlace} mode={mode} labelOf={labelOf} />
              ) : (
                <ChamberGrid chamber={chamber} stateOf={stateOf} roomOf={roomOf} onPlace={onPlace} mode={mode} labelOf={labelOf} />
              )}
            </section>
          )}
        </>
      )}
      <PlaceLegend show={legend} units={unitsText(scene.chambers.map((sc) => sc.storage))} />
    </div>
  );
}
