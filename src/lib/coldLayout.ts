/**
 * A cold store chamber worked out from its real size.
 *
 * The owner measures the chamber — length (from the door to the back wall),
 * breadth (wall to wall) and height (floor to ceiling) — and KashRoot lays it
 * out the way stores are stacked: stacks of apple boxes on a base (pallet),
 * with air gaps along the walls and under the ceiling, a little space between
 * stacks, clear floor inside the door, and a walkway from the door to the back
 * wall. From that come the rows, the stacks in each row, how many boxes go on
 * one place (boxes per layer × layers) and where each place is, in metres —
 * for the to-scale diagram, the 3D view and directions for farmers.
 *
 * The store's standards (box size, base, walkway, gaps) start from common
 * values and the owner can change every one of them — and the owner can give
 * their own count of boxes on each place, which then counts instead of the
 * worked-out one (never more than fit). Everything is in metres;
 * `unit` only remembers how the owner likes to see it. Shared by browser and
 * server, no side effects.
 */

export type SizeUnit = 'ft' | 'm';

export interface ChamberSize {
  /** How the owner typed the sizes (stored values are always metres). */
  unit: SizeUnit;
  /** From the door to the back wall. */
  length: number;
  /** Wall to wall. */
  width: number;
  /** Floor to ceiling. */
  height: number;
  /** One apple box: length × width × height. */
  box: { l: number; w: number; h: number };
  /** The base a stack stands on (pallet): length × width. */
  place: { l: number; w: number };
  /** Height of that base. */
  base: number;
  /** Walkway from the door to the back wall (0 = none). */
  aisle: number;
  /** Air gap between stacks and the side and back walls. */
  wallGap: number;
  /** Gap between two stacks. */
  stackGap: number;
  /** Air gap between the top of a stack and the ceiling. */
  topGap: number;
  /** Clear floor just inside the door. */
  doorGap: number;
  /** The owner's own count of boxes on each place; unset = as many as fit. */
  boxes?: number;
}

/** Common values; the owner changes them to match their store. */
export const STANDARDS: Omit<ChamberSize, 'unit' | 'length' | 'width' | 'height'> = {
  box: { l: 0.5, w: 0.3, h: 0.3 },
  place: { l: 1.2, w: 1.0 },
  base: 0.15,
  aisle: 1.5,
  wallGap: 0.3,
  stackGap: 0.1,
  topGap: 0.5,
  doorGap: 1.5,
};

export const FOOT = 0.3048;
export const INCH = 0.0254;

/** The grid the booking map uses: at most 60 rows and 26 stacks across. */
export const MAX_ROWS = 60;
export const MAX_COLS = 26;

export interface ChamberPlan {
  rows: number;
  cols: number;
  /** Stacks left of the walkway (the walkway runs between stack `aisleAfter` and the next); null = no walkway. */
  aisleAfter: number | null;
  /** The walkway, from x0 to x1 metres from the left wall. */
  aisleX: [number, number] | null;
  /** Where the door is in the front wall: from x0 to x1. */
  doorX: [number, number];
  /** One place as laid in the room: across the breadth (w) and along the length (d). */
  placeW: number;
  placeD: number;
  /** Left edge of each stack, metres from the left wall (index 0 = stack 1). */
  colX: number[];
  /** Near edge of each row, metres in from the door wall (index 0 = row 1). */
  rowZ: number[];
  perLayer: number;
  /** Layers on a place (the top one may be part-full when the owner gives a smaller count). */
  layers: number;
  boxesPerPlace: number;
  /** The most boxes that fit on one place by the sizes. */
  fits: number;
  /** Height of a full stack, base included. */
  stackHeight: number;
  /** Why it cannot be laid out (empty when it can). */
  problems: string[];
  /** Things the owner should know (e.g. space left over). */
  notes: string[];
}

/**
 * Sizes are typed rounded (3.28 ft for 1 m), so a count that misses by a hair
 * still counts: up to 2% for boxes on a base and layers under a ceiling, half
 * a percent for stacks in a room.
 */
const BOX_SLACK = 0.02;
const ROOM_SLACK = 0.005;
const fit = (space: number, size: number, gap: number) => (space >= size * (1 - ROOM_SLACK) ? Math.floor((space + gap) / (size + gap) + ROOM_SLACK) : 0);
const round = (n: number) => Math.round(n * 1000) / 1000;

/** Boxes on one layer of a base, turning the boxes whichever way fits more. */
function boxesPerLayer(place: { l: number; w: number }, box: { l: number; w: number }): number {
  const n = (space: number, size: number) => Math.floor(space / size + BOX_SLACK);
  const a = n(place.l, box.l) * n(place.w, box.w);
  const b = n(place.l, box.w) * n(place.w, box.l);
  return Math.max(a, b);
}

