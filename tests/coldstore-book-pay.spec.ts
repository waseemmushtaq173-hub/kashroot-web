/**
 * The whole way a farmer books in the 3D store, as the real booking window runs it: click a bin in 3D, the selected-bin panel
 * asks how many bins and shows the price, "Book & pay now" opens the confirm step, "Book" makes the booking, and
 * the pay step shows who to pay. The database's answers are supplied by the test (nothing is saved); what the browser sends
 * to the unit registry is checked: the farmer's own account, the booking's own reference, and always "PENDING" (only the
 * owner marks places paid). Needs a server started with KR_TEST_PAGES=1; KR_BASE_URL says where.
 */
import { expect, test, type Page } from '@playwright/test';

const draft = {"title": "Shopian Cold Store", "ownerName": "Owner", "ownerPhone": "9876543210", "managerName": "", "managerPhone": "9876543210", "state": "Jammu & Kashmir", "district": "Shopian", "area": "Test", "address": "", "unit": "m", "building": {"length": "40", "width": "30", "height": "12", "door": {"wall": "front", "from": "18", "width": "4", "height": "5"}, "sides": "both", "wallThickness": "", "passageWidth": "", "doorKind": "", "spCleaningL": "", "spCleaningW": "", "spGradingL": "", "spGradingW": "", "spPackingL": "", "spPackingW": "", "spMachineryL": "", "spMachineryW": "", "spDockL": "", "spDockW": ""}, "chambers": [{"key": "cmwigzwea0", "no": "1", "storage": "bins", "count": "480", "kg": "250", "tonnes": "", "floors": "1", "length": "14", "width": "12", "height": "8", "door": {"wall": "front", "from": "5", "width": "3", "height": "4"}, "rate": "45", "stackHigh": "8", "rackLevels": "4", "wallPosition": "", "spotX": "", "spotY": "", "unitL": "1.2", "unitW": "1", "unitH": "0.76", "floorHeights": "8", "aisle": "3.5", "stackGap": "0.1", "wallGap": "0.3", "coolerWall": "", "coolant": "", "ca": "", "temperature": "", "humidity": "", "doorType": "", "cratesPerBin": "100"}]};

// The window scrolls inside itself: a tall screen keeps the 3D picture and the buttons in view together.
test.use({ viewport: { width: 1280, height: 1300 } });

const BOOKING_ID = '11111111-2222-4333-8444-555555555555';
const FARMER_ID = '00000000-0000-4000-8000-0000000000bb';

/** Where the booking stands on sharing a bin (the database's answer to kr_cold_share_status): the test changes it while it runs. */
type Share = { state: 'none' | 'asked' | 'allowed' | 'declined' };

