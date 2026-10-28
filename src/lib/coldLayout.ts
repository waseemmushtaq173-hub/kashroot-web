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
 * The door is where the owner measured it in the front wall (else in the
 * middle), and the walkway runs straight in from it. Windows and vents are
 * placed on whichever wall the owner says, at the distance, size and height
 * above the floor they measured.
 *
 * The store's standards (box size, base, walkway, gaps) start from common
 * values and the owner can change every one of them — and the owner can give
 * their own count of boxes on each place, which then counts instead of the
 * worked-out one (never more than fit). Everything is in metres;
 * `unit` only remembers how the owner likes to see it. Shared by browser and
 * server, no side effects.
 *
 * Stores set up with the owner wizard (lib/coldStore) work the other way
 * round: the owner says how many bins or crates a chamber holds, and each
 * floor of it is one size with `places` (stacks) and `boxes` (bins or crates
 * in one stack). Then exactly that many places are laid out, standing against
 * the back wall with a walkway in from the door, and the grid cells left over
 * are `unused` — so the places always add up to the owner's count.
 */

export type SizeUnit = 'ft' | 'm';

/** The four walls. Front is the door wall; left and right as you stand in the door facing in. */
export type Wall = 'front' | 'back' | 'left' | 'right';
export const WALLS: Wall[] = ['front', 'back', 'left', 'right'];

/** A door in the front wall: `at` from the left wall to its left edge. */
export interface DoorSize {
  at: number;
  width: number;
  height: number;
}

/**
 * A window or vent. `at` is measured along its wall: on the front and back
 * walls from the left wall, on the left and right walls from the door wall,
 * to its nearest edge. `sill` is its height above the floor.
 */
export interface WindowSize {
  wall: Wall;
  at: number;
  width: number;
  height: number;
  sill: number;
}
export const MAX_WINDOWS = 12;

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
  /** Where the door is in the front wall; unset = in the middle. */
  door?: DoorSize;
  /** Windows and vents. */
  windows?: WindowSize[];
  /**
   * Owner wizard (lib/coldStore): which wall of the chamber the door is in,
   * with the building seen from its front ('front' when unset). `length`,
   * `width` and `door` are always measured from the door: length from the
   * door wall to the wall opposite, width along the door wall, `door.at`
   * from the left corner as you stand outside facing the door.
   */
  doorWall?: Wall;
  /** Owner wizard: the chamber has `floors` floors and this is floor `floor` (1 = lowest); `height` is the whole chamber's. */
  floors?: number;
  floor?: number;
  /** Owner wizard: exactly this many places (stacks) on this floor, each `boxes` bins or crates high. */
  places?: number;
  /** What one stack is made of, for words like "5 bins high". */
  stackOf?: 'bin' | 'crate';
  /** Owner wizard: how high the owner said they stack, when they said. */
  stackHigh?: number;
  /** Owner wizard: where the chamber stands, when the owner said — metres from the building's left wall and front wall to its front-left corner. */
  spot?: { x: number; y: number };
  /**
   * Owner wizard: each floor's clear height as the owner measured it — floor
   * (or grating) to the grating above, or to the ceiling — lowest first, in
   * metres. Unset: the chamber's height shared evenly between its floors.
   */
  floorHeights?: number[];
  /** Owner wizard, optional: the chamber's cooling as the owner described it (the 3D view puts the coolers on `wall`). */
  cooling?: CoolingInfo;
}

export interface CoolingInfo {
  /** The wall the cooling units hang on (from the door: front is the door wall). */
  wall?: Wall;
  kind?: 'ammonia' | 'freon';
  /** A controlled-atmosphere (CA) chamber. */
  ca?: boolean;
  /** As the owner writes it, e.g. "0 to 2 °C". */
  temperature?: string;
  /** Relative humidity, %. */
  humidity?: number;
}

/** A floor's clear height and how far above the ground it starts (metres), from the owner's heights or the height shared evenly. */
export function floorSpan(s: Pick<ChamberSize, 'height' | 'floors' | 'floor' | 'floorHeights'>): { h: number; z0: number } {
  const floors = s.floors ?? 1;
  const floor = s.floor ?? 1;
  const own = s.floorHeights;
  if (own && own.length === floors && own.every((h) => Number.isFinite(h) && h > 0)) {
    return { h: own[floor - 1], z0: own.slice(0, floor - 1).reduce((a, b) => a + b, 0) };
  }
  const h = s.height / floors;
  return { h, z0: (floor - 1) * h };
}

