/**
 * Chambers are closed rooms: no two look alike (each has its own colour), and from outside only the chamber that is open cuts its
 * near walls away — every other chamber stays solid under its roof. No browser: the materials are stood in for by names.
 */
import { expect, test } from '@playwright/test';

import { chamberAccent, faceWalls } from '@/components/rental/three/buildStore';

const mats = { wall: 'wall', wallNear: 'wallNear', chamberWall: 'chamberWall', chamberNear: 'chamberNear', wainscot: 'wainscot', wainscotNear: 'wainscotNear' };
const kit = { mats } as unknown as Parameters<typeof faceWalls>[0];

/** A wall on the +x face of its room at the origin: the eye at +x looks at it from outside, so it is one of the near walls. */
const wall = (of: 'hall' | 'chamber', chamber?: number) =>
  ({ material: null, userData: { of, chamber, out: { x: 1, z: 0 }, mid: { x: 0, z: 0 } } }) as unknown as Parameters<typeof faceWalls>[1][number];
const eye = { x: 10, z: 0 };
const looks = (walls: ReturnType<typeof wall>[]) => walls.map((w) => w.material as unknown as string);

test('chambers 1 to 8 each have a colour of their own, and the colours come round again after that', () => {
  const colours = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => chamberAccent(n));
  expect(new Set(colours).size).toBe(8);
  expect(chamberAccent(9)).toBe(chamberAccent(1));
  expect(chamberAccent(0)).toBe(chamberAccent(1));
  expect(chamberAccent(-3)).toMatch(/^#[0-9A-F]{6}$/i);
});

test('only the open chamber cuts its near wall away; the others stay solid', () => {
  const walls = [wall('chamber', 0), wall('chamber', 1), wall('chamber', 2), wall('hall')];
  faceWalls(kit, walls, eye, false, 1);
  expect(looks(walls)).toEqual(['chamberWall', 'chamberNear', 'chamberWall', 'wallNear']);
});

test('with no chamber open every chamber cuts its near wall away, as before', () => {
  const walls = [wall('chamber', 0), wall('chamber', 1)];
  faceWalls(kit, walls, eye, false, -1);
  expect(looks(walls)).toEqual(['chamberNear', 'chamberNear']);
});

test('walking every wall is solid, and x-ray turns every wall to glass', () => {
  const walls = [wall('chamber', 0), wall('chamber', 1), wall('hall')];
  faceWalls(kit, walls, null, false, 1);
  expect(looks(walls)).toEqual(['chamberWall', 'chamberWall', 'wall']);
  faceWalls(kit, walls, eye, true, 1);
  expect(looks(walls)).toEqual(['chamberNear', 'chamberNear', 'wallNear']);
});

test('a wall on the far side of the open chamber stays solid', () => {
  const far = wall('chamber', 1);
  (far.userData as { out: { x: number; z: number } }).out = { x: -1, z: 0 };
  faceWalls(kit, [far], eye, false, 1);
  expect(far.material as unknown as string).toBe('chamberWall');
});
