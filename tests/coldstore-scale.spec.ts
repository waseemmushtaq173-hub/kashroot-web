/**
 * Step 2, to scale: the scale bar's length, the coolers on the wall the owner
 * named (as built in three.js meshes, inside their chamber), the measure
 * tool's distances to the centimetre, and the walking pace.
 * Pure: no browser. Run: npx playwright test tests/coldstore-scale.spec.ts
 */
import { expect, test } from '@playwright/test';
import * as THREE from 'three';

import { scaleLength } from '@/components/rental/drawingMarks';
import type { Kit } from '@/components/rental/three/buildStore';
import { buildFixtures } from '@/components/rental/three/fixtures';
import { buildScene, coolerToward, insideDoor, type SceneChamber, type StoreScene } from '@/components/rental/three/storeScene';
import { aheadOf, walkWorld, WALK_SPEED } from '@/components/rental/walk/walker';
import { blankChamber, blankStore, previewChambers, storeModel, type ChamberDraft, type StoreDraft } from '@/lib/coldStore';
import type { Wall } from '@/lib/coldLayout';

const CM = 0.01;

/** The same 2-chamber store as tests/coldstore-model (40 × 30 m; bins; crates on 3 floors). */
function sample(change: (bins: ChamberDraft, crates: ChamberDraft) => void = () => {}): StoreDraft {
  const d = blankStore(null);
  Object.assign(d, { title: 'Test cold store', ownerName: 'Owner', ownerPhone: '9876543210', managerPhone: '9876543210', district: 'Shopian', area: 'Test', unit: 'm' });
  d.building = { length: '40', width: '30', height: '12', door: { wall: 'front', from: '18', width: '4', height: '5' }, sides: 'both' };
  const bins = blankChamber(1, 'bins');
  Object.assign(bins, { count: '480', kg: '250', floors: '1', length: '14', width: '12', height: '8', rate: '45', door: { wall: 'front', from: '5', width: '3', height: '4' } });
  const crates = blankChamber(2, 'crates');
  Object.assign(crates, { count: '9000', kg: '20', floors: '3', length: '12', width: '10', height: '9', rate: '6', floorHeights: '3.2, 3, 2.8', door: { wall: 'front', from: '4', width: '2', height: '2.8' } });
  change(bins, crates);
  d.chambers = [bins, crates];
  return d;
}
const sceneOf = (d: StoreDraft): StoreScene => {
  const model = storeModel(d);
  return buildScene(previewChambers(model, 'test'), model.building);
};

/** A kit of plain materials (no textures: no canvas in node), enough for the fixtures. */
function plainKit(): Kit {
  const mats = new Proxy({} as Record<string, THREE.Material>, { get: (all, k: string) => (all[k] ??= Object.assign(new THREE.MeshBasicMaterial(), { name: k })) });
  return { T: THREE, mats, unitBox: new THREE.BoxGeometry(), stackGeo: () => new THREE.BoxGeometry(), edge: new THREE.LineBasicMaterial(), edgeOn: new THREE.LineBasicMaterial(), textures: [], dispose: () => {} } as unknown as Kit;
}

type Box = { x0: number; x1: number; y0: number; y1: number; top: number };

/** The plan rectangle each cooler mesh covers (world x → plan x, world z → plan y reversed). */
function coolerBoxes(scene: StoreScene): Box[] {
  const o = { ox: 0, oy: 0 };
  const { group } = buildFixtures(plainKit(), scene, o);
  group.updateMatrixWorld(true);
  const out: Box[] = [];
  group.traverse((m) => {
    if (!(m instanceof THREE.Mesh) || (m.material as THREE.Material).name !== 'cooler') return;
    const b = new THREE.Box3().setFromObject(m);
    out.push({ x0: b.min.x + o.ox, x1: b.max.x + o.ox, y0: o.oy - b.max.z, y1: o.oy - b.min.z, top: b.max.y });
  });
  return out;
}

