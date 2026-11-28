/**
 * The L-bank cold store of the architectural diagram, from the owner's numbers
 * (lib/coldStore storeModel â†’ previewChambers â†’ three/storeScene buildScene â€”
 * the path the Drawing, the 3D view and the walk all use): Chambers 1..4 down
 * the left wall front to rear, 5..N along the back wall left to right, the
 * airlock vestibule inside the main door, and the work hall's zones.
 * Pure: no browser. Run: npx playwright test tests/coldstore-lbank.spec.ts
 */
import { expect, test } from '@playwright/test';

import { buildScene, vestibuleOf, zonesForViewer, type StoreScene } from '@/components/rental/three/storeScene';
import { blankChamber, blankStore, previewChambers, storeModel, type StoreDraft } from '@/lib/coldStore';

function lbankStore(count: number, sides: 'lbank' | 'both' = 'lbank'): StoreDraft {
  const d = blankStore(null);
  d.title = 'L-bank test store';
  d.ownerName = 'Owner';
  d.ownerPhone = '9876543210';
  d.managerPhone = '9876543210';
  d.district = 'Shopian';
  d.area = 'Test';
  d.unit = 'm';
  Object.assign(d.building, { length: '70', width: '60', height: '12', door: { wall: 'front', from: '28', width: '4', height: '5' }, sides });
  d.chambers = Array.from({ length: count }, (_, i) => {
    const c = blankChamber(i + 1, 'bins');
    Object.assign(c, { count: '100', kg: '250', floors: '1', length: '10', width: '9', height: '8', rate: '45', unitL: '1.2', unitW: '1', unitH: '0.76', floorHeights: '8', aisle: '2.5', stackGap: '0.1', wallGap: '0.3', stackHigh: '4', door: { wall: 'front', from: '3', width: '3', height: '4' } });
    return c;
  });
  return d;
}

function built(d: StoreDraft): StoreScene {
  const model = storeModel(d);
  return buildScene(previewChambers(model, 'test'), model.building);
}

const byNo = (scene: StoreScene, n: number) => scene.chambers.find((c) => c.name === `Chamber ${n}`)!;

test('Chambers 1..4 stand down the left wall, front to rear, doors opening into the passage', () => {
  const scene = built(lbankStore(7));
  const left = [1, 2, 3, 4].map((n) => byNo(scene, n));
  for (const c of left) {
    expect(c, 'chamber exists').toBeTruthy();
    expect(c.rect.x, `${c.name} against the left wall`).toBeLessThan(scene.passage!.x + 0.01);
    expect(c.rect.x + c.rect.w, `${c.name} stops at the passage`).toBeLessThanOrEqual(scene.passage!.x + 0.05);
  }
  // Front (y = 0) towards the rear: each one starts where the one before ends.
  for (let i = 1; i < left.length; i++) expect(left[i].rect.y, `Chamber ${i + 1} behind Chamber ${i}`).toBeGreaterThanOrEqual(left[i - 1].rect.y + left[i - 1].rect.d - 0.05);
  expect(left[0].rect.y, 'Chamber 1 is the nearest the main door').toBeLessThan(1);
});

test('Chambers 5..N line the back wall from left to right, doors opening into the hall', () => {
  const scene = built(lbankStore(7));
  const back = [5, 6, 7].map((n) => byNo(scene, n));
  const rear = scene.hall.y + scene.hall.d;
  for (const c of back) {
    expect(c, 'chamber exists').toBeTruthy();
    expect(c.rect.y + c.rect.d, `${c.name} against the back wall`).toBeGreaterThan(rear - 1.5);
    expect(c.doorWall, `${c.name}'s door opens towards the front (into the hall)`).toBe('front');
  }
  for (let i = 1; i < back.length; i++) expect(back[i].rect.x, `Chamber ${i + 5} to the right of Chamber ${i + 4}`).toBeGreaterThanOrEqual(back[i - 1].rect.x + back[i - 1].rect.w - 0.05);
});

test('no two chambers overlap in the L-bank', () => {
  const scene = built(lbankStore(8));
  const cs = scene.chambers;
  for (let i = 0; i < cs.length; i++) {
    for (let j = i + 1; j < cs.length; j++) {
      const a = cs[i].rect;
      const b = cs[j].rect;
      const overlap = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 0.05 && Math.min(a.y + a.d, b.y + b.d) - Math.max(a.y, b.y) > 0.05;
      expect(overlap, `${cs[i].name} overlaps ${cs[j].name}`).toBe(false);
    }
  }
});

test('the default "both sides" store still alternates, so nothing existing moves', () => {
  const scene = built(lbankStore(4, 'both'));
  const c1 = byNo(scene, 1);
  const c2 = byNo(scene, 2);
  expect(c1.rect.x).toBeLessThan(scene.passage!.x);
  expect(c2.rect.x).toBeGreaterThan(scene.passage!.x);
});

