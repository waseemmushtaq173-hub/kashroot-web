/**
 * An owner types a 2-chamber store into the real wizard (one of bins, one of
 * crates on 3 floors of their own heights); farmers then see the same counts
 * and sizes in the Drawing, the 3D view and the walk inside. Needs a server
 * started with KR_TEST_PAGES=1 (the test page); KR_BASE_URL says where.
 * Screenshots: test-results/cold-*.png
 */
import { expect, test, type Locator, type Page } from '@playwright/test';

const PAGE = '/test-pages/cold-store';

/** The drawing's pixels per metre, read off its scale bar ("10 m" drawn N px long). */
async function pxPerMetre(svg: Locator): Promise<number> {
  const bar = svg.locator('[data-scale-bar]');
  await expect(bar).toHaveCount(1);
  const [text, px] = await Promise.all([bar.getAttribute('data-scale-bar'), bar.getAttribute('data-scale-px')]);
  const m = Number(text!.split(' ')[0]) * (text!.endsWith('ft') ? 0.3048 : 1);
  return Number(px) / m;
}

/** A dimension line agrees with the scale bar: `metres` long on the drawing's own scale (to the centimetre). */
async function expectDim(svg: Locator, dim: string, metres: number) {
  const k = await pxPerMetre(svg);
  const px = Number(await svg.locator(`[data-dim="${dim}"]`).first().getAttribute('data-dim-px'));
  expect(Math.abs(px / k - metres), `${dim} line drawn ${(px / k).toFixed(3)} m`).toBeLessThanOrEqual(0.01);
}

async function typeStore(page: Page) {
  // The building (the wizard keeps what is typed on this browser, as for a real owner).
  await page.goto(`${PAGE}?view=owner&step=2`);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('radio', { name: 'Metres' }).click();
  await page.getByLabel('Length, along the front (m)').fill('40');
  await page.getByLabel('Width, front to back (m)').fill('30');
  await page.getByLabel('Height, ground to roof (m)').fill('12');
  await page.getByLabel('Main door: distance from the left corner (m)').fill('18');
  await page.getByLabel('Main door: width (m)').fill('4');
  await page.getByLabel('Main door: height (m)').fill('5');
  await page.getByRole('radio', { name: 'Both sides' }).click();
  await page.waitForTimeout(300);
  // Chamber 1: bins, one floor. (Back at the chambers: the kept draft opens.)
  await page.goto(`${PAGE}?view=owner&step=3`);
  await expect(page.getByText('Step 3 of 5')).toBeVisible();
  const addChamber = page.getByRole('button', { name: 'Add a chamber' }).first();
  await addChamber.click();
  await page.getByRole('radio', { name: 'Bins' }).click();
  await page.getByLabel('How many bins does it hold?').fill('480');
  await page.getByLabel('Kg of apples in one bin').fill('250');
  await page.getByLabel('Length, along the front (m)').fill('14');
  await page.getByLabel('Width, front to back (m)').fill('12');
  await page.getByLabel('Height, floor to ceiling (m)').fill('8');
  await page.getByLabel('Door: distance from the left corner (m)').fill('5');
  await page.getByLabel('Door: width (m)').fill('3');
  await page.getByLabel('Door: height (m)').fill('4');
  await page.getByLabel('Rent for one bin for one month (₹)').fill('45');
  // Chamber 2: crates, 3 floors of 3.2, 3 and 2.8 m.
  await addChamber.click();
  await page.getByRole('radio', { name: 'Crates' }).click();
  await page.getByLabel('How many crates does it hold?').fill('9000');
  await page.getByLabel('Kg of apples in one crate').fill('20');
  await page.getByRole('textbox', { name: 'How many floors?', exact: true }).fill('3');
  await page.getByLabel('Length, along the front (m)').fill('12');
  await page.getByLabel('Width, front to back (m)').fill('10');
  await page.getByLabel('Height, floor to ceiling (m)').fill('9');
  await page.getByRole('textbox', { name: 'Floor 1', exact: true }).fill('3.2');
  await page.getByRole('textbox', { name: 'Floor 2', exact: true }).fill('3');
  await page.getByRole('textbox', { name: 'Floor 3', exact: true }).fill('2.8');
  await page.getByLabel('Door: distance from the left corner (m)').fill('4');
  await page.getByLabel('Door: width (m)').fill('2');
  await page.getByLabel('Door: height (m)').fill('2.8');
  await page.getByLabel('Rent for one crate for one month (₹)').fill('6');
}

