/**
 * "Walk inside" must open, let a visitor walk, and close and open again without
 * an error screen or a console error (a stack's materials were once freed as if
 * a list were one material). Needs a server started with KR_TEST_PAGES=1; KR_BASE_URL says where.
 */
import { expect, test } from '@playwright/test';

const draft = {"title": "Shopian Cold Store", "ownerName": "Owner", "ownerPhone": "9876543210", "managerName": "", "managerPhone": "9876543210", "state": "Jammu & Kashmir", "district": "Shopian", "area": "Test", "address": "", "unit": "m", "building": {"length": "40", "width": "30", "height": "12", "door": {"wall": "front", "from": "18", "width": "4", "height": "5"}, "sides": "both", "wallThickness": "", "passageWidth": "", "doorKind": "", "spCleaningL": "", "spCleaningW": "", "spGradingL": "", "spGradingW": "", "spPackingL": "", "spPackingW": "", "spMachineryL": "", "spMachineryW": "", "spDockL": "", "spDockW": ""}, "chambers": [{"key": "cmwigzwea0", "no": "1", "storage": "bins", "count": "480", "kg": "250", "tonnes": "", "floors": "1", "length": "14", "width": "12", "height": "8", "door": {"wall": "front", "from": "5", "width": "3", "height": "4"}, "rate": "45", "stackHigh": "8", "rackLevels": "4", "wallPosition": "", "spotX": "", "spotY": "", "unitL": "1.2", "unitW": "1", "unitH": "0.76", "floorHeights": "8", "aisle": "3.5", "stackGap": "0.1", "wallGap": "0.3", "coolerWall": "", "coolant": "", "ca": "", "temperature": "", "humidity": "", "doorType": "", "cratesPerBin": "100"}]};

test('Walk inside opens, walks, closes and opens again with no error', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // A request the test copy cannot reach (no database here) is not a script error.
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
  await page.goto('/test-pages/cold-store?view=owner');
  await page.evaluate((d) => localStorage.setItem('kr_cold_wizard:test-owner:new', JSON.stringify(d)), draft);
  await page.goto('/test-pages/cold-store?view=farmer');

  await page.getByText('Walk inside', { exact: true }).first().click();
  await expect(page.locator('canvas').first()).toBeVisible();
  for (let i = 0; i < 3; i++) {
    await page.keyboard.down('ArrowUp');
    await page.waitForTimeout(600);
    await page.keyboard.up('ArrowUp');
  }
  await page.getByRole('button', { name: 'Go to Chamber 1' }).click();
  await page.waitForTimeout(1500);

  // Out and in again: the scene is rebuilt and freed each time.
  await page.getByText('3D view', { exact: true }).first().click();
  await page.waitForTimeout(800);
  await page.getByText('Walk inside', { exact: true }).first().click();
  await page.waitForTimeout(1500);

  await expect(page.getByText(/try again/i)).toHaveCount(0);
  expect(errors, errors.join('\n')).toEqual([]);
});
