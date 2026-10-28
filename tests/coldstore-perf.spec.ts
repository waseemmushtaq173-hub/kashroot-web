/**
 * The cold store on a slow phone: the 2-chamber store (bins; crates on 3
 * floors) at 390 px with the CPU slowed 4×. Measures how long the 3D view
 * takes to open and the frames per second while walking, and saves them to
 * test-results/coldstore-perf.json. Software WebGL in a headless browser is
 * slower than a real phone's GPU, so these numbers are a cautious floor.
 * Needs a server started with KR_TEST_PAGES=1; KR_BASE_URL says where.
 */
import { writeFileSync } from 'node:fs';

import { expect, test } from '@playwright/test';

import { blankChamber, blankStore, type StoreDraft } from '@/lib/coldStore';

const PAGE = '/test-pages/cold-store';
const DRAFT_KEY = 'kr_cold_wizard:test-owner:new';

function sampleStore(): StoreDraft {
  const d = blankStore(null);
  Object.assign(d, { title: 'Test cold store', ownerName: 'Owner', ownerPhone: '9876543210', managerPhone: '9876543210', district: 'Shopian', area: 'Test', unit: 'm' });
  d.building = { length: '40', width: '30', height: '12', door: { wall: 'front', from: '18', width: '4', height: '5' }, sides: 'both' };
  const bins = blankChamber(1, 'bins');
  Object.assign(bins, { count: '480', kg: '250', floors: '1', length: '14', width: '12', height: '8', rate: '45', door: { wall: 'front', from: '5', width: '3', height: '4' } });
  const crates = blankChamber(2, 'crates');
  Object.assign(crates, { count: '9000', kg: '20', floors: '3', length: '12', width: '10', height: '9', rate: '6', floorHeights: '3.2, 3, 2.8', door: { wall: 'front', from: '4', width: '2', height: '2.8' } });
  d.chambers = [bins, crates];
  return d;
}

test('the 3D store opens fast and walks smoothly on a slow phone', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 390, height: 860 });
  const probe = await page.goto(`${PAGE}?view=farmer`);
  test.skip(probe?.status() === 404, 'Test pages are off: start the server with KR_TEST_PAGES=1');
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [DRAFT_KEY, JSON.stringify(sampleStore())]);
  await page.reload();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  // A person looks at the drawing first (the 3D code loads meanwhile, in the background).
  await page.waitForTimeout(3000);

  // Open: from the tap to the first drawn frame (the "Opening…" note goes once the scene is ready).
  const t0 = Date.now();
  await page.getByRole('tab', { name: '3D view' }).click();
  await expect(page.locator('canvas')).toHaveCount(1, { timeout: 60_000 });
  await expect(page.getByText('Opening the 3D view…')).toHaveCount(0, { timeout: 60_000 });
  const openMs = Date.now() - t0;

  // Walk: frames drawn in 3 s of holding "Walk forward".
  await page.getByRole('tab', { name: 'Walk inside' }).click();
  await page.getByRole('button', { name: 'Go to Chamber 2' }).click();
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const w = window as unknown as { __frames: number; __counting: boolean };
    w.__frames = 0;
    w.__counting = true;
    const tick = () => {
      if (!w.__counting) return;
      w.__frames++;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const fwd = await page.getByRole('button', { name: 'Walk forward' }).boundingBox();
  await page.mouse.move(fwd!.x + fwd!.width / 2, fwd!.y + fwd!.height / 2);
  await page.mouse.down();
  const w0 = Date.now();
  await page.waitForTimeout(3000);
  await page.mouse.up();
  const frames = await page.evaluate(() => {
    const w = window as unknown as { __frames: number; __counting: boolean };
    w.__counting = false;
    return w.__frames;
  });
  const fps = Math.round((frames / ((Date.now() - w0) / 1000)) * 10) / 10;
  await page.screenshot({ path: 'test-results/coldstore-perf-walk-390.png' });
  writeFileSync('test-results/coldstore-perf.json', JSON.stringify({ openMs, fps, cpuSlowdown: 4, width: 390 }, null, 2));
  console.log(`3D opens in ${openMs} ms; walking at ${fps} fps (CPU 4x slower, software WebGL)`);
  // Targets: open within 3 s, walk at 30 fps — measured 2.5 s and 34 fps here; the guard leaves room for a slower test machine.
  expect(openMs).toBeLessThan(6_000);
  expect(fps).toBeGreaterThanOrEqual(20);
});
