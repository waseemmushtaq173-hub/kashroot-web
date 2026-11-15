/**
 * Drawing ⇄ 3D view ⇄ Walk inside, over and over, as a farmer sees the store:
 * every switch frees one 3D scene and builds the next. Freeing once threw
 * "material.map?.dispose is not a function" on the unit cooler's array of
 * materials (three/dispose), which also left the WebGL context behind. No
 * script error, no 3D failure in the console, and never more than one 3D canvas.
 * The store is put straight into the wizard's kept draft (no typing). Needs a
 * server started with KR_TEST_PAGES=1; KR_BASE_URL says where.
 */
import { expect, test } from '@playwright/test';

import { blankChamber, blankStore } from '@/lib/coldStore';

const PAGE = '/test-pages/cold-store';
const DRAFT_KEY = 'kr_cold_wizard:test-owner:new';
/** The 3D scene's own canvas (the walk also has a small 2D map canvas, hidden from readers). */
const SCENE = 'canvas[role="img"]';

/** A 40 × 30 m store: one bins chamber, one crates chamber on 3 floors, coolers on the back wall. */
function draft(): string {
  const d = blankStore(null);
  Object.assign(d, { title: 'Test cold store', ownerName: 'Owner', ownerPhone: '9876543210', managerPhone: '9876543210', district: 'Shopian', area: 'Test', unit: 'm' });
  Object.assign(d.building, { length: '40', width: '30', height: '12', door: { wall: 'front', from: '18', width: '4', height: '5' }, sides: 'both' });
  const bins = blankChamber(1, 'bins');
  Object.assign(bins, { count: '480', kg: '250', floors: '1', length: '14', width: '12', height: '8', rate: '45', unitL: '1.2', unitW: '1', unitH: '0.76', floorHeights: '8', aisle: '3.5', stackGap: '0.1', wallGap: '0.3', stackHigh: '8', coolerWall: 'back', door: { wall: 'front', from: '5', width: '3', height: '4' } });
  const crates = blankChamber(2, 'crates');
  Object.assign(crates, { count: '3000', kg: '20', floors: '3', length: '12', width: '10', height: '9', rate: '6', unitL: '0.6', unitW: '0.4', unitH: '0.3', aisle: '3', stackGap: '0.05', wallGap: '0.2', stackHigh: '9', floorHeights: '3.2, 3, 2.8', coolerWall: 'back', door: { wall: 'front', from: '4', width: '2', height: '2.8' } });
  d.chambers = [bins, crates];
  return JSON.stringify(d);
}

test('switching Drawing, 3D view and Walk inside again and again never throws', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && /dispose|3D scene failed/i.test(m.text())) errors.push(m.text());
  });
  await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [DRAFT_KEY, draft()]);
  await page.setViewportSize({ width: 1280, height: 900 });
  const probe = await page.goto(`${PAGE}?view=farmer`);
  test.skip(probe?.status() === 404, 'Test pages are off: start the server with KR_TEST_PAGES=1');
  await expect(page.getByText(/2 chambers · holds/)).toContainText('480 bins and 3,000 crates');
  for (let round = 0; round < 4; round++) {
    await page.getByRole('tab', { name: '3D view' }).click();
    await expect(page.locator(SCENE)).toHaveCount(1, { timeout: 30_000 });
    await page.waitForTimeout(900);
    await page.getByRole('tab', { name: 'Walk inside' }).click();
    await expect(page.locator(SCENE)).toHaveCount(1);
    await page.waitForTimeout(900);
    await page.getByRole('tab', { name: 'Drawing' }).click();
    await expect(page.locator(SCENE)).toHaveCount(0);
  }
  await page.getByRole('tab', { name: '3D view' }).click();
  await expect(page.locator(SCENE)).toHaveCount(1, { timeout: 30_000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'test-results/cold-tabs-3d.png' });
  await page.getByRole('tab', { name: 'Drawing' }).click();
  await page.screenshot({ path: 'test-results/cold-tabs-drawing.png', fullPage: true });
  expect(errors, errors.join(' | ')).toHaveLength(0);
});

/**
 * A place tapped on the drawing opens the selected-bin panel: its code, what
 * it holds, the rent, and a count that changes the price as it is typed —
 * never more than the place holds.
 */
test('tapping a bin opens the selected-bin panel; the count changes the price and stays within capacity', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [DRAFT_KEY, draft()]);
  await page.setViewportSize({ width: 390, height: 860 });
  const probe = await page.goto(`${PAGE}?view=farmer`);
  test.skip(probe?.status() === 404, 'Test pages are off: start the server with KR_TEST_PAGES=1');
  // Chamber 1 (bins): 8 bins a place, ₹45 a bin a month; the test page books 6 months.
  await page.getByRole('button', { name: /Chamber 1, Row 1, stack 1: Free/ }).click();
  const panel = page.getByTestId('selected-bin-panel');
  await expect(panel).toBeVisible();
  await expect(page.getByTestId('selected-bin-id')).toHaveText('C1-R1-S1');
  await expect(panel).toContainText('Total capacity');
  await expect(panel).toContainText('8 bins');
  await expect(page.getByTestId('selected-bin-price')).toHaveText(/2,160/);
  const qty = page.getByTestId('selected-bin-qty');
  await qty.fill('3');
  await expect(page.getByTestId('selected-bin-price')).toHaveText(/810/);
  await qty.fill('500');
  await expect(qty).toHaveValue('8');
  await page.getByRole('button', { name: 'One bin fewer' }).click();
  await expect(qty).toHaveValue('7');
  await expect(page.getByRole('button', { name: /Chamber 1, Row 1, stack 1: Your choice/ })).toHaveAttribute('aria-pressed', 'true');
  await panel.scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/cold-bin-panel-390.png' });
  const scrollX = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(scrollX, 'no sideways scroll').toBeLessThanOrEqual(0);
  await page.getByTestId('book-selected-bin').click();
  await expect(page.getByRole('status')).toContainText('confirm step');
  expect(errors, errors.join(' | ')).toHaveLength(0);
});

/** The one-time-code card: all six boxes inside the card at 320, 360 and 390 px (the sixth once hung over the edge). */
for (const width of [320, 360, 390]) {
  test(`the six code boxes stay inside their card at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    const probe = await page.goto('/test-pages/kit');
    test.skip(probe?.status() === 404, 'Test pages are off: start the server with KR_TEST_PAGES=1');
    const sample = page.getByTestId('otp-sample');
    await sample.scrollIntoViewIfNeeded();
    const card = await sample.locator('> div').first().boundingBox();
    const boxes = await sample.locator('[aria-hidden] > span.grid').evaluateAll((els) => els.map((el) => el.getBoundingClientRect()).map((r) => ({ left: r.left, right: r.right, width: r.width })));
    expect(boxes).toHaveLength(6);
    for (const b of boxes) {
      expect(b.left, 'box starts inside the card').toBeGreaterThanOrEqual(card!.x);
      expect(b.right, 'box ends inside the card').toBeLessThanOrEqual(card!.x + card!.width);
      expect(b.width, 'box is wide enough to read').toBeGreaterThanOrEqual(28);
    }
    await sample.screenshot({ path: `test-results/otp-${width}.png` });
  });
}