test('work areas are only what the owner entered, and where the owner said: nothing is made up', () => {
  // Nothing entered: no area is drawn — no lanes, no sorting area, no dock.
  expect(built(lbankStore(7)).zones, 'no area the owner did not enter').toEqual([]);

  // Sized AND placed: exactly there (metres from the left wall and the front wall), exactly that size.
  const d = lbankStore(7);
  Object.assign(d.building, { spPackingL: '12', spPackingW: '8', spPackingX: '40', spPackingY: '45', spCleaningL: '10', spCleaningW: '6', spCleaningX: '52', spCleaningY: '45' });
  const scene = built(d);
  expect(scene.zones.map((z) => z.key).sort()).toEqual(['cleaning', 'packing']);
  const packing = scene.zones.find((z) => z.key === 'packing')!;
  expect(packing.rect.x).toBeCloseTo(40, 1);
  expect(packing.rect.y).toBeCloseTo(45, 1);
  expect(packing.rect.w).toBeCloseTo(12, 1);
  expect(packing.rect.d).toBeCloseTo(8, 1);
  expect(packing.placed).toBe(true);
  expect(scene.notes.join(' '), 'placed by the owner: nothing to tell').not.toContain('no position');

  // Sized but not placed: drawn on free floor with its own size, and the owner is told to say where it stands.
  const e = lbankStore(3);
  Object.assign(e.building, { spGradingL: '10', spGradingW: '6' });
  const loose = built(e);
  expect(loose.zones.map((z) => z.key)).toEqual(['grading']);
  expect(loose.zones[0].placed).toBe(false);
  expect(loose.notes.join(' ')).toContain('Grading & Sorting Machinery has a size but no position');

  // The dock only when the owner sized it; farmers never see the machinery room.
  const f = lbankStore(3);
  Object.assign(f.building, { spDockL: '5', spDockW: '4', spMachineryL: '6', spMachineryW: '5', spMachineryX: '2', spMachineryY: '50' });
  const withDock = built(f);
  expect(withDock.zones.map((z) => z.key).sort()).toEqual(['dock', 'machinery']);
  for (const mode of ['book', 'view'] as const) expect(zonesForViewer(withDock.zones, mode).map((z) => z.key)).not.toContain('machinery');
  expect(zonesForViewer(withDock.zones, 'owner').map((z) => z.key)).toContain('machinery');
});

test('a position outside the building, or only one distance, is flagged and never used', () => {
  const d = lbankStore(3);
  Object.assign(d.building, { spPackingL: '12', spPackingW: '8', spPackingX: '65', spPackingY: '5' });
  const model = storeModel(d);
  expect(model.issues.map((i) => i.message).join(' ')).toContain('would go outside the building');
  const half = lbankStore(3);
  Object.assign(half.building, { spPackingL: '12', spPackingW: '8', spPackingX: '10' });
  expect(storeModel(half).issues.map((i) => i.message).join(' ')).toContain('write both distances');
});

test('the airlock vestibule sits just inside the main door with an inner door across the passage', () => {
  const scene = built(lbankStore(7));
  const v = scene.vestibule;
  expect(v, 'vestibule').toBeTruthy();
  expect(v!.rect.y, 'starts at the main door wall').toBeLessThan(0.05);
  expect(v!.rect.d, 'a real airlock depth').toBeGreaterThan(1.5);
  const innerDoorY = v!.door.y1;
  expect(innerDoorY, 'inner door deeper than the main door').toBeGreaterThan(scene.mainDoor!.mid.y + 1.5);
  expect(Math.abs(v!.door.x2 - v!.door.x1), 'inner door as wide as the main door').toBeGreaterThanOrEqual(Math.min(scene.mainDoor!.width, scene.passage!.w) - 0.05);
  // No wall of it may seal a chamber door.
  for (const c of scene.chambers) {
    if (!c.door) continue;
    for (const w of v!.walls) {
      const crosses = Math.max(Math.min(w.x1, w.x2), Math.min(c.door.x1, c.door.x2)) <= Math.min(Math.max(w.x1, w.x2), Math.max(c.door.x1, c.door.x2)) + 0.01 && Math.max(Math.min(w.y1, w.y2), Math.min(c.door.y1, c.door.y2)) <= Math.min(Math.max(w.y1, w.y2), Math.max(c.door.y1, c.door.y2)) + 0.01;
      expect(crosses, `${c.name}'s door is sealed by the vestibule`).toBe(false);
    }
  }
});

test('no vestibule where the passage is too short for one', () => {
  expect(vestibuleOf(null, null, [], { x: 0, y: 0, w: 10, d: 10 })).toBeNull();
});

