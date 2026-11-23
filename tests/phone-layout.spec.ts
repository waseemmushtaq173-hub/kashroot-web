/**
 * A phone gets the page at its own width, not a desktop page shrunk to fit: text is the size it is written, nothing is zoomed,
 * and the home page's three tool cards and the portal cards are small tiles (the three side by side, the portals two across).
 * A browser test: needs a server started with KR_TEST_PAGES=1 (KR_BASE_URL says where).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

test('the page is laid out at the phone\'s own width, not 800 px wide', () => {
  const layout = readFileSync(join(process.cwd(), 'src/app/layout.tsx'), 'utf8');
  expect(layout).toContain('width: "device-width"');
  expect(layout).toContain('initialScale: 1');
  expect(layout).not.toMatch(/width:\s*800/);
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

  test('the home page: the three cards sit side by side as small tiles, with text a phone can read', async ({ page }) => {
    await page.goto('/', { waitUntil: 'load' });
    expect(await page.evaluate(() => ({ w: innerWidth, scale: visualViewport?.scale }))).toEqual({ w: 390, scale: 1 });
    const tools = page.getByLabel('KashRoot tools').locator('article');
    await expect(tools).toHaveCount(3);
    const boxes = await tools.evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width }; }));
    // One row: the same top, left to right, each about a third of the screen.
    expect(Math.max(...boxes.map((b) => b.y)) - Math.min(...boxes.map((b) => b.y))).toBeLessThan(3);
    expect(boxes[0].x).toBeLessThan(boxes[1].x);
    expect(boxes[1].x).toBeLessThan(boxes[2].x);
    for (const b of boxes) expect(b.w).toBeLessThan(135);
    // Small, but readable without zooming: no text under 11 px, titles about 13 px.
    const sizes = await tools.evaluateAll((els) => els.flatMap((e) => [...e.querySelectorAll('h2, a')].map((n) => ({ tag: n.tagName, px: parseFloat(getComputedStyle(n).fontSize) }))));
    for (const s of sizes) expect(s.px, `${s.tag} text size`).toBeGreaterThanOrEqual(11);
    expect(sizes.filter((s) => s.tag === 'H2').every((s) => s.px <= 14)).toBe(true);
    // The long text and the tag are left out of the small tile; the name and the button stay.
    await expect(tools.first().locator('p')).toBeHidden();
    await expect(tools.first().getByRole('heading', { name: 'Pay After Delivery' })).toBeVisible();
    await expect(tools.first().getByRole('link', { name: 'How it works' })).toBeVisible();
    await expect(tools.first().getByRole('link', { name: 'Buy produce' })).toBeVisible();
    // Nothing runs off the screen sideways.
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  });

  test('the portal cards are two across, not one big card per row', async ({ page }) => {
    await page.goto('/', { waitUntil: 'load' });
    const grid = page.locator('#portals-heading').locator('xpath=ancestor::section[1]').locator('ul').first();
    await grid.scrollIntoViewIfNeeded();
    const tiles = grid.locator('> li');
    expect(await tiles.count()).toBeGreaterThanOrEqual(8);
    const boxes = await tiles.evaluateAll((els) => els.slice(0, 4).map((e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y + scrollY, w: r.width }; }));
    // Two to a row: the first two share a top, the third starts the next row.
    expect(Math.abs(boxes[0].y - boxes[1].y)).toBeLessThan(3);
    expect(boxes[2].y).toBeGreaterThan(boxes[0].y + 40);
    for (const b of boxes) expect(b.w).toBeLessThan(200);
  });

  test('other pages fit the phone without sideways scrolling', async ({ page }) => {
    for (const path of ['/login', '/compare-prices', '/mandi-weather', '/supplies/tester', '/escrow', '/support', '/tracking', '/test-pages/shell']) {
      await page.goto(path, { waitUntil: 'load' });
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), `${path} scrolls sideways`).toBeLessThanOrEqual(1);
    }
  });
});

test.describe('on a large screen', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('the three cards keep their full text, side by side', async ({ page }) => {
    await page.goto('/', { waitUntil: 'load' });
    const tools = page.getByLabel('KashRoot tools').locator('article');
    await expect(tools).toHaveCount(3);
    await expect(tools.first().locator('p')).toBeVisible();
    await expect(tools.first().getByRole('link', { name: 'How escrow payment works' })).toBeVisible();
    const ys = await tools.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().y));
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(3);
  });
});
