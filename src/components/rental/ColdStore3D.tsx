'use client';

/**
 * The whole cold store in 3D, built to scale from the owner's numbers
 * (three/storeScene, three/buildStore): the building with its roof off and
 * its front wall see-through, the main door where it was measured, every
 * chamber where it stands with its own door, the floors inside a chamber as
 * grating decks, and every bin or crate stacked where the plan puts it.
 * Colours say what each place is (components/rental/placeLook): booked
 * stacks stand full, a free place is a marked space with the outline of the
 * stack that fits there.
 *
 *   orbit  drag to turn, pinch or scroll to zoom; one tap for the whole store,
 *          the view from the main door or from above; tap a chamber for what
 *          it holds, tap a place to choose it (booking) or see whose it is.
 *   walk   a visitor at eye height (1.6 m) starting outside the main door:
 *          arrows and keys to walk, drag to look; walls and stacks stop you,
 *          doors let you through; "Go to floor 2" inside a chamber with
 *          floors; a small map shows where you are; tap a place in front of
 *          you, or the mark in the middle, to choose it.
 *
 * three.js is imported inside the effect (only when the view opens), stacks
 * are instanced, a frame is drawn only when something moves or changes, the
 * pixel ratio is lower on phones, and everything is freed when the view
 * closes. Without WebGL the Drawing is the way.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { DoorOpen, Factory, Footprints, Layers, Maximize2, ScanEye, ShoppingCart, Volume2, X } from 'lucide-react';

import { PLACE_LOOK, type Look } from '@/components/rental/placeLook';
import { loadColdKitGeo, type ColdKitGeos } from '@/components/rental/three/coldKit';
import { buildPlaces, buildRoute, buildShell, disposeGroup, faceWalls, makeKit, sizeLabels, wx, wz, type Cell, type InstSummary, type Origin, type Places, type PlacesState, type Shell } from '@/components/rental/three/buildStore';
import { routeTo, type Route, type RouteLang } from '@/components/rental/walk/route';
import { speak, stopSpeaking } from '@/lib/client/speech';
import { rememberedLang, rememberLang } from '@/lib/langDetect';
import { buildScene, chamberAt, EYE, insideDoor, midOf, sceneText, startPoint, zonesForViewer, type SceneChamber, type StoreScene } from '@/components/rental/three/storeScene';
import { drawMiniMap } from '@/components/rental/walk/miniMap';
import { noInput, usePageZoom, WalkHud, type Measure, type Press, type Target, type WalkInput, type Where } from '@/components/rental/walk/WalkHud';
import { aheadOf, canStand, walk, WALK_SPEED, walkWorld, type Walker, type WalkWorld } from '@/components/rental/walk/walker';
import { placeDirections, showLength } from '@/lib/coldLayout';
import { countText, nice, unitWord, type Building, type PreviewRows, type Storage } from '@/lib/coldStore';
import { placeLabel, type ColdChamber } from '@/lib/db/coldMap';

export type View3D = 'orbit' | 'walk';

/**
 * One farmer's share of a shared place, for the owner's card only: the 3D
 * view never receives holders in a farmer-facing mode, so no other farmer's
 * name, quantity or booking reference can reach a farmer's screen.
 */
export interface PlaceHolder {
  name: string;
  /** Units (bins / crates / boxes) this farmer holds on the place; null when the records do not say. */
  units: number | null;
  /** The booking's reference. */
  ref: string | null;
  /** The apple variety, only when the records say (never invented). */
  variety?: string | null;
}

/** A place in words: "Chamber 2 · Floor 1 · Row 3, stack 4 · 4 bins free". */
export function placeText(c: SceneChamber, cell: Cell): string {
  const f = c.floors[cell.floor];
  const st = c.storage;
  const at = `${f.row.name} · ${placeLabel(cell.slot)}`;
  switch (cell.look) {
    case 'free':
      return `${at} · ${countText(cell.free, st)} free`;
    case 'part':
      return `${at} · shared, room for ${cell.free.toLocaleString('en-IN')} of ${countText(f.k, st)}`;
    case 'selected':
      return `${at} · your choice (${countText(cell.free, st)})`;
    case 'held':
      return `${at} · ${PLACE_LOOK.held.label}`;
    case 'booked':
      return `${at} · ${PLACE_LOOK.booked.label}`;
    case 'mine':
      return `${at} · your ${unitWord(st)}`;
    default:
      return `${at} · no place here`;
  }
}

/** The places of the store as cells, with what each is for the months looked at. */
export function cellsOf(scene: StoreScene, stateOf: (c: ColdChamber, slot: string) => Look, roomOf: (c: ColdChamber, slot: string) => number): Cell[] {
  const out: Cell[] = [];
  for (const c of scene.chambers) {
    c.floors.forEach((f, fi) => {
      f.places.forEach((p, pi) => {
        const look: Look = p.blocked ? 'blocked' : stateOf(f.row, p.slot);
        const free = look === 'blocked' ? 0 : Math.max(0, roomOf(f.row, p.slot));
        out.push({ chamber: c.index, floor: fi, place: pi, row: p.row, col: p.col, slot: p.slot, look, free, full: 1 - free / Math.max(1, f.k) });
      });
    });
  }
  return out;
}

/** The shapes of a chamber in words: "12.2 m × 7.6 m, 8.5 m high". */
const sizeText = (c: SceneChamber, unit: 'ft' | 'm') => `${showLength(c.rect.w, unit)} × ${showLength(c.rect.d, unit)}, ${showLength(c.h, unit)} high`;

interface Api {
  setData: (scene: StoreScene, cells: Cell[], free: number[], mineName?: string) => void;
  setActive: (index: number) => void;
  setView: (v: View3D) => void;
  frame: (what: 'all' | 'door' | 'top' | number) => void;
  /** Fly down to stand in front of one place, as from a seat in a stadium: its chamber open, the place in front of you. */
  seat: (chamber: number, floor: number, slot: string) => void;
  /** Take the chosen place's glow away (back to choosing). */
  clearSeat: () => void;
  walkTo: (index: number | null) => void;
  /** Where the next walk starts (a chamber's door), instead of the main door. */
  walkFrom: (index: number) => void;
  goFloor: (n: number) => void;
  /** Say again where the visitor is and draw the small map (when the buttons over the view appear). */
  showWhere: () => void;
  choose: () => void;
  kick: () => void;
  /** Show the way to the farmer's place on the floor (null: none). */
  setRoute: (route: Route | null) => void;
  /** The measure tool on or off; `mark` puts its mark where the visitor stands. */
  measure: (on: boolean) => void;
  mark: () => void;
  /** Walk the way from the main door (walking only). False when there is no way to walk. */
  guide: () => boolean;
  stopGuide: () => void;
  /** Floor slice + grower highlight on the already-built places (the toggles re-slice, without rebuilding). */
  world: (s: { floor: number | 'all'; mine: boolean }) => void;
  /** X-ray walls on/off (every wall turns glass at once). */
  xray: (on: boolean) => void;
}

/**
 * The farmer's place to lead them to: their own bins when looking at their
 * booking, their choice while booking — the first one in the store's order
 * (nearest the main door). Null when there is none.
 */
function routeFor(scene: StoreScene, cells: Cell[], mode: 'book' | 'owner' | 'view'): Route | null {
  const look: Look | null = mode === 'view' ? 'mine' : mode === 'book' ? 'selected' : null;
  if (!look) return null;
  const theirs = cells.filter((c) => c.look === look);
  const first = theirs[0];
  if (!first) return null;
  const f = scene.chambers[first.chamber]?.floors[first.floor];
  const directions = f?.plan && f.row.size ? placeDirections(f.row.size, f.plan, first.row, first.col + 1) : '';
  return routeTo(scene, first, theirs.length - 1, directions);
}

const TURN = 1.7; // radians a second
const LOOK = 1.1;
const PITCH = 1.05;
/** Field of view: looking at the whole store, and walking (wider, as your eyes see). */
const FOV = { orbit: 45, walk: 68 } as const;

/** What a chamber holds: over the 3D view's corner, or under the view on a phone (`zoom`: bigger words there). */
function InfoCard({ c, free, rate, unit, onClose, onWalk, onBook, zoom }: { c: SceneChamber; free: number; rate: number | null; unit: 'ft' | 'm'; onClose: () => void; onWalk?: () => void; onBook?: () => void; zoom: number }) {
  const g = c.group;
  const st: Storage = c.storage;
  const r = g.rate ?? rate;
  const below = zoom > 1.3;
  return (
    <section
      aria-label={`${c.name}: what it holds`}
      style={below ? { zoom: Math.min(1.8, zoom * 0.8) } : undefined}
      className={`pointer-events-auto rounded-2xl bg-white/95 p-3 text-sm text-slate-800 shadow-xl ring-1 ring-slate-900/10 backdrop-blur ${below ? 'w-full' : 'absolute bottom-2 left-2 z-20 w-[min(300px,calc(100%-16px))]'}`}
    >
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-base font-bold text-slate-900">{c.name}</h4>
        <button type="button" onClick={onClose} aria-label="Close" className="-m-1 grid h-11 w-11 cursor-pointer place-items-center rounded-xl text-slate-500 hover:bg-slate-100">
          <X className="h-5 w-5" aria-hidden />
        </button>
      </div>
      <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
        <dt className="text-slate-500">Holds</dt>
        <dd className="font-semibold">{countText(g.count, st)}{g.floors.length > 1 ? ` on ${g.floors.length} floors` : ''}</dd>
        {g.unitKg ? (
          <>
            <dt className="text-slate-500">Each {UNIT_ONE[st]}</dt>
            <dd>{nice(g.unitKg)} kg of apples</dd>
          </>
        ) : null}
        {g.capacityMt ? (
          <>
            <dt className="text-slate-500">Capacity</dt>
            <dd>{nice(g.capacityMt)} tonnes</dd>
          </>
        ) : null}
        <dt className="text-slate-500">Free now</dt>
        <dd className="font-semibold text-forest">{countText(free, st)}</dd>
        {r ? (
          <>
            <dt className="text-slate-500">Rent</dt>
            <dd>₹{nice(r)} a {UNIT_ONE[st]} a month</dd>
          </>
        ) : null}
        {c.toScale && (
          <>
            <dt className="text-slate-500">Size</dt>
            <dd>{sizeText(c, unit)}</dd>
          </>
        )}
      </dl>
      {onBook && free > 0 && (
        <button type="button" data-testid="book-here" onClick={onBook} className="kr-btn-primary mt-2 inline-flex min-h-[48px] w-full items-center justify-center gap-2 text-base">
          Book a place here
        </button>
      )}
      {onWalk && (
        <button type="button" onClick={onWalk} className="mt-2 inline-flex min-h-[44px] w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-forest px-3 font-semibold text-white hover:bg-forest-deep">
          <Footprints className="h-4 w-4" aria-hidden /> Walk in here
        </button>
      )}
    </section>
  );
}
const UNIT_ONE: Record<Storage, string> = { bins: 'bin', crates: 'crate', boxes: 'box' };
const UNIT_MANY: Record<Storage, string> = { bins: 'bins', crates: 'crates', boxes: 'boxes' };

/**
 * The crate drawer, opened by tapping any stack in the 3D and walk views —
 * the live booking / capacity inspector: the place's own identifiers and
 * exact bookkeeping — weights from the owner's kg per unit and the boxes
 * the database says are standing, allocation from the bookings (never
 * invented, "—" without).
 */
