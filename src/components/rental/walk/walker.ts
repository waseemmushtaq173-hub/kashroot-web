/**
 * Walking inside the cold store (components/rental/three/storeScene): where a
 * visitor may stand. Walls stop you and door openings let you through; stacks
 * of bins or crates stop you, empty places do not. On an upper floor of a
 * chamber you stay on that floor until you go down again (its walls are
 * closed all round up there). Pure: no three.js, no React.
 */
import type { Rect, Seg, StoreScene, Vec } from '@/components/rental/three/storeScene';

/** How close to a wall or stack a visitor's body can come (metres). */
export const RADIUS = 0.28;
/** How far beyond the building a visitor may walk (the yard). */
const YARD = 8;

export interface WalkWorld {
  scene: StoreScene;
  /** On the ground: the building's walls and every chamber's walls, doors open. */
  walls: Seg[];
  /** Each chamber's four walls, closed (for its upper floors). */
  closed: Seg[][];
  /** Each chamber's floors (index 0 = floor 1): the footprints that stop you. */
  stacks: Rect[][][];
  area: Rect;
}

export interface Walker {
  x: number;
  y: number;
  /** 1 = the ground; above 1 only inside a chamber. */
  level: number;
  /** The chamber whose upper floor you are on (-1 on the ground). */
  inside: number;
}

/** The world to walk in; `stops(chamber, floorIndex, placeIndex)` says which places have a stack on them. */
export function walkWorld(scene: StoreScene, stops: (chamber: number, floor: number, place: number) => boolean): WalkWorld {
  const walls = [...scene.walls, ...scene.chambers.flatMap((c) => c.walls)];
  const closed = scene.chambers.map((c) => {
    const r = c.rect;
    return [
      { x1: r.x, y1: r.y, x2: r.x + r.w, y2: r.y },
      { x1: r.x, y1: r.y + r.d, x2: r.x + r.w, y2: r.y + r.d },
      { x1: r.x, y1: r.y, x2: r.x, y2: r.y + r.d },
      { x1: r.x + r.w, y1: r.y, x2: r.x + r.w, y2: r.y + r.d },
    ];
  });
  const stacks = scene.chambers.map((c, ci) => c.floors.map((f, fi) => f.places.filter((_, pi) => stops(ci, fi, pi)).map((p) => p.rect)));
  const b = scene.bounds;
  return { scene, walls, closed, stacks, area: { x: b.x - YARD, y: b.y - YARD, w: b.w + 2 * YARD, d: b.d + 2 * YARD } };
}

/** Distance from a point to a wall line. */
export function toSeg(p: Vec, s: Seg): number {
  const vx = s.x2 - s.x1;
  const vy = s.y2 - s.y1;
  const len2 = vx * vx + vy * vy;
  const t = len2 ? Math.max(0, Math.min(1, ((p.x - s.x1) * vx + (p.y - s.y1) * vy) / len2)) : 0;
  return Math.hypot(p.x - (s.x1 + t * vx), p.y - (s.y1 + t * vy));
}

const inRect = (p: Vec, r: Rect, grow: number) => p.x > r.x - grow && p.x < r.x + r.w + grow && p.y > r.y - grow && p.y < r.y + r.d + grow;

/** Can a visitor stand here? */
export function canStand(world: WalkWorld, p: Vec, level: number, inside: number): boolean {
  if (!inRect(p, world.area, 0)) return false;
  if (level > 1 && inside >= 0) {
    if (world.closed[inside].some((s) => toSeg(p, s) < RADIUS)) return false;
    if (!inRect(p, world.scene.chambers[inside].rect, 0)) return false;
    return !(world.stacks[inside][level - 1] ?? []).some((r) => inRect(p, r, RADIUS));
  }
  if (world.walls.some((s) => toSeg(p, s) < RADIUS)) return false;
  for (const c of world.scene.chambers) {
    if (!inRect(p, c.rect, RADIUS + 0.1)) continue;
    if ((world.stacks[c.index][0] ?? []).some((r) => inRect(p, r, RADIUS))) return false;
  }
  return true;
}

/**
 * Move by (dx, dy), sliding along a wall or stack when the way straight on
 * is shut. Returns whether the visitor moved. Steps should stay below
 * 2 × RADIUS so a thin wall is never stepped over.
 */
export function moveBy(world: WalkWorld, w: Walker, dx: number, dy: number): boolean {
  const here = { x: w.x, y: w.y };
  // Stuck (a stack appeared where you stand): any way out is allowed.
  const stuck = !canStand(world, here, w.level, w.inside);
  for (const [mx, my] of [[dx, dy], [dx, 0], [0, dy]] as const) {
    if (!mx && !my) continue;
    const p = { x: w.x + mx, y: w.y + my };
    if (stuck ? inRect(p, world.area, 0) : canStand(world, p, w.level, w.inside)) {
      w.x = p.x;
      w.y = p.y;
      return true;
    }
  }
  return false;
}

/** Walk a longer way in small steps (keyboard and buttons call this each frame). */
export function walk(world: WalkWorld, w: Walker, dx: number, dy: number): boolean {
  const n = Math.max(1, Math.ceil(Math.hypot(dx, dy) / (RADIUS * 0.8)));
  let moved = false;
  for (let i = 0; i < n; i++) moved = moveBy(world, w, dx / n, dy / n) || moved;
  return moved;
}
