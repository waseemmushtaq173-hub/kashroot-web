/**
 * The portal frame's dashboard look (src/app/test-pages/shell, made-up names only):
 *   - the sidebar greeting ("Hi, Name 👋") with the person's initials;
 *   - the stat cards lift 5 px under the pointer;
 *   - the sections stay where they were: as buttons at the top of the page on a phone (no bar at the bottom), in the sidebar on a large screen;
 *   - the expert conversation as chat bubbles, and one-tap replies that fill the box without sending.
 * Needs the server started with KR_TEST_PAGES=1. KR_BASE_URL says where it runs.
 */
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

import { addQuickReply, quickRepliesFor } from '@/components/advisory/quickReplies';

const axePath = join(process.cwd(), 'node_modules', 'axe-core', 'axe.min.js');

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

  test('the sections are buttons at the top of the page, as before, and nothing floats at the bottom', async ({ page }) => {
    await page.goto('/test-pages/shell', { waitUntil: 'load' });
    // No bottom bar in the page at all, and nothing fixed to the bottom of the screen but what was there before.
    await expect(page.locator('[data-kr-dock]')).toHaveCount(0);
    const tabs = page.getByRole('tab');
    await expect(tabs.first()).toBeVisible();
    const top = (await tabs.first().boundingBox())!;
    const view = await page.evaluate(() => ({ h: document.documentElement.clientHeight, w: window.innerWidth }));
    expect(top.y, 'near the top of the page, below the heading, not at the bottom of the screen').toBeLessThan(view.h / 2);
    // Opening one still works.
    await page.getByRole('tab', { name: /Orders/ }).tap();
    await expect(page.getByRole('tab', { name: /Orders/ })).toHaveAttribute('aria-selected', 'true');
    // The page leaves no room at the bottom for a bar that is not there.
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--kr-dock-h'))).toBe('');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(view.w);
  });

  test('the greeting and the chat have readable colours', async ({ page }) => {
    await page.goto('/test-pages/shell', { waitUntil: 'load' });
    await page.addScriptTag({ path: axePath });
    const bad = await page.evaluate(async () => {
      const axe = (window as unknown as { axe: { run: (c: unknown, o: unknown) => Promise<{ violations: { nodes: { target: string[]; any: { data?: { contrastRatio?: number } }[] }[] }[] }> } }).axe;
      const r = await axe.run('[aria-label="Sample conversation"], [aria-label="Sidebar greeting"]', { runOnly: { type: 'rule', values: ['color-contrast'] } });
      return r.violations.flatMap((v) => v.nodes.map((n) => `${n.target.join(' ')} ${n.any[0]?.data?.contrastRatio ?? ''}`));
    });
    expect(bad, bad.join('\n')).toEqual([]);
  });
});

test.describe('large screen', () => {
  test.use({ viewport: { width: 1280, height: 860 } });

  test('the sections are in the sidebar, as before', async ({ page }) => {
    await page.goto('/test-pages/shell', { waitUntil: 'load' });
    await expect(page.locator('[data-kr-dock]')).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'Overview' })).toBeVisible();
  });

  test('the sidebar greeting says hi with the first name and the initials', async ({ page }) => {
    await page.goto('/test-pages/shell', { waitUntil: 'load' });
    const greeting = page.getByLabel('Sidebar greeting');
    await expect(greeting).toContainText('Hi, Sample');
    await expect(greeting).toContainText('SG');
  });

  test('a whole first name shows in the greeting, even a long one: it wraps, it is never cut to "…"', async ({ page }) => {
    await page.goto('/test-pages/shell', { waitUntil: 'load' });
    const names = page.getByLabel('Longer names in the sidebar').locator('[data-kr-greeting]');
    await expect(names).toHaveCount(2);
    for (const [i, first] of ['Waseem', 'Mohammadabdulrahman'].entries()) {
      const hi = names.nth(i).locator('span.font-bold').last();
      await expect(hi).toContainText(`Hi, ${first}`);
      const fit = await hi.evaluate((el) => ({ cut: el.scrollWidth > el.clientWidth + 1, ellipsis: getComputedStyle(el).textOverflow === 'ellipsis', width: el.getBoundingClientRect().width }));
      expect(fit.cut, `${first} is wider than its room`).toBe(false);
      expect(fit.ellipsis).toBe(false);
      // The card keeps its own width: nothing pushes out past the sidebar.
      const card = (await names.nth(i).boundingBox())!;
      const sidebar = (await page.getByLabel('Longer names in the sidebar').boundingBox())!;
      expect(card.x + card.width).toBeLessThanOrEqual(sidebar.x + sidebar.width + 1);
    }
  });

  test('a stat card lifts 5 px under the pointer', async ({ page }) => {
    await page.goto('/test-pages/shell', { waitUntil: 'load' });
    const card = page.locator('.kr-kpi').nth(1);
    const at = async () => (await card.boundingBox())!.y;
    const before = await at();
    await card.hover();
    await expect.poll(at, { timeout: 2000 }).toBeCloseTo(before - 5, 0);
    await page.mouse.move(2, 2);
    await expect.poll(at, { timeout: 2000 }).toBeCloseTo(before, 0);
  });

  test('the conversation shows as bubbles: own messages on the right, others on the left', async ({ page }) => {
    await page.goto('/test-pages/shell', { waitUntil: 'load' });
    const chat = page.getByLabel('Sample conversation');
    const mine = chat.getByText('My apple leaves have dark spots.');
    const theirs = chat.getByText('Please tell me since when this is happening.');
    const m = (await mine.boundingBox())!;
    const t = (await theirs.boundingBox())!;
    expect(m.x, 'own message further right').toBeGreaterThan(t.x);
    await expect(chat.getByRole('button', { name: /Listen/ })).toHaveCount(1);
  });
});

test.describe('one-tap replies', () => {
  test('the farmer gets replies in the language of the question; Kashmiri readers get the Urdu lines', () => {
    expect(quickRepliesFor(false, 'en')[0]).toBe('Thank you 🙏');
    expect(quickRepliesFor(false, 'hi')[0]).toBe('धन्यवाद 🙏');
    expect(quickRepliesFor(false, 'ur')[0]).toBe('شکریہ 🙏');
    expect(quickRepliesFor(false, 'ks')).toEqual(quickRepliesFor(false, 'ur'));
    for (const lang of ['en', 'hi', 'ur', 'ks'] as const) expect(quickRepliesFor(false, lang)).toHaveLength(4);
  });

  test('the expert gets questions to ask, never advice, doses or products', () => {
    const lines = quickRepliesFor(true, 'en');
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) {
      expect(l.endsWith('?'), l).toBe(true);
      expect(l.toLowerCase(), l).not.toMatch(/spray (with|it)|dose|apply|\b(mg|ml|kg)\b|fungicide|pesticide/);
    }
  });

  test('a reply is added under what is already written, never over it', () => {
    expect(addQuickReply('', 'Thank you 🙏')).toBe('Thank you 🙏');
    expect(addQuickReply('The spots are on the old leaves.', 'Please call me')).toBe('The spots are on the old leaves.\nPlease call me');
    expect(addQuickReply('Already typed  \n', 'Please call me')).toBe('Already typed\nPlease call me');
  });
});
