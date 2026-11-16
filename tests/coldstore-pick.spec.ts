/**
 * A farmer clicks a stack of bins in the 3D view, says how many bins are theirs
 * (a shared stack), sees the price (bins × rate × months) and can book it.
 * Needs a server started with KR_TEST_PAGES=1; KR_BASE_URL says where.
 */
import { expect, test } from '@playwright/test';

const draft = {"title": "Shopian Cold Store", "ownerName": "Owner", "ownerPhone": "9876543210", "managerName": "", "managerPhone": "9876543210", "state": "Jammu & Kashmir", "district": "Shopian", "area": "Test", "address": "", "unit": "m", "building": {"length": "40", "width": "30", "height": "12", "door": {"wall": "front", "from": "18", "width": "4", "height": "5"}, "sides": "both", "wallThickness": "", "passageWidth": "", "doorKind": "", "spCleaningL": "", "spCleaningW": "", "spGradingL": "", "spGradingW": "", "spPackingL": "", "spPackingW": "", "spMachineryL": "", "spMachineryW": "", "spDockL": "", "spDockW": ""}, "chambers": [{"key": "cmwigzwea0", "no": "1", "storage": "bins", "count": "480", "kg": "250", "tonnes": "", "floors": "1", "length": "14", "width": "12", "height": "8", "door": {"wall": "front", "from": "5", "width": "3", "height": "4"}, "rate": "45", "stackHigh": "8", "rackLevels": "4", "wallPosition": "", "spotX": "", "spotY": "", "unitL": "1.2", "unitW": "1", "unitH": "0.76", "floorHeights": "8", "aisle": "3.5", "stackGap": "0.1", "wallGap": "0.3", "coolerWall": "", "coolant": "", "ca": "", "temperature": "", "humidity": "", "doorType": "", "cratesPerBin": "100"}]};

test('clicking a stack in 3D selects it, and the price follows the number of bins', async ({ page }) => {
  await page.goto('/test-pages/cold-store?view=owner');
  await page.evaluate((d) => localStorage.setItem('kr_cold_wizard:test-owner:new', JSON.stringify(d)), draft);
  await page.goto('/test-pages/cold-store?view=farmer');
  await page.getByText('3D view', { exact: true }).first().click();
  await page.waitForTimeout(5000);
  const canvas = page.locator('canvas').first();
  await expect(canvas).toBeVisible();
  const box = (await canvas.boundingBox())!;
  const panel = page.getByText('SELECTED BIN').first();
  for (const [fx, fy] of [[0.3, 0.62], [0.27, 0.55], [0.33, 0.68], [0.36, 0.6], [0.25, 0.65], [0.4, 0.7]]) {
    if (await panel.count()) break;
    await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
    await page.waitForTimeout(800);
  }
  await expect(panel).toBeVisible();
  await page.getByLabel(/How many bins here/i).fill('3');
  await expect(page.getByText(/3 × ₹45 × 6 months/)).toBeVisible();
  await expect(page.getByText('₹810')).toBeVisible();
  await expect(page.getByRole('button', { name: /Book Selected Bin/i })).toBeEnabled();
});
