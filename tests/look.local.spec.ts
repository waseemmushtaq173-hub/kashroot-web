/**
 * Pictures of the KashRoot look, for a person to check by eye (nothing is asserted beyond "no script error"):
 * the homepage, a portal's door, the open tracking portal, a tool page and the 3D cold store with free,
 * shared, booked, held, chosen and own places. Runs only with KR_LOOK=1 against a server started with
 * KR_TEST_PAGES=1. Pictures: test-results/look-*.png
 */
import { expect, test } from '@playwright/test';

import { blankChamber, blankStore } from '@/lib/coldStore';

test.skip(process.env.KR_LOOK !== '1', 'pictures only on request (KR_LOOK=1)');

const DRAFT_KEY = 'kr_cold_wizard:test-owner:new';

function draft(): string {
  const d = blankStore(null);
  Object.assign(d, { title: 'Test cold store', ownerName: 'Owner', ownerPhone: '9876543210', managerPhone: '9876543210', district: 'Shopian', area: 'Test', unit: 'm' });
  Object.assign(d.building, { length: '44', width: '32', height: '10', door: { wall: 'front', from: '20', width: '4', height: '5' }, sides: 'both' });
  const bins = blankChamber(1, 'bins');
  Object.assign(bins, { count: '480', kg: '250', floors: '1', length: '14', width: '12', height: '8', rate: '45', unitL: '1.2', unitW: '1', unitH: '0.76', floorHeights: '8', aisle: '3.5', stackGap: '0.1', wallGap: '0.3', stackHigh: '8', coolerWall: 'back', door: { wall: 'front', from: '5', width: '3', height: '4' } });
  const crates = blankChamber(2, 'crates');
  Object.assign(crates, { count: '3000', kg: '20', floors: '3', length: '12', width: '10', height: '9', rate: '6', unitL: '0.6', unitW: '0.4', unitH: '0.3', aisle: '3', stackGap: '0.05', wallGap: '0.2', stackHigh: '9', floorHeights: '3.2, 3, 2.8', coolerWall: 'back', door: { wall: 'front', from: '4', width: '2', height: '2.8' } });
  d.chambers = [bins, crates];
  return JSON.stringify(d);
}

for (const [name, path, width] of [
  ['home', '/', 1280],
  ['home-390', '/', 390],
  ['login-farmer', '/login/farmer', 1280],
  ['tracking', '/tracking/dashboard', 1280],
  ['tracking-390', '/tracking/dashboard', 390],
  ['mandi', '/mandi-weather', 1280],
  ['compare', '/compare-prices', 1280],
  ['escrow', '/escrow', 1280],
  ['support', '/support', 1280],
  ['kit', '/test-pages/kit', 1280],
] as const) {
  test(`picture: ${name}`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize({ width, height: 900 });
    await page.goto(path);
    await page.waitForLoadState('load');
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `test-results/look-${name}.png`, fullPage: false });
    expect(errors, errors.join(' | ')).toHaveLength(0);
  });
}

test('picture: 3D cold store', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') console.log('console error:', m.text().slice(0, 300));
  });
  await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [DRAFT_KEY, draft()]);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/test-pages/cold-store?view=farmer&looks=1');
  await page.getByRole('tab', { name: '3D view' }).click();
  await expect(page.locator('canvas[role="img"]')).toHaveCount(1, { timeout: 30_000 });
  await page.waitForTimeout(3500);
  await page.locator('canvas[role="img"]').screenshot({ path: 'test-results/look-3d.png' });
  await page.getByRole('button', { name: 'Chamber 1' }).click();
  await page.waitForTimeout(2500);
  await page.locator('canvas[role="img"]').screenshot({ path: 'test-results/look-3d-chamber.png' });
  await page.getByRole('button', { name: 'X-ray walls' }).click();
  await page.getByRole('button', { name: 'View from the door' }).click();
  await page.waitForTimeout(2500);
  await page.locator('canvas[role="img"]').screenshot({ path: 'test-results/look-3d-xray.png' });
  await page.getByRole('button', { name: 'X-ray walls' }).click();
  await page.getByRole('tab', { name: 'Walk inside' }).click();
  await page.waitForTimeout(3000);
  await page.locator('canvas[role="img"]').screenshot({ path: 'test-results/look-3d-walk.png' });
  await page.getByRole('tab', { name: 'Drawing' }).click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'test-results/look-drawing.png' });
  expect(errors, errors.join(' | ')).toHaveLength(0);
});
