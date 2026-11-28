/**
 * The buttons a farmer and an owner need in the cold-store booking, where they can be seen.
 *
 * A farmer: the window says where they are (1 Choose places, 2 Confirm, 3 Pay the owner), and the bottom of the window always has one big
 * button to press — "Choose places for me" (asks how many bins when KashRoot does not know), then "Book & pay now · ₹…", then
 * "Book for ₹…", and on the last step the owner's payment comes before the gate pass.
 * An owner: the map window opens with "See how a farmer books & pays", "Bookings to confirm" and "Change chambers", the free / booked /
 * waiting counts, and "Money received" on a place a farmer has booked.
 * The database's answers are supplied by the test (nothing is saved). Needs a server started with KR_TEST_PAGES=1; KR_BASE_URL says where.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

const draft = JSON.parse(readFileSync(join(process.cwd(), 'tests/fixtures/cold-store-draft.json'), 'utf8')) as { chambers: { key: string }[] };
const BOOKING_ID = '11111111-2222-4333-8444-555555555555';
const json = (body: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

async function open(page: Page, path: string, taken: unknown[] = []) {
  await page.route('**/api/supabase/**', async (route) => {
    const url = route.request().url();
    if (url.includes('/rpc/kr_cold_map')) return route.fulfill(json(taken));
    if (url.includes('/rpc/kr_book_cold_places')) return route.fulfill(json(BOOKING_ID));
    if (url.includes('/rpc/kr_cold_share_status')) return route.fulfill(json([]));
    if (url.includes('/rpc/kr_payment_details')) return route.fulfill(json([{ account_name: 'Test Owner', upi_id: 'test-owner@testbank', account_number: null, ifsc: null, bank_name: null }]));
    if (url.includes('/rest/v1/rental_bookings')) return route.fulfill(json({ id: BOOKING_ID, amount: 810, status: 'requested', created_at: new Date().toISOString(), payment_ref: null }));
    return route.fulfill(json([]));
  });
  await page.route('**/api/cold-storage/book-units**', (route) => route.fulfill(json({ ok: true, bookedCount: 1, allocations: [], temperatureLogs: [] })));
  await page.goto('/test-pages/cold-store?view=owner');
  await page.evaluate((d) => localStorage.setItem('kr_cold_wizard:test-owner:new', JSON.stringify(d)), draft);
  await page.goto(path);
}

