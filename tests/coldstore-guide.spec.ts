/**
 * A first-time farmer is told what to do in three plain steps, the 3D view is not buried in measurement plates until asked, and the
 * Drawing never says a chamber is "drawn outside" the building. Needs a server started with KR_TEST_PAGES=1; KR_BASE_URL says where.
 */
import { expect, test } from '@playwright/test';

const base = {"title": "Shopian Cold Store", "ownerName": "Owner", "ownerPhone": "9876543210", "managerName": "", "managerPhone": "9876543210", "state": "Jammu & Kashmir", "district": "Shopian", "area": "Test", "address": "", "unit": "m", "building": {"length": "40", "width": "30", "height": "12", "door": {"wall": "front", "from": "18", "width": "4", "height": "5"}, "sides": "both", "wallThickness": "", "passageWidth": "", "doorKind": "", "spCleaningL": "", "spCleaningW": "", "spGradingL": "", "spGradingW": "", "spPackingL": "", "spPackingW": "", "spMachineryL": "", "spMachineryW": "", "spDockL": "", "spDockW": ""}, "chambers": [{"key": "cmwigzwea0", "no": "1", "storage": "bins", "count": "480", "kg": "250", "tonnes": "", "floors": "1", "length": "14", "width": "12", "height": "8", "door": {"wall": "front", "from": "5", "width": "3", "height": "4"}, "rate": "45", "stackHigh": "8", "rackLevels": "4", "wallPosition": "", "spotX": "", "spotY": "", "unitL": "1.2", "unitW": "1", "unitH": "0.76", "floorHeights": "8", "aisle": "3.5", "stackGap": "0.1", "wallGap": "0.3", "coolerWall": "", "coolant": "", "ca": "", "temperature": "", "humidity": "", "doorType": "", "cratesPerBin": "100"}]};

test('the 3D view tells a new farmer the three steps, and hides measurement plates until "Show sizes"', async ({ page }) => {
  await page.goto('/test-pages/cold-store?view=owner');
  await page.evaluate((d) => localStorage.setItem('kr_cold_wizard:test-owner:new', JSON.stringify(d)), base);
  await page.goto('/test-pages/cold-store?view=farmer');
  await page.getByText('3D view', { exact: true }).first().click();
  await expect(page.locator('canvas').first()).toBeVisible();
  await expect(page.getByText('1. Tap a chamber to open it.')).toBeVisible();
  await expect(page.getByText('3. Press Next.')).toBeVisible();
  const sizes = page.getByRole('button', { name: 'Show sizes' });
  await expect(sizes).toHaveAttribute('aria-pressed', 'false');
  await sizes.click();
  await expect(sizes).toHaveAttribute('aria-pressed', 'true');
});

test('a chamber too big for the left of the passage stands on the right, inside, and no "drawn outside" notice is shown', async ({ page }) => {
  // A 14 m chamber, the main door 8 m from the left wall: the first chamber would go left, where there is only 8 m.
  const d = JSON.parse(JSON.stringify(base));
  d.building.door = { wall: 'front', from: '8', width: '4', height: '5' };
  d.chambers[0].length = '20';
  await page.goto('/test-pages/cold-store?view=owner');
  await page.evaluate((v) => localStorage.setItem('kr_cold_wizard:test-owner:new', JSON.stringify(v)), d);
  await page.goto('/test-pages/cold-store?view=farmer');
  await page.getByText('Drawing', { exact: true }).first().click();
  await page.waitForTimeout(1500);
  await expect(page.getByText(/drawn outside/i)).toHaveCount(0);
  await expect(page.getByText(/drawn where they would stand/i)).toHaveCount(0);
});