/** The same rectangle test the structure uses, so the specs cannot drift from it. */
const hits = (a: { x: number; y: number; w: number; d: number }, b: { x: number; y: number; w: number; d: number }) => a.x < b.x + b.w - 1e-6 && a.x + a.w > b.x + 1e-6 && a.y < b.y + b.d - 1e-6 && a.y + a.d > b.y + 1e-6;
const grow = (r: { x: number; y: number; w: number; d: number }, g: number) => ({ x: r.x - g, y: r.y - g, w: r.w + 2 * g, d: r.d + 2 * g });
/** A door opening as a thin rectangle on its wall. */
const gap = (s: { x1: number; y1: number; x2: number; y2: number }) => ({ x: Math.min(s.x1, s.x2), y: Math.min(s.y1, s.y2), w: Math.abs(s.x2 - s.x1), d: Math.abs(s.y2 - s.y1) });
const FT_2_5 = 0.762;

for (const count of [3, 8]) {
  test(`an owner with ${count} chambers gets exactly ${count}, and columns never block a door, the passage or a chamber`, () => {
    const scene = built(lbankStore(count));
    expect(scene.chambers, `${count} configured chambers`).toHaveLength(count);
    const { pillars } = scene.structure;
    expect(pillars.length, 'a building this size has columns').toBeGreaterThan(6);
    const hall = scene.hall;
    for (const p of pillars) {
      expect(p.x, 'inside the building').toBeGreaterThanOrEqual(hall.x);
      expect(p.y).toBeGreaterThanOrEqual(hall.y);
      expect(p.x + p.w).toBeLessThanOrEqual(hall.x + hall.w);
      expect(p.y + p.d).toBeLessThanOrEqual(hall.y + hall.d);
      for (const c of scene.chambers) {
        expect(hits(p, c.rect), `column at ${p.x},${p.y} stands in ${c.name}`).toBe(false);
        if (c.door) expect(hits(p, grow(gap(c.door), FT_2_5)), `column at ${p.x},${p.y} within 2.5 ft of ${c.name}'s door`).toBe(false);
      }
      expect(hits(p, grow(gap(scene.mainDoor!.seg), FT_2_5)), 'within 2.5 ft of the main door').toBe(false);
      expect(hits(p, scene.passage!), `column at ${p.x},${p.y} stands in the passage`).toBe(false);
      expect(hits(p, scene.vestibule!.rect), 'column in the airlock').toBe(false);
    }
    // No two columns closer than a column's own width apart.
    for (let i = 0; i < pillars.length; i++) for (let j = i + 1; j < pillars.length; j++) expect(hits(pillars[i], pillars[j]), 'columns overlap').toBe(false);
  });
}

test('columns are on the 25 ft grid along the outer walls and ceiling beams land on them', () => {
  const scene = built(lbankStore(7));
  const { pillars, beams } = scene.structure;
  const hall = scene.hall;
  // Along the front wall (the main door is clear of every column): no gap between neighbours wider than 25 ft plus one slide of 12.5 ft.
  const front = pillars.filter((p) => p.y < hall.y + 1).map((p) => p.x + p.w / 2).sort((a, b) => a - b);
  for (let i = 1; i < front.length; i++) expect(front[i] - front[i - 1], 'column spacing on the front wall').toBeLessThanOrEqual(7.62 * 2 + 0.01);
  expect(beams.length, 'ceiling beams').toBeGreaterThan(0);
  for (const b of beams) {
    expect(b.x1, 'beam inside').toBeGreaterThanOrEqual(hall.x);
    expect(b.x2).toBeLessThanOrEqual(hall.x + hall.w);
    // A beam runs the short way across (the building is 70 × 60 here: along the front-to-back).
    const alongY = Math.abs(b.x1 - b.x2) < 1e-6;
    const line = alongY ? b.x1 : b.y1;
    const aligned = pillars.some((p) => Math.abs((alongY ? p.x + p.w / 2 : p.y + p.d / 2) - line) < 0.01);
    expect(aligned, `beam at ${line.toFixed(2)} sits on a column line`).toBe(true);
  }
});

test('columns are solid for the walker: you cannot stand in one, but doors and the passage stay walkable', async () => {
  const { walkWorld, canStand } = await import('@/components/rental/walk/walker');
  const scene = built(lbankStore(7));
  const world = walkWorld(scene, () => false);
  for (const p of scene.structure.pillars) expect(canStand(world, { x: p.x + p.w / 2, y: p.y + p.d / 2 }, 1, -1), `standing in the column at ${p.x},${p.y}`).toBe(false);
  // The way in from the main door, straight up the passage, is open.
  const md = scene.mainDoor!;
  for (let k = 1; k <= 8; k++) expect(canStand(world, { x: md.mid.x - md.inward.x * 0, y: md.mid.y + k * 1.5 }, 1, -1), `passage ${k * 1.5} m in`).toBe(true);
  // In front of each chamber door, just outside it, is open too.
  for (const c of scene.chambers) {
    if (!c.door) continue;
    const m = { x: (c.door.x1 + c.door.x2) / 2, y: (c.door.y1 + c.door.y2) / 2 };
    expect(canStand(world, { x: m.x - c.inward.x * 1.2, y: m.y - c.inward.y * 1.2 }, 1, -1), `outside ${c.name}'s door`).toBe(true);
  }
});
