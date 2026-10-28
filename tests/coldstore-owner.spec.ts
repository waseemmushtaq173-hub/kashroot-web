/**
 * An owner types a 2-chamber store into the real wizard (one of bins, one of
 * crates on 3 floors of their own heights); farmers then see the same counts
 * and sizes in the Drawing, the 3D view and the walk inside. Needs a server
 * started with KR_TEST_PAGES=1 (the test page); KR_BASE_URL says where.
 * Screenshots: test-results/cold-*.png
 */
import { expect, test, type Page } from '@playwright/test';

const PAGE = '/test-pages/cold-store';

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
    await page.screenshot({ path: `test-results/cold-owner-${width}.png`, fullPage: true });

    // Farmers: the same counts, in the Drawing, the 3D view and the walk inside.
    await page.goto(`${PAGE}?view=farmer`);
    await expect(page.getByText(/2 chambers · holds/)).toContainText('480 bins and 9,000 crates');
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
    await page.screenshot({ path: `test-results/cold-farmer-walk-${width}.png` });

    const scrollX = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(scrollX, 'no sideways scroll').toBeLessThanOrEqual(0);
    expect(errors, errors.join(' | ')).toHaveLength(0);
  });
}
