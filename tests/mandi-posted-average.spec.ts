/**
 * The average of the rates traders posted, shown in the unit the person chose. It showed "₹12 per box" for apples posted at
 * about ₹1,450 a 20 kg box, because a price per kg was converted as if it were a price per quintal.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

import { inUnit, perKg } from '@/lib/db/mandiRates';

test('a price per kg goes to a box by its weight, to a kg as it is, and to a quintal by 100', () => {
  // Three posted apple rates per 20 kg box: ₹1,500, ₹1,450 and ₹1,150.
  const kgs = [1500, 1450, 1150].map((p) => perKg({ unit: 'box', box_kg: 20 }, p)!);
  const avgKg = kgs.reduce((s, n) => s + n, 0) / kgs.length;
  expect(avgKg).toBeCloseTo(68.33, 1);
  expect(inUnit(avgKg, 'box', 17)).toBeCloseTo(1161.7, 0);
  expect(inUnit(avgKg, 'box', 20)).toBeCloseTo(1366.7, 0);
  expect(inUnit(avgKg, 'kg', 17)).toBeCloseTo(68.33, 1);
  expect(inUnit(avgKg, 'quintal', 17)).toBeCloseTo(6833.3, 0);
  // No box weight: the usual 17 kg box.
  expect(inUnit(100, 'box', 0)).toBe(1700);
});

test('the card uses it, not the government-price factor', () => {
  const page = readFileSync(join(process.cwd(), 'src/app/mandi-weather/page.tsx'), 'utf8');
  expect(page).toContain('inUnit(posted.avgKg, effectiveUnit, boxKg)');
  expect(page).not.toContain('posted.avgKg * factor');
});
