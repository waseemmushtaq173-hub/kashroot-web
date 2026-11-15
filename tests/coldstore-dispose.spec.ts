/**
 * Freeing the 3D cold store: a mesh with an ARRAY of materials (the unit
 * cooler) once ended the scene's cleanup with "material.map?.dispose is not a
 * function" — on an array, `.map` is Array.prototype.map. The cleanup
 * (three/buildStore disposeGroup, with real three.js objects) must free a
 * group holding such a mesh, free what the group made, and leave the kit's
 * shared materials alone.
 * Pure: no browser. Run: npx playwright test tests/coldstore-dispose.spec.ts
 */
import { expect, test } from '@playwright/test';
import * as THREE from 'three';

import { disposeGroup } from '@/components/rental/three/buildStore';
import { disposeMaterialSafely, materialsOf } from '@/components/rental/three/dispose';

/** Counts dispose() calls on anything three.js frees through its 'dispose' event. */
function watch(o: { addEventListener: (type: 'dispose', fn: () => void) => void }): { n: number } {
  const seen = { n: 0 };
  o.addEventListener('dispose', () => seen.n++);
  return seen;
}

test('the old cleanup line throws on an array of materials (the bug)', () => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), [new THREE.MeshStandardMaterial(), new THREE.MeshStandardMaterial()]);
  const old = () => (mesh.material as unknown as { map?: { dispose: () => void } }).map?.dispose();
  expect(old).toThrow(/dispose is not a function/);
});

test('one material, an array, nothing: all are freed without a throw', () => {
  const tex = new THREE.Texture();
  const single = new THREE.MeshStandardMaterial({ map: tex, normalMap: new THREE.Texture() });
  const a = new THREE.MeshStandardMaterial({ emissiveMap: new THREE.Texture() });
  const b = new THREE.MeshBasicMaterial();
  const seen = [watch(tex), watch(single), watch(a), watch(b), watch(a.emissiveMap!), watch(single.normalMap!)];
  expect(() => {
    disposeMaterialSafely(single);
    disposeMaterialSafely([a, b]);
    disposeMaterialSafely(null);
    disposeMaterialSafely(undefined);
    disposeMaterialSafely([null, 7, 'x']);
  }).not.toThrow();
  expect(seen.map((s) => s.n)).toEqual([1, 1, 1, 1, 1, 1]);
  expect(materialsOf([a, null, b])).toHaveLength(2);
});

test('disposeGroup frees a group with an array-material mesh and keeps the kit’s own', () => {
  const shared = new THREE.MeshStandardMaterial();
  const sharedTex = new THREE.Texture();
  const kit = { mats: { cooler: shared }, edge: new THREE.LineBasicMaterial(), edgeOn: new THREE.LineBasicMaterial(), unitBox: new THREE.BoxGeometry(), textures: [sharedTex] };
  const ownTex = new THREE.Texture();
  const own = new THREE.MeshStandardMaterial({ map: ownTex });
  const usesSharedTex = new THREE.MeshStandardMaterial({ map: sharedTex });
  const group = new THREE.Group();
  group.add(new THREE.Mesh(new THREE.BoxGeometry(), [shared, own, shared]));
  group.add(new THREE.Mesh(new THREE.BoxGeometry(), usesSharedTex));
  const seen = { shared: watch(shared), sharedTex: watch(sharedTex), own: watch(own), ownTex: watch(ownTex), usesSharedTex: watch(usesSharedTex) };
  expect(() => disposeGroup(THREE, kit as unknown as Parameters<typeof disposeGroup>[1], group)).not.toThrow();
  expect(seen.own.n).toBe(1);
  expect(seen.ownTex.n).toBe(1);
  expect(seen.usesSharedTex.n).toBe(1);
  expect(seen.shared.n).toBe(0);
  expect(seen.sharedTex.n).toBe(0);
  // Mounting again and freeing again (tab switches) stays quiet.
  expect(() => disposeGroup(THREE, kit as unknown as Parameters<typeof disposeGroup>[1], group)).not.toThrow();
});
