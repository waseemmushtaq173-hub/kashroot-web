/**
 * The Live Mandi Rates page, with the price service answering as the live one does today (KR_BASE_URL says where the
 * site runs). Nothing is invented: every price below is a made-up test answer given to a mocked /api/mandi, and the
 * checks are about what the page does with it — shows the crop asked for, says why a list is empty, dates old reports.
 */
import { expect, test, type Page } from '@playwright/test';

const row = (over: Record<string, unknown>) => ({ state: 'Tamil Nadu', district: 'Salem', market: 'Ammapet', commodity: 'Potato', variety: 'Other', grade: 'Local', arrivalDate: '2026-11-27', minPrice: 5600, maxPrice: 6000, modalPrice: 5800, ...over });

async function open(page: Page, url: string, answer: Record<string, unknown>) {
  // The page reads this site's own API and the rates posted by Mandi Helpers; nothing leaves the test.
  await page.route('**/api/mandi?*', (route) => route.fulfill({ json: { usingSampleKey: false, fetchedAt: '2026-11-27T05:00:00.000Z', source: 'Agmarknet via data.gov.in', ...answer } }));
  await page.route('**/api/mandi/commodities', (route) => route.fulfill({ json: { commodities: ['Potato', 'Onion'], varieties: {}, count: 2 } }));
  await page.route('**/api/supabase/**', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/weather**', (route) => route.fulfill({ status: 503, json: { error: 'not in this test' } }));
  await page.route('**/api/v1/weather**', (route) => route.fulfill({ status: 503, json: { error: 'not in this test' } }));
  await page.goto(url, { waitUntil: 'load' });
}

test('a crop other than Apple shows its rows (the page used to keep only Apple)', async ({ page }) => {
  await open(page, '/mandi-weather?crop=Potato', { records: [row({}), row({ market: 'Alangudi', modalPrice: 6500 }), row({ commodity: 'Onion', market: 'Mixed in by mistake' })], total: 3, agmarknet: 'captcha' });
  await expect(page.getByRole('cell', { name: /Ammapet/ }).first()).toBeVisible();
  await expect(page.getByRole('cell', { name: /Alangudi/ }).first()).toBeVisible();
  // Another crop's row is never mixed in.
  await expect(page.getByText('Mixed in by mistake')).toHaveCount(0);
  await expect(page.getByText('Best price')).toBeVisible();
});

test('Apple rows still show, in the 17 kg box the growers use', async ({ page }) => {
  await open(page, '/mandi-weather?crop=Apple', { records: [row({ commodity: 'Apple', state: 'Jammu and Kashmir', district: 'Shopian', market: 'Shopian', modalPrice: 7000 })], total: 1, agmarknet: 'ok' });
  await expect(page.getByRole('cell', { name: /Shopian/ }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /₹ \/ box/ })).toHaveAttribute('aria-pressed', 'true');
});

test('an empty list behind the Agmarknet CAPTCHA says so, and never claims no mandi reported', async ({ page }) => {
  await open(page, '/mandi-weather?crop=Apple', { records: [], total: 0, agmarknet: 'captcha' });
  await expect(page.getByText('No Apple prices can be read right now')).toBeVisible();
  await expect(page.getByText(/asks every visitor to solve a CAPTCHA/)).toBeVisible();
  await expect(page.getByText(/No mandi has reported/)).toHaveCount(0);
  const link = page.getByRole('link', { name: 'Open agmarknet.gov.in' }).first();
  await expect(link).toHaveAttribute('href', 'https://agmarknet.gov.in/');
  expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
});

test('an empty list from a feed that works says the feed has none', async ({ page }) => {
  await open(page, '/mandi-weather?crop=Apple&state=Himachal%20Pradesh', { records: [], total: 0, agmarknet: 'ok' });
  await expect(page.getByText('No Apple reports in the official feed')).toBeVisible();
  await expect(page.getByText(/no Apple reports for Himachal Pradesh right now/)).toBeVisible();
});

test('earlier reports are labelled as saved, each with its own date', async ({ page }) => {
  await open(page, '/mandi-weather?crop=Apple', { records: [row({ commodity: 'Apple', market: 'Sopore', state: 'Jammu and Kashmir', district: 'Baramulla', arrivalDate: '2026-11-24', modalPrice: 6800 })], total: 1, stale: true, fetchedAt: '2026-11-24T08:00:00.000Z', agmarknet: 'captcha' });
  await expect(page.getByText(/have no new Apple reports right now/)).toBeVisible();
  await expect(page.getByText('Stale', { exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: /Sopore/ }).first()).toBeVisible();
  await expect(page.getByText(/24 Nov/).first()).toBeVisible();
});

test('the crop box offers the usual crops even when the feed lists few', async ({ page }) => {
  await open(page, '/mandi-weather', { records: [], total: 0, agmarknet: 'ok' });
  const options = await page.locator('#commodities option').evaluateAll((o) => o.map((x) => (x as HTMLOptionElement).value));
  for (const crop of ['Apple', 'Potato', 'Onion', 'Tomato']) expect(options).toContain(crop);
  expect(new Set(options).size).toBe(options.length);
});
