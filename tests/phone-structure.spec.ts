/**
 * What a person sees on a phone, page by page, at the three common widths (360, 390, 412 px): nothing wider than the screen,
 * nothing cut off by its own box, no placeholder cut short, no two pieces of text or two buttons on top of each other, and no
 * explanatory paragraph under a page title pushing the tool off the first screen. The floating microphone and the sticky header
 * are meant to float over the page, so they are not counted as "on top of" anything; the microphone is held small on a phone.
 * KR_BASE_URL says where the site runs.
 */
import { expect, test } from '@playwright/test';

import { PORTAL_IDS } from '@/lib/auth/roles';

const PAGES = ['/', '/login', ...PORTAL_IDS.map((id) => `/login/${id}`), '/register', '/forgot-password', '/compare-prices', '/mandi-weather', '/supplies/tester', '/escrow', '/support', '/privacy', '/terms', '/refunds', '/delivery', '/tracking', '/status', '/offline'];

import { inspect } from './helpers/phoneInspect';

for (const width of [360, 390, 412]) {
  test.describe(`${width} px`, () => {
    test.use({ viewport: { width, height: 800 }, isMobile: true, hasTouch: true });
    for (const path of PAGES) {
      test(`${path} is laid out cleanly`, async ({ page }) => {
        await page.route('**/api/supabase/**', (route) => route.fulfill({ json: [] }));
        await page.route('**/api/mandi?*', (route) => route.fulfill({ json: { records: [], total: 0, usingSampleKey: false, fetchedAt: new Date().toISOString(), source: 'test', agmarknet: 'ok' } }));
        await page.route('**/api/mandi/commodities', (route) => route.fulfill({ json: { commodities: [], varieties: {}, count: 0 } }));
        await page.route('**/api/weather**', (route) => route.fulfill({ status: 503, json: { error: 'not in this test' } }));
        await page.route('**/api/v1/weather**', (route) => route.fulfill({ status: 503, json: { error: 'not in this test' } }));
        await page.goto(path, { waitUntil: 'load' });
        await page.waitForTimeout(2200);
        const r = await inspect(page);
        const found = [...r.wider.map((x) => `WIDER: ${x}`), ...r.cut.map((x) => `CUT OFF: ${x}`), ...r.placeholder.map((x) => `PLACEHOLDER: ${x}`), ...r.overlaps.map((x) => `ON TOP: ${x}`), ...r.unreadable.map((x) => `UNREADABLE: ${x}`)];
        expect([...new Set(found)].slice(0, 12), `${path} at ${width}px`).toEqual([]);
      });
    }
  });
}

test.describe('on a phone, the page opens on the tool, not on a paragraph', () => {
  test.use({ viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true });

  test('TrueScan: its title, two cards and the box to type in are all in the first screen', async ({ page }) => {
    await page.route('**/api/supabase/**', (route) => route.fulfill({ json: [] }));
    await page.goto('/supplies/tester', { waitUntil: 'load' });
    await page.waitForTimeout(1500);
    const input = page.locator('#truescan-text');
    await expect(input).toBeVisible();
    const box = (await input.boundingBox())!;
    expect(box.y + box.height, 'the text box ends inside a 800px screen').toBeLessThan(800);
    // The card counts the lists that are really in the app; it never says "Not yet" next to 1,531 listed entries.
    await expect(page.getByText('Not yet', { exact: true })).toHaveCount(0);
    await expect(page.getByText('1,531', { exact: true })).toBeVisible();
    // The line under the title is for screen readers only.
    const line = page.locator('p.sr-only', { hasText: 'type the registration number or the name from the label' });
    await expect(line).toHaveCount(1);
    expect((await line.boundingBox())!.width).toBeLessThanOrEqual(2);
  });

  test('the floating microphone is a small button on a phone', async ({ page }) => {
    await page.goto('/escrow', { waitUntil: 'load' });
    const mic = page.getByRole('button', { name: /Speak to KashRoot|Help on this page/ });
    await expect(mic).toBeVisible();
    const b = (await mic.boundingBox())!;
    expect(b.width).toBeLessThanOrEqual(52);
    expect(b.width).toBeGreaterThanOrEqual(44);
  });

  test('sign-in pages: each portal\u2019s button has its own colour and the form fits the first screen', async ({ page }) => {
    const colours: Record<string, string> = {};
    for (const id of ['farmer', 'buyer', 'kissan', 'rental', 'tracking', 'dealer', 'expert', 'trader', 'business']) {
      await page.goto(`/login/${id}`, { waitUntil: 'load' });
      const button = page.getByRole('button', { name: /^Sign in to / }).last();
      await expect(button).toBeVisible();
      const info = await button.evaluate((el) => ({ img: getComputedStyle(el).backgroundImage, bottom: el.getBoundingClientRect().bottom }));
      colours[id] = info.img.match(/rgb\([^)]*\)/)?.[0] ?? info.img;
      // Ending above 700px leaves room for the "I am human" box (about 80px) and still keeps the button on an 800px screen.
      expect(info.bottom, `${id}: the sign-in button ends inside the first screen`).toBeLessThan(700);
    }
    // One colour per portal, none of them the shared indigo the site's push-button rule paints on every submit button.
    expect(new Set(Object.values(colours)).size, JSON.stringify(colours)).toBe(Object.keys(colours).length);
    expect(Object.values(colours)).not.toContain('rgb(99, 88, 224)');
  });

  test('register: each role has its own colour (a farmer is not indigo)', async ({ page }) => {
    await page.goto('/register', { waitUntil: 'load' });
    const colour = (name: string) => page.getByRole('button', { name: new RegExp(`^${name}`) }).locator('span').first().evaluate((e) => getComputedStyle(e).backgroundImage);
    const farmer = await colour('Farmer');
    const buyer = await colour('Buyer');
    expect(farmer).not.toEqual(buyer);
    expect(farmer).toMatch(/rgb\((225|244|251|220|239)/); // rose / orange family
    expect(buyer).toMatch(/rgb\((37|59|14|6|8)/); // blue / cyan family
  });
});