/** How long a wall is: front and back walls are the breadth, left and right the length. */
export const wallLength = (s: Pick<ChamberSize, 'length' | 'width'>, wall: Wall) => (wall === 'front' || wall === 'back' ? s.width : s.length);

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
/** Rows a floor with an exact count may use (cold_chambers.rows allows 99 since 20261025000000). */
export const GRID_ROWS = 99;

export interface ChamberPlan {
  rows: number;
  cols: number;
  /** Stacks left of the walkway (the walkway runs between stack `aisleAfter` and the next); null = no walkway. */
  aisleAfter: number | null;
  /** The walkway, from x0 to x1 metres from the left wall. */
  aisleX: [number, number] | null;
  /** Where the door is in the front wall: from x0 to x1. */
  doorX: [number, number];
  /** How high the door is. */
  doorH: number;
  /** The door is where the owner measured it (not just in the middle). */
  doorSet: boolean;
  /** Windows and vents that fit on their walls. */
  windows: WindowSize[];
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
  /** Exact-count floors: grid cells left empty so the places add up exactly (saved as blocked). */
  unused?: string[];
  /** Exact-count floors: the places do not all fit at their real size, so they are drawn closer together than they stand. */
  crowded?: boolean;
  /** Exact-count floors: the height of one floor, and how high this floor's base is above the ground. */
  floorH?: number;
  floorZ?: number;
  /** What one stack is made of ('bin' | 'crate'). */
  stackOf?: 'bin' | 'crate';
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

/**
 * Stacks across the breadth. The walkway runs in from the door: in the middle
 * when there is room for stacks on both sides, or (`door` given) straight in
 * from where the door is, with stacks packed against it on either side.
 */
function across(width: number, pw: number, s: ChamberSize, door: number | null) {
  const g = s.stackGap;
  const usable = width - 2 * s.wallGap;
  if (s.aisle > 0 && door !== null && usable >= s.aisle) {
    const a0 = Math.min(Math.max(door - s.aisle / 2, s.wallGap), width - s.wallGap - s.aisle);
    const a1 = a0 + s.aisle;
    const left = fit(a0 - s.wallGap, pw, g);
    const right = fit(width - s.wallGap - a1, pw, g);
    if (left + right >= 1) {
      const colX = [
        ...Array.from({ length: left }, (_, i) => a0 - (left - i) * (pw + g) + g),
        ...Array.from({ length: right }, (_, i) => a1 + i * (pw + g)),
      ];
      return { colX, aisleAfter: left, aisleX: [a0, a1] as [number, number] };
    }
  }
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

function layout(s: ChamberSize, pw: number, pd: number, door: number | null) {
  const a = across(s.width, pw, s, door);
  const rows = fit(s.length - s.doorGap - s.wallGap, pd, s.stackGap);
  return { ...a, rows, cols: a.colX.length, pw, pd };
}

/** Is a number a usable size in metres between lo and hi? */
const ok = (n: number, lo: number, hi: number) => Number.isFinite(n) && n >= lo && n <= hi;

/** The whole layout of a chamber from its size and the store's standards. */
export function planChamber(s: ChamberSize): ChamberPlan {
  if (s.places !== undefined) return planCounted(s);
  const problems: string[] = [];
  const notes: string[] = [];
  if (!ok(s.length, 2, 200) || !ok(s.width, 2, 200)) problems.push('Enter the length and breadth of the chamber (at least 2 m / 7 ft each).');
  if (!ok(s.height, 0.01, 30)) problems.push('Enter the height of the chamber, floor to ceiling.');
  if (!ok(s.box.l, 0.1, 2) || !ok(s.box.w, 0.1, 2) || !ok(s.box.h, 0.05, 2)) problems.push('Check the box size.');
  if (!ok(s.place.l, 0.2, 5) || !ok(s.place.w, 0.2, 5)) problems.push('Check the size of a stack base (pallet).');
  if (![s.base, s.aisle, s.wallGap, s.stackGap, s.topGap, s.doorGap].every((n) => ok(n, 0, 10))) problems.push('Check the walkway and gap sizes.');
  const door = s.door;
  if (door && !problems.length) {
    if (![door.at, door.width, door.height].every(Number.isFinite)) problems.push('Enter the door: how far it is from the left wall, its width and its height (or leave all three empty for a door in the middle).');
    else if (!ok(door.width, 0.5, s.width) || !ok(door.at, 0, s.width) || door.at + door.width > s.width * (1 + ROOM_SLACK)) problems.push('The door does not fit in the front wall — check how far it is from the left wall and how wide it is.');
    else if (!ok(door.height, 1, s.height * (1 + ROOM_SLACK))) problems.push('The door must be at least 1 m (3.3 ft) high and no higher than the ceiling.');
  }
  const windows: WindowSize[] = [];
  (s.windows ?? []).slice(0, MAX_WINDOWS).forEach((win, i) => {
    if (problems.length) return;
    const along = wallLength(s, win.wall);
    const name = `Window ${i + 1}`;
    if (!WALLS.includes(win.wall) || !ok(win.width, 0.05, along) || !ok(win.height, 0.05, s.height) || !ok(win.at, 0, along) || !ok(win.sill, 0, s.height)) problems.push(`${name}: enter how far along the wall it is, its width and height, and how high it is from the floor.`);
    else if (win.at + win.width > along * (1 + ROOM_SLACK)) problems.push(`${name} goes past the end of the ${win.wall} wall — check how far along it is and its width.`);
    else if (win.sill + win.height > s.height * (1 + ROOM_SLACK)) problems.push(`${name} goes above the ceiling — check its height and how high it is from the floor.`);
    else if (win.wall === 'front' && door && win.at < door.at + door.width && door.at < win.at + win.width && win.sill < door.height) problems.push(`${name} overlaps the door.`);
    else windows.push(win);
  });

  const perLayer = problems.length ? 0 : boxesPerLayer(s.place, s.box);
  const layers = problems.length ? 0 : Math.max(0, Math.floor((s.height - s.topGap - s.base) / s.box.h + BOX_SLACK));
  if (!problems.length && perLayer < 1) problems.push('One box is bigger than a stack base — check the box and base sizes.');
  if (!problems.length && layers < 1) problems.push('The ceiling is too low for one layer of boxes with the air gap and the base.');

  // Turn the bases whichever way fits more places.
  let best = { colX: [] as number[], aisleAfter: null as number | null, aisleX: null as [number, number] | null, rows: 0, cols: 0, pw: s.place.w, pd: s.place.l };
  if (!problems.length) {
    const centre = door ? door.at + door.width / 2 : null;
    const a = layout(s, s.place.w, s.place.l, centre);
    const b = layout(s, s.place.l, s.place.w, centre);
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

  // The door: where the owner measured it, else in front of the walkway (or in the middle).
  let doorX: [number, number];
  if (door && !problems.length) doorX = [door.at, Math.min(s.width, door.at + door.width)];
  else {
    const doorW = Math.min(s.width * 0.4, Math.max(1.2, aisleX ? aisleX[1] - aisleX[0] : 1.8));
    const doorMid = aisleX ? (aisleX[0] + aisleX[1]) / 2 : s.width / 2;
    doorX = [Math.max(0, doorMid - doorW / 2), Math.min(s.width, doorMid + doorW / 2)];
  }
  const doorH = door && !problems.length ? Math.min(door.height, s.height) : Math.min(3, Math.max(0, s.height) * 0.7);
  if (!problems.length && door && aisleX && (aisleX[1] < doorX[0] || aisleX[0] > doorX[1])) notes.push('The walkway cannot start right at the door (it is too close to a wall), so it runs as near to it as fits.');

  if (!problems.length) {
    const backSpare = s.length - s.wallGap - (rowZ.at(-1) ?? 0) - best.pd;
    if (backSpare > best.pd * 0.6) notes.push(`${round(backSpare)} m is left free at the back wall (less than one stack).`);
  }

  return {
    rows: problems.length ? 0 : rows,
    cols: problems.length ? 0 : cols,
    aisleAfter: problems.length ? null : aisleAfter,
    aisleX: problems.length ? null : aisleX,
    doorX: [round(doorX[0]), round(doorX[1])],
    doorH: round(doorH),
    doorSet: Boolean(door) && !problems.length,
    windows: problems.length ? [] : windows,
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

const slotName = (row: number, col: number) => `${row}${String.fromCharCode(65 + col)}`;
/** Room taken by n things in a line, with gaps between them. */
const span = (n: number, size: number, gap: number) => (n > 0 ? n * size + (n - 1) * gap : 0);

/** One way to stand the places: turned (pw across, pd deep), with or without the walkway. */
interface Way {
  pw: number;
  pd: number;
  walk: [number, number] | null;
  /** The most stacks left and right of the walkway (all in `maxL` without one), and rows. */
  maxL: number;
  maxR: number;
  maxRows: number;
}

/**
 * A floor with an exact number of places (owner wizard): `places` stacks of
 * `boxes` bins or crates. The rows × stacks are chosen to fit the floor and
 * follow its shape, the stacks stand against the back wall with a walkway
 * straight in from the door, and the few grid cells left over (fewer than
 * one row, in the row by the door, next to the walkway) are `unused`. When
 * the places cannot all stand on the floor at their real size they are drawn
 * closer together and the plan says `crowded`.
 */
function planCounted(s: ChamberSize): ChamberPlan {
  const problems: string[] = [];
  const notes: string[] = [];
  const floors = s.floors ?? 1;
  const floor = s.floor ?? 1;
  const p = s.places ?? 0;
  const k = s.boxes ?? 1;
  const { width: W, length: L } = s;
  if (!ok(L, 1, 300) || !ok(W, 1, 300)) problems.push('Enter the length and width of the chamber.');
  if (!ok(s.height, 0.5, 60)) problems.push('Enter the height of the chamber, floor to ceiling.');
  if (!Number.isInteger(floors) || floors < 1 || floors > 10 || !Number.isInteger(floor) || floor < 1 || floor > floors) problems.push('A chamber has 1 to 10 floors.');
  if (!Number.isInteger(p) || p < 1 || p > GRID_ROWS * MAX_COLS) problems.push(`A floor has 1 to ${(GRID_ROWS * MAX_COLS).toLocaleString('en-IN')} places.`);
  if (!Number.isInteger(k) || k < 1 || k > 5000) problems.push('A stack has 1 to 5,000 bins or crates.');
  if (!ok(s.place.l, 0.05, 5) || !ok(s.place.w, 0.05, 5) || !ok(s.box.h, 0.05, 5)) problems.push('Check the size of one bin or crate.');
  if (![s.aisle, s.wallGap, s.stackGap, s.doorGap].every((n) => ok(n, 0, 10))) problems.push('Check the walkway and gap sizes.');
  const door = s.door;
  if (door && !problems.length) {
    if (![door.at, door.width, door.height].every(Number.isFinite)) problems.push('Enter the door: how far it is from the left corner, its width and its height.');
    else if (!ok(door.width, 0.3, W * (1 + ROOM_SLACK)) || !ok(door.at, 0, W) || door.at + door.width > W * (1 + ROOM_SLACK)) problems.push('The door does not fit in its wall — check how far it is from the left corner and how wide it is.');
    else if (!ok(door.height, 0.5, s.height * (1 + ROOM_SLACK))) problems.push('The door must be lower than the chamber.');
  }
  const { h: floorH, z0: floorZ } = floorSpan(s);
  const empty: ChamberPlan = {
    rows: 0, cols: 0, aisleAfter: null, aisleX: null, doorX: [0, 0], doorH: 0, doorSet: false, windows: [], placeW: s.place.w, placeD: s.place.l,
    colX: [], rowZ: [], perLayer: 1, layers: 0, boxesPerPlace: 0, fits: 0, stackHeight: 0, problems, notes, unused: [], crowded: false, floorH: 0, floorZ: 0, stackOf: s.stackOf,
  };
  if (problems.length) return empty;

  const g = s.stackGap;
  const wg = s.wallGap;
  const doorMid = door ? door.at + door.width / 2 : W / 2;
  const turns: [number, number][] = s.place.l === s.place.w ? [[s.place.w, s.place.l]] : [[s.place.w, s.place.l], [s.place.l, s.place.w]];
  const ways: Way[] = [];
  for (const [pw, pd] of turns) {
    const maxRows = Math.min(GRID_ROWS, fit(L - s.doorGap - wg, pd, g));
    if (s.aisle > 0 && W - 2 * wg >= s.aisle) {
      const a0 = Math.min(Math.max(doorMid - s.aisle / 2, wg), W - wg - s.aisle);
      const a1 = a0 + s.aisle;
      const maxL = fit(a0 - wg, pw, g);
      const maxR = fit(W - wg - a1, pw, g);
      if (maxL + maxR >= 1) ways.push({ pw, pd, walk: [a0, a1], maxL, maxR, maxRows });
    }
    ways.push({ pw, pd, walk: null, maxL: fit(W - 2 * wg, pw, g), maxR: 0, maxRows });
  }

  // Rows × stacks for the places: the shape of the floor, few cells left over.
  type Grid = { way: Way; rows: number; cols: number; score: number };
  const grid = (way: Way, maxRows: number, maxCols: number): Grid | null => {
    const availW = Math.max(0.01, W - 2 * wg - (way.walk ? way.walk[1] - way.walk[0] : 0));
    const availD = Math.max(0.01, L - s.doorGap - wg);
    let out: Grid | null = null;
    for (let c = 1; c <= Math.min(maxCols, MAX_COLS); c++) {
      const r = Math.ceil(p / c);
      if (r > maxRows) continue;
      const score = Math.abs(Math.log(span(r, way.pd, g) / availD / (span(c, way.pw, g) / availW))) + (2 * (r * c - p)) / p;
      if (!out || score < out.score - 1e-9) out = { way, rows: r, cols: c, score };
    }
    return out;
  };
  const bestOf = (list: (Grid | null)[]) => list.reduce<Grid | null>((a, b) => (b && (!a || b.score < a.score - 1e-9) ? b : a), null);
  let chosen = bestOf(ways.filter((w) => w.walk).map((w) => grid(w, w.maxRows, w.maxL + w.maxR))) ?? bestOf(ways.filter((w) => !w.walk).map((w) => grid(w, w.maxRows, w.maxL)));
  const crowded = !chosen;
  // Too many to stand on the floor: lay them out anyway, drawn closer together.
  if (!chosen) chosen = bestOf(ways.filter((w) => !w.walk).map((w) => grid(w, GRID_ROWS, MAX_COLS)));
  if (!chosen) {
    problems.push('These places do not fit on the booking map.');
    return empty;
  }
  const { way, rows, cols } = chosen;
  let { pw, pd } = way;
  let gx = g;
  let gz = g;
  if (crowded) {
    const fx = Math.min(1, Math.max(0.01, W - 2 * wg) / span(cols, pw, g));
    const fz = Math.min(1, Math.max(0.01, L - 2 * wg) / span(rows, pd, g));
    pw *= fx;
    gx *= fx;
    pd *= fz;
    gz *= fz;
    notes.push(`${p.toLocaleString('en-IN')} places do not fit on this floor at their real size, so they are drawn closer together.`);
  }

  // Stacks left and right of the walkway, packed against it; else in the middle.
  let left = 0;
  let colX: number[];
  if (way.walk && !crowded) {
    left = Math.min(way.maxL, Math.round((cols * way.maxL) / (way.maxL + way.maxR)));
    if (cols - left > way.maxR) left = cols - way.maxR;
    const [a0, a1] = way.walk;
    colX = [...Array.from({ length: left }, (_, i) => a0 - (left - i) * (pw + gx) + gx), ...Array.from({ length: cols - left }, (_, i) => a1 + i * (pw + gx))];
  } else {
    const x0 = wg + (W - 2 * wg - span(cols, pw, gx)) / 2;
    colX = Array.from({ length: cols }, (_, i) => x0 + i * (pw + gx));
  }
  // Rows stand against the back wall; row 1 is the one nearest the door.
  const rowZ = Array.from({ length: rows }, (_, j) => L - wg - pd - (rows - 1 - j) * (pd + gz));

  // The cells left over: in row 1, next to the walkway first (room to turn by the door).
  const walk = way.walk && !crowded ? way.walk : null;
  const order: number[] = [];
  if (walk && left > 0 && left < cols) {
    for (let d = 0; order.length < cols; d++) {
      if (left - 1 - d >= 0) order.push(left - 1 - d);
      if (left + d < cols) order.push(left + d);
    }
  } else if (walk && left === 0) for (let i = 0; i < cols; i++) order.push(i);
  else for (let i = cols - 1; i >= 0; i--) order.push(i);
  const unused = order.slice(0, rows * cols - p).sort((a, b) => a - b).map((i) => slotName(1, i));

  const doorX: [number, number] = door ? [door.at, Math.min(W, door.at + door.width)] : [Math.max(0, W / 2 - Math.min(W * 0.4, 1.8) / 2), Math.min(W, W / 2 + Math.min(W * 0.4, 1.8) / 2)];
  const fits = Math.max(0, Math.floor(floorH / s.box.h + BOX_SLACK));
  if (k > fits) notes.push(`Stacks of ${k} are higher than one floor.`);
  return {
    rows,
    cols,
    aisleAfter: walk ? left : null,
    aisleX: walk ? [round(walk[0]), round(walk[1])] : null,
    doorX: [round(doorX[0]), round(doorX[1])],
    doorH: round(door ? Math.min(door.height, s.height) : Math.min(3, s.height * 0.7)),
    doorSet: Boolean(door),
    windows: [],
    placeW: round(pw),
    placeD: round(pd),
    colX: colX.map(round),
    rowZ: rowZ.map(round),
    perLayer: 1,
    layers: k,
    boxesPerPlace: k,
    fits,
    stackHeight: round(k * s.box.h),
    problems,
    notes,
    unused,
    crowded,
    floorH: round(floorH),
    floorZ: round(floorZ),
    stackOf: s.stackOf,
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

/** How a place is stacked: "8 a layer × 16 layers", or "8 a layer, 13 layers (4 on top)" — or "5 bins high". */
export function layersText(plan: Pick<ChamberPlan, 'perLayer' | 'layers' | 'boxesPerPlace' | 'stackOf'>): string {
  if (plan.stackOf && plan.perLayer === 1) return `${plan.layers} ${plan.stackOf}${plan.layers === 1 ? '' : 's'} high`;
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
  const { boxes, door, windows, doorWall, floors, floor, places, stackOf, stackHigh, spot, ...rest } = s as ChamberSize;
  const int = (n: unknown, lo: number, hi: number): n is number => typeof n === 'number' && Number.isInteger(n) && n >= lo && n <= hi;
  const d = door && typeof door === 'object' && [door.at, door.width, door.height].every(num) ? { at: door.at, width: door.width, height: door.height } : null;
  const ws = Array.isArray(windows)
    ? windows
        .filter((w) => w && typeof w === 'object' && WALLS.includes(w.wall) && [w.at, w.width, w.height, w.sill].every(num))
        .slice(0, MAX_WINDOWS)
        .map((w) => ({ wall: w.wall, at: w.at, width: w.width, height: w.height, sill: w.sill }))
    : [];
  return {
    ...rest,
    unit: s.unit === 'ft' ? 'ft' : 'm',
    ...(num(boxes) && boxes! >= 1 ? { boxes: Math.floor(boxes!) } : {}),
    ...(d ? { door: d } : {}),
    ...(ws.length ? { windows: ws } : {}),
    ...(doorWall && WALLS.includes(doorWall) ? { doorWall } : {}),
    ...(int(floors, 1, 10) && int(floor, 1, floors) ? { floors, floor } : {}),
    ...(int(places, 1, GRID_ROWS * MAX_COLS) ? { places } : {}),
    ...(stackOf === 'bin' || stackOf === 'crate' ? { stackOf } : {}),
    ...(int(stackHigh, 1, 5000) ? { stackHigh } : {}),
    ...(spot && typeof spot === 'object' && num(spot.x) && num(spot.y) ? { spot: { x: spot.x, y: spot.y } } : {}),
  };
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