for (const width of [1280, 390]) {
  test(`owner types a store, farmers see the same (${width} px)`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const probe = await page.goto(`${PAGE}?view=owner`);
    test.skip(probe?.status() === 404, 'Test pages are off: start the server with KR_TEST_PAGES=1');
    await page.setViewportSize({ width, height: 900 });
    await typeStore(page);

    // The owner sees exactly what was typed, and what fits by the measurements.
    await expect(page.getByText('480 bins + 9,000 crates')).toBeVisible();
    await expect(page.getByText(/By its size/)).toBeVisible();
    // The owner's drawing is to scale: its length and width lines measure 40 m and 30 m on its own scale bar.
    const ownerSvg = page.locator('figure svg').filter({ has: page.locator('[data-scale-bar]') }).first();
    await expectDim(ownerSvg, 'length', 40);
    await expectDim(ownerSvg, 'width', 30);
    await page.screenshot({ path: `test-results/cold-owner-${width}.png`, fullPage: true });

    // Farmers: the same counts, in the Drawing, the 3D view and the walk inside.
    await page.goto(`${PAGE}?view=farmer`);
    await expect(page.getByText(/2 chambers · holds/)).toContainText('480 bins and 9,000 crates');
    const farmerSvg = page.locator('figure svg').filter({ has: page.locator('[data-scale-bar]') }).first();
    await expectDim(farmerSvg, 'length', 40);
    await expectDim(farmerSvg, 'width', 30);
    await page.screenshot({ path: `test-results/cold-farmer-drawing-${width}.png`, fullPage: true });
    // The crates chamber, its 3 floors and its size as typed.
    await page.getByRole('tab', { name: '3D view' }).click();
    await expect(page.locator('canvas')).toHaveCount(1, { timeout: 30_000 });
    await page.getByRole('button', { name: 'Chamber 2' }).click();
    await expect(page.getByText('9 m high').first()).toBeVisible();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `test-results/cold-farmer-3d-${width}.png` });
    await page.getByRole('tab', { name: 'Walk inside' }).click();
    await page.getByRole('button', { name: 'Go to Chamber 2' }).click();
    await page.waitForTimeout(1500);
    // The measure tool: straight ahead to a wall or stack, then from a mark as you walk.
    await page.getByRole('button', { name: 'Measure', exact: true }).click();
    await expect(page.locator('[data-measure]')).toContainText(/Ahead: (\d+\.\d\d m to the (wall|stack)|open space)/);
    await page.getByRole('button', { name: 'Mark here' }).click();
    await expect(page.locator('[data-measure]')).toContainText('From your mark: 0.00 m');
    // Hold "Walk forward" down for 1.2 s, as a finger would.
    const fwd = await page.getByRole('button', { name: 'Walk forward' }).boundingBox();
    await page.mouse.move(fwd!.x + fwd!.width / 2, fwd!.y + fwd!.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(1200);
    await page.mouse.up();
    await expect(page.locator('[data-measure-mark]')).not.toHaveAttribute('data-measure-mark', '0');
    const walked = Number(await page.locator('[data-measure-mark]').getAttribute('data-measure-mark'));
    // An unhurried walk: 1.2 m/s at most, so about a metre in 1.2 s and never more than 1.6 m.
    expect(walked).toBeGreaterThan(0.2);
    expect(walked).toBeLessThanOrEqual(1.6);
    await page.screenshot({ path: `test-results/cold-farmer-walk-${width}.png` });

    const scrollX = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(scrollX, 'no sideways scroll').toBeLessThanOrEqual(0);
    expect(errors, errors.join(' | ')).toHaveLength(0);
  });
}