const inside = (c: SceneChamber) => (q: Box) => q.x0 >= c.rect.x - CM && q.x1 <= c.rect.x + c.rect.w + CM && q.y0 >= c.rect.y - CM && q.y1 <= c.rect.y + c.rect.d + CM;
const depthOf = (c: SceneChamber) => (Math.abs(c.inward.y) > 0.5 ? c.rect.d : c.rect.w);

test('the scale bar is a round length that fits', () => {
  expect(scaleLength(12, 'm')).toEqual({ metres: 10, text: '10 m' });
  expect(scaleLength(4.9, 'm').text).toBe('2 m');
  expect(scaleLength(30, 'm').text).toBe('25 m');
  const ft = scaleLength(30, 'm');
  expect(ft.metres).toBe(25);
  const feet = scaleLength(10, 'ft');
  expect(feet.text).toBe('25 ft');
  expect(Math.abs(feet.metres - 7.62)).toBeLessThanOrEqual(CM);
});

test('coolers hang on the wall the owner named, inside their chamber', () => {
  for (const wall of ['', 'front', 'left', 'right', 'back'] as const) {
    const scene = sceneOf(sample((bins) => (bins.coolerWall = wall)));
    const c = scene.chambers.find((x) => x.no === 1)!;
    const boxes = coolerBoxes(scene).filter(inside(c));
    expect(boxes.length, `${wall || 'unsaid'}: coolers in Chamber 1`).toBeGreaterThan(0);
    // Every cooler hugs the wall asked for (within 0.25 m of it), under the ceiling.
    const to = coolerToward(c.doorWall, (wall || undefined) as Wall | undefined);
    for (const q of boxes) {
      const gap = to.y > 0.5 ? c.rect.y + c.rect.d - q.y1 : to.y < -0.5 ? q.y0 - c.rect.y : to.x > 0.5 ? c.rect.x + c.rect.w - q.x1 : q.x0 - c.rect.x;
      expect(gap, `${wall || 'unsaid'}: gap to the wall`).toBeGreaterThanOrEqual(0);
      expect(gap).toBeLessThanOrEqual(0.25);
      expect(q.top).toBeLessThanOrEqual(c.h + CM);
    }
  }
  // Unsaid: the wall facing the door. The door wall: back out through the door.
  const c = sceneOf(sample()).chambers.find((x) => x.no === 1)!;
  expect(coolerToward(c.doorWall, undefined)).toEqual(c.inward);
  expect(coolerToward(c.doorWall, 'front')).toEqual({ x: -c.inward.x, y: -c.inward.y });
});

test('every cooler of every chamber stays inside it', () => {
  const scene = sceneOf(sample((bins, crates) => ((bins.coolerWall = 'left'), (crates.coolerWall = 'right'))));
  const boxes = coolerBoxes(scene);
  expect(boxes.length).toBeGreaterThan(1);
  for (const q of boxes) expect(scene.chambers.some((c) => inside(c)(q)), JSON.stringify(q)).toBe(true);
});

test('the measure tool reads the true distance to the centimetre', () => {
  const scene = sceneOf(sample());
  // An empty store: only walls. Just inside each door, looking straight in, the back wall is the depth less the step in.
  const empty = walkWorld(scene, () => false);
  for (const c of scene.chambers) {
    const at = insideDoor(c, 0.9);
    const r = aheadOf(empty, { x: at.x, y: at.y, level: 1, inside: -1 }, Math.atan2(c.inward.y, c.inward.x));
    expect(r?.what).toBe('wall');
    expect(Math.abs(r!.d - (depthOf(c) - 0.9)), `${c.name}: ${r!.d}`).toBeLessThanOrEqual(CM);
  }
  // Every place full: never further than the back wall, and the walkway or a stack is what it meets.
  const full = walkWorld(scene, () => true);
  for (const c of scene.chambers) {
    const at = insideDoor(c, 0.9);
    const r = aheadOf(full, { x: at.x, y: at.y, level: 1, inside: -1 }, Math.atan2(c.inward.y, c.inward.x));
    expect(r).not.toBeNull();
    expect(r!.d).toBeLessThanOrEqual(depthOf(c) - 0.9 + CM);
  }
});

test('walking pace is 1.2 m/s', () => {
  expect(WALK_SPEED).toBe(1.2);
});
