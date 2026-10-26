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
import { planOf, type ChamberPlan, type Wall } from '@/lib/coldLayout';
import { arrangeStore, doorLine, fromDoor, groupChambers, outlineOf, placeRect, type Building, type ChamberGroup, type PreviewRows, type Side, type Storage } from '@/lib/coldStore';
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
  side: Side | null;
  doorWall: Wall;
  /** The door as a line on its wall, its height, and the way in (a unit vector into the chamber). */
  door: Seg | null;
  doorH: number;
  inward: Vec;
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
}

export interface StoreScene {
  /** The owner's building (null: not given). */
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
function wizardChamber(g: ChamberGroup, index: number, at: { x: number; y: number; w: number; d: number; fits: boolean; side?: Side }): SceneChamber {
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
    floors.push({
      row,
      floor: row.floor,
      z0: plan.floorZ ?? 0,
      h,
      k,
      layers: k,
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
    walls: wallsOf(rect, door, doorWall),
    windows: [],
    floors,
    beside: false,
  };
}

/** The footprint of an older chamber (its door in the front wall). */
function olderSize(g: ChamberGroup): { w: number; d: number } {
  const row = g.floors[0];
  if (row.size) return { w: row.size.width, d: row.size.length };
  return { w: row.cols * PITCH + 2 * PAD, d: row.rows * PITCH + 2 * PAD };
}

/** An older chamber (boxes): measured (door and windows as measured) or rows × stacks. */
function olderChamber(g: ChamberGroup, index: number, at: Vec, beside: boolean): SceneChamber {
  const row = g.floors[0];
  const s = row.size;
  const { w, d } = olderSize(g);
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
    floor = { row, floor: 1, z0: 0, h: s.height, k: row.boxes_per_slot, layers: Math.max(1, plan.layers), stackH: Math.max(0.2, plan.stackHeight), places, walkway, crowded: false, plan };
  } else {
    const f = PITCH * 0.82;
    for (let r = 1; r <= row.rows; r++) {
      for (let c = 0; c < row.cols; c++) {
        const slot = placeName(r, c);
        places.push({ row: r, col: c, slot, rect: { x: at.x + PAD + (c + 0.5) * PITCH - f / 2, y: at.y + PAD + (r - 0.5) * PITCH - f / 2, w: f, d: f }, blocked: row.blocked.includes(slot) });
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
    walls: wallsOf(rect, door, 'front'),
    windows,
    floors: [floor],
    beside,
  };
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
    hall = { x: 0, y: 0, w: b.length, d: b.width };
    const lay = arrangeStore(b, wizard.map((g) => ({ key: g.key, name: g.name, outline: outlineOf(g.size!), spot: g.size!.spot })));
    passage = lay.passage.rect;
    // The owner's live preview brings where its top view puts each chamber (lib/coldStore previewChambers): the very same places.
    const pre = rows as PreviewRows;
    for (const p of pre.spots ? (pre.problems ?? []) : lay.problems.map((x) => x.message)) if (!problems.includes(p)) problems.push(p);
    for (const g of wizard) chambers.push(wizardChamber(g, chambers.length, pre.spots?.[g.floors[0].id] ?? lay.spots[g.key]));
    // Older chambers: in a line beside the building, to its right.
    let x = b.length + 4;
    for (const g of older) {
      chambers.push(olderChamber(g, chambers.length, { x, y: 0 }, true));
      x += olderSize(g).w + GAP;
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

  let mainDoor: MainDoor | null = null;
  let walls: Seg[] = [];
  if (b) {
    const seg = doorLine(b.door, { length: b.length, width: b.width });
    mainDoor = { seg, wall: b.door.wall, from: b.door.from, width: b.door.width, height: b.door.height, mid: midOf(seg), inward: INWARD[b.door.wall] };
    walls = wallsOf(hall, seg, b.door.wall);
  }

  let x0 = hall.x;
  let y0 = hall.y;
  let x1 = hall.x + hall.w;
  let y1 = hall.y + hall.d;
  let height = b?.height ?? 0;
  let floors = 1;
  for (const c of chambers) {
    x0 = Math.min(x0, c.rect.x);
    y0 = Math.min(y0, c.rect.y);
    x1 = Math.max(x1, c.rect.x + c.rect.w);
    y1 = Math.max(y1, c.rect.y + c.rect.d);
    height = Math.max(height, c.h);
    floors = Math.max(floors, c.floors.length);
  }
  return { building: b, hall, bounds: { x: x0, y: y0, w: x1 - x0, d: y1 - y0 }, height: Math.max(height, 1), mainDoor, walls, passage, chambers, problems, beside: Boolean(b) && older.length > 0, floors, unit };
}

const ORD = ['1st', '2nd', '3rd'];
/**
 * The store in words, for people who cannot see the 3D view: "The main door
 * is in the front wall. Chamber 1 stands on the left of the passage, the 1st
 * from the main door. …".
 */
export function sceneText(scene: StoreScene): string {
  const out: string[] = [];
  if (scene.mainDoor) out.push(`The main door is in the ${scene.mainDoor.wall} wall; a passage runs straight in from it.`);
  const seen: Record<Side, number> = { left: 0, right: 0 };
  for (const c of scene.chambers) {
    const floors = c.floors.length > 1 ? ` It has ${c.floors.length} floors.` : '';
    if (c.side) {
      const n = ++seen[c.side];
      out.push(`${c.name} stands on the ${c.side} of the passage, the ${ORD[n - 1] ?? `${n}th`} from the main door, its door facing the passage.${floors}`);
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
