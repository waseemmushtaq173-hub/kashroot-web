/**
 * The L-bank cold store of the architectural diagram, from the owner's numbers
 * (lib/coldStore storeModel → previewChambers → three/storeScene buildScene —
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

test('the hall holds receiving, the grading line, sorting, packaging and dispatch; farmers never see the plant', () => {
  const scene = built(lbankStore(7));
  const keys = scene.zones.map((z) => z.key);
  for (const k of ['cleaning', 'grading', 'sorting', 'packing', 'dock']) expect(keys, `zone ${k}`).toContain(k);
  expect(scene.zones.find((z) => z.key === 'cleaning')!.label).toMatch(/receiving/i);
  expect(scene.zones.find((z) => z.key === 'grading')!.label).toMatch(/grading line/i);
  expect(scene.zones.find((z) => z.key === 'dock')!.label).toMatch(/dispatch/i);
  for (const mode of ['book', 'view'] as const) expect(zonesForViewer(scene.zones, mode).map((z) => z.key)).not.toContain('machinery');
  // No zone stands on a chamber or on the forklift passage.
  for (const z of scene.zones.filter((x) => x.key !== 'dock')) {
    for (const c of scene.chambers) {
      const overlap = Math.min(z.rect.x + z.rect.w, c.rect.x + c.rect.w) - Math.max(z.rect.x, c.rect.x) > 0.05 && Math.min(z.rect.y + z.rect.d, c.rect.y + c.rect.d) - Math.max(z.rect.y, c.rect.y) > 0.05;
      expect(overlap, `${z.label} on ${c.name}`).toBe(false);
    }
  }
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