for (const width of [360, 390, 1280]) {
  test.describe(`at ${width} px`, () => {
    test.use({ viewport: { width, height: width < 600 ? 780 : 900 } });

    test('a farmer always has a button to press: choose places, next, book, and pay comes before the gate pass', async ({ page }) => {
      test.setTimeout(120_000);
      await open(page, '/test-pages/booking');
      const steps = page.getByTestId('booking-steps');
      await expect(steps).toBeVisible();
      await expect(steps.getByRole('listitem')).toHaveText([/Choose places/, /Confirm/, /Pay the owner/]);
      await expect(steps.locator('[aria-current="step"]')).toContainText('Choose places');

      // The footer button is on screen, big, and inside the window, before anything is chosen.
      const choose = page.getByTestId('choose-for-me');
      await expect(choose).toBeEnabled();
      // (The window slides up when it opens: measure once it has stopped.)
      await expect.poll(async () => { const r = (await choose.boundingBox())!; return Math.round(r.y + r.height); }, { message: 'inside the screen once the window has settled' }).toBeLessThanOrEqual(page.viewportSize()!.height);
      const box = (await choose.boundingBox())!;
      expect(box.height, 'a big button').toBeGreaterThanOrEqual(47.5);
      expect(box.x, 'inside at the left').toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, 'inside at the right').toBeLessThanOrEqual(width);

      // Not knowing how many: it takes the farmer to the question instead of doing nothing.
      await choose.click();
      await expect(page.getByLabel(/How many bins do you have/i)).toBeFocused();
      await page.getByLabel(/How many bins do you have/i).fill('40');
      await choose.click();

      // Places chosen: the same place now says what comes next and what it costs.
      const next = page.getByTestId('next-confirm');
      await expect(next).toBeVisible();
      await expect(next).toContainText(/Book & pay now · ₹/);
      await next.click();
      await expect(steps.locator('[aria-current="step"]')).toContainText('Confirm');
      const book = page.getByRole('button', { name: /^Book for ₹/ });
      const bookBox = (await book.boundingBox())!;
      expect(bookBox.height).toBeGreaterThanOrEqual(47.5);
      expect(bookBox.x + bookBox.width).toBeLessThanOrEqual(width);
      await book.click();

      // Paying: step 3, and the owner's payment is above the gate pass.
      await expect(steps.locator('[aria-current="step"]')).toContainText('Pay the owner');
      const pay = page.getByRole('link', { name: /by UPI app/ });
      await expect(pay).toBeVisible();
      const gate = page.getByText('Gate Pass QR Code').first();
      await expect(gate).toBeVisible();
      expect((await pay.boundingBox())!.y, 'the pay button is above the gate pass').toBeLessThan((await gate.boundingBox())!.y);
    });

    test('an owner sees what to do in the map window, the counts, and Money received on a booked place', async ({ page }) => {
      test.setTimeout(120_000);
      const chamber = `preview:${draft.chambers[0].key}:1`;
      await open(page, '/test-pages/booking?as=owner', [{ chamber_id: chamber, slot: '1A', state: 'part', used: 5, mine: 0 }]);
      const preview = page.getByTestId('owner-preview');
      const requests = page.getByTestId('owner-requests');
      await expect(preview).toBeVisible();
      await expect(preview).toContainText('See how a farmer books & pays');
      await expect(requests).toContainText('Bookings to confirm · 1');
      await expect(page.getByRole('button', { name: 'Change chambers' })).toBeVisible();
      for (const b of [preview, requests]) {
        const r = (await b.boundingBox())!;
        expect(r.height).toBeGreaterThanOrEqual(47.5);
        expect(r.x + r.width, 'inside at the right').toBeLessThanOrEqual(width);
      }

      // Free, booked and waiting come from the same map as the drawing: 480 bins, 5 of them taken.
      const counts = page.getByTestId('owner-counts');
      await expect(counts).toContainText('Free');
      await expect(counts.locator('div').filter({ hasText: /^Free/ })).toContainText('475');
      await expect(counts.locator('div').filter({ hasText: /^Booked/ })).toContainText('5');
      await expect(counts.locator('div').filter({ hasText: /^Waiting for you/ })).toContainText('1');

      // Each button does its job.
      await preview.click();
      await expect(page.getByTestId('owner-log')).toHaveText('preview');
      await requests.click();
      await expect(page.getByTestId('owner-log')).toHaveText('requests');

      // The booked place: who, the reference, and Money received.
      await page.getByRole('button', { name: /Row 1, stack 1:/ }).first().click();
      await expect(page.getByText('Test Farmer').first()).toBeVisible();
      await expect(page.getByText('TEST-UPI-123')).toBeVisible();
      await page.getByTestId('owner-money-received').click();
      await expect(page.getByTestId('owner-log')).toHaveText(`money-received:11111111-2222-4333-8444-666666666666`);
      await expect(page.getByTestId('owner-money-received')).toHaveCount(0);
    });
  });
}

test.describe('a chamber in 3D', () => {
  test.use({ viewport: { width: 1280, height: 1300 } });

  test('its card says "Book a place here": the free place nearest the door is chosen and "Book & pay now" shows the price', async ({ page }) => {
    test.setTimeout(240_000); // the software 3D renderer is slow on its first load
    await open(page, '/test-pages/booking');
    await page.getByText('3D view', { exact: true }).first().click();
    await page.getByRole('button', { name: 'Chamber 1', exact: true }).click({ timeout: 90_000 });
    await page.getByTestId('book-here').click({ timeout: 30_000 });
    const go = page.getByTestId('next-confirm');
    await expect(go).toContainText(/Book & pay now · ₹/);
    // From there it is the same way on: confirm, book, pay the owner.
    await go.click();
    await expect(page.getByRole('button', { name: /^Book for ₹/ })).toBeVisible();
  });
});