/** Everything up to and including pressing "Book": open the store, click a bin in 3D, ask for 3 bins, confirm. */
async function chooseAndBook(page: Page, share: Share): Promise<Record<string, unknown>[]> {
  const unitCalls: Record<string, unknown>[] = [];
  const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) });
  await page.route('**/api/supabase/**', async (route) => {
    const url = route.request().url();
    if (url.includes('/rpc/kr_cold_map')) return route.fulfill(json([]));
    if (url.includes('/rpc/kr_book_cold_places')) return route.fulfill(json(BOOKING_ID));
    if (url.includes('/rpc/kr_cold_share_status')) return route.fulfill(json(share.state === 'none' ? [] : [{ booking_id: BOOKING_ID, state: share.state, waiting: share.state === 'asked' ? 1 : 0 }]));
    // The owner's payment details come only from the database's own check that this farmer has a live booking.
    if (url.includes('/rpc/kr_payment_details')) return route.fulfill(json([{ account_name: 'Test Owner', upi_id: 'test-owner@testbank', account_number: null, ifsc: null, bank_name: null }]));
    if (url.includes('/rest/v1/rental_bookings')) return route.fulfill(json({ id: BOOKING_ID, amount: 810, status: 'requested', created_at: new Date().toISOString(), payment_ref: null }));
    return route.fulfill(json([]));
  });
  await page.route('**/api/cold-storage/book-units**', async (route) => {
    if (route.request().method() === 'POST') {
      unitCalls.push(JSON.parse(route.request().postData() ?? '{}'));
      return route.fulfill(json({ ok: true, bookedCount: 1 }));
    }
    return route.fulfill(json({ ok: true, allocations: [], temperatureLogs: [] }));
  });

  await page.goto('/test-pages/cold-store?view=owner');
  await page.evaluate((d) => localStorage.setItem('kr_cold_wizard:test-owner:new', JSON.stringify(d)), draft);
  await page.goto('/test-pages/booking');

  // 1. The 3D view: click a bin.
  await page.getByText('3D view', { exact: true }).first().click();
  await page.waitForTimeout(9000); // three.js loads on the first look, and the software renderer is slow
  const canvas = page.locator('canvas').first();
  await expect(canvas).toBeVisible();
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  const panel = page.getByText('SELECTED BIN').first();
  // The window's 3D view is smaller than the full page: look for a bin over a grid of points on the picture.
  const points: [number, number][] = [];
  for (const fy of [0.55, 0.65, 0.45, 0.75, 0.35, 0.85, 0.25]) for (const fx of [0.3, 0.4, 0.5, 0.2, 0.6, 0.7, 0.1, 0.8, 0.9]) points.push([fx, fy]);
  for (let round = 0; round < 2 && !(await panel.count()); round++) {
    for (const [fx, fy] of points) {
      if (await panel.count()) break;
      await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
      await page.waitForTimeout(450);
    }
  }
  await expect(panel).toBeVisible();

  // 2. It asks how many bins and shows the price; "Book" goes on to confirming.
  await page.getByLabel(/How many bins here/i).fill('3');
  await expect(page.getByText(/3 × ₹45 × 6 months/)).toBeVisible();
  await page.getByTestId('book-selected-bin').click();
  await expect(page.getByText('Confirm your places')).toBeVisible();

  // 3. Booking.
  await page.getByRole('button', { name: /^Book for ₹/ }).click();
  return unitCalls;
}

test('click a bin in 3D, book it, and land on the pay step', async ({ page }) => {
  test.setTimeout(240_000); // the software 3D renderer takes about a minute and a half
  const unitCalls = await chooseAndBook(page, { state: 'none' });
  // The booking is made and the pay step names who to pay.
  await expect(page.getByText('Pay the owner').first()).toBeVisible();
  await expect(page.getByTestId('pay-amount')).toHaveText('₹810');
  await expect(page.getByText('test-owner@testbank').first()).toBeVisible();
  await expect(page.getByRole('link', { name: /Pay ₹810 by UPI app/ })).toHaveAttribute('href', /^upi:\/\/pay\?.*pa=test-owner%40testbank/);
  await expect(page.getByAltText(/UPI QR code to pay ₹810/)).toBeVisible();

  // 4. What went to the unit registry: the farmer's own account and booking, never "paid".
  await expect.poll(() => unitCalls.length).toBeGreaterThan(0);
  for (const c of unitCalls) {
    expect(c.farmerId).toBe(FARMER_ID);
    expect(c.bookingId).toBe(BOOKING_ID);
    expect(c.idempotencyKeyPrefix).toBe(`kr-booking-${BOOKING_ID}`);
    expect(c.paymentStatus).toBe('PENDING');
  }
});

test('a bin shared with another farmer waits for their yes: no payment box until then, and "Check again" opens it', async ({ page }) => {
  test.setTimeout(240_000);
  const share: Share = { state: 'asked' };
  await chooseAndBook(page, share);
  // The places are held, but there is nothing to pay yet: the farmer is told who they wait for (a farmer, never a name).
  const waiting = page.getByTestId('share-waiting');
  await expect(waiting).toBeVisible();
  await expect(waiting).toContainText('Waiting for the other farmer’s yes');
  await expect(page.getByText(/as soon as the other farmer says yes/)).toBeVisible();
  await expect(page.getByTestId('pay-amount')).toHaveCount(0);
  await expect(page.getByRole('link', { name: /by UPI app/ })).toHaveCount(0);
  // The other farmer says yes: the payment box opens.
  share.state = 'allowed';
  await page.getByRole('button', { name: 'Check again' }).click();
  await expect(page.getByTestId('pay-amount')).toHaveText('₹810');
  await expect(waiting).toHaveCount(0);
});