function CrateCard({
  cell,
  scene,
  chambers,
  mode,
  onPlace,
  stackOf,
  holdersOf,
  mineOf,
  mineName,
  facilityName,
  facilityId,
  onClose,
}: {
  cell: Cell;
  scene: StoreScene;
  chambers: ColdChamber[];
  mode: 'book' | 'owner' | 'view';
  /** Booking flow: choose this place — or take it off — right from the card, the same choose a map tap makes; the choice flows into the booking's confirm and payment. */
  onPlace?: (c: ColdChamber, slot: string, look: Look) => void;
  stackOf?: (c: ColdChamber, slot: string) => string | null;
  holdersOf?: (c: ColdChamber, slot: string) => PlaceHolder[];
  mineOf?: (c: ColdChamber, slot: string) => number | null;
  mineName?: string;
  facilityName?: string;
  facilityId?: string;
  onClose: () => void;
}) {
  const c = scene.chambers[cell.chamber];
  const f = c?.floors[cell.floor];
  const row = chambers.find((x) => x.id === f?.row.id);
  const st: Storage = c?.storage ?? 'boxes';
  const per = row?.unit_kg ?? c?.group?.unitKg ?? null;
  const maxUnits = f?.k ?? 0;
  const standing = Math.max(0, maxUnits - cell.free);
  const kg = (units: number) => (per != null ? `${nice(units * per)} kg` : '—');
  const owner = mode === 'owner';
  // Role isolation: the owner reads every farmer sharing a place; a farmer's card holds only their own units and what is still free.
  const allocation = owner && row ? stackOf?.(row, cell.slot) ?? null : null;
  const holders = owner && row ? holdersOf?.(row, cell.slot) ?? [] : [];
  const mineUnits = !owner && row ? mineOf?.(row, cell.slot) ?? null : null;
  const whose = owner ? allocation : cell.look === 'mine' ? (mineName?.trim() ? `${mineName.trim()} (you)` : 'You') : null;
  const unitType = st === 'bins' ? 'Wooden bins' : st === 'crates' ? 'Plastic crates' : 'Paper cartons';
  // The unit's own measured size, only what the owner's save holds (never invented; — without).
  const dims = row && (row.unit_length_m != null || row.unit_width_m != null || row.unit_height_m != null)
    ? `${nice(Number(row.unit_length_m ?? 0))} × ${nice(Number(row.unit_width_m ?? 0))} × ${nice(Number(row.unit_height_m ?? 0))} m`
    : null;
  // This place can be chosen from the card itself (booking only): free, shared with room left,
  // or already this farmer's choice (the button then takes it off).
  const chosen = cell.look === 'selected';
  const bookable = mode === 'book' && Boolean(onPlace && row) && (chosen || cell.look === 'free' || cell.look === 'part');
  return (
    <section aria-label={`${c?.name ?? 'Place'}: what is on place ${cell.slot}`} className="rounded-2xl bg-white/95 p-3 text-sm text-slate-800 shadow-xl ring-1 ring-slate-900/10 backdrop-blur">
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-base font-bold text-slate-900">{placeLabel(cell.slot)} · {PLACE_LOOK[cell.look].label}</h4>
        <button type="button" onClick={onClose} aria-label="Close" className="-m-1 grid h-11 w-11 cursor-pointer place-items-center rounded-xl text-slate-500 hover:bg-slate-100">
          <X className="h-5 w-5" aria-hidden />
        </button>
      </div>
      <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
        <dt className="text-slate-500">Facility</dt>
        <dd className="font-semibold">{facilityName?.trim() || 'This cold store'}</dd>
        <dt className="text-slate-500">Facility ID</dt>
        <dd>{facilityId?.trim() || '—'}</dd>
        <dt className="text-slate-500">Chamber</dt>
        <dd>{c?.name}{c?.toScale ? ` · ${sizeText(c, scene.unit)}` : ''}</dd>
        <dt className="text-slate-500">Chamber ID</dt>
        <dd>{row?.id ?? c?.group?.key ?? c?.key ?? '—'}</dd>
        <dt className="text-slate-500">Level / layer</dt>
        <dd>{f && c && c.floors.length > 1 ? `Floor ${f.floor} of ${c.floors.length}` : 'Ground level'}</dd>
        <dt className="text-slate-500">Storage Unit ID</dt>
        <dd className="font-semibold">{`${c?.name ?? 'Chamber'}${row?.chamber_no != null ? ` (Chamber ${row.chamber_no})` : ''} · Floor ${f?.floor ?? cell.floor + 1} · ${cell.slot}`}</dd>
        <dt className="text-slate-500">Storage Type</dt>
        <dd>{unitType}</dd>
        <dt className="text-slate-500">Maximum Capacity</dt>
        <dd className="font-semibold">{countText(maxUnits, st)} · {kg(maxUnits)}</dd>
        {dims && (
          <>
            <dt className="text-slate-500">Unit size (L×W×H)</dt>
            <dd>{dims}</dd>
          </>
        )}
        {owner ? (
          <>
            <dt className="text-slate-500">Stored Quantity</dt>
            <dd className={standing ? 'font-semibold text-forest-deep' : ''}>{standing.toLocaleString('en-IN')} {unitWord(st, standing)} · {kg(standing)}</dd>
          </>
        ) : (
          <>
            <dt className="text-slate-500">Your {unitWord(st, 2)}</dt>
            <dd className={mineUnits ? 'font-semibold text-forest-deep' : ''}>
              {mineUnits ? `${mineUnits.toLocaleString('en-IN')} ${unitWord(st, mineUnits)} · ${kg(mineUnits)}` : cell.look === 'mine' ? 'Yours' : 'None'}
            </dd>
            <dt className="text-slate-500">Occupied now</dt>
            <dd>{countText(standing, st)} · {kg(standing)}</dd>
          </>
        )}
        <dt className="text-slate-500">{owner ? 'Available Capacity' : 'Free in this place'}</dt>
        <dd className={!owner ? 'font-semibold text-forest' : ''}>{cell.free.toLocaleString('en-IN')} {unitWord(st, cell.free)} · {kg(cell.free)}</dd>
        <dt className="text-slate-500">Occupancy Status</dt>
        <dd>{PLACE_LOOK[cell.look].label}{owner && whose ? ` · ${whose}` : ''}</dd>
        {!owner && cell.look === 'mine' && whose && (
          <>
            <dt className="text-slate-500">Grower allocation</dt>
            <dd>{whose}</dd>
          </>
        )}
      </dl>
      {owner && holders.length > 0 && (
        <div className="mt-2 rounded-xl bg-slate-50 p-2 ring-1 ring-slate-200">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Shared by {holders.length} {holders.length === 1 ? 'farmer' : 'farmers'}</p>
          <ul className="mt-1 space-y-1">
            {holders.map((h, i) => (
              <li key={`${h.ref ?? h.name}-${i}`}>
                <span className="font-semibold">{h.name}</span>
                {' — '}
                {h.units != null ? `${h.units.toLocaleString('en-IN')} ${unitWord(st, h.units)} · ${kg(h.units)}` : 'quantity not recorded'}
                {h.variety ? ` · ${h.variety}` : ''}
                {h.ref ? <span className="ml-1 font-mono text-xs text-slate-500">ref {h.ref}</span> : null}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-slate-600">
            {holders.reduce((n, h) => n + (h.units ?? 0), 0).toLocaleString('en-IN')} of {maxUnits.toLocaleString('en-IN')} {unitWord(st, maxUnits)} held · {cell.free.toLocaleString('en-IN')} free
          </p>
        </div>
      )}
      {bookable && (
        <button
          type="button"
          data-testid="select-and-book-bin"
          onClick={() => onPlace?.(row!, cell.slot, cell.look)}
          className={`mt-3 w-full ${chosen ? 'kr-btn-secondary' : 'kr-btn-primary'}`}
        >
          {chosen ? <X className="h-4 w-4" aria-hidden /> : <ShoppingCart className="h-4 w-4" aria-hidden />}
          {chosen ? 'Remove from my selection' : 'Select & Book This Bin'}
        </button>
      )}
    </section>
  );
}


/** What is shown from outside: every place, only those with room, or only the person's own. */
type Focus = 'all' | 'free' | 'mine';
/** A place someone can still put bins on (or has just chosen). */
const isFree = (c: Cell) => c.free > 0 && (c.look === 'free' || c.look === 'part' || c.look === 'selected');

/** The guided walk's languages; each is said aloud in its own voice (lib/client/speech). */
const GUIDE_LANGS: [RouteLang, string][] = [
  ['ks', 'کٲشُر'],
  ['ur', 'اردو'],
  ['hi', 'हिन्दी'],
  ['en', 'English'],
];

export function ColdStore3D({
  chambers,
  stateOf,
  roomOf,
  mode,
  onPlace,
  active,
  onActive,
  building,
  rate = null,
  view = 'orbit',
  onView,
  mineName,
  stackOf,
  holdersOf,
  mineOf,
  onOpenTwin,
  facilityName,
  facilityId,
  onBookNow,
}: {
  chambers: ColdChamber[];
  stateOf: (c: ColdChamber, slot: string) => Look;
  /** Bins / crates / boxes that still fit on a place (stable, like stateOf). */
  roomOf: (c: ColdChamber, slot: string) => number;
  mode: 'book' | 'owner' | 'view';
  onPlace?: (c: ColdChamber, slot: string, look: Look) => void;
  active: string | null;
  onActive: (id: string) => void;
  /** The store's building (rental_listings.building); without it the chambers stand side by side. Not given: the preview rows' own (owner wizard). */
  building?: Building | null;
  /** The store's rent for chambers without their own. */
  rate?: number | null;
  /** Look around from outside (orbit) or walk inside. */
  view?: View3D;
  onView?: (v: View3D) => void;
  /** The farmer's name, shown over their own places ('mine'). */
  mineName?: string;
  /** Who holds one place (owner views): a sentence for the crate drawer read from the bookings, or null. */
  stackOf?: (c: ColdChamber, slot: string) => string | null;
  /** Owner views: every farmer sharing one place, with units and booking references. */
  holdersOf?: (c: ColdChamber, slot: string) => PlaceHolder[];
  /** Farmer views: how many units the viewer themselves hold on one place (null: not known). */
  mineOf?: (c: ColdChamber, slot: string) => number | null;
  /** Book mode: the place's bar "Book & pay now" goes on to confirming and paying (the booking window's own next step). */
  onBookNow?: () => void;
  onOpenTwin?: () => void;
  /** The facility's name, shown in the place inspector (Facility → Chamber → …). */
  facilityName?: string;
  /** The facility's database id, shown in the place inspector (Facility ID row). */
  facilityId?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HTMLCanvasElement>(null);
  const api = useRef<Api | null>(null);
  const input = useRef<WalkInput>(noInput());
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  // WebGL contexts and module loads can fail transiently — a phone juggling
  // too many live canvases, a driver hiccup just after a tab switch, one bad
  // network round trip. The view is rebuilt from scratch up to three times,
  // a quarter second apart, before the quiet "cannot show 3D" panel shows.
  const [attempt, setAttempt] = useState(0);
  // Set when the safety cap trims a very large store: the honest badge over the view.
  const [instSummary, setInstSummary] = useState<InstSummary | null>(null);
  // The 3D world is built only once the component has truly mounted (never
  // during a portal's first render or a stray server pass): three.js, WebGL
  // and their loaders exist only in the browser, and a hiccup there must
  // never take the page down.
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- kept as shipped: changing when this state is set needs its signed-in flow tested
  useEffect(() => setMounted(true), []);
  const [info, setInfo] = useState<number | null>(null);
  // The place flown down to (book mode): its bar at the foot of the view, with "Book & pay now".
  const [seatAt, setSeatAt] = useState<{ chamber: number; floor: number; slot: string } | null>(null);
  const [where, setWhere] = useState<Where>({ text: 'You are outside the main door.', chamber: -1, level: 1, floors: 1 });
  const [target, setTarget] = useState<Target | null>(null);
  const [measure, setMeasure] = useState<Measure | null>(null);
  // The digital-twin controls (in addition to the camera pills and the place filters).
  const [xrayWalls, setXrayWalls] = useState(false);
  // The Blender kit's real geometries, loaded in the BACKGROUND: the 3D world
  // always mounts with its own procedural kit first (well under 400 ms, never
  // waiting on a network), and rebuilds once with the real shapes when the
  // kit GLB has arrived. A missing or slow GLB simply never arrives: the
  // procedural shapes stay — nothing waits, nothing breaks.
  const [kitProtos, setKitProtos] = useState<ColdKitGeos | null>(null);
  useEffect(() => {
    let live = true;
    void (async () => {
      const T = await import('three');
      const protos = await loadColdKitGeo(T, '/models/coldstore_kit.glb', 8000);
      if (live && protos) setKitProtos(protos);
    })();
    return () => {
      live = false;
    };
  }, []);
  const [myHighlight, setMyHighlight] = useState(false);
  /** The crate stack the drawer is open for: one tap on a booked (or the farmer's own) stack. */
  const [stackCell, setStackCell] = useState<Cell | null>(null);
  // On a phone the page is shrunk to fit: a taller view and bigger buttons.
  const zoom = usePageZoom();
  const textId = useId();

  // The owner's live preview brings its building with its rows (lib/coldStore previewChambers).
  const shownBuilding = building !== undefined ? building : ((chambers as PreviewRows).building ?? null);
  // The scene and its places are built in a guard: odd input can never take
  // the page down — worst case the view opens empty and the Drawing beside
  // it still shows the store.
  const scene = useMemo(() => {
    try {
      const built = buildScene(chambers, shownBuilding);
      // The machinery bay stays out of farmer-facing views (book / view);
      // the owner's own view keeps the plant bay they sized.
      return { ...built, zones: zonesForViewer(built.zones, mode) };
    } catch (err) {
      console.error('The store scene failed to build:', err instanceof Error ? err.message : err);
      return buildScene([], null);
    }
  }, [chambers, shownBuilding, mode]);
  const cells = useMemo(() => {
    try {
      return cellsOf(scene, stateOf, roomOf);
    } catch (err) {
      console.error('The places failed to build:', err instanceof Error ? err.message : err);
      return [] as Cell[];
    }
  }, [scene, stateOf, roomOf]);
  const free = useMemo(() => {
    const out = scene.chambers.map(() => 0);
    for (const c of cells) out[c.chamber] += c.free;
    return out;
  }, [scene, cells]);
  // The drawer's place, as it is right now: a choice made from the card (or the
  // map) re-labels the card at once — its look, room and the book button state
  // — instead of repeating the snapshot taken when it was opened.
  const liveCell = useMemo(
    () => (stackCell ? cells.find((x) => x.chamber === stackCell.chamber && x.floor === stackCell.floor && x.place === stackCell.place) ?? stackCell : null),
    [stackCell, cells],
  );
  const activeIndex = useMemo(() => scene.chambers.findIndex((c) => c.group.floors.some((r) => r.id === active)), [scene, active]);
  // From outside, the person can show only the places with room, only their own, and one floor at a
  // time (the upper floors hide the lower ones). Walking always shows everything, as it stands.
  const [focus, setFocus] = useState<Focus>('all');
  // Measurement plates (length, width, height, aisle) are hidden from outside so the names and the places can be read; one button shows them.
  const [sizes, setSizes] = useState(false);
  const [floorShown, setFloorShown] = useState<number | null>(null);
  const floorsMost = useMemo(() => Math.max(1, ...scene.chambers.map((c) => c.floors.length)), [scene]);
  const mineLook: Look | null = mode === 'view' ? 'mine' : mode === 'book' ? 'selected' : null;
  const shownCells = useMemo(
    () =>
      view === 'walk'
        ? cells
        : cells.filter(
            (c) =>
              (focus === 'all' || (focus === 'free' ? isFree(c) : c.look === mineLook)) &&
              (floorShown === null || scene.chambers[c.chamber]?.floors[c.floor]?.floor === floorShown),
          ),
    [cells, focus, floorShown, view, mineLook, scene],
  );
  const counts = useMemo(() => {
    // Room by kind: a store can hold bins in one chamber and crates in another.
    const room = new Map<Storage, number>();
    let freePlaces = 0;
    let mine = 0;
    for (const c of cells) {
      if (isFree(c)) {
        freePlaces++;
        const st = scene.chambers[c.chamber]?.storage ?? 'bins';
        room.set(st, (room.get(st) ?? 0) + c.free);
      }
      if (mineLook && c.look === mineLook) mine++;
    }
    return { room, freePlaces, mine };
  }, [cells, mineLook, scene]);
  // The way to the farmer's place, and the guided walk along it: the step reached (null: not
  // guiding), whether they have arrived, and the language the steps are said in.
  // Guarded: an odd store must not take the page down to the error guard —
  // the view opens without a route, and the Drawing beside it still works.
  const route = useMemo(() => {
    try {
      return routeFor(scene, cells, mode);
    } catch (err) {
      console.error('The way could not be worked out:', err instanceof Error ? err.message : err);
      return null;
    }
  }, [scene, cells, mode]);
  const [guideAt, setGuideAt] = useState<number | null>(null);
  const [guideDone, setGuideDone] = useState(false);
  const [guideLang, setGuideLang] = useState<RouteLang>('en');
  const guidePending = useRef(false);
  const onStep = useCallback((k: number | null, done = false) => {
    setGuideAt(k);
    setGuideDone(done);
  }, []);

  // Opening the crate drawer from inside the scene (a tap on a booked / own stack).
  const onStack = useCallback((c: Cell) => setStackCell(c), []);

  // An api hiccup (a scene the 3D code cannot draw, a WebGL hiccup) must never
  // take the page down to the error guard: the failure is logged, the view
  // keeps its last good frame, and the next data change retries.
  const safe = useCallback((fn: () => void) => {
    try {
      fn();
    } catch (err) {
      console.error('3D update failed:', err instanceof Error ? err.message : err);
    }
  }, []);

  // The latest data and callbacks, for the scene (which is set up once).
  const latest = useRef({ scene, cells, free, mode, onPlace, onActive, view, activeIndex, mineName, route, onStep, onStack, chambers, stackOf, sizes });
  useEffect(() => {
    latest.current = { scene, cells, free, mode, onPlace, onActive, view, activeIndex, mineName, route, onStep, onStack, chambers, stackOf, sizes };
  }, [scene, cells, free, mode, onPlace, onActive, view, activeIndex, mineName, route, onStep, onStack, chambers, stackOf, sizes]);
  useEffect(() => safe(() => api.current?.setRoute(route)), [safe, route]);
  // Each step said aloud as the walk reaches it, in the person's language.
  useEffect(() => {
    if (guideAt === null || !route) return;
    const step = route.steps[guideAt];
    if (step) void speak(step.text[guideLang], guideLang);
  }, [guideAt, guideLang, route]);
  // Leaving the walk, or the page: stop talking.
  useEffect(() => {
    if (view !== 'walk') {
      api.current?.stopGuide();
      stopSpeaking();
    }
  }, [view]);
  useEffect(() => () => stopSpeaking(), []);
  // The places are built again only when the store or what its places are changes (not when the page around it redraws).
  useEffect(() => safe(() => api.current?.setData(scene, shownCells, free, mineName)), [safe, scene, shownCells, free, mineName]);
  useEffect(() => safe(() => api.current?.setActive(activeIndex)), [safe, activeIndex]);
  useEffect(() => safe(() => api.current?.setView(view)), [safe, view]);
  // The small map is drawn into the walk's buttons, which appear once the view is ready.
  useEffect(() => {
    if (view === 'walk' && ready) api.current?.showWhere();
    // "Show me the way" from outside: the walk starts once the view has switched.
    if (view === 'walk' && ready && guidePending.current) {
      guidePending.current = false;
      api.current?.guide();
    }
  }, [view, ready]);
  const press = useCallback<Press>((k, on) => {
    input.current[k] = on;
    if (on) api.current?.kick();
  }, []);

  // Floor slice and grower highlight, also without building the places again.
  useEffect(() => safe(() => api.current?.world({ floor: floorShown ?? 'all', mine: myHighlight })), [safe, floorShown, myHighlight, shownCells]);
  useEffect(() => safe(() => api.current?.xray(xrayWalls)), [safe, xrayWalls]);

  useEffect(() => {
    const el = host.current;
    // Not mounted yet (or already gone): nothing to build — three.js exists
    // only in a browser, and the mount gate keeps the first portal render
    // free of any 3D work at all.
    if (!el || !mounted) return;
    let disposed = false;
    let cleanup = () => {};

    // Transient WebGL failures (a context lost to tab churn, a driver hiccup,
    // one slow module fetch) get an automatic retry: this mount is rebuilt
    // from scratch up to three times, a quarter second apart, before the
    // quiet "cannot show 3D" panel shows. A fresh attempt means a brand-new
    // canvas and a brand-new WebGL context — the old one is torn down by the
    // cleanup below before the next run starts.
    const scheduleRetry = () => {
      if (disposed) return;
      if (attempt < 2) {
        window.setTimeout(() => {
          if (!disposed) setAttempt((a) => a + 1);
        }, 250);
      } else {
        setFailed(true);
      }
    };

    void (async () => {
      let T: typeof import('three');
      let controlsMod: typeof import('three/examples/jsm/controls/OrbitControls.js');
      try {
        T = await import('three');
        controlsMod = await import('three/examples/jsm/controls/OrbitControls.js');
      } catch {
        // The module bundle itself did not arrive — often a one-off network
        // hiccup, not a broken browser. Same retry, not an instant give-up.
        scheduleRetry();
        return;
      }
      if (disposed) return;
      const { OrbitControls } = controlsMod;

      const phone = window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 640;
      // A low-cost phone (4 GB or less, or 4 cores or fewer): one pixel per screen pixel, no smoothing.
      const nav = navigator as Navigator & { deviceMemory?: number };
      const weak = phone && ((nav.deviceMemory ?? 8) <= 4 || (nav.hardwareConcurrency ?? 8) <= 4);
      let renderer: InstanceType<typeof T.WebGLRenderer>;
      try {
        renderer = new T.WebGLRenderer({ antialias: !phone, powerPreference: phone ? 'low-power' : 'default' });
      } catch {
        // Context creation refused — try the whole mount again before
        // concluding this phone cannot show 3D.
        scheduleRetry();
        return;
      }
      // Filmic tone mapping and sRGB output: the same pixels, but light rolls
      // off the way eyes expect, so steel, paint and apples read solid.
      renderer.toneMapping = T.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;
      renderer.outputColorSpace = T.SRGBColorSpace;
      // Soft sun shadows on a laptop only: one extra draw pass per light is too
      // much for a phone, which keeps the flat, even look.
      const withShadows = !phone && !weak;
      renderer.shadowMap.enabled = withShadows;
      if (withShadows) renderer.shadowMap.type = T.PCFSoftShadowMap;
      renderer.localClippingEnabled = true;
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      // Sharp when still. On a slow phone, fewer pixels while something moves (see the loop).
      const fullRatio = Math.min(window.devicePixelRatio || 1, weak ? 1 : phone ? 1.5 : 2);
      renderer.setPixelRatio(fullRatio);
      renderer.setClearColor('#CFE2E6');
      const cv = renderer.domElement;
      let moveRatio = fullRatio;
      let slowFrames = 0;
      let handHeld = false;
      cv.className = 'block h-full w-full rounded-3xl outline-none';
      cv.setAttribute('role', 'img');
      cv.setAttribute('aria-describedby', textId);
      cv.setAttribute('aria-label', 'The whole cold store in 3D. Drag to turn it, pinch or scroll to zoom.');
      el.prepend(cv);

      const world3 = new T.Scene();
      // The Kashmir valley sky behind the store: pale blue overhead down to a sage haze at the ridge line — never a white void.
      const skyTex = (() => {
        const sky = document.createElement('canvas');
        sky.width = 4;
        sky.height = 256;
        const g = sky.getContext('2d');
        if (!g) return null;
        const grad = g.createLinearGradient(0, 0, 0, 256);
        grad.addColorStop(0, '#BDD6E2');
        grad.addColorStop(1, '#E4EFEA');
        g.fillStyle = grad;
        g.fillRect(0, 0, 4, 256);
        const tex = new T.CanvasTexture(sky);
        tex.colorSpace = T.SRGBColorSpace;
        return tex;
      })();
      if (skyTex) world3.background = skyTex;
      const camera = new T.PerspectiveCamera(FOV.orbit, 1, 0.05, 2000);
      camera.rotation.order = 'YXZ';
      const controls = new OrbitControls(camera, cv);
      controls.enableDamping = !reduceMotion;
      controls.dampingFactor = 0.12;
      controls.maxPolarAngle = Math.PI * 0.49;
      controls.minDistance = 2;
      controls.screenSpacePanning = false;

      world3.add(new T.HemisphereLight('#ffffff', '#94a3b8', 1.9));
      const sun = new T.DirectionalLight('#fff7ed', 1.6);
      sun.position.set(-40, 80, 55);
      if (withShadows) {
        sun.castShadow = true;
        sun.shadow.mapSize.set(2048, 2048);
        sun.shadow.bias = -0.0004;
        sun.shadow.normalBias = 0.03;
        const sc = sun.shadow.camera;
        sc.left = -70;
        sc.right = 70;
        sc.top = 70;
        sc.bottom = -70;
        sc.near = 10;
        sc.far = 240;
      }
      world3.add(sun);
      const fill = new T.DirectionalLight('#dbeafe', 0.55);
      fill.position.set(50, 30, -40);
      world3.add(fill);
      // Real interior lights for walking (the LED strips are emissive meshes, not light sources): two
      // point lights that follow the walker, hung under the ceiling of the room they stand in — a
      // chamber or the grading / packaging hall — so every chamber is brightly lit where you are.
      // The count never changes (no shader recompiles); both stay dark outside the walk.
      const walkLamps = [0, 1].map(() => {
        const l = new T.PointLight('#f5faff', 0, 18, 1.5);
        world3.add(l);
        return l;
      });

      // Gentle studio reflections for the steel and painted panels (desktop
      // only: the prefiltered map is memory a phone is short of). Kept faint —
      // the lights stay in charge of the look.
      if (withShadows) {
        const { RoomEnvironment } = await import('three/examples/jsm/environments/RoomEnvironment.js');
        const pmrem = new T.PMREMGenerator(renderer);
        world3.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
        world3.environmentIntensity = 0.35;
        pmrem.dispose();
      }

      // The kit used for all logic is the procedural one, dressed with the
      // Blender protos when they have answered in the background (or kept
      // plain when they never do). Nothing here waits on the network: the
      // first mount always draws the procedural kit at once.
      const kit = makeKit(T, phone, kitProtos);

      // A soft contact shadow under the building: a radial gradient on a disc,
      // so the store sits on the yard instead of floating — cheaper than a
      // shadow pass and there on phones too.
      const contactTex = (() => {
        const cv = document.createElement('canvas');
        cv.width = 128;
        cv.height = 128;
        const g = cv.getContext('2d');
        if (!g) return null;
        const grad = g.createRadialGradient(64, 64, 10, 64, 64, 64);
        grad.addColorStop(0, 'rgba(15,23,42,0.30)');
        grad.addColorStop(0.55, 'rgba(15,23,42,0.13)');
        grad.addColorStop(1, 'rgba(15,23,42,0)');
        g.fillStyle = grad;
        g.fillRect(0, 0, 128, 128);
        const t = new T.CanvasTexture(cv);
        t.colorSpace = T.SRGBColorSpace;
        return t;
      })();
      const contactMat = contactTex ? new T.MeshBasicMaterial({ map: contactTex, transparent: true, depthWrite: false }) : null;
      let contact: InstanceType<typeof T.Mesh> | null = null;
      // Desktop only: the sun's shadow pass. Opaque lit meshes cast and
      // receive; see-through things (gratings, glows, marks) stay out of it.
      const dressShadows = (g: InstanceType<typeof T.Object3D>) => {
        if (!withShadows) return;
        g.traverse((o) => {
          const m = o as unknown as { isMesh?: boolean; castShadow?: boolean; receiveShadow?: boolean; material?: { transparent?: boolean; isMeshStandardMaterial?: boolean } };
          if (m.isMesh && m.material && m.material.isMeshStandardMaterial) {
            m.castShadow = !m.material.transparent;
            m.receiveShadow = true;
          }
        });
      };
      // Walking: a light haze gives the long rooms their depth.
      const haze = new T.Fog('#DCE9E6', 14, 70);
      const root = new T.Group();
      world3.add(root);
      let shell: Shell | null = null;
      let places: PlacesState | null = null;
      // The way to the farmer's place (arrows on the floor), and the guided walk along it:
      // `i` the next point, `said` the last step told.
      let routeNow: Route | null = null;
      let routeGroup: InstanceType<typeof T.Object3D> | null = null;
      let guide: { i: number; said: number } | null = null;
      // The guided walk's points: the way, with its last part carried on over empty bays up to the place.
      let guidePts: Route['points'] = [];
      let shown: StoreScene | null = null;
      let origin: Origin = { ox: 0, oy: 0 };
      let walkWorldNow: WalkWorld | null = null;
      let mode3: View3D = 'orbit';
      // Labels: on top of everything from outside; walking, hidden behind walls like real signs (null: set them again).
      let labelsWalk: boolean | null = null;
      let dirty = true;
      // The frame loop's state (kick() may run before the loop is defined below).
      let raf = 0;
      let running = false;
      let last = 0;
      let held = 0;
      // X-ray walls: every wall of the store turns glass at once (the 3D toggle).
      let xrayNow = false;
      // The chamber that is open (its index; -1 when none): every other chamber stays a closed room under its roof.
      let openNow = -1;
      const me: Walker & { heading: number; pitch: number } = { x: 0, y: 0, level: 1, inside: -1, heading: Math.PI / 2, pitch: -0.08 };
      let orbitPose: { pos: [number, number, number]; target: [number, number, number] } | null = null;
      let startAt: number | null = null;

      // ── Camera ──
      let flight: { from: number[]; to: number[]; t0: number; dur: number } | null = null;
      // The view last chosen (whole store, from the door, from above, a chamber) until the camera is moved by hand:
      // when the view changes size (a phone turned, buttons growing on a phone) it is framed again, so nothing is cut off.
      let framed: 'all' | 'door' | 'top' | number | null = null;
      const setPose = (pos: number[], target: number[], instant: boolean, dur = 700) => {
        if (instant || reduceMotion) {
          camera.position.set(pos[0], pos[1], pos[2]);
          controls.target.set(target[0], target[1], target[2]);
          controls.update();
          flight = null;
        } else {
          flight = { from: [camera.position.x, camera.position.y, camera.position.z, controls.target.x, controls.target.y, controls.target.z], to: [...pos, ...target], t0: performance.now(), dur };
        }
        dirty = true;
        kick();
      };
      const aspect = () => camera.aspect || 1;
      /**
       * A box (building frame) filling the view, seen from the front, a little to the right and above
       * (higher on a tall phone view, so the store fills it): the camera steps back until all eight
       * corners of the box are on screen, with a small margin.
       */
      const probe = new T.PerspectiveCamera();
      const fit = (x: number, y: number, w: number, d: number, h: number, instant = false) => {
        const cx = wx(origin, x + w / 2);
        const cz = wz(origin, y + d / 2);
        const cy = Math.min(h, 12) * 0.22;
        const v = T.MathUtils.degToRad(camera.fov / 2);
        const hv = Math.atan(Math.tan(v) * aspect());
        const dir = new T.Vector3(0.3, aspect() < 1 ? 1 : 0.72, 0.95).normalize();
        const corners: InstanceType<typeof T.Vector3>[] = [];
        for (const px of [x, x + w]) for (const pz of [y, y + d]) for (const py of [0, h]) corners.push(new T.Vector3(wx(origin, px), py, wz(origin, pz)));
        probe.fov = camera.fov;
        probe.aspect = aspect();
        probe.near = camera.near;
        probe.far = camera.far;
        probe.updateProjectionMatrix();
        let dist = (0.5 * Math.hypot(w, d, h)) / Math.sin(Math.min(v, hv));
        const p = new T.Vector3();
        for (let i = 0; i < 8; i++) {
          probe.position.set(cx + dir.x * dist, cy + dir.y * dist, cz + dir.z * dist);
          probe.lookAt(cx, cy, cz);
          probe.updateMatrixWorld();
          let most = 0;
          for (const c of corners) {
            p.copy(c).project(probe);
            // Behind the camera: step well back.
            most = Math.max(most, p.z > 1 ? 2 : Math.abs(p.x), p.z > 1 ? 2 : Math.abs(p.y));
          }
          const k = Math.min(2, Math.max(0.6, most / 0.9));
          if (Math.abs(k - 1) < 0.01) break;
          dist *= k;
        }
        controls.maxDistance = Math.max(60, dist * 4);
        setPose([cx + dir.x * dist, cy + dir.y * dist, cz + dir.z * dist], [cx, cy, cz], instant);
      };
      const frame = (what: 'all' | 'door' | 'top' | number, instant = false) => {
        const s = shown;
        if (!s) return;
        framed = what;
        if (typeof what === 'number') {
          // The chamber and its name above it.
          const c = s.chambers[what];
          if (c) fit(c.rect.x, c.rect.y, c.rect.w, c.rect.d, c.h + 2.5, instant);
          return;
        }
        const b = s.bounds;
        if (what === 'all') return fit(b.x, b.y, b.w, b.d, s.height + 1.5, instant); // and the names over the chambers
        if (what === 'top') {
          const v = T.MathUtils.degToRad(camera.fov / 2);
          const hv = Math.atan(Math.tan(v) * aspect());
          const dist = Math.max((b.w * 0.55) / Math.tan(hv), (b.d * 0.55) / Math.tan(v)) + s.height;
          const cx = wx(origin, b.x + b.w / 2);
          const cz = wz(origin, b.y + b.d / 2);
          controls.maxDistance = Math.max(controls.maxDistance, dist * 2);
          return setPose([cx, dist, cz + 0.01], [cx, 0, cz], instant);
        }
        // Standing back from the main door and above it, looking in along the passage: the chambers on either side.
        const st = startPoint(s);
        const n = st.facing;
        const deep = s.building ? (n.x ? s.hall.w : s.hall.d) : 12;
        // Far enough back that the passage and the chamber doors on both sides of it fit across the view (further on a narrow phone).
        const across = (s.passage ? (n.x ? s.passage.d : s.passage.w) : 3) / 2 + 6;
        const hv = Math.atan(Math.tan(T.MathUtils.degToRad(camera.fov / 2)) * aspect());
        const back = Math.min(40, Math.max(6, across / Math.tan(hv) - 3));
        const up = (s.building?.height ?? s.height) + Math.max(3, deep * 0.2, back * 0.3);
        const p = { x: st.at.x - n.x * back, y: st.at.y - n.y * back };
        const t = { x: st.at.x + n.x * (3 + deep * 0.45), y: st.at.y + n.y * (3 + deep * 0.45) };
        setPose([wx(origin, p.x), up, wz(origin, p.y)], [wx(origin, t.x), 0, wz(origin, t.y)], instant);
      };

      let seatMark: InstanceType<typeof T.Group> | null = null;
      const clearSeat = () => {
        if (!seatMark) return;
        world3.remove(seatMark);
        seatMark.traverse((o) => {
          const m = o as unknown as { geometry?: { dispose: () => void }; material?: { dispose: () => void } };
          m.geometry?.dispose();
          m.material?.dispose();
        });
        seatMark = null;
        dirty = true;
        kick();
      };
      // The view from one place, as a seat view in a stadium: standing in the chamber's walkway right in front of the stack, at
      // eye height on its floor, looking at it. The camera flies down in one smooth move; drag to look around from there.
      const seat = (ci: number, fi: number, slot: string) => {
        const s = shown;
        const c = s?.chambers[ci];
        const f = c?.floors[fi];
        const p = f?.places.find((x) => x.slot === slot);
        if (!s || !c || !f || !p) return;
        framed = null;
        const pc = { x: p.rect.x + p.rect.w / 2, y: p.rect.y + p.rect.d / 2 };
        let stand: { x: number; y: number };
        const w = f.walkway;
        if (w) {
          // On the walkway's middle line, level with the place.
          stand = w.d >= w.w ? { x: w.x + w.w / 2, y: Math.min(Math.max(pc.y, w.y + 0.5), w.y + w.d - 0.5) } : { x: Math.min(Math.max(pc.x, w.x + 0.5), w.x + w.w - 0.5), y: w.y + w.d / 2 };
        } else {
          // No walkway: a few steps back from the place, towards the chamber door.
          const toward = c.door ? midOf(c.door) : { x: c.rect.x + c.rect.w / 2, y: c.rect.y + c.rect.d / 2 };
          const dx = toward.x - pc.x;
          const dy = toward.y - pc.y;
          const len = Math.hypot(dx, dy) || 1;
          const back = Math.min(3, len);
          stand = { x: pc.x + (dx / len) * back, y: pc.y + (dy / len) * back };
        }
        if (w) {
          // A few steps back along the walkway towards the chamber door, so the place is seen at an angle with its neighbours,
          // as the pitch is seen from a seat — not nose to nose with it.
          const door = c.door ? midOf(c.door) : { x: w.x + w.w / 2, y: w.y };
          const upright = w.d >= w.w;
          const along = upright ? Math.sign(door.y - stand.y) || -1 : Math.sign(door.x - stand.x) || -1;
          const room = upright ? (along > 0 ? w.y + w.d - 0.4 - stand.y : stand.y - (w.y + 0.4)) : along > 0 ? w.x + w.w - 0.4 - stand.x : stand.x - (w.x + 0.4);
          const step = Math.max(0, Math.min(3.2, room));
          stand = upright ? { x: stand.x, y: stand.y + along * step } : { x: stand.x + along * step, y: stand.y };
        }
        if (Math.hypot(stand.x - pc.x, stand.y - pc.y) < 2) {
          // Too close to see the whole stack: step back along the same line (or towards the door).
          const dx = stand.x - pc.x || 0.001;
          const dy = stand.y - pc.y;
          const len = Math.hypot(dx, dy) || 1;
          stand = { x: pc.x + (dx / len) * 2.2, y: pc.y + (dy / len) * 2.2 };
        }
        // From a raised seat: about level with the top of the stack (never above the ceiling), looking down at its middle, so the
        // whole stack, its neighbours and its "Your choice" tag are all in view.
        // The chosen place glows: a soft rose box round the whole stack with bright edges, so it stands out from its neighbours.
        clearSeat();
        const sw = p.rect.w + 0.12;
        const sd = p.rect.d + 0.12;
        const sh = Math.max(0.6, f.stackH) + 0.1;
        const box = new T.BoxGeometry(sw, sh, sd);
        const glow = new T.Mesh(box, new T.MeshBasicMaterial({ color: '#F43F5E', transparent: true, opacity: 0.18, depthWrite: false }));
        const edges = new T.LineSegments(new T.EdgesGeometry(box), new T.LineBasicMaterial({ color: '#FB7185' }));
        seatMark = new T.Group();
        seatMark.add(glow, edges);
        seatMark.position.set(wx(origin, pc.x), f.z0 + sh / 2, wz(origin, pc.y));
        seatMark.renderOrder = 5;
        world3.add(seatMark);
        // Above the stack tops when the room allows (as from an upper tier), so a place behind its neighbours still shows; looking
        // down at the chosen stack's glowing top.
        const eye = f.z0 + Math.max(EYE + 0.4, Math.min(f.h - 0.25, f.stackH + 1.6));
        const lookAt = f.z0 + Math.max(0.6, Math.min(eye - f.z0 - 1, f.stackH * 0.75));
        setPose([wx(origin, stand.x), eye, wz(origin, stand.y)], [wx(origin, pc.x), lookAt, wz(origin, pc.y)], false, 1500);
      };

      // ── Walking ──
      const placeWalker = () => {
        camera.position.set(wx(origin, me.x), eyeY(), wz(origin, me.y));
        // Heading (building frame) → camera yaw: forward is (cos h, 0, −sin h) in the world.
        camera.rotation.set(me.pitch, Math.atan2(-Math.cos(me.heading), Math.sin(me.heading)), 0, 'YXZ');
        dirty = true;
      };
      const eyeY = () => {
        if (!shown || me.level <= 1 || me.inside < 0) return EYE;
        const f = shown.chambers[me.inside]?.floors[me.level - 1];
        return (f?.z0 ?? 0) + EYE;
      };
      let lastWhere = '';
      // The measure tool: where its mark is, and what was last said (so React hears only of changes).
      let measuring = false;
      let mark: { x: number; y: number; level: number; inside: number } | null = null;
      let lastMeasure = '';
      const tellMeasure = () => {
        if (!measuring || !walkWorldNow) return;
        const ahead = aheadOf(walkWorldNow, me, me.heading);
        const fromMark = mark ? Math.hypot(me.x - mark.x, me.y - mark.y) : null;
        const next: Measure = { ahead: ahead ? { d: Math.round(ahead.d * 100) / 100, what: ahead.what } : null, fromMark: fromMark === null ? null : Math.round(fromMark * 100) / 100, floorsApart: mark ? me.level - mark.level : 0 };
        const key = JSON.stringify(next);
        if (key !== lastMeasure) {
          lastMeasure = key;
          setMeasure(next);
        }
      };
      const tellWhere = () => {
        const s = shown;
        if (!s) return;
        const ci = me.inside >= 0 ? me.inside : chamberAt(s, me);
        const c = ci >= 0 ? s.chambers[ci] : null;
        const inHall = me.x >= s.hall.x && me.x <= s.hall.x + s.hall.w && me.y >= s.hall.y && me.y <= s.hall.y + s.hall.d;
        const text = c
          ? `You are in ${c.name}${c.floors.length > 1 ? ` · Floor ${me.level}` : ''}.`
          : s.building
            ? inHall
              ? 'You are inside the building, in the passage.'
              : 'You are outside the building.'
            : 'You are in the corridor.';
        const key = `${text}|${ci}|${me.level}|${c?.floors.length ?? 1}`;
        if (key !== lastWhere) {
          lastWhere = key;
          setWhere({ text, chamber: ci, level: me.level, floors: c?.floors.length ?? 1 });
        }
        if (mapRef.current) drawMiniMap(mapRef.current, s, me, me.heading, me.level, me.inside);
        tellMeasure();
      };
      const standAt = (p: { x: number; y: number }, heading: number) => {
        pinned = false;
        me.x = p.x;
        me.y = p.y;
        me.level = 1;
        me.inside = -1;
        me.heading = heading;
        me.pitch = -0.08;
        placeWalker();
        tellWhere();
        aim(true);
        kick();
      };
      const toMainDoor = () => {
        if (!shown) return;
        const st = startPoint(shown);
        standAt(st.at, Math.atan2(st.facing.y, st.facing.x));
      };
      const walkTo = (index: number | null) => {
        if (!shown) return;
        if (index === null) return toMainDoor();
        const c = shown.chambers[index];
        if (!c || !walkWorldNow) return;
        const m = c.door ? midOf(c.door) : { x: c.rect.x + c.rect.w / 2, y: c.rect.y };
        for (const back of [1.4, 1.0, 2.2, 0.7]) {
          const p = { x: m.x - c.inward.x * back, y: m.y - c.inward.y * back };
          if (canStand(walkWorldNow, p, 1, -1)) return standAt(p, Math.atan2(c.inward.y, c.inward.x));
        }
        standAt(insideDoor(c), Math.atan2(c.inward.y, c.inward.x));
      };
      const goFloor = (n: number) => {
        const s = shown;
        if (!s || !walkWorldNow) return;
        const ci = me.inside >= 0 ? me.inside : chamberAt(s, me);
        const c = s.chambers[ci];
        if (!c || n < 1 || n > c.floors.length) return;
        const level = n;
        const inside = n > 1 ? ci : -1;
        if (!canStand(walkWorldNow, me, level, inside)) {
          const p = insideDoor(c, 0.9);
          me.x = p.x;
          me.y = p.y;
          me.heading = Math.atan2(c.inward.y, c.inward.x);
        }
        me.level = level;
        me.inside = inside;
        pinned = false;
        placeWalker();
        tellWhere();
        aim(true);
        kick();
      };

      // ── Picking ──
      const ray = new T.Raycaster();
      const ptr = new T.Vector2();
      const cellAt = (nx: number, ny: number): Cell | null => {
        if (!places) return null;
        ray.setFromCamera(ptr.set(nx, ny), camera);
        ray.far = mode3 === 'walk' ? 40 : Infinity;
        const targets: InstanceType<typeof T.Object3D>[] = places.picks.map((p) => p.mesh);
        // Walking, the walls are solid: no choosing through them.
        const walking = mode3 === 'walk';
        if (walking && shell) targets.push(...shell.walls);
        // Looking from outside, a closed chamber's roof and solid walls hide what is inside: tapping them opens the chamber, not a place.
        if (!walking && shell) targets.push(...shell.roofs.filter((r) => r.visible), ...shell.walls.filter((w) => w.userData.of === 'chamber' && w.material === kit.mats.chamberWall));
        for (const hit of ray.intersectObjects(targets, false)) {
          if (hit.instanceId === undefined) return null; // a wall
          const cell = places.picks.find((p) => p.mesh === hit.object)?.cells[hit.instanceId];
          if (!cell) continue;
          // Walking, only the places of the floor you stand on (the grating between floors is see-through).
          if (walking && (cell.floor !== me.level - 1 || (me.level > 1 && cell.chamber !== me.inside))) continue;
          return cell;
        }
        return null;
      };
      const chamberHit = (nx: number, ny: number): number | null => {
        if (!shell) return null;
        ray.setFromCamera(ptr.set(nx, ny), camera);
        ray.far = Infinity;
        const hit = ray.intersectObjects(shell.hits, false)[0];
        return hit ? (hit.object.userData.chamber as number) : null;
      };
      const choosable = (cell: Cell) => {
        const md = latest.current.mode;
        return md === 'owner' ? cell.look !== 'blocked' : md === 'book' && (cell.look === 'free' || cell.look === 'part' || cell.look === 'selected');
      };
      const act = (cell: Cell) => {
        const s = shown;
        const { onPlace: pick, onActive: activate } = latest.current;
        const f = s?.chambers[cell.chamber]?.floors[cell.floor];
        if (!f) return;
        activate(f.row.id);
        if (choosable(cell)) {
          pick?.(f.row, cell.slot, cell.look);
          // Choosing a free place (not taking one off): fly down to it, and show the place's own bar with "Book & pay now".
          if (latest.current.mode === 'book' && mode3 === 'orbit' && (cell.look === 'free' || cell.look === 'part')) {
            seat(cell.chamber, cell.floor, cell.slot);
            setSeatAt({ chamber: cell.chamber, floor: cell.floor, slot: cell.slot });
          }
        }
      };
      let aimed: Cell | null = null;
      let aimAt = 0;
      // After the guided walk: the ring stays on the farmer's place until they look round or move.
      let pinned = false;
      const aim = (force = false) => {
        if (mode3 !== 'walk' || pinned) return;
        const now = performance.now();
        if (!force && now - aimAt < 120) return;
        aimAt = now;
        const cell = cellAt(0, 0);
        aimed = cell;
        const s = shown;
        const next: Target | null = cell && s ? { key: `${cell.chamber}:${cell.floor}:${cell.slot}:${cell.look}:${cell.free}`, text: placeText(s.chambers[cell.chamber], cell), can: choosable(cell), chosen: cell.look === 'selected' } : null;
        setTarget((t) => (t?.key === next?.key && t?.can === next?.can ? t : next));
      };

      // ── Hover and tap ──
      const showTip = (cell: Cell | null, x: number, y: number) => {
        const t = tip.current;
        if (!t) return;
        if (!cell || !shown) {
          t.style.opacity = '0';
          return;
        }
        const rect = el.getBoundingClientRect();
        // What the place is, and how to walk to it from the chamber's door.
        const f = shown.chambers[cell.chamber].floors[cell.floor];
        const way = f.plan && f.row.size ? placeDirections(f.row.size, f.plan, cell.row, cell.col + 1) : '';
        t.textContent = `${placeText(shown.chambers[cell.chamber], cell)}${way ? `\n${way}` : ''}`;
        t.style.opacity = '1';
        t.style.left = `${Math.min(Math.max(8, x - rect.left + 12), rect.width - 236)}px`;
        t.style.top = `${Math.max(8, y - rect.top - 52)}px`;
      };
      const norm = (e: { clientX: number; clientY: number }) => {
        const r = cv.getBoundingClientRect();
        return [((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1] as const;
      };
      let down: { x: number; y: number; id: number; heading: number; pitch: number; moved: boolean } | null = null;
      let hideTip = 0;
      const onDown = (e: PointerEvent) => {
        down = { x: e.clientX, y: e.clientY, id: e.pointerId, heading: me.heading, pitch: me.pitch, moved: false };
        if (mode3 === 'walk') {
          cv.setPointerCapture?.(e.pointerId);
          el.focus({ preventScroll: true });
        }
      };
      const onMoveDrag = (e: PointerEvent) => {
        if (!down || e.pointerId !== down.id) return false;
        const dx = e.clientX - down.x;
        const dy = e.clientY - down.y;
        if (Math.hypot(dx, dy) > 6) {
          down.moved = true;
          pinned = false;
        }
        if (mode3 === 'walk' && down.moved) {
          // Drag the view: like turning your head (the store moves with your finger).
          const k = 3.2 / Math.max(300, cv.clientWidth);
          me.heading = down.heading + dx * k;
          me.pitch = Math.max(-PITCH, Math.min(PITCH, down.pitch + dy * k));
          placeWalker();
          tellWhere();
          aim();
          kick();
        }
        return true;
      };
      const onUp = (e: PointerEvent) => {
        if (!down || e.pointerId !== down.id) return;
        const tap = !down.moved && Math.hypot(e.clientX - down.x, e.clientY - down.y) <= 6;
        down = null;
        if (!tap) {
          if (mode3 === 'walk') {
            aim(true);
            tellMeasure();
          }
          // Sharp again after looking round.
          dirty = true;
          kick();
          return;
        }
        const [nx, ny] = norm(e);
        const cell = cellAt(nx, ny);
        showTip(cell, e.clientX, e.clientY);
        window.clearTimeout(hideTip);
        if (e.pointerType !== 'mouse') hideTip = window.setTimeout(() => showTip(null, 0, 0), 2600);
        if (cell) {
          act(cell);
          // Any stack opens the live booking / capacity inspector — free or
          // booked — so what a place is and holds is always one tap away.
          latest.current.onStack?.(cell);
          return;
        }
        if (mode3 === 'orbit') {
          const ci = chamberHit(nx, ny);
          setInfo(ci);
          if (ci !== null) {
            const row = shown?.chambers[ci]?.floors[0]?.row;
            if (row) latest.current.onActive(row.id);
          }
        }
      };
      let moveQueued = false;
      const onMove = (e: PointerEvent) => {
        if (onMoveDrag(e)) return;
        if (e.pointerType !== 'mouse' || e.buttons || moveQueued || mode3 === 'walk') return;
        moveQueued = true;
        requestAnimationFrame(() => {
          moveQueued = false;
          const [nx, ny] = norm(e);
          const cell = cellAt(nx, ny);
          showTip(cell, e.clientX, e.clientY);
          cv.style.cursor = cell && choosable(cell) ? 'pointer' : 'grab';
        });
      };
      const onLeave = () => showTip(null, 0, 0);
      cv.addEventListener('pointerdown', onDown);
      cv.addEventListener('pointerup', onUp);
      cv.addEventListener('pointercancel', () => (down = null));
      cv.addEventListener('pointermove', onMove);
      cv.addEventListener('pointerleave', onLeave);
      controls.addEventListener('change', () => {
        dirty = true;
        kick();
      });
      controls.addEventListener('start', () => {
        framed = null;
        handHeld = true;
        kick();
      });
      controls.addEventListener('end', () => {
        // Sharp again once the finger lifts.
        handHeld = false;
        dirty = true;
        kick();
      });

      // Keys while walking: W A S D or arrows to walk, ← → (Q E) to turn, R F to look up and down.
      const keyMap: Record<string, keyof WalkInput> = {
        w: 'fwd', arrowup: 'fwd', s: 'back', arrowdown: 'back', a: 'left', d: 'right',
        arrowleft: 'turnL', q: 'turnL', arrowright: 'turnR', e: 'turnR', r: 'up', pageup: 'up', f: 'down', pagedown: 'down',
      };
      const onKey = (on: boolean) => (e: KeyboardEvent) => {
        if (mode3 !== 'walk') return;
        const t = e.target as HTMLElement | null;
        if (t && /^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(t.tagName)) return;
        const k = keyMap[e.key.toLowerCase()];
        if (!k) return;
        e.preventDefault();
        input.current[k] = on;
        if (on) kick();
      };
      const keyDown = onKey(true);
      const keyUp = onKey(false);
      const clearKeys = () => Object.assign(input.current, noInput());
      el.addEventListener('keydown', keyDown);
      el.addEventListener('keyup', keyUp);
      window.addEventListener('blur', clearKeys);

      const resize = () => {
        const w = el.clientWidth;
        const h = el.clientHeight;
        if (!w || !h) return;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        if (framed !== null && mode3 === 'orbit') frame(framed, true);
        dirty = true;
        kick();
      };
      const ro = new ResizeObserver(resize);
      ro.observe(el);
      resize();

      // ── The data ──
      let shownCells = '';
      const setData = (s: StoreScene, cs: Cell[], freeBy: number[], who?: string) => {
        const fresh = s !== shown;
        // The same store with the same places: nothing to build again.
        const sign = `${cs.map((c) => `${c.look}${c.free}`).join()}|${freeBy.join()}|${who ?? ''}`;
        if (!fresh && sign === shownCells) return;
        shownCells = sign;
        if (fresh) {
          if (shell) {
            root.remove(shell.group);
            disposeGroup(T, kit, shell.group);
          }
          const b = s.bounds;
          origin = { ox: b.x + b.w / 2, oy: b.y + b.d / 2 };
          shell = buildShell(kit, s, origin);
          dressShadows(shell.group);
          root.add(shell.group);
          // The disc under the building, from its own footprint, just over the
          // yard (the hall floor sits above it inside the walls).
          if (contactMat) {
            if (contact) {
              root.remove(contact);
              contact.geometry.dispose();
            }
            contact = new T.Mesh(new T.CircleGeometry(Math.max(b.w, b.d) * 0.62, 48), contactMat);
            contact.rotation.x = -Math.PI / 2;
            contact.position.set(0, -0.02, 0);
            root.add(contact);
          }
        }
        // A new store (or new measurements): the way is drawn again from its own numbers.
        if (fresh) {
          routeNow = latest.current.route;
          stopGuide();
        }
        if (places) {
          root.remove(places.group);
          disposeGroup(T, kit, places.group);
        }
        places = buildPlaces(kit, s, cs, origin, (i) => freeBy[i] ?? 0, who);
        setInstSummary(places.instSummary);
        dressShadows(places.group);
        root.add(places.group);
        labelsWalk = null;
        const stops = new Set<string>();
        for (const c of cs) {
          const ch = s.chambers[c.chamber];
          if (c.look === 'booked' || c.look === 'mine' || c.look === 'part' || (c.look === 'blocked' && ch?.storage === 'boxes')) stops.add(`${c.chamber}:${c.floor}:${c.place}`);
        }
        walkWorldNow = walkWorld(s, (ci, fi, pi) => stops.has(`${ci}:${fi}:${pi}`));
        const first = !shown;
        const moved = shown && (shown.bounds.w !== s.bounds.w || shown.bounds.d !== s.bounds.d || shown.chambers.length !== s.chambers.length);
        shown = s;
        if (fresh) showRoute();
        setActive(latest.current.activeIndex);
        if (first || moved) {
          frame('all', true);
          if (mode3 === 'walk') toMainDoor();
        } else if (mode3 === 'walk') {
          placeWalker();
          tellWhere();
          aim(true);
        }
        dirty = true;
        kick();
      };
      const setActive = (index: number) => {
        openNow = index;
        if (!shell) return;
        for (const line of shell.outlines) line.material = line.userData.chamber === index ? kit.edgeOn : kit.edge;
        dirty = true;
        kick();
      };
      /**
       * One frame. From outside, the walls between the camera and the inside
       * are see-through (a cutaway from any side) — or all of them are, when
       * x-ray mode is on; walking, every wall looks solid (unless x-ray).
       * Labels stay readable however far away they are.
       */
      const render = () => {
        if (shell) faceWalls(kit, shell.walls, mode3 === 'walk' ? null : { x: camera.position.x, z: camera.position.z }, xrayNow, openNow);
        // From outside a chamber wears its roof, except the open one (and every chamber in x-ray mode); walking the ceiling stands in for it.
        if (shell) for (const roof of shell.roofs) roof.visible = mode3 !== 'walk' && !xrayNow && openNow >= 0 && roof.userData.chamber !== openNow;
        // Ceilings, roof and lights only when walking: from outside the roof is off so you can look in.
        if (shell) shell.walkOnly.visible = mode3 === 'walk';
        world3.fog = mode3 === 'walk' ? haze : null;
        if (mode3 === 'walk' && shown) {
          // The room the walker is in sets how high the luminaires hang: under its ceiling, or under the deck above.
          const ci = me.inside >= 0 ? me.inside : chamberAt(shown, me);
          const ch = ci >= 0 ? shown.chambers[ci] : null;
          const room = ch ? ch.h : shown.building?.height ?? shown.height;
          const base = ch && me.inside >= 0 && me.level > 1 ? ch.floors[me.level - 1]?.z0 ?? 0 : 0;
          const hang = Math.max(EYE + 0.6, Math.min(room - 0.35, base + 4.2));
          // One over the walker, one a few metres ahead, as a row of strips would light the way.
          [0, 1].forEach((i) => {
            const reach = i * 5;
            walkLamps[i].position.set(wx(origin, me.x + Math.cos(me.heading) * reach), hang, wz(origin, me.y + Math.sin(me.heading) * reach));
            walkLamps[i].intensity = i === 0 ? 40 : 28;
          });
        } else for (const l of walkLamps) l.intensity = 0;
        if (labelsWalk !== (mode3 === 'walk')) {
          labelsWalk = mode3 === 'walk';
          root.traverse((o) => {
            if (o instanceof T.Sprite) o.material.depthTest = labelsWalk === true;
          });
        }
        const px = (2 * Math.tan(T.MathUtils.degToRad(camera.fov / 2))) / Math.max(1, el.clientHeight);
        const plates = [...(shell?.labels ?? []), ...(places?.labels ?? [])];
        const showSizes = mode3 === 'walk' || latest.current.sizes;
        for (const s of plates) s.visible = showSizes || !s.userData.size;
        sizeLabels(plates, camera, px);
        renderer.render(world3, camera);
      };
      const setView = (v: View3D) => {
        if (v === mode3) return;
        mode3 = v;
        Object.assign(input.current, noInput());
        camera.fov = FOV[v];
        camera.updateProjectionMatrix();
        showTip(null, 0, 0);
        if (v === 'walk') {
          orbitPose = { pos: [camera.position.x, camera.position.y, camera.position.z], target: [controls.target.x, controls.target.y, controls.target.z] };
          controls.enabled = false;
          flight = null;
          cv.setAttribute('aria-label', 'Walking inside the cold store. Use the arrows to walk and turn, drag to look around.');
          cv.style.cursor = 'grab';
          walkTo(startAt);
          startAt = null;
        } else {
          controls.enabled = true;
          cv.setAttribute('aria-label', 'The whole cold store in 3D. Drag to turn it, pinch or scroll to zoom.');
          setTarget(null);
          if (orbitPose) setPose(orbitPose.pos, orbitPose.target, true);
          else frame('all', true);
        }
        dirty = true;
        kick();
      };
      const choose = () => {
        if (aimed) act(aimed);
      };

      // ── The way to the farmer's place ──
      const showRoute = () => {
        if (routeGroup) {
          root.remove(routeGroup);
          disposeGroup(T, kit, routeGroup);
          routeGroup = null;
        }
        if (routeNow && shown && shown.chambers[routeNow.chamber]) {
          routeGroup = buildRoute(kit, shown, routeNow, origin);
          root.add(routeGroup);
        }
        dirty = true;
        kick();
      };
      /** Tell the page the newest step the walk has reached (it is said aloud there). */
      const announce = (point: number, done = false) => {
        const r = routeNow;
        if (!r || !guide) return;
        let k = -1;
        r.steps.forEach((s, n) => {
          if (s.at <= point) k = n;
        });
        if (k > guide.said || done) {
          guide.said = Math.max(guide.said, k);
          latest.current.onStep(guide.said, done);
        }
      };
      const stopGuide = (tell = true) => {
        if (!guide) return;
        guide = null;
        if (tell) latest.current.onStep(null);
      };
      const startGuide = () => {
        const r = routeNow;
        if (!r || mode3 !== 'walk' || r.points.length < 2) return false;
        // From the walkway, on over empty bays (floor, nothing stacked) towards the place: as far as
        // the walk itself may go, stopping a little short of the place. Never through a stack.
        pinned = false;
        guidePts = [...r.points];
        const end = guidePts[guidePts.length - 1];
        if (walkWorldNow) {
          const dx = r.face.x - end.x;
          const dy = r.face.y - end.y;
          const d = Math.hypot(dx, dy);
          let reach = 0;
          for (let s = 0.2; s < d - 0.9; s += 0.2) {
            if (!canStand(walkWorldNow, { x: end.x + (dx / d) * s, y: end.y + (dy / d) * s }, end.level, end.inside)) break;
            reach = s;
          }
          if (reach > 0.3) guidePts.push({ x: end.x + (dx / d) * reach, y: end.y + (dy / d) * reach, level: end.level, inside: end.inside });
        }
        const [p0, p1] = guidePts;
        Object.assign(input.current, noInput());
        standAt(p0, Math.atan2(p1.y - p0.y, p1.x - p0.x));
        guide = { i: 1, said: -1 };
        announce(0);
        kick();
        return true;
      };
      /** One step of the guided walk: towards the next point at walking pace, turning smoothly. */
      const guideStep = (dt: number): boolean => {
        const r = routeNow;
        if (!guide || !r) return false;
        if (Object.values(input.current).some(Boolean)) {
          // The person takes over.
          stopGuide();
          return false;
        }
        const to = guidePts[guide.i];
        if (!to) {
          stopGuide();
          return false;
        }
        if (to.level !== me.level || to.inside !== me.inside) {
          // Up (or down) to this floor, where the walk goes on.
          me.level = to.level;
          me.inside = to.inside;
          guide.i++;
          announce(guide.i - 1);
        } else {
          const dx = to.x - me.x;
          const dy = to.y - me.y;
          const d = Math.hypot(dx, dy);
          if (d > 0.05) {
            const diff = ((Math.atan2(dy, dx) - me.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
            me.heading += Math.max(-2.4 * dt, Math.min(2.4 * dt, diff));
          }
          me.pitch += (-0.12 - me.pitch) * Math.min(1, dt * 3);
          const v = WALK_SPEED * dt;
          if (d <= v) {
            me.x = to.x;
            me.y = to.y;
            guide.i++;
            announce(guide.i - 1);
          } else {
            me.x += (dx / d) * v;
            me.y += (dy / d) * v;
          }
        }
        if (guide && guide.i >= guidePts.length) {
          // Arrived: face the place, looking at the middle of its stack (the ring rests on it).
          me.heading = Math.atan2(r.face.y - me.y, r.face.x - me.x);
          const fl = shown?.chambers[r.chamber]?.floors[r.floor];
          if (fl) me.pitch = Math.max(-PITCH, Math.min(PITCH, Math.atan2(fl.z0 + fl.stackH / 2 - eyeY(), Math.max(0.5, Math.hypot(r.face.x - me.x, r.face.y - me.y)))));
          // The ring rests on their place (empty bays in between can be pointed at too: not now).
          const cell = latest.current.cells.find((c) => c.chamber === r.chamber && c.floor === r.floor && c.place === r.place);
          if (cell && shown) {
            placeWalker();
            aimed = cell;
            setTarget({ key: `${cell.chamber}:${cell.floor}:${cell.slot}:${cell.look}:${cell.free}`, text: placeText(shown.chambers[cell.chamber], cell), can: choosable(cell), chosen: cell.look === 'selected' });
            pinned = true;
          }
          announce(guidePts.length - 1, true);
          guide = null;
        }
        return true;
      };
      const setRoute = (r: Route | null) => {
        stopGuide();
        routeNow = r;
        showRoute();
      };

      // ── The loop: runs only while something moves ──
      const ease = (t: number) => 1 - Math.pow(1 - t, 3);
      let moving = false;
      const step = (dt: number) => {
        const i = input.current;
        if (pinned && Object.values(i).some(Boolean)) pinned = false;
        let busy = guideStep(dt);
        const turn = (i.turnL ? 1 : 0) - (i.turnR ? 1 : 0);
        if (turn) {
          me.heading += turn * TURN * dt;
          busy = true;
        }
        const look = (i.up ? 1 : 0) - (i.down ? 1 : 0);
        if (look) {
          me.pitch = Math.max(-PITCH, Math.min(PITCH, me.pitch + look * LOOK * dt));
          busy = true;
        }
        const go = (i.fwd ? 1 : 0) - (i.back ? 1 : 0);
        const side = (i.left ? 1 : 0) - (i.right ? 1 : 0);
        if ((go || side) && walkWorldNow) {
          held += dt;
          // An unhurried walk, as in the real store (a softer first step).
          const speed = Math.min(WALK_SPEED, 0.6 + held * 2);
          const hx = Math.cos(me.heading);
          const hy = Math.sin(me.heading);
          walk(walkWorldNow, me, (hx * go - hy * side) * speed * dt, (hy * go + hx * side) * speed * dt);
          busy = true;
        } else held = 0;
        if (busy) {
          placeWalker();
          tellWhere();
          aim();
        } else if (moving) aim(true); // stopped: say exactly what the ring rests on
        moving = busy;
        return busy;
      };
      function loop(t: number) {
        // Real time, even on a slow phone (walk() goes in small steps, so walls still stop you).
        const gap = last ? (t - last) / 1000 : 0;
        const dt = last ? Math.min(0.2, gap) : 1 / 60;
        last = t;
        let busy = false;
        if (flight) {
          const u = Math.min(1, (performance.now() - flight.t0) / flight.dur);
          // A long flight (down to a place) starts and lands softly, like a camera crane; a short one just eases out.
          const k = flight.dur > 900 ? (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2) : ease(u);
          const f = flight.from;
          const to = flight.to;
          camera.position.set(f[0] + (to[0] - f[0]) * k, f[1] + (to[1] - f[1]) * k, f[2] + (to[2] - f[2]) * k);
          controls.target.set(f[3] + (to[3] - f[3]) * k, f[4] + (to[4] - f[4]) * k, f[5] + (to[5] - f[5]) * k);
          if (k >= 1) flight = null;
          busy = true;
          dirty = true;
        }
        if (mode3 === 'walk') busy = step(dt) || busy;
        else if (controls.update()) busy = true;
        // Slower than 20 frames a second while moving: a slow phone. Draw fewer pixels while
        // moving (sharp again when still) and stop gliding as soon as the finger lifts.
        if (busy && gap > 0.05) {
          if (++slowFrames >= 6) {
            slowFrames = 0;
            moveRatio = Math.max(0.5, moveRatio * 0.8);
            controls.enableDamping = false;
          }
        } else if (busy) slowFrames = 0;
        const moving = busy || handHeld || Boolean(down?.moved);
        if (dirty || busy) {
          const want = moving ? moveRatio : fullRatio;
          if (renderer.getPixelRatio() !== want) renderer.setPixelRatio(want);
          render();
          dirty = false;
        }
        if (busy || flight) raf = requestAnimationFrame(loop);
        else {
          running = false;
          last = 0;
          if (!moving && renderer.getPixelRatio() !== fullRatio) {
            renderer.setPixelRatio(fullRatio);
            render();
          }
        }
      }
      function kick() {
        if (running) return;
        running = true;
        raf = requestAnimationFrame(loop);
      }

        api.current = {
        setData,
        setActive,
        setView,
        frame: (w) => frame(w),
        seat,
        clearSeat,
        walkTo,
        walkFrom: (i) => (startAt = i),
        goFloor,
        choose,
        kick,
        setRoute,
        guide: startGuide,
        stopGuide: () => stopGuide(false),
        showWhere: () => {
          lastWhere = '';
          if (mode3 === 'walk') tellWhere();
        },
        measure: (on) => {
          measuring = on;
          mark = null;
          lastMeasure = '';
          if (on) tellMeasure();
          else setMeasure(null);
        },
        mark: () => {
          mark = { x: me.x, y: me.y, level: me.level, inside: me.inside };
          tellMeasure();
        },
        // The digital-twin controls, applied to the places already built: no rebuild, a shade of work.
        world: (s) => {
          if (!places) return;
          places.applyWorld(s);
          places.applyWorldApples(s);
          dirty = true;
          kick();
        },
        xray: (on) => {
          xrayNow = on;
          dirty = true;
          kick();
        },
      };
      setData(latest.current.scene, latest.current.cells, latest.current.free, latest.current.mineName);
      setView(latest.current.view);
      setReady(true);

      cleanup = () => {
        cancelAnimationFrame(raf);
        window.clearTimeout(hideTip);
        ro.disconnect();
        el.removeEventListener('keydown', keyDown);
        el.removeEventListener('keyup', keyUp);
        window.removeEventListener('blur', clearKeys);
        controls.dispose();
        if (shell) disposeGroup(T, kit, shell.group);
        if (places) disposeGroup(T, kit, places.group);
        if (routeGroup) disposeGroup(T, kit, routeGroup);
        kit.dispose();
        contactMat?.dispose();
        contactTex?.dispose();
        skyTex?.dispose();
        (world3.environment as InstanceType<typeof T.Texture> | null)?.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
        cv.remove();
        api.current = null;
      };
    })().catch((err) => {
      // Any 3D failure stays inside this panel: a WebGL, module or geometry
      // hiccup never takes the page down to the portal's error screen — and
      // it goes through the same automatic retry as the rest.
      if (disposed) return;
      console.error('3D scene failed:', err instanceof Error ? err.message : err);
      scheduleRetry();
    });

    return () => {
      disposed = true;
      cleanup();
    };
    // Rebuilt from scratch per attempt (the retry counter) and once more when
    // the Blender kit arrives in the background; textId never changes, and
    // data and callbacks reach the scene through `latest`/`api`.
  }, [textId, mounted, attempt, kitProtos]);

  // The place taken off again (tapped once more, cleared, or booked by someone else meanwhile): its glow and bar go too.
  const seatGone = Boolean(seatAt) && cells.find((x) => x.chamber === seatAt?.chamber && x.floor === seatAt?.floor && x.slot === seatAt?.slot)?.look !== 'selected';
  useEffect(() => {
    if (!seatGone) return;
    api.current?.clearSeat();
    queueMicrotask(() => setSeatAt(null));
  }, [seatGone]);

  if (failed) {
    return <p className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-950 ring-1 ring-amber-200">This phone or browser cannot show 3D. Use the Drawing — it shows the same chambers and places.</p>;
  }

  const walking = view === 'walk';
  // "Show me the way": walks from the main door to the farmer's place, saying each step.
  const showWay = () => {
    const l = rememberedLang();
    setGuideLang(l === 'hi' || l === 'ur' || l === 'ks' ? l : 'en');
    stopSpeaking();
    if (walking) api.current?.guide();
    else {
      guidePending.current = true;
      onView?.('walk');
    }
  };
  const stopWay = () => {
    api.current?.stopGuide();
    setGuideAt(null);
    setGuideDone(false);
    stopSpeaking();
  };
  const wayLabel = route ? (mode === 'view' ? `Show me the way to my ${scene.chambers[route.chamber]?.storage ?? 'boxes'}` : 'Show the way to your choice') : '';
  const WAY_WORDS: Record<RouteLang, { follow: string; here: string; again: string; stop: string }> = {
    en: { follow: 'Follow the green arrows', here: 'You are there', again: 'Say it again', stop: 'Stop' },
    hi: { follow: 'हरे तीरों के साथ चलिए', here: 'आप पहुँच गए', again: 'फिर से सुनिए', stop: 'रोकिए' },
    ur: { follow: 'سبز تیروں کے ساتھ چلیے', here: 'آپ پہنچ گئے', again: 'پھر سے سنیے', stop: 'روکیے' },
    ks: { follow: 'سبز تیرن پَتہٕ پَتہٕ پَکِو', here: 'توٚہۍ واتیوٗ', again: 'بیٚیہِ بوزِو', stop: 'رۄکِو' },
  };
  const rtl = guideLang === 'ur' || guideLang === 'ks' ? 'rtl' : undefined;
  // The steps said again in another language (and remembered for next time).
  const sayIn = (l: RouteLang) => {
    setGuideLang(l);
    rememberLang(l);
  };
  // "My bins" when the store holds one kind; "My places" when it holds bins and crates.
  const kinds = new Set(scene.chambers.map((c) => c.storage));
  const unitMany = kinds.size === 1 ? UNIT_MANY[[...kinds][0]] : 'places';
  const roomText = [...counts.room].map(([st, n]) => countText(n, st)).join(' and ');
  const show = (f: Focus) => {
    setFocus(f);
    if (f === 'mine') {
      const first = cells.find((c) => c.look === mineLook);
      if (first) api.current?.frame(first.chamber);
    }
  };
  const showing =
    focus === 'free'
      ? counts.freePlaces
        ? `Showing only the places with room: ${counts.freePlaces.toLocaleString('en-IN')} place${counts.freePlaces === 1 ? '' : 's'}, room for ${roomText}.`
        : 'No place has room for these months.'
      : focus === 'mine'
        ? counts.mine
          ? `Showing only ${mode === 'view' ? `your ${unitMany}` : 'your choice'}: ${counts.mine.toLocaleString('en-IN')} place${counts.mine === 1 ? '' : 's'}.`
          : mode === 'view'
            ? 'You have nothing here yet.'
            : 'You have not chosen a place yet.'
        : '';
  const ww = WAY_WORDS[guideLang];
  const chip = (on: boolean) => `inline-flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-xl px-3 text-sm font-semibold transition ${on ? 'bg-forest text-white' : 'bg-forest-soft text-forest-deep ring-1 ring-[#CFE0D6] hover:bg-forest-soft'}`;
  const shownInfo = info !== null ? scene.chambers[info] : null;
  // Every chamber is drawn inside the building. When the owner's numbers need more room than the building has, the building is drawn larger and the owner is told why; a chamber that moved to the other side is told to the owner only.
  const note = scene.problems.length ? (mode === 'owner' ? scene.problems.slice(0, 2).join(' ') : 'As the owner measured them, some chambers need more room than the building has, so the building is drawn larger here.') : mode === 'owner' ? scene.notes.slice(0, 2).join(' ') : '';
  const big = zoom > 1.3;
  const height = walking ? (big ? 'min(78vh, 1050px)' : 'min(70vh, 560px)') : big ? 'min(62vh, 820px)' : 'min(62vh, 520px)';
  // "Book a place here" on a chamber's card: the free place nearest its door is chosen at once (the same as tapping it), and the
  // booking window asks how many bins and goes on to "Book & pay now".
  const bookHere = (ci: number) => {
    const ch = scene.chambers[ci];
    const pick = cells
      .filter((x) => x.chamber === ci && (x.look === 'free' || x.look === 'part'))
      .sort((a, b) => a.floor - b.floor || a.row - b.row || a.col - b.col)[0];
    const f = pick ? ch?.floors[pick.floor] : null;
    if (!pick || !f) return;
    onActive(f.row.id);
    onPlace?.(f.row, pick.slot, pick.look);
    setInfo(null);
    api.current?.seat(ci, pick.floor, pick.slot);
    setSeatAt({ chamber: ci, floor: pick.floor, slot: pick.slot });
  };
  // The chosen place's bar over the foot of the view, as on a stadium seat view: where it is, its room and rent, "Other places"
  // (back to the chamber) and "Book & pay now" (on to confirming and paying the owner).
  const seatCell = seatAt ? cells.find((x) => x.chamber === seatAt.chamber && x.floor === seatAt.floor && x.slot === seatAt.slot) : undefined;
  const seatChamber = seatAt ? scene.chambers[seatAt.chamber] : undefined;
  const seatRow = seatAt ? seatChamber?.floors[seatAt.floor]?.row : undefined;
  const seatRate = seatChamber ? seatChamber.group.rate ?? rate : null;

  const seatBar =
    mode === 'book' && !walking && ready && seatAt && seatCell?.look === 'selected' && seatChamber && seatRow ? (
      <section
        aria-label="Your chosen place"
        data-testid="seat-bar"
        className="absolute inset-x-2 bottom-2 z-30 mx-auto flex max-w-xl flex-wrap items-center gap-2 rounded-2xl bg-slate-950/85 px-3 py-2.5 text-white shadow-2xl ring-1 ring-white/15 backdrop-blur-md sm:flex-nowrap sm:rounded-full sm:pl-5"
      >
        <div className="min-w-0 basis-full sm:flex-1 sm:basis-auto">
          <p className="truncate text-[11px] font-bold uppercase tracking-[0.12em] text-white/90">
            {seatChamber.name}
            {seatChamber.floors.length > 1 ? ` · Floor ${seatAt.floor + 1}` : ''} · {placeLabel(seatAt.slot)}
          </p>
          <p className="truncate text-xs text-white/75">
            A full place holds {countText(seatChamber.floors[seatAt.floor]?.k ?? 0, seatChamber.storage)}
            {seatRate ? ` · ₹${nice(seatRate)} a ${unitWord(seatChamber.storage, 1)} a month` : ''}
          </p>
        </div>
        <button
          type="button"
          data-kr-plain
          onClick={() => {
            const ci = seatAt.chamber;
            setSeatAt(null);
            api.current?.clearSeat();
            api.current?.frame(ci);
          }}
          className="inline-flex min-h-[44px] shrink-0 cursor-pointer items-center rounded-full px-3 text-xs font-semibold text-white/90 ring-1 ring-white/25 hover:bg-white/10"
        >
          ‹ Other places
        </button>
        {onBookNow && (
          <button
            type="button"
            data-kr-plain
            data-testid="seat-book"
            onClick={onBookNow}
            className="inline-flex min-h-[44px] flex-1 shrink-0 cursor-pointer items-center justify-center rounded-full bg-rose-500 px-4 text-sm font-bold text-white shadow-lg shadow-rose-900/30 hover:bg-rose-400 sm:flex-none"
          >
            Book &amp; pay now
          </button>
        )}
      </section>
    ) : null;
  const card =
    !walking && shownInfo ? (
      <InfoCard
        zoom={zoom}
        c={shownInfo}
        free={free[shownInfo.index] ?? 0}
        rate={rate}
        unit={scene.unit}
        onClose={() => setInfo(null)}
        onWalk={
          onView
            ? () => {
                api.current?.walkFrom(shownInfo.index);
                onView('walk');
              }
            : undefined
        }
        onBook={mode === 'book' && onPlace ? () => bookHere(shownInfo.index) : undefined}
      />
    ) : null;
  return (
    <div className="space-y-2">
      {mode === 'book' && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-forest-soft px-4 py-2.5 text-base font-semibold text-forest-deep ring-1 ring-[#CFE0D6]">
          <span>{walking ? '1. Walk up to a stack.' : '1. Tap a chamber to open it.'}</span>
          <span>{walking ? '2. Tap a free stack to choose it.' : '2. Tap a free stack to choose it.'}</span>
          <span>3. Press Book & pay now.</span>
        </p>
      )}
      <div className="flex flex-wrap gap-2" role="group" aria-label={walking ? 'Walk to' : 'Look at'}>
        {route && onView && (
          <button type="button" onClick={showWay} className={`${chip(true)} shadow-sm hover:bg-forest-deep`}>
            <Footprints className="h-4 w-4" aria-hidden /> {wayLabel}
          </button>
        )}
        {walking ? (
          <button type="button" onClick={() => api.current?.walkTo(null)} className={chip(false)}>
            <DoorOpen className="h-4 w-4" aria-hidden /> Back to the main door
          </button>
        ) : (
          <>
            <button type="button" onClick={() => api.current?.frame('all')} className={chip(false)}>
              <Maximize2 className="h-4 w-4" aria-hidden /> Whole store
            </button>
            <button type="button" onClick={() => api.current?.frame('door')} className={chip(false)}>
              <DoorOpen className="h-4 w-4" aria-hidden /> View from the door
            </button>
            <button type="button" onClick={() => api.current?.frame('top')} className={chip(false)}>
              <ScanEye className="h-4 w-4" aria-hidden /> Top view
            </button>
          </>
        )}
        {scene.chambers.map((c) => (
          <button
            key={c.key}
            type="button"
            aria-pressed={activeIndex === c.index}
            onClick={() => {
              const row = c.floors[0]?.row;
              if (row && activeIndex !== c.index) onActive(row.id);
              if (walking) api.current?.walkTo(c.index);
              else {
                setInfo(c.index);
                api.current?.frame(c.index);
              }
            }}
            className={chip(activeIndex === c.index)}
          >
            {walking ? `Go to ${c.name}` : c.name}
          </button>
        ))}
        {onOpenTwin && (
          <button type="button" onClick={onOpenTwin} className={chip(false)}>
            <Factory className="h-4 w-4" aria-hidden /> Digital twin
          </button>
        )}
        <span aria-label="What the store holds" className="ml-auto inline-flex min-h-[36px] items-center rounded-xl bg-white px-3 text-xs font-semibold uppercase tracking-wide text-slate-600 ring-1 ring-slate-200">
          {kinds.size === 1 ? UNIT_MANY[[...kinds][0]] : 'Places'}
        </span>
      </div>
      {!walking && (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Show">
          {mode !== 'owner' && (
            <>
              <button type="button" aria-pressed={focus === 'all'} onClick={() => show('all')} className={chip(focus === 'all')}>
                All places
              </button>
              <button type="button" aria-pressed={focus === 'free'} onClick={() => show('free')} className={chip(focus === 'free')}>
                Free places{counts.freePlaces ? ` (${counts.freePlaces.toLocaleString('en-IN')})` : ''}
              </button>
              {mineLook && (
                <button type="button" aria-pressed={focus === 'mine'} onClick={() => show('mine')} className={chip(focus === 'mine')}>
                  {mode === 'view' ? `My ${unitMany}` : 'My choice'}
                  {counts.mine ? ` (${counts.mine.toLocaleString('en-IN')})` : ''}
                </button>
              )}
            </>
          )}
          <button type="button" aria-pressed={sizes} onClick={() => setSizes((v) => !v)} className={chip(sizes)}>
            Show sizes
          </button>
          {floorsMost > 1 && (
            <span className="inline-flex flex-wrap items-center gap-1.5">
              <Layers className="h-4 w-4 text-slate-500" aria-hidden />
              <span className="sr-only">Floor</span>
              <button type="button" aria-pressed={floorShown === null} onClick={() => setFloorShown(null)} className={chip(floorShown === null)}>
                Every floor
              </button>
              {Array.from({ length: floorsMost }, (_, i) => i + 1).map((n) => (
                <button key={n} type="button" aria-pressed={floorShown === n} onClick={() => setFloorShown(n)} className={chip(floorShown === n)}>
                  Floor {n}
                </button>
              ))}
            </span>
          )}
          <button type="button" aria-pressed={xrayWalls} onClick={() => setXrayWalls((v) => !v)} className={chip(xrayWalls)}>
            <ScanEye className="h-4 w-4" aria-hidden /> See inside all chambers
          </button>
          <button
            type="button"
            aria-pressed={myHighlight}
            onClick={() => setMyHighlight((v) => !v)}
            className={chip(myHighlight)}
            title={mode === 'owner' ? 'Dims every stack that nobody has booked' : 'Dims every stack that is not yours'}
          >
            {mode === 'owner' ? 'Highlight booked' : 'Highlight mine'}
          </button>
        </div>
      )}
      {!walking && showing && (
        <p aria-live="polite" className="text-sm font-semibold text-slate-700">
          {showing}
        </p>
      )}
      <div
        ref={host}
        tabIndex={walking ? 0 : -1}
        className="relative w-full touch-none select-none overflow-hidden rounded-3xl bg-gradient-to-b from-[#BDD6E2] to-[#E4EFEA] outline-none ring-1 ring-slate-900/10 focus-visible:ring-2 focus-visible:ring-forest-mid"
        style={{ height }}
      >
        {!ready && (
          <div className="absolute inset-0 grid place-items-center rounded-3xl bg-slate-100/80" role="status" aria-live="polite">
            <div className="flex flex-col items-center gap-3">
              <span className="h-9 w-9 animate-spin rounded-full border-[3px] border-[#CFE0D6] border-t-forest-mid" aria-hidden />
              <p className="text-sm font-semibold text-slate-600">Initializing the 3D cold store...</p>
            </div>
          </div>
        )}
        <p id={textId} data-scene-text className="sr-only">{sceneText(scene)}</p>
        <div ref={tip} aria-live="polite" className="pointer-events-none absolute z-30 max-w-[228px] whitespace-pre-line rounded-xl bg-slate-900/90 px-3 py-2 text-xs font-semibold text-white opacity-0 shadow-lg transition-opacity" />
        {instSummary && ready && !walking && (
          <p role="status" className="pointer-events-none absolute left-1/2 top-3 z-30 w-fit max-w-[calc(100%-1rem)] -translate-x-1/2 rounded-full bg-slate-900/85 px-3.5 py-1.5 text-center text-[11px] font-semibold text-white shadow-lg">
            Showing optimized 3D instanced view of {instSummary.total.toLocaleString('en-IN')} storage places · {instSummary.boxes.toLocaleString('en-IN')} total box capacity
          </p>
        )}
        {walking && ready && (
          <WalkHud
            press={press}
            where={where}
            onFloor={(n) => api.current?.goFloor(n)}
            target={target}
            onChoose={() => api.current?.choose()}
            mapRef={mapRef}
            mode={mode}
            zoom={zoom}
            unit={scene.unit}
            measure={measure}
            onMeasure={(on) => api.current?.measure(on)}
            onMark={() => api.current?.mark()}
          />
        )}
        {seatBar}
        {!big && card}
      </div>
      {big && card}
      {stackCell && liveCell && (
        <CrateCard
          cell={liveCell}
          scene={scene}
          chambers={chambers}
          mode={mode}
          // Booking flow: the card's own "Select & Book This Bin" — the same
          // choose a map tap makes, so the choice flows into confirm & payment.
          onPlace={mode === 'book' ? onPlace : undefined}
          // Role isolation: only the owner's view reads who holds a place;
          // farmer-facing cards never name another farmer and carry only the
          // viewer's own units plus what is still free.
          stackOf={mode === 'owner' ? stackOf : undefined}
          holdersOf={mode === 'owner' ? holdersOf : undefined}
          mineOf={mode === 'owner' ? undefined : mineOf}
          mineName={mineName}
          facilityName={facilityName}
          facilityId={facilityId}
          onClose={() => setStackCell(null)}
        />
      )}
      {route && guideAt !== null && (
        <section aria-label="The way to your place" className="rounded-2xl bg-forest-soft p-3 ring-1 ring-[#CFE0D6]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 dir={rtl} className="font-semibold text-forest-deep">{guideDone ? ww.here : ww.follow}</h4>
            <div className="flex gap-2">
              <button type="button" onClick={() => void speak(route.steps[guideAt]?.text[guideLang] ?? '', guideLang)} className="inline-flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-xl bg-white px-3 text-sm font-semibold text-forest-deep ring-1 ring-[#CFE0D6] hover:bg-forest-soft">
                <Volume2 className="h-4 w-4" aria-hidden /> {ww.again}
              </button>
              <button type="button" onClick={stopWay} className="inline-flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-xl bg-white px-3 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100">
                <X className="h-4 w-4" aria-hidden /> {ww.stop}
              </button>
            </div>
          </div>
          <div role="radiogroup" aria-label="Language of the steps" className="mt-2 flex flex-wrap gap-1.5">
            {GUIDE_LANGS.map(([l, name]) => (
              <button key={l} type="button" role="radio" aria-checked={guideLang === l} onClick={() => sayIn(l)} className={`min-h-[44px] cursor-pointer rounded-xl px-3 text-sm font-semibold ring-1 ${guideLang === l ? 'bg-forest text-white ring-forest' : 'bg-white text-forest-deep ring-[#CFE0D6] hover:bg-forest-soft'}`}>
                {name}
              </button>
            ))}
          </div>
          <ol dir={rtl} aria-live="polite" className="mt-2 space-y-1 text-sm">
            {route.steps.map((s, k) => (
              <li key={k} className={`rounded-lg px-2 py-1 ${k === guideAt ? 'bg-forest font-semibold text-white' : k < guideAt ? 'text-forest' : 'text-slate-600'}`}>
                {k + 1}. {s.text[guideLang]}
              </li>
            ))}
          </ol>
        </section>
      )}
      {note &&<p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-950 ring-1 ring-amber-300">{note}</p>}
      <p className="text-xs text-slate-500">Sizes, chambers, doors and places are the owner’s. Cooling units hang on the wall the owner named (or the one facing the door); how many, and the lights and curtains, are drawn as in a typical cold store — the Photos tab shows this store as it really is, when the owner has added photos.</p>
      <p className="text-xs text-slate-600">
        {walking
          ? `Walk with the arrows (or the keys W A S D, ← →) · drag to look around · ${mode === 'book' ? 'tap a free place in front of you, or aim the ring at it, to choose it.' : mode === 'owner' ? 'tap a stack to see whose it is.' : 'your stacks are forest green under a gold light.'}`
          : `Drag to turn the store · pinch or scroll to zoom · two fingers to move. Every chamber is a closed room with its own door and colour: tap one (or its button) to open it and see what it holds. ${mode === 'book' ? 'Tap a free place (an outlined stack) to choose it; tap it again to undo.' : mode === 'owner' ? 'Tap a stack to see whose it is.' : 'Your stacks are forest green under a gold light.'}`}
      </p>
    </div>
  );
}

/** The default export too: either import style works. */
export default ColdStore3D;
