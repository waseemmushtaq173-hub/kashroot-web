/**
 * The whole cold store as one scene, in metres, worked out from the owner's
 * own numbers — shared by the drawing (top view), the 3D view and the walk
 * inside, so all three show exactly the same store.
 *
 * Frame: the building seen from its front (the road side). x runs along the
 * front from the left wall, y from the front wall to the back; heights are
 * above the ground. Chambers stand where the owner wizard puts them
 * (lib/coldStore arrangeStore: in number order from the main door inward,
 * on the left, the right or both sides of the passage from it, or where the
 * owner said), each floor of a chamber is one saved row, and every place
 * (one stack of bins or crates) stands where the saved plan puts it
 * (lib/coldLayout). Chambers set up before the wizard (boxes) keep their own
 * plan; with a building they are drawn beside it. Without a building the
 * chambers stand side by side along a corridor. Pure: no three.js, no React.
 */
import { ensureBuildingEnclosesChambers, planOf, type ChamberPlan, type Wall } from '@/lib/coldLayout';
import { arrangeStore, doorLine, fromDoor, groupChambers, oppositeWall, outlineOf, placeRect, type Building, type ChamberGroup, type PreviewRows, type SpaceKey, type Storage, type WallSide, type WorkSpaces } from '@/lib/coldStore';
import { placeName, type ColdChamber } from '@/lib/db/coldMap';

