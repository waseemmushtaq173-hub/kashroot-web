/**
 * The 10 km cluster, the nearest hub and the settlement (lib/clusterConsolidation): only real coordinates
 * give a number — a missing or (0, 0) point gives null, never a made-up distance — and the grower is
 * charged nothing. The first tests are pure (no browser); the last one opens the Buyer portal's shop on
 * the test page (needs a server started with KR_TEST_PAGES=1; KR_BASE_URL says where).
 */
import { expect, test } from '@playwright/test';

import { CLUSTER_RADIUS_KM, TRUCK_CAPACITY_BOXES, VERIFIED_JK_HUBS, calculateClusterSettlement, computeRealDistanceKm, getNearestVerifiedHub, isValidCoordinate } from '@/lib/clusterConsolidation';

test('a distance comes only from two real points', () => {
  // Srinagar (Lal Chowk) to Shopian town: about 41 km in a straight line.
  const km = computeRealDistanceKm(34.0722, 74.8094, 33.7173, 74.8333);
  expect(km).not.toBeNull();
  expect(km!).toBeGreaterThan(38);
  expect(km!).toBeLessThan(42);
  expect(computeRealDistanceKm(33.7, 74.8, 33.7, 74.8)).toBe(0);
  for (const bad of [null, undefined, Number.NaN, 200] as const) expect(computeRealDistanceKm(bad as number, 74.8, 33.7, 74.8)).toBeNull();
  expect(computeRealDistanceKm(0, 0, 33.7, 74.8), '(0, 0) is "not recorded", not a place').toBeNull();
  expect(isValidCoordinate('33.7', 74.8), 'text is not a coordinate').toBe(false);
});

test('the nearest hub is the nearest of the four, and none without GPS', () => {
  expect(getNearestVerifiedHub(null, null)).toBeNull();
  expect(getNearestVerifiedHub(0, 0)).toBeNull();
  for (const hub of VERIFIED_JK_HUBS) {
    const near = getNearestVerifiedHub(hub.lat, hub.lng);
    expect(near?.hub.id).toBe(hub.id);
    expect(near?.distanceKm).toBe(0);
  }
  const shopianTown = getNearestVerifiedHub(33.7173, 74.8333)!;
  expect(shopianTown.hub.id).toBe('HUB-SHP-AGLAR');
  expect(shopianTown.distanceKm).toBeLessThan(CLUSTER_RADIUS_KM);
});

test('the grower is paid in full; the buyer pays 1% on the boxes', () => {
  const s = calculateClusterSettlement({ produceSubtotalInr: 240_000, totalBoxes: 200, freightPerBoxInr: 0 });
  expect(s).toEqual({ produceSubtotalInr: 240_000, freightTotalInr: 0, buyerConsolidationFeeInr: 2_400, farmerFeeInr: 0, farmerNetPayoutInr: 240_000, buyerTotalPayableInr: 242_400 });
  expect(TRUCK_CAPACITY_BOXES).toBe(2000);
});

test('the truck starts empty and counts only boxes the buyer adds from real listings', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const probe = await page.goto('/test-pages/cluster');
  test.skip(probe?.status() === 404, 'Test pages are off: start the server with KR_TEST_PAGES=1');
  await expect(page.getByTestId('truck-load')).toHaveText('Current Truck Load: 0 / 2,000 Boxes (0%)');
  await page.waitForTimeout(4000);
  const cards = page.getByTestId('cluster-on-card');
  const n = await cards.count();
  // Whatever is really on sale: each card either shows its hub (it has GPS) or says it has none.
  for (let i = 0; i < n; i++) await expect(cards.nth(i)).toContainText(/Nearest KashRoot Hub: .+ km away|Orchard GPS not recorded on this listing/);
  const add = page.getByRole('button', { name: 'Add boxes to truck' });
  if (await add.count()) {
    await add.first().click();
    await expect(page.getByTestId('truck-load')).not.toHaveText('Current Truck Load: 0 / 2,000 Boxes (0%)');
    await expect(page.getByTestId('truck-bar')).toContainText('Order #1');
  }
  await page.screenshot({ path: 'test-results/cluster-truck.png', fullPage: true });
  expect(errors, errors.join(' | ')).toHaveLength(0);
});
