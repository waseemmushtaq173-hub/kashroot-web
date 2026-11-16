/**
 * The buyer's shop with pooled locations, in a real browser: the four KashRoot hubs with who sells within 10 km of each,
 * the real distance from a hub to each orchard on its card, a hub chosen to filter the produce, and how far each hub is
 * from the buyer once they share their position. The listings are stubbed here (made up for the test); the screen never
 * invents one. Needs a server started with KR_TEST_PAGES=1 (KR_BASE_URL says where).
 */
import { expect, test } from '@playwright/test';

import { VERIFIED_JK_HUBS } from '@/lib/hubs';

const HUB = VERIFIED_JK_HUBS[0];
const row = (id: string, name: string, lat: number | null, lng: number | null, qty: number) => ({
  id, seller_id: `s-${id}`, seller_name: 'Test grower', category: 'produce', subcategory: 'apple', variety: 'Test', grade: 'A', unit: 'box', price: 800, quantity: qty, details: null, photo: null, active: true,
  updated_at: '2026-11-16T05:00:00Z', created_at: '2026-11-16T05:00:00Z', phone: null, box_capacity_kg: 20, packing_layers: '4 Layer', apples_per_box: null, product: name, district: 'Shopian',
  captured_lat: lat, captured_lng: lng, captured_accuracy_m: 10, captured_address: null, captured_at_iso: null, is_live_camera_verified: lat !== null, payout_upi: null,
});

test.use({ geolocation: { latitude: 34.0722, longitude: 74.8094, accuracy: 20 }, permissions: ['geolocation'] });

test('each hub says who sells near it; each card gives the real distance; a hub filters; GPS gives the buyer\'s distance', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/rest/v1/market_listings**', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify([row('l1', 'Apple near the hub', HUB.lat + 0.03, HUB.lng, 120), row('l2', 'Apple far from every hub', 34.0722, 74.8094, 60), row('l3', 'Apple with no GPS', null, null, 30)]) }),
  );
  const probe = await page.goto('/test-pages/cluster');
  test.skip(probe?.status() === 404, 'Test pages are off: start the server with KR_TEST_PAGES=1');
  const hubs = page.getByRole('list', { name: 'KashRoot hubs' });
  await expect(hubs).toContainText('1 farmer · 120 boxes');
  await expect(hubs).toContainText('No produce within 10 km yet');
  // The truck is gone: no capacity bar, no "Add boxes to truck".
  await expect(page.getByText(/truck/i)).toHaveCount(0);
  // Each card: the distance from the nearest hub, and whether the orchard is inside its pickup area.
  await expect(page.getByText('Inside its 10 km pickup area')).toHaveCount(1);
  await expect(page.getByText('Outside its 10 km pickup area')).toHaveCount(1);
  await expect(page.getByText(/^\d+(\.\d+)? km to the KashRoot hub at /).first()).toBeVisible();
  await expect(page.getByText(/no orchard GPS/i).first()).toBeVisible();
  // Before the buyer shares a position there is no "from you" number.
  await expect(hubs).not.toContainText('km from you');
  await page.getByRole('button', { name: 'How far is KashRoot from me?' }).click();
  await expect(hubs).toContainText('km from you');
  // Choosing a hub shows only the produce it collects.
  await page.getByRole('button', { name: new RegExp(HUB.locationName.split(',')[0]) }).first().click();
  await expect(page.getByText('Showing orchards within 10 km')).toBeVisible();
  await expect(page.getByText('Apple near the hub')).toBeVisible();
  await expect(page.getByText('Apple far from every hub')).toHaveCount(0);
  expect(errors, errors.join(' | ')).toHaveLength(0);
});