export interface Vec {
  x: number;
  y: number;
}
export interface Rect {
  x: number;
  y: number;
  /** Along the front, and front to back. */
  w: number;
  d: number;
}
export interface Seg {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** What one stack is made of: wooden bins, plastic crates, or apple boxes (older stores). */
export type Kind = 'bin' | 'crate' | 'carton';

/**
 * The 3D view draws a stack as at most this many levels. A wizard store can
 * keep hundreds of bins on one place (Al Noor: 300 on each of 1,556 places);
 * drawing a steel rail for every level of every drawn place ran a phone's
 * WebGL context out of memory before the first frame. The place still holds
 * every bin — only the drawn levels are capped, evenly filling the floor
 * height, and the places-near cap badge says the view is representative.
 */
export const DRAW_LEVEL_CAP = 24;

export interface ScenePlace {
  row: number;
  /** Stack index from 0 ("A"). */
  col: number;
  slot: string;
  /** Its footprint in the building frame. */
  rect: Rect;
  /** Not a place: a pillar (older chambers) or floor left over so the count is exact (wizard). */
  blocked: boolean;
}

export interface SceneFloor {
  /** The saved row of this floor. */
  row: ColdChamber;
  floor: number;
  /** Height of this floor's base above the ground, and up to the next floor (or the ceiling). */
  z0: number;
  h: number;
  /** Bins / crates / boxes on a full place, the layers drawn, and how high a full stack stands. */
  k: number;
  layers: number;
  stackH: number;
  places: ScenePlace[];
  /** The walkway in from the chamber door. */
  walkway: Rect | null;
  /** The places are drawn closer together than they stand (too many for the floor). */
  crowded: boolean;
  plan: ChamberPlan | null;
}

export interface SceneChamber {
  key: string;
  index: number;
  no: number | null;
  name: string;
  group: ChamberGroup;
  storage: Storage;
  kind: Kind;
  rect: Rect;
  /** Wall height (the whole chamber). */
  h: number;
  /** Built from measured sizes (false: an older chamber drawn by rows × stacks, not to scale). */
  toScale: boolean;
  /** Inside the building, clear of the others. */
  fits: boolean;
  /** The side of the passage it stands on (null: where the owner said, or no building). */
  side: WallSide | null;
  doorWall: Wall;
  /** The door as a line on its wall, its height, and the way in (a unit vector into the chamber). */
  door: Seg | null;
  doorH: number;
  inward: Vec;
  /** Towards the wall the cooling units hang on (the owner's choice; unsaid: the wall facing the door). */
  coolerTo: Vec;
  /** The four walls with the door left open. */
  walls: Seg[];
  windows: { seg: Seg; sill: number; height: number; wall: Wall }[];
  floors: SceneFloor[];
  /** An older chamber drawn beside the building. */
  beside: boolean;
}

export interface MainDoor {
  seg: Seg;
  wall: Wall;
  from: number;
  width: number;
  height: number;
  mid: Vec;
  /** Into the building. */
  inward: Vec;
  /** How it opens (absent: a roll-up shutter, as always drawn). */
  kind?: import('@/lib/coldStore').DoorKind;
}

/** A work zone painted on the real floor: the dock at the main door, or a line of work set out on free floor. */
export interface SceneZone {
  key: 'cleaning' | 'grading' | 'sorting' | 'packing' | 'machinery' | 'dock';
  label: string;
  rect: Rect;
}

/**
 * The airlock vestibule just inside the main door (Fishery Leaflet 427
 * anteroom principle: warm outside air must not reach the working hall or the
 * chambers). The main door is its outer door; `door` is the inner airlock
 * door across the passage. `walls` are only the sides that are open hall and
 * the stubs beside the inner door — a chamber wall alongside the passage
 * already closes its side.
 */
export interface Vestibule {
  rect: Rect;
  walls: Seg[];
  door: Seg;
}

export interface StoreScene {
  /** The owner's building as the drawing encloses it — grown where a chamber poked out (null: not given). */
  building: Building | null;
  /** The building's floor, or the space the chambers stand in. */
  hall: Rect;
  /** Everything drawn. */
  bounds: Rect;
  /** The tallest thing. */
  height: number;
  mainDoor: MainDoor | null;
  /** The building's walls with the main door left open (none without a building). */
  walls: Seg[];
  /** The passage straight in from the main door (null without a building). */
  passage: Rect | null;
  /** The airlock vestibule inside the main door (null when the passage has no room for one). */
  vestibule: Vestibule | null;
  /** Work zones painted on the floor (none without a building, and only where free floor has room). */
  zones: SceneZone[];
  chambers: SceneChamber[];
  /** Why something is drawn where it should not be. */
  problems: string[];
  /** Older chambers stand beside the building in this view. */
  beside: boolean;
  /** The most floors any chamber has. */
  floors: number;
  /** The unit the owner typed in. */
  unit: 'ft' | 'm';
}

/** Older chambers without a measured size: a place every 1.2 m, low walls, stacks 1.4 m (not to scale). */
export const PITCH = 1.2;
const PAD = 0.7;
const LOW_WALL = 1.1;
const LOW_STACK = 1.4;
/** Between chambers standing side by side (no building), and the corridor in front of them. */
const GAP = 2;
const CORRIDOR = 3;
export const EYE = 1.6;

/** Into a room through each wall (the building frame, y to the back). */
export const INWARD: Record<Wall, Vec> = { front: { x: 0, y: 1 }, back: { x: 0, y: -1 }, left: { x: 1, y: 0 }, right: { x: -1, y: 0 } };

/**
 * Towards the wall a chamber's coolers hang on. The owner names it from the
 * door (front = the door wall, left / right as you stand at the door facing in,
 * back = facing the door); in the plan, along the door wall "from its left
 * corner" runs (inward.y, -inward.x) — the same way lib/coldStore fromDoor counts.
 */
export function coolerToward(doorWall: Wall, wall: Wall | undefined): Vec {
  const i = INWARD[doorWall];
  const along = { x: i.y, y: -i.x };
  switch (wall) {
    case 'front':
      return { x: -i.x, y: -i.y };
    case 'left':
      return { x: -along.x, y: -along.y };
    case 'right':
      return along;
    default:
      return i;
  }
}

const KIND: Record<Storage, Kind> = { bins: 'bin', crates: 'crate', boxes: 'carton' };

/** A rectangle's four walls, with the stretch `open` (on the wall `wall`) left open. */
function wallsOf(r: Rect, open: Seg | null, wall: Wall): Seg[] {
  const sides: Record<Wall, Seg> = {
    front: { x1: r.x, y1: r.y, x2: r.x + r.w, y2: r.y },
    back: { x1: r.x, y1: r.y + r.d, x2: r.x + r.w, y2: r.y + r.d },
    left: { x1: r.x, y1: r.y, x2: r.x, y2: r.y + r.d },
    right: { x1: r.x + r.w, y1: r.y, x2: r.x + r.w, y2: r.y + r.d },
  };
  const out: Seg[] = [];
  for (const w of ['front', 'back', 'left', 'right'] as Wall[]) {
    const s = sides[w];
    if (w !== wall || !open) {
      out.push(s);
      continue;
    }
    // Along x (front, back) or along y (left, right).
    if (w === 'front' || w === 'back') {
      const a = Math.min(open.x1, open.x2);
      const b = Math.max(open.x1, open.x2);
      if (a - s.x1 > 0.01) out.push({ x1: s.x1, y1: s.y1, x2: a, y2: s.y1 });
      if (s.x2 - b > 0.01) out.push({ x1: b, y1: s.y1, x2: s.x2, y2: s.y1 });
    } else {
      const a = Math.min(open.y1, open.y2);
      const b = Math.max(open.y1, open.y2);
      if (a - s.y1 > 0.01) out.push({ x1: s.x1, y1: s.y1, x2: s.x1, y2: a });
      if (s.y2 - b > 0.01) out.push({ x1: s.x1, y1: b, x2: s.x1, y2: s.y2 });
    }
  }
  return out;
}

const shift = (s: Seg, x: number, y: number): Seg => ({ x1: s.x1 + x, y1: s.y1 + y, x2: s.x2 + x, y2: s.y2 + y });
export const midOf = (s: Seg): Vec => ({ x: (s.x1 + s.x2) / 2, y: (s.y1 + s.y2) / 2 });
export const segLength = (s: Seg) => Math.hypot(s.x2 - s.x1, s.y2 - s.y1);

/** A wizard chamber (its floors), standing with its front-left corner at `at`. */
function wizardChamber(g: ChamberGroup, index: number, at: { x: number; y: number; w: number; d: number; fits: boolean; side?: WallSide }): SceneChamber {
  const size = g.size!;
  const o = outlineOf(size);
  const rect: Rect = { x: at.x, y: at.y, w: at.w, d: at.d };
  const local = { length: at.w, width: at.d };
  const doorWall = o.door?.wall ?? 'front';
  const door = o.door ? shift(doorLine(o.door, local), at.x, at.y) : null;
  const floors: SceneFloor[] = [];
  for (const row of g.floors) {
    const s = row.size;
    if (!s) continue;
    const plan = planOf(s);
    const places: ScenePlace[] = [];
    for (let r = 1; r <= row.rows; r++) {
      for (let c = 0; c < row.cols; c++) {
        const q = placeRect(s, plan, r, c);
        if (!q) continue;
        const slot = placeName(r, c);
        places.push({ row: r, col: c, slot, rect: { x: at.x + q.x, y: at.y + q.y, w: q.w, d: q.d }, blocked: row.blocked.includes(slot) });
      }
    }
    let walkway: Rect | null = null;
    if (plan.aisleX) {
      const a = fromDoor(s.doorWall ?? 'front', local, plan.aisleX[0], 0);
      const b = fromDoor(s.doorWall ?? 'front', local, plan.aisleX[1], s.length);
      walkway = { x: at.x + Math.min(a.x, b.x), y: at.y + Math.min(a.y, b.y), w: Math.abs(a.x - b.x), d: Math.abs(a.y - b.y) };
    }
    const h = plan.floorH || s.height;
    const k = Math.max(1, row.boxes_per_slot);
    const layers = Math.max(1, Math.min(k, DRAW_LEVEL_CAP));
    floors.push({
      row,
      floor: row.floor,
      z0: plan.floorZ ?? 0,
      h,
      k,
      layers,
      // A stack never goes through the floor above (only when the owner's count needed taller stacks).
      stackH: Math.min(k * s.box.h, h * 0.97),
      places,
      walkway,
      crowded: Boolean(plan.crowded),
      plan,
    });
  }
  return {
    key: g.key,
    index,
    no: g.no,
    name: g.name,
    group: g,
    storage: g.storage,
    kind: KIND[g.storage],
    rect,
    h: size.height,
    toScale: true,
    fits: at.fits,
    side: at.side ?? null,
    doorWall,
    door,
    doorH: o.door?.height ?? Math.min(3, size.height),
    inward: INWARD[doorWall],
    coolerTo: coolerToward(doorWall, size.cooling?.wall),
    walls: wallsOf(rect, door, doorWall),
    windows: [],
    floors,
    beside: false,
  };
}

/** The footprint of an older chamber (its door in the front wall); `d` clamps inside a hall depth when given. */
function olderSize(g: ChamberGroup, limitD = Infinity): { w: number; d: number } {
  const row = g.floors[0];
  if (row.size) return { w: row.size.width, d: Math.min(row.size.length, limitD) };
  return { w: row.cols * PITCH + 2 * PAD, d: Math.min(row.rows * PITCH + 2 * PAD, limitD) };
}

/** An older chamber (boxes): measured (door and windows as measured) or rows × stacks. */
function olderChamber(g: ChamberGroup, index: number, at: Vec, beside = false, sizeUnknown?: { w: number; d: number }): SceneChamber {
  const row = g.floors[0];
  const s = row.size;
  const { w, d } = sizeUnknown ?? olderSize(g);
  const rect: Rect = { x: at.x, y: at.y, w, d };
  const places: ScenePlace[] = [];
  let floor: SceneFloor;
  let door: Seg;
  let doorH: number;
  const windows: SceneChamber['windows'] = [];
  if (s) {
    const plan = planOf(s);
    for (let r = 1; r <= row.rows; r++) {
      for (let c = 0; c < row.cols; c++) {
        const q = placeRect(s, plan, r, c);
        if (!q) continue;
        const slot = placeName(r, c);
        places.push({ row: r, col: c, slot, rect: { x: at.x + q.x, y: at.y + q.y, w: q.w, d: q.d }, blocked: row.blocked.includes(slot) });
      }
    }
    door = { x1: at.x + plan.doorX[0], y1: at.y, x2: at.x + plan.doorX[1], y2: at.y };
    doorH = plan.doorH;
    for (const win of plan.windows) {
      // On the front and back walls measured from the left wall; on the side walls from the door wall.
      const seg: Seg =
        win.wall === 'front' || win.wall === 'back'
          ? { x1: at.x + win.at, y1: at.y + (win.wall === 'back' ? d : 0), x2: at.x + win.at + win.width, y2: at.y + (win.wall === 'back' ? d : 0) }
          : { x1: at.x + (win.wall === 'right' ? w : 0), y1: at.y + win.at, x2: at.x + (win.wall === 'right' ? w : 0), y2: at.y + win.at + win.width };
      windows.push({ seg, sill: win.sill, height: win.height, wall: win.wall });
    }
    const walkway = plan.aisleX ? { x: at.x + plan.aisleX[0], y: at.y, w: plan.aisleX[1] - plan.aisleX[0], d } : null;
    floor = { row, floor: 1, z0: 0, h: s.height, k: row.boxes_per_slot, layers: Math.max(1, Math.min(plan.layers, DRAW_LEVEL_CAP)), stackH: Math.max(0.2, Math.min(plan.stackHeight, plan.floorH || plan.stackHeight)), places, walkway, crowded: false, plan };
  } else {
    // Rows × stacks without a measured size: the places stand inside the
    // chamber's own rectangle. When there are more rows than 1.2 m steps
    // fit between the walls, the step shrinks (crowded) and the footprint
    // with it — a long chamber's grid never runs out through the back wall.
    const stepX = row.cols > 1 ? Math.min(PITCH, (w - 2 * PAD) / row.cols) : PITCH;
    const stepY = Math.min(PITCH, (d - 2 * PAD) / Math.max(1, row.rows));
    const f = Math.max(0.05, Math.min(PITCH * 0.82, stepX * 0.9, stepY * 0.9));
    const midX = at.x + (w - (row.cols - 1) * stepX) / 2;
    const midY = at.y + (d - (row.rows - 1) * stepY) / 2;
    for (let r = 1; r <= row.rows; r++) {
      for (let c = 0; c < row.cols; c++) {
        const slot = placeName(r, c);
        places.push({ row: r, col: c, slot, rect: { x: midX + c * stepX - f / 2, y: midY + (r - 1) * stepY - f / 2, w: f, d: f }, blocked: row.blocked.includes(slot) });
      }
    }
    const dw = Math.min(1.6, w * 0.4);
    door = { x1: at.x + (w - dw) / 2, y1: at.y, x2: at.x + (w + dw) / 2, y2: at.y };
    doorH = LOW_WALL;
    floor = { row, floor: 1, z0: 0, h: LOW_WALL, k: row.boxes_per_slot, layers: 4, stackH: LOW_STACK, places, walkway: null, crowded: false, plan: null };
  }
  return {
    key: g.key,
    index,
    no: g.no,
    name: g.name,
    group: g,
    storage: g.storage,
    kind: KIND[g.storage],
    rect,
    h: s ? s.height : LOW_WALL,
    toScale: Boolean(s),
    fits: true,
    side: null,
    doorWall: 'front',
    door,
    doorH,
    inward: INWARD.front,
    coolerTo: INWARD.front,
    walls: wallsOf(rect, door, 'front'),
    windows,
    floors: [floor],
    beside,
  };
}

/** The smallest floor a work lane needs, and the gap left between lanes. */
const ZONE_MIN_LANE = 3;
const ZONE_MIN_DEPTH = 3;
const ZONE_GAP = 0.4;

/**
 * The biggest empty rectangle of the hall's floor on a 1 m grid: nothing in
 * `taken` (chambers, the passage) stands on it. The classic row-by-row scan
 * of free heights (largest rectangle under a histogram), so one pass finds
 * it.
 */
function biggestFreeRect(hall: Rect, taken: Rect[]): Rect | null {
  const gw = Math.max(2, Math.floor(hall.w));
  const gd = Math.max(2, Math.floor(hall.d));
  const occ = new Uint8Array(gw * gd);
  for (const r of taken) {
    const xa = Math.max(0, Math.floor(r.x - hall.x));
    const ya = Math.max(0, Math.floor(r.y - hall.y));
    const xb = Math.min(gw, Math.ceil(r.x + r.w - hall.x));
    const yb = Math.min(gd, Math.ceil(r.y + r.d - hall.y));
    for (let y = ya; y < yb; y++) for (let x = xa; x < xb; x++) occ[y * gw + x] = 1;
  }
  const hgt = new Int32Array(gw);
  const stack: number[] = [];
  let best: Rect | null = null;
  let bestArea = 0;
  for (let y = 0; y < gd; y++) {
    for (let x = 0; x < gw; x++) hgt[x] = occ[y * gw + x] ? 0 : hgt[x] + 1;
    stack.length = 0;
    for (let x = 0; x <= gw; x++) {
      const cur = x < gw ? hgt[x] : 0;
      while (stack.length && hgt[stack[stack.length - 1]] >= cur) {
        const h = hgt[stack.pop() as number];
        const left = stack.length ? stack[stack.length - 1] + 1 : 0;
        const w = x - left;
        if (h * w > bestArea && h >= ZONE_MIN_DEPTH && w >= ZONE_MIN_LANE) {
          bestArea = h * w;
          best = { x: hall.x + left, y: hall.y + y - h + 1, w, d: h };
        }
      }
      stack.push(x);
    }
  }
  return best;
}

/** The lines of work, in the order they follow the fruit through the store (the sorting area is carved from the grading lane). */
const ZONE_LINES: [SpaceKey, string][] = [
  ['cleaning', 'Receiving & weighing area'],
  ['grading', 'Automated grading line'],
  ['packing', 'Packaging space'],
  ['machinery', 'Refrigeration plant'],
];
/** The grading lane's share that stays the machine line; the rest, beside it, is the sorting area. */
const GRADING_SHARE = 0.62;

/** The colour a work zone is painted in — the same hue in the 2D drawing and on the 3D floor. */
export const ZONE_LOOK: Record<SceneZone['key'], string> = {
  cleaning: '#0e7490',
  grading: '#15803d',
  sorting: '#4d7c0f',
  packing: '#a16207',
  machinery: '#475569',
  dock: '#c2410c',
};

/**
 * Where the work zones stand. A zone the owner sized keeps its own length ×
 * width (clamped into the free floor, laid along its longer side; too many
 * for it shrink together so every one still fits); zones left empty are set
 * out as equal lanes on whatever room is left. The dock stands on the
 * passage floor at the main door — an owner-sized dock keeps its length as
 * the depth it reaches into the passage. Only real free floor is set out —
 * never a chamber, never the forklift corridor. Exported for the wizard's
 * own live drawing (owner/StoreDrawing), which draws the same zones from
 * the draft.
 */
export function workZones(hall: Rect, chamberRects: Rect[], passage: Rect | null, doorWall: Wall, ownerSpaces?: WorkSpaces): SceneZone[] {
  const zones: SceneZone[] = [];
  const taken = [...chamberRects];
  if (passage) taken.push({ ...passage });
  const free = biggestFreeRect(hall, taken);
  const owner = ownerSpaces ?? null;
  if (free) {
    const along = free.w >= free.d;
    const run = along ? free.w : free.d;
    const cross = along ? free.d : free.w;
    const put = (key: SceneZone['key'], label: string, len: number, wid: number, at: number) => {
      zones.push({ key, label, rect: along ? { x: free.x + at, y: free.y + (cross - wid) / 2, w: len, d: wid } : { x: free.x + (cross - wid) / 2, y: free.y + at, w: wid, d: len } });
    };
    const sized = ZONE_LINES.filter(([k]) => owner?.[k]);
    const rest = ZONE_LINES.filter(([k]) => !owner?.[k]);
    if (sized.length) {
      // Owner-sized first: their lengths along the run (an owner space is
      // never smaller than 1 m), shrinking together when they overflow, with
      // the gap left between them.
      const lanes = sized.map(([k, label]) => {
        const s = owner![k]!;
        const len = Math.min(Math.max(s.l, 1), run);
        const wid = Math.min(Math.max(s.w, 1), cross);
        return { k, label, len, wid };
      });
      const room = run - ZONE_GAP * Math.max(0, lanes.length - 1);
      const total = lanes.reduce((n, s) => n + s.len, 0);
      const scale = total > room && total > 0 ? room / total : 1;
      let at = 0;
      for (const s of lanes) {
        const len = Math.max(1, s.len * scale);
        put(s.k, s.label, len, s.wid, at);
        at += len + ZONE_GAP;
      }
      // The zones left to KashRoot: equal lanes over what run is still free.
      const left = Math.max(0, run - at);
      const n = Math.min(rest.length, Math.floor(left / ZONE_MIN_LANE));
      if (n > 0) {
        const lane = left / n;
        rest.slice(0, n).forEach(([key, label], i) => put(key, label, lane - 2 * ZONE_GAP, cross - 2 * ZONE_GAP, at + i * lane + ZONE_GAP));
      }
    } else {
      // Nothing owner-sized: the four lines of work as equal lanes, as many
      // as fit side by side along the free rect's longer side.
      const n = Math.min(ZONE_LINES.length, Math.floor(run / ZONE_MIN_LANE));
      const lane = run / n;
      ZONE_LINES.slice(0, n).forEach(([key, label], i) => put(key, label, lane - 2 * ZONE_GAP, cross - 2 * ZONE_GAP, i * lane + ZONE_GAP));
    }
  }
  // The grading lane holds the machine line and, beside it along the same run, the sorting area.
  const gi = zones.findIndex((z) => z.key === 'grading');
  if (gi >= 0) {
    const g = zones[gi].rect;
    const along = g.w >= g.d;
    const run = along ? g.w : g.d;
    if (run >= ZONE_MIN_LANE * 2) {
      const lineLen = Math.max(ZONE_MIN_LANE, (run - ZONE_GAP) * GRADING_SHARE);
      const sortLen = run - ZONE_GAP - lineLen;
      if (sortLen >= 1.5) {
        zones[gi] = { ...zones[gi], rect: along ? { ...g, w: lineLen } : { ...g, d: lineLen } };
        zones.splice(gi + 1, 0, { key: 'sorting', label: 'Sorting area', rect: along ? { ...g, x: g.x + lineLen + ZONE_GAP, w: sortLen } : { ...g, y: g.y + lineLen + ZONE_GAP, d: sortLen } });
      }
    }
  }
  if (passage) {
    // The dock is the strip of the passage at the main door: the passage
    // runs from it, clear of every chamber, to the wall opposite. An
    // owner-sized dock keeps its length as the depth it reaches in.
    const horiz = doorWall === 'front' || doorWall === 'back';
    const size = horiz ? passage.d : passage.w;
    const depth = Math.min(owner?.dock ? Math.max(1.2, owner.dock.l) : 3, size);
    if (depth >= 1.2 && Math.min(passage.w, passage.d) >= 1.2) {
      const touchesNear = horiz ? Math.abs(passage.y - hall.y) < 0.6 : Math.abs(passage.x - hall.x) < 0.6;
      const touchesFar = horiz ? Math.abs(passage.y + passage.d - (hall.y + hall.d)) < 0.6 : Math.abs(passage.x + passage.w - (hall.x + hall.w)) < 0.6;
      const frontEnd = doorWall === 'front' || doorWall === 'left' ? touchesNear : touchesFar;
      const lo = horiz ? passage.y : passage.x;
      const at = frontEnd ? lo : lo + size - depth;
      zones.push({ key: 'dock', label: 'Dispatch & truck bay', rect: horiz ? { x: passage.x, y: at, w: passage.w, d: depth } : { x: at, y: passage.y, w: depth, d: passage.d } });
    }
  }
  return zones;
}

/**
 * The store from its saved rows (one per floor of a chamber) and, when known,
 * its building. Deterministic: the same rows give the same scene.
 */
export function buildScene(rows: ColdChamber[], building: Building | null | undefined): StoreScene {
  const groups = groupChambers(rows);
  const wizard = groups.filter((g) => g.no !== null && g.size);
  const older = groups.filter((g) => !(g.no !== null && g.size));
  const chambers: SceneChamber[] = [];
  const problems: string[] = [];
  const b = building ?? null;
  const unit = b?.unit ?? wizard[0]?.size?.unit ?? older.find((g) => g.floors[0].size)?.floors[0].size?.unit ?? 'm';

  let hall: Rect;
  let passage: Rect | null = null;
  if (b) {
    // Every chamber inside the walls (lib/coldLayout): the owner's building
    // grows a little where a chamber pokes out — its door and heights stay
    // as measured — so the arrangement below never stands one outside.
    // Growing the shell moves the passage and every spot with it, so the
    // arrangement is reworked (at most three rounds) until nothing pokes
    // past the walls. A chamber wider than the passage leaves room for is
    // beyond growing: it keeps its fits = false and the hall stretches
    // around it below.
    // The saved wall of each chamber (step 3: LEFT / BACK / RIGHT / FRONT)
    // forms the owner-diagram banks: 1..4 along the left wall with doors
    // facing the hall, 5..N along the far wall with doors at their bottom.
    // A back / front bank chamber is turned — its door wall becomes the face
    // towards the hall — so its outline, door and places land the right way
    // even when an older save measured it for a passage side.
    const bankOf = (g: ChamberGroup): WallSide | undefined => {
      const wp = (g.sidePosition ?? '').trim().toUpperCase();
      return wp === 'LEFT' ? 'left' : wp === 'RIGHT' ? 'right' : wp === 'BACK' ? 'back' : wp === 'FRONT' ? 'front' : undefined;
    };
    const banked = wizard.map((g) => {
      const side = bankOf(g);
      if (side !== 'back' && side !== 'front') return g;
      return { ...g, size: { ...g.size!, doorWall: side === 'back' ? b.door.wall : oppositeWall(b.door.wall) } };
    });
    let enclosed = ensureBuildingEnclosesChambers(b, banked.map((g) => g.size!));
    const arranged = (cur: Building) => arrangeStore(cur, banked.map((g) => ({ key: g.key, name: g.name, outline: outlineOf(g.size!), spot: g.size!.spot, side: bankOf(g) })));
    let lay = arranged(enclosed);
    const round2 = (n: number) => Math.round(n * 100) / 100;
    for (let grown = 0; grown < 3; grown++) {
      let east = enclosed.length;
      let back = enclosed.width;
      for (const g of banked) {
        const spot = lay.spots[g.key];
        if (!spot || spot.fits) continue;
        east = Math.max(east, spot.x + spot.w);
        back = Math.max(back, spot.y + spot.d);
      }
      if (east <= enclosed.length && back <= enclosed.width) break;
      enclosed = { ...enclosed, length: round2(east + 0.6), width: round2(back + 0.6) };
      lay = arranged(enclosed);
    }
    hall = { x: 0, y: 0, w: enclosed.length, d: enclosed.width };
    passage = lay.passage.rect;
    // The owner's live preview brings where its top view puts each chamber (lib/coldStore previewChambers): the very same places.
    const pre = rows as PreviewRows;
    for (const p of pre.spots ? (pre.problems ?? []) : lay.problems.map((x) => x.message)) if (!problems.includes(p)) problems.push(p);
    for (const g of banked) chambers.push(wizardChamber(g, chambers.length, pre.spots?.[g.floors[0].id] ?? lay.spots[g.key]));
    // Older chambers: never outside the walls. The building stretches to
    // wrap them, east of the measured chambers, passage still in front —
    // Chamber 1 every chamber sits inside the insulated perimeter.
    let x = enclosed.length + 2;
    const olderPlaced: { g: ChamberGroup; at: Vec; size: { w: number; d: number } }[] = [];
    for (const g of older) {
      const s = olderSize(g, Math.max(2, enclosed.width - 2 * PAD));
      olderPlaced.push({ g, at: { x, y: (enclosed.width - s.d) / 2 }, size: s });
      x += s.w + GAP;
    }
    for (const p of olderPlaced) chambers.push(olderChamber(p.g, chambers.length, p.at, false, p.size));
    // The east wall moves out so every chamber is inside the building.
    if (olderPlaced.length > 0) {
      hall = { x: 0, y: 0, w: enclosed.length + 2 + olderPlaced.reduce((n, p) => n + p.size.w + GAP, 0), d: enclosed.width };
    }
    // A chamber measured before the building was (or one bigger than its
    // shell) still ends up inside the walls: the building grows around every
    // chamber, every place and the passage too. The front wall keeps its
    // y = 0, so the main door and the walls derived below stay where the
    // owner measured.
    let east = hall.x + hall.w;
    let back = hall.y + hall.d;
    for (const c of chambers) {
      east = Math.max(east, c.rect.x + c.rect.w);
      back = Math.max(back, c.rect.y + c.rect.d);
      for (const f of c.floors) {
        if (f.walkway) {
          east = Math.max(east, f.walkway.x + f.walkway.w);
          back = Math.max(back, f.walkway.y + f.walkway.d);
        }
        for (const p of f.places) {
          east = Math.max(east, p.rect.x + p.rect.w);
          back = Math.max(back, p.rect.y + p.rect.d);
        }
      }
    }
    if (passage) {
      east = Math.max(east, passage.x + passage.w);
      back = Math.max(back, passage.y + passage.d);
    }
    hall = { x: hall.x, y: hall.y, w: Math.max(hall.w, east - hall.x), d: Math.max(hall.d, back - hall.y) };
    // The passage runs straight in from the main door to the wall opposite:
    // it reaches the back of the hall even when the hall grew around it.
    if (passage) passage = { x: passage.x, y: passage.y, w: passage.w, d: Math.max(passage.d, hall.y + hall.d - passage.y) };
    // Every place sits inside its own chamber — hard-clamped, so no
    // rounding or odd input can poke a stack through a chamber wall.
    for (const c of chambers) {
      for (const f of c.floors) {
        if (f.walkway) {
          f.walkway = {
            x: Math.max(c.rect.x, Math.min(f.walkway.x, c.rect.x + c.rect.w - f.walkway.w)),
            y: Math.max(c.rect.y, Math.min(f.walkway.y, c.rect.y + c.rect.d - f.walkway.d)),
            w: f.walkway.w,
            d: f.walkway.d,
          };
        }
        for (const p of f.places) {
          p.rect = {
            x: Math.max(c.rect.x, Math.min(p.rect.x, c.rect.x + c.rect.w - p.rect.w)),
            y: Math.max(c.rect.y, Math.min(p.rect.y, c.rect.y + c.rect.d - p.rect.d)),
            w: p.rect.w,
            d: p.rect.d,
          };
        }
      }
    }
  } else {
    // No building: side by side along a corridor (in front of them), fronts in a line.
    let x = 0;
    let deep = 0;
    for (const g of wizard) {
      const o = outlineOf(g.size!);
      chambers.push(wizardChamber(g, chambers.length, { x, y: CORRIDOR, w: o.length, d: o.width, fits: true }));
      x += o.length + GAP;
      deep = Math.max(deep, o.width);
    }
    for (const g of older) {
      const s = olderSize(g);
      chambers.push(olderChamber(g, chambers.length, { x, y: CORRIDOR }, false));
      x += s.w + GAP;
      deep = Math.max(deep, s.d);
    }
    const width = Math.max(4, x - GAP);
    hall = { x: -1, y: 0, w: width + 2, d: CORRIDOR + Math.max(deep, 2) + 1 };
  }

  // The building everything is drawn inside: the owner's shell grown where a
  // chamber poked out through a wall or up through the roof, so the labels,
  // the walls and the roof all tell the same truth as the drawing.
  let effBuilding: Building | null = null;
  if (b) {
    let tall = b.height;
    for (const c of chambers) tall = Math.max(tall, c.h);
    effBuilding = { ...b, length: hall.w, width: hall.d, height: tall > b.height ? Math.round((tall + 0.3) * 100) / 100 : b.height };
  }

  let mainDoor: MainDoor | null = null;
  let walls: Seg[] = [];
  let zones: SceneZone[] = [];
  if (b) {
    const seg = doorLine(b.door, { length: hall.w, width: hall.d });
    mainDoor = { seg, wall: b.door.wall, from: b.door.from, width: b.door.width, height: b.door.height, mid: midOf(seg), inward: INWARD[b.door.wall], kind: b.doorKind };
    walls = wallsOf(hall, seg, b.door.wall);
    // The work zones painted on the floor: the dock at the main door, and
    // the lines of work on the biggest clear floor — real free floor only,
    // the owner's own sizes kept where they gave them.
    zones = workZones(hall, chambers.map((c) => c.rect), passage, b.door.wall, b.workSpaces);
  }

  let x0 = hall.x;
  let y0 = hall.y;
  let x1 = hall.x + hall.w;
  let y1 = hall.y + hall.d;
  let height = effBuilding ? effBuilding.height : 0;
  let floors = 1;
  for (const c of chambers) {
    x0 = Math.min(x0, c.rect.x);
    y0 = Math.min(y0, c.rect.y);
    x1 = Math.max(x1, c.rect.x + c.rect.w);
    y1 = Math.max(y1, c.rect.y + c.rect.d);
    height = Math.max(height, c.h);
    floors = Math.max(floors, c.floors.length);
  }
  const vestibule = vestibuleOf(mainDoor, passage, chambers, hall);
  return { building: effBuilding, hall, bounds: { x: x0, y: y0, w: x1 - x0, d: y1 - y0 }, height: Math.max(height, 1), mainDoor, walls, passage, vestibule, zones, chambers, problems, beside: false, floors, unit };
}

const ORD = ['1st', '2nd', '3rd'];

/** How deep the airlock vestibule is, metres in from the main door. */
const VESTIBULE_DEPTH = 2.4;

/**
 * The airlock vestibule in the passage just inside the main door: its inner
 * door across the passage, a wall on each side that is open hall (a chamber
 * standing alongside already closes its own side) and stubs either side of
 * the inner door. Null when the passage is too short or narrow for one.
 */
export function vestibuleOf(md: MainDoor | null, passage: Rect | null, chambers: { rect: Rect }[], hall: Rect): Vestibule | null {
  if (!md || !passage) return null;
  const vertical = md.inward.y !== 0;
  const a0 = vertical ? passage.x : passage.y;
  const a1 = vertical ? passage.x + passage.w : passage.y + passage.d;
  const room = vertical ? passage.d : passage.w;
  const depth = Math.min(VESTIBULE_DEPTH, room * 0.4);
  if (depth < 1.6 || a1 - a0 < 1.6) return null;
  const sign = vertical ? md.inward.y : md.inward.x;
  const start = vertical ? md.mid.y : md.mid.x;
  const end = start + sign * depth;
  const lo = Math.min(start, end);
  const mid = vertical ? md.mid.x : md.mid.y;
  const half = Math.min(md.width, a1 - a0) / 2;
  const g0 = Math.max(a0, mid - half);
  const g1 = Math.min(a1, mid + half);
  const at = (a: number, d: number): Vec => (vertical ? { x: a, y: d } : { x: d, y: a });
  const line = (aa: number, dd: number, bb: number, ee: number): Seg => {
    const p = at(aa, dd);
    const q = at(bb, ee);
    return { x1: p.x, y1: p.y, x2: q.x, y2: q.y };
  };
  // The building's own wall, or a chamber standing against this edge of the passage along the vestibule's depth, is its side wall already.
  const onHall = (edge: number) => (vertical ? [hall.x, hall.x + hall.w] : [hall.y, hall.y + hall.d]).some((e) => Math.abs(e - edge) < 0.3);
  const closed = (edge: number) =>
    onHall(edge) ||
    chambers.some(({ rect: r }) => {
      const near = vertical ? [r.x, r.x + r.w] : [r.y, r.y + r.d];
      const span = vertical ? [r.y, r.y + r.d] : [r.x, r.x + r.w];
      return near.some((e) => Math.abs(e - edge) < 0.3) && Math.min(span[1], lo + depth) - Math.max(span[0], lo) > 0.5;
    });
  const walls: Seg[] = [];
  if (!closed(a0)) walls.push(line(a0, start, a0, end));
  if (!closed(a1)) walls.push(line(a1, start, a1, end));
  if (g0 - a0 > 0.05) walls.push(line(a0, end, g0, end));
  if (a1 - g1 > 0.05) walls.push(line(g1, end, a1, end));
  const rect: Rect = vertical ? { x: a0, y: lo, w: a1 - a0, d: depth } : { x: lo, y: a0, w: depth, d: a1 - a0 };
  return { rect, walls, door: line(g0, end, g1, end) };
}

/**
 * The zones a viewer may see. Farmer-facing views (book / view) never show
 * the machinery bay — the supplementary directive keeps the refrigeration
 * plant room, CA/CS gas room, electrical room, office and laboratory out of
 * farmer 2D/3D; the owner's own view keeps the plant bay they sized.
 */
export function zonesForViewer(zones: SceneZone[], mode: 'book' | 'owner' | 'view'): SceneZone[] {
  return mode === 'owner' ? zones : zones.filter((z) => z.key !== 'machinery');
}

/**
 * The store in words, for people who cannot see the 3D view: "The main door
 * is in the front wall. Chamber 1 stands on the left of the passage, the 1st
 * from the main door. …".
 */
export function sceneText(scene: StoreScene): string {
  const out: string[] = [];
  if (scene.mainDoor) out.push(`The main door is in the ${scene.mainDoor.wall} wall; a passage runs straight in from it.`);
  const seen: Record<WallSide, number> = { left: 0, right: 0, back: 0, front: 0 };
  for (const c of scene.chambers) {
    const floors = c.floors.length > 1 ? ` It has ${c.floors.length} floors.` : '';
    if (c.side) {
      const n = ++seen[c.side];
      const where = c.side === 'back' ? 'along the far wall' : c.side === 'front' ? 'along the entrance wall' : `on the ${c.side} of the passage`;
      out.push(`${c.name} stands ${where}, the ${ORD[n - 1] ?? `${n}th`} banked there, its door facing the hall.${floors}`);
    } else if (c.beside) out.push(`${c.name} is drawn beside the building.`);
    else if (scene.building) out.push(`${c.name} stands where the owner said.${floors}`);
    else out.push(`${c.name} is number ${c.index + 1} along the corridor.${floors}`);
  }
  return out.join(' ');
}

/** Which chamber (index) a point stands in, or -1. */
export function chamberAt(scene: StoreScene, p: Vec, margin = 0): number {
  for (const c of scene.chambers) {
    const r = c.rect;
    if (p.x >= r.x - margin && p.x <= r.x + r.w + margin && p.y >= r.y - margin && p.y <= r.y + r.d + margin) return c.index;
  }
  return -1;
}

/** Where a visitor starts: just outside the main door, facing in (else at the front of the corridor). */
export function startPoint(scene: StoreScene): { at: Vec; facing: Vec } {
  if (scene.mainDoor) {
    const { mid, inward } = scene.mainDoor;
    return { at: { x: mid.x - inward.x * 3, y: mid.y - inward.y * 3 }, facing: inward };
  }
  return { at: { x: scene.hall.x + scene.hall.w / 2, y: scene.hall.y - 2 }, facing: { x: 0, y: 1 } };
}

/** A point just inside a chamber's door (clear floor: stacks start further in). */
export function insideDoor(c: SceneChamber, depth = 0.8): Vec {
  const m = c.door ? midOf(c.door) : { x: c.rect.x + c.rect.w / 2, y: c.rect.y };
  return { x: m.x + c.inward.x * depth, y: m.y + c.inward.y * depth };
}

/** A row's number plate: on a slim post at the end of the row that opens onto the aisle. */
export interface RowPlate {
  chamber: number;
  /** The floor's index in its chamber, and the row number shown. */
  floor: number;
  row: number;
  /** Where the post stands, how high the plate's middle is above the ground, and which way the plate faces. */
  at: Vec;
  z: number;
  facing: Vec;
}

/** Plates stand this far from the end of a row, and this high above their floor (lower under a low floor above). */
export const PLATE_GAP = 0.12;
export const PLATE_HEIGHT = 1.7;

const inRect = (p: Vec, r: Rect, margin = 0) => p.x > r.x + margin && p.x < r.x + r.w - margin && p.y > r.y + margin && p.y < r.y + r.d - margin;

/**
 * One number plate for every row on every floor of every chamber drawn to
 * scale, as stores hang them: beside the row where people walk past — at
 * the edge of the walkway in from the door (which may cut through the rows),
 * else nearest the door — facing that way, inside the chamber and clear of
 * every stack.
 */
export function rowPlates(scene: StoreScene): RowPlate[] {
  const out: RowPlate[] = [];
  for (const c of scene.chambers) {
    if (!c.toScale) continue;
    const left = { x: -c.inward.y, y: c.inward.x };
    c.floors.forEach((f, fi) => {
      const byRow = new Map<number, ScenePlace[]>();
      for (const p of f.places) byRow.set(p.row, [...(byRow.get(p.row) ?? []), p]);
      for (const [row, places] of byRow) {
        const sorted = [...places].sort((a, b) => a.col - b.col);
        const centre = (p: ScenePlace) => ({ x: p.rect.x + p.rect.w / 2, y: p.rect.y + p.rect.d / 2 });
        // Along the row (a row of one: across the chamber, side to side).
        const a = centre(sorted[0]);
        const z = centre(sorted[sorted.length - 1]);
        const len = Math.hypot(z.x - a.x, z.y - a.y);
        const along = len > 1e-6 ? { x: (z.x - a.x) / len, y: (z.y - a.y) / len } : left;
        // Where people walk: the walkway in from the door (it may cut through the rows), else the door itself.
        const door = c.door ? midOf(c.door) : { x: c.rect.x + c.rect.w / 2, y: c.rect.y };
        const reach = (v: Vec) => {
          const w = f.walkway;
          if (!w) return Math.hypot(v.x - door.x, v.y - door.y);
          return Math.hypot(Math.max(w.x - v.x, 0, v.x - w.x - w.w), Math.max(w.y - v.y, 0, v.y - w.y - w.d));
        };
        // Beside either side of any stack of the row, in the open: the spot nearest where people walk.
        const spots = sorted
          .flatMap((p) =>
            [1, -1].map((sg) => {
              const dir = { x: along.x * sg, y: along.y * sg };
              const half = Math.abs(dir.x) * (p.rect.w / 2) + Math.abs(dir.y) * (p.rect.d / 2);
              const v = centre(p);
              return { dir, at: { x: v.x + dir.x * (half + PLATE_GAP), y: v.y + dir.y * (half + PLATE_GAP) } };
            }),
          )
          .filter(({ at }) => inRect(at, c.rect, 0.05) && !f.places.some((q) => inRect(at, q.rect)))
          .sort((x, y) => reach(x.at) - reach(y.at));
        if (spots.length) out.push({ chamber: c.index, floor: fi, row, at: spots[0].at, z: f.z0 + Math.min(PLATE_HEIGHT, Math.max(0.6, f.h - 0.35)), facing: spots[0].dir });
      }
    });
  }
  return out;
}