/** Stacks across the breadth, with the walkway in the middle when there is room for stacks on both sides. */
function across(width: number, pw: number, s: ChamberSize) {
  const g = s.stackGap;
  const usable = width - 2 * s.wallGap;
  const centre = (n: number, from: number, room: number) => {
    const block = n * (pw + g) - g;
    const x0 = from + (room - block) / 2;
    return Array.from({ length: n }, (_, i) => x0 + i * (pw + g));
  };
  if (s.aisle > 0) {
    const side = fit((usable - s.aisle) / 2, pw, g);
    if (side >= 1) {
      const block = side * (pw + g) - g;
      const spare = usable - (2 * block + s.aisle);
      const x0 = s.wallGap + spare / 2;
      const left = Array.from({ length: side }, (_, i) => x0 + i * (pw + g));
      const aisle: [number, number] = [x0 + block, x0 + block + s.aisle];
      const right = Array.from({ length: side }, (_, i) => aisle[1] + i * (pw + g));
      return { colX: [...left, ...right], aisleAfter: side, aisleX: aisle };
    }
    // Room for stacks on one side only: the walkway runs along the right wall.
    const one = fit(usable - s.aisle, pw, g);
    if (one >= 1) {
      const aisle: [number, number] = [width - s.wallGap - s.aisle, width - s.wallGap];
      return { colX: centre(one, s.wallGap, usable - s.aisle), aisleAfter: one, aisleX: aisle };
    }
  }
  const n = fit(usable, pw, g);
  return { colX: centre(n, s.wallGap, usable), aisleAfter: null, aisleX: null };
}

function layout(s: ChamberSize, pw: number, pd: number) {
  const a = across(s.width, pw, s);
  const rows = fit(s.length - s.doorGap - s.wallGap, pd, s.stackGap);
  return { ...a, rows, cols: a.colX.length, pw, pd };
}

/** Is a number a usable size in metres between lo and hi? */
const ok = (n: number, lo: number, hi: number) => Number.isFinite(n) && n >= lo && n <= hi;

/** The whole layout of a chamber from its size and the store's standards. */
export function planChamber(s: ChamberSize): ChamberPlan {
  const problems: string[] = [];
  const notes: string[] = [];
  if (!ok(s.length, 2, 200) || !ok(s.width, 2, 200)) problems.push('Enter the length and breadth of the chamber (at least 2 m / 7 ft each).');
  if (!ok(s.height, 0.01, 30)) problems.push('Enter the height of the chamber, floor to ceiling.');
  if (!ok(s.box.l, 0.1, 2) || !ok(s.box.w, 0.1, 2) || !ok(s.box.h, 0.05, 2)) problems.push('Check the box size.');
  if (!ok(s.place.l, 0.2, 5) || !ok(s.place.w, 0.2, 5)) problems.push('Check the size of a stack base (pallet).');
  if (![s.base, s.aisle, s.wallGap, s.stackGap, s.topGap, s.doorGap].every((n) => ok(n, 0, 10))) problems.push('Check the walkway and gap sizes.');

  const perLayer = problems.length ? 0 : boxesPerLayer(s.place, s.box);
  const layers = problems.length ? 0 : Math.max(0, Math.floor((s.height - s.topGap - s.base) / s.box.h + BOX_SLACK));
  if (!problems.length && perLayer < 1) problems.push('One box is bigger than a stack base — check the box and base sizes.');
  if (!problems.length && layers < 1) problems.push('The ceiling is too low for one layer of boxes with the air gap and the base.');

  // Turn the bases whichever way fits more places.
  let best = { colX: [] as number[], aisleAfter: null as number | null, aisleX: null as [number, number] | null, rows: 0, cols: 0, pw: s.place.w, pd: s.place.l };
  if (!problems.length) {
    const a = layout(s, s.place.w, s.place.l);
    const b = layout(s, s.place.l, s.place.w);
    best = b.rows * b.cols > a.rows * a.cols ? b : a;
    if (best.rows < 1 || best.cols < 1) problems.push('The chamber is too small for one stack with these gaps and walkway.');
  }

  const { aisleX } = best;
  let { rows, colX, aisleAfter } = best;
  if (rows > MAX_ROWS) {
    notes.push(`The chamber fits ${rows} rows; the map shows the first ${MAX_ROWS} from the door.`);
    rows = MAX_ROWS;
  }
  if (colX.length > MAX_COLS) {
    notes.push(`The chamber fits ${colX.length} stacks across; the map shows ${MAX_COLS}.`);
    if (aisleAfter !== null && aisleAfter * 2 === colX.length) {
      const side = MAX_COLS / 2;
      colX = [...colX.slice(aisleAfter - side, aisleAfter), ...colX.slice(aisleAfter, aisleAfter + side)];
      aisleAfter = side;
    } else {
      colX = colX.slice(0, MAX_COLS);
      if (aisleAfter !== null) aisleAfter = Math.min(aisleAfter, MAX_COLS);
    }
  }
  const cols = colX.length;
  const rowZ = Array.from({ length: rows }, (_, i) => s.doorGap + i * (best.pd + s.stackGap));
  const fits = perLayer * layers;
  // The owner's own count, when given, as long as it fits.
  const own = s.boxes !== undefined && !problems.length ? s.boxes : null;
  if (own !== null && !(Number.isInteger(own) && own >= 1)) problems.push('Boxes on each place must be a whole number, at least 1.');
  else if (own !== null && own > fits) problems.push(`Only ${fits.toLocaleString('en-IN')} boxes fit on one place by these sizes (${perLayer} a layer × ${layers} layers). Write a smaller number, or check the box size and the ceiling height.`);
  const boxesPerPlace = own !== null && own >= 1 && own <= fits ? own : fits;
  const used = perLayer ? Math.ceil(boxesPerPlace / perLayer) : 0;
  if (boxesPerPlace > 5000) problems.push('More than 5,000 boxes on one place — check the sizes.');

  // The door: in front of the walkway, or in the middle.
  const doorW = Math.min(s.width * 0.4, Math.max(1.2, aisleX ? aisleX[1] - aisleX[0] : 1.8));
  const doorMid = aisleX ? (aisleX[0] + aisleX[1]) / 2 : s.width / 2;
  const doorX: [number, number] = [Math.max(0, doorMid - doorW / 2), Math.min(s.width, doorMid + doorW / 2)];

  if (!problems.length) {
    const backSpare = s.length - s.wallGap - (rowZ.at(-1) ?? 0) - best.pd;
    if (backSpare > best.pd * 0.6) notes.push(`${round(backSpare)} m is left free at the back wall (less than one stack).`);
  }

  return {
    rows: problems.length ? 0 : rows,
    cols: problems.length ? 0 : cols,
    aisleAfter: problems.length ? null : aisleAfter,
    aisleX: problems.length ? null : aisleX,
    doorX,
    placeW: best.pw,
    placeD: best.pd,
    colX: problems.length ? [] : colX.map(round),
    rowZ: problems.length ? [] : rowZ.map(round),
    perLayer,
    layers: used,
    boxesPerPlace: problems.length ? 0 : boxesPerPlace,
    fits,
    stackHeight: round(s.base + Math.max(used, 0) * s.box.h),
    problems,
    notes,
  };
}

