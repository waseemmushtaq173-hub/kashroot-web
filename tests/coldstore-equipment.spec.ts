/**
 * The machines and people in a work zone (three/equipment): they must stay inside the zone the owner measured — never through a
 * chamber wall, never out into the passage — however big or thin the zone is, stay a handful of draw calls (merged per
 * material), and a zone too small for any holds none. No browser: three.js runs in Node, the materials are stood in for.
 */
import { expect, test } from '@playwright/test';

import { zoneEquipment, type ZoneKey } from '@/components/rental/three/equipment';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const T = require('three') as typeof import('three');

const KEYS: ZoneKey[] = ['cleaning', 'grading', 'sorting', 'packing', 'machinery', 'dock'];
/** One stand-in material per name, so merging by material can be checked. */
const mats = new Proxy({} as Record<string, unknown>, {
  get(target, name: string) {
    return (target[name] ??= new T.MeshBasicMaterial());
  },
});
const kit = { T, mats } as unknown as Parameters<typeof zoneEquipment>[0];

const SIZES: [number, number][] = [[3, 2], [8, 6], [12, 12], [20, 3], [4.4, 11.7], [60, 60]];

for (const key of KEYS) {
  for (const [L, C] of SIZES) {
    test(`${key} in a ${L} × ${C} m zone stays inside it, in a few draw calls`, () => {
      const g = zoneEquipment(kit, key, L, C);
      expect(g, 'something to draw').not.toBeNull();
      const meshes: InstanceType<typeof T.Mesh>[] = [];
      g!.traverse((o) => {
        if ((o as InstanceType<typeof T.Mesh>).isMesh) meshes.push(o as InstanceType<typeof T.Mesh>);
      });
      expect(meshes.length, 'merged per material').toBeLessThanOrEqual(20);
      const box = new T.Box3().setFromObject(g!);
      // A little over the edge is the zone's own yellow border and a person standing at it; never more.
      const slackL = 1.2;
      const slackC = 1.8;
      expect(box.min.x, `${key} left`).toBeGreaterThanOrEqual(-L / 2 - slackL);
      expect(box.max.x, `${key} right`).toBeLessThanOrEqual(L / 2 + slackL);
      expect(box.min.z, `${key} near`).toBeGreaterThanOrEqual(-C / 2 - slackC);
      expect(box.max.z, `${key} far`).toBeLessThanOrEqual(C / 2 + slackC);
      expect(box.min.y, 'on the floor').toBeGreaterThanOrEqual(-0.01);
      expect(box.max.y, 'no taller than a store').toBeLessThanOrEqual(3);
    });
  }
}

test('a zone too small for any machine holds none', () => {
  for (const key of KEYS) {
    expect(zoneEquipment(kit, key, 0.8, 2)).toBeNull();
    expect(zoneEquipment(kit, key, 5, 0.4)).toBeNull();
  }
});

test('a big zone gets more machines than a small one (never one toy in a corner)', () => {
  const count = (key: ZoneKey, L: number, C: number) => {
    let v = 0;
    zoneEquipment(kit, key, L, C)!.traverse((o) => {
      const m = o as InstanceType<typeof T.Mesh>;
      if (m.isMesh) v += m.geometry.getAttribute('position').count;
    });
    return v;
  };
  for (const key of ['grading', 'sorting', 'packing', 'cleaning'] as const) expect(count(key, 24, 14), key).toBeGreaterThan(count(key, 6, 4));
});
