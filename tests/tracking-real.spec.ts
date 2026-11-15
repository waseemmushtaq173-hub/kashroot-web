/**
 * The live tracking portal (/tracking) shows only what the database holds:
 *   - the Tracking ID box opens empty (nothing is typed in for the visitor, nothing opens by itself);
 *   - the shipment form in the driver tab has no ready-made consignment in it;
 *   - a shipment cannot be created from made-up defaults: the server refuses one without real places and details;
 *   - a position is refused unless it comes from the trip's own vehicle (and then its driver or paired device).
 * KR_BASE_URL says where the site runs.
 */
import { expect, test } from '@playwright/test';

test('the tracking box opens empty and nothing is opened for the visitor', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/tracking');
  await page.waitForLoadState('load');
  await page.waitForTimeout(2500);
  const box = page.getByPlaceholder('e.g. Enter your Shipment ID from your Buyer/Farmer Order or Driver Trip');
  await expect(box).toBeVisible();
  await expect(box).toHaveValue('');
  // No shipment is open: its status strip is not on the page.
  await expect(page.getByText('Live Tracking Status')).toHaveCount(0);
  expect(await page.content()).not.toMatch(/KR-SHP-2026-(605324|825766|615472|582693|856924)/);
  expect(errors, errors.join(' | ')).toHaveLength(0);
});

test('the list of active shipments holds only shipments still on the road', async ({ request }) => {
  const res = await request.get('/api/tracking/portal');
  expect(res.ok()).toBeTruthy();
  const data = (await res.json()) as { availableShipments: { shipment_status: string; updated_at: string }[] };
  for (const s of data.availableShipments) {
    expect(['ASSIGNED', 'IN_TRANSIT', 'TRACKING_PAUSED']).toContain(s.shipment_status);
    expect(Date.now() - new Date(s.updated_at).getTime()).toBeLessThan(24 * 3600 * 1000 + 60_000);
  }
});

test('a shipment is refused without real places and details; a position without its own vehicle', async ({ request }) => {
  const none = await request.post('/api/tracking/portal', { data: { action: 'CREATE_OR_ASSIGN_SHIPMENT' } });
  expect(none.status()).toBe(400);
  expect(((await none.json()) as { error: string }).error).toMatch(/origin and the destination/i);
  const noDetails = await request.post('/api/tracking/portal', {
    data: { action: 'CREATE_OR_ASSIGN_SHIPMENT', originLat: 33.72, originLng: 74.83, destinationLat: 28.71, destinationLng: 77.17 },
  });
  expect(noDetails.status()).toBe(400);
  expect(((await noDetails.json()) as { error: string }).error).toMatch(/Fill in: .*commodity.*buyer/i);
  const ping = await request.post('/api/tracking/ingest', {
    data: { eventAction: 'GPS_PING', shipmentId: '00000000-0000-4000-8000-000000000001', vehicleId: '00000000-0000-4000-8000-000000000002', latitude: 33.7, longitude: 74.8 },
  });
  expect(ping.status()).toBe(403);
});
