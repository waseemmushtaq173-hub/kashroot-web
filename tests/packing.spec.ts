/**
 * The farmer's sell form states packing simply: the grade (A or B) and the box layers (4, 5 or both), and shows no 3D box.
 * Older listings keep their own words. Pure helpers and source guards, no server needed.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

import { applesFor, GRADE_CHOICES, LAYER_CHOICES, singleLayerCount } from '@/lib/packing';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

test('two grades and three layer choices: only 4, only 5, or both', () => {
  expect([...GRADE_CHOICES]).toEqual(['A', 'B']);
  expect(LAYER_CHOICES.map((c) => c.value)).toEqual(['4 Layer', '5 Layer', '4 Layer + 5 Layer']);
  expect(applesFor('4 Layer')).toBe('~80–100 apples');
  expect(applesFor('5 Layer')).toBe('~125–150 apples');
  expect(applesFor('4 Layer + 5 Layer')).toContain('4 layer');
  // An older listing's own words get no made-up count.
  expect(applesFor('3 Layer')).toBeNull();
  expect(applesFor('Loose / Crate Packed')).toBeNull();
  expect(applesFor(null)).toBeNull();
});

test('only a packing with one layer count can be drawn as one box', () => {
  expect(singleLayerCount('4 Layer')).toBe(4);
  expect(singleLayerCount('5 Layer')).toBe(5);
  expect(singleLayerCount('2 Layer (Half Box)')).toBe(2);
  expect(singleLayerCount('4 Layer + 5 Layer')).toBeNull();
  expect(singleLayerCount('4 and 5 Layer')).toBeNull();
  expect(singleLayerCount('Loose / Crate Packed')).toBeNull();
  expect(singleLayerCount('')).toBeNull();
  expect(singleLayerCount(undefined)).toBeNull();
});

test('the sell form has grade and layer buttons and no 3D box; the buyer\'s box is not drawn for "both"', () => {
  const form = read('src/components/market/ProductForm.tsx');
  expect(form).not.toMatch(/AppleBox3D|three/);
  expect(form).toContain('aria-label="Grade of the apples"');
  expect(form).toContain('aria-label="Box layers"');
  expect(form).toContain('LAYER_CHOICES.map');
  expect(form).toContain('GRADE_CHOICES.map');
  // Choosing a layer saves its usual apple count in the same change.
  expect(form).toContain('apples_per_box: c.apples');
  expect(read('src/components/three/AppleBox3DLazy.tsx')).toContain('singleLayerCount(String(layers)) === null) return null');
  expect(read('src/components/market/shop/ListingDetailModal.tsx')).toContain("singleLayerCount(l.packing_layers) !== null ? 'Turn the box");
});