/** Plans are pure: remember the last few, so views redrawing often do not recompute. */
const memo = new Map<string, ChamberPlan>();
export function planOf(s: ChamberSize): ChamberPlan {
  const key = JSON.stringify(s);
  let p = memo.get(key);
  if (!p) {
    p = planChamber(s);
    if (memo.size > 50) memo.clear();
    memo.set(key, p);
  }
  return p;
}

/** How a place is stacked: "8 a layer × 16 layers", or "8 a layer, 13 layers (4 on top)". */
export function layersText(plan: Pick<ChamberPlan, 'perLayer' | 'layers' | 'boxesPerPlace'>): string {
  const top = plan.boxesPerPlace - (plan.layers - 1) * plan.perLayer;
  const many = `${plan.layers} layer${plan.layers === 1 ? '' : 's'}`;
  return top === plan.perLayer ? `${plan.perLayer} a layer × ${many}` : `${plan.perLayer} a layer, ${many} (${top} on top)`;
}

/** A length in the owner's unit: "12.2 m" or "40 ft". */
export function showLength(m: number, unit: SizeUnit): string {
  if (unit === 'ft') {
    const ft = m / FOOT;
    return `${ft >= 10 ? Math.round(ft) : Math.round(ft * 10) / 10} ft`;
  }
  return `${m >= 10 ? Math.round(m * 10) / 10 : Math.round(m * 100) / 100} m`;
}

/** A size as JSON from the database, checked (null when it is not a usable size). */
export function asChamberSize(v: unknown): ChamberSize | null {
  if (!v || typeof v !== 'object') return null;
  const s = v as Partial<ChamberSize>;
  const num = (n: unknown) => typeof n === 'number' && Number.isFinite(n);
  if (![s.length, s.width, s.height, s.base, s.aisle, s.wallGap, s.stackGap, s.topGap, s.doorGap].every(num)) return null;
  if (!s.box || !s.place || ![s.box.l, s.box.w, s.box.h, s.place.l, s.place.w].every(num)) return null;
  const { boxes, ...rest } = s as ChamberSize;
  return { ...rest, unit: s.unit === 'ft' ? 'ft' : 'm', ...(num(boxes) && boxes! >= 1 ? { boxes: Math.floor(boxes!) } : {}) };
}

/**
 * Where a place is, for a farmer walking in: "Row 3 — 4.6 m in from the door,
 * left of the walkway, 2nd stack from it".
 */
export function placeDirections(s: ChamberSize, plan: ChamberPlan, row: number, stack: number): string {
  const z = plan.rowZ[row - 1];
  if (z === undefined || stack < 1 || stack > plan.cols) return '';
  const inFromDoor = `${showLength(z, s.unit)} in from the door`;
  const ord = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`;
  if (plan.aisleAfter === null) return `${inFromDoor}, ${ord(stack)} stack from the left wall`;
  if (stack <= plan.aisleAfter) {
    const fromWalkway = plan.aisleAfter - stack + 1;
    return `${inFromDoor}, left of the walkway, ${fromWalkway === 1 ? 'next to the walkway' : `${ord(fromWalkway)} stack from it`}`;
  }
  const fromWalkway = stack - plan.aisleAfter;
  return `${inFromDoor}, right of the walkway, ${fromWalkway === 1 ? 'next to the walkway' : `${ord(fromWalkway)} stack from it`}`;
}
