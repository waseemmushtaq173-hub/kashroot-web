/**
 * The portal frame's dashboard look (src/app/test-pages/shell, made-up names only):
 *   - the sidebar greeting ("Hi, Name 👋") with the person's initials;
 *   - the stat cards lift 5 px under the pointer;
 *   - on a phone (page laid out 800 px wide, shown at half size) the sections float in a bar at the bottom, clear of the
 *     round microphone button and the page edge, with every section tappable, nothing scrolling sideways, and the page
 *     given room so the bar never hides its end; on a large screen there is no bar (the sidebar has the sections);
 *   - the expert conversation as chat bubbles, and one-tap replies that fill the box without sending.
 * Needs the server started with KR_TEST_PAGES=1. KR_BASE_URL says where it runs.
 */
import { join } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { addQuickReply, quickRepliesFor } from '@/components/advisory/quickReplies';

const axePath = join(process.cwd(), 'node_modules', 'axe-core', 'axe.min.js');

/** The router follows pushState: the test page now believes it is in the Farmer portal, so the real microphone button shows too. */
async function asFarmerPortal(page: Page) {
  await page.goto('/test-pages/shell', { waitUntil: 'load' });
  // Tried again until the page has started up (the router only follows pushState once it has).
  await expect(async () => {
    await page.evaluate(() => window.history.pushState(null, '', '/farmer/dashboard'));
    await expect(page.getByRole('button', { name: /help on this page/i })).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 20_000 });
}

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

  test('the sections float at the bottom, clear of the microphone, and every one can be tapped', async ({ page }) => {
    await asFarmerPortal(page);
    const dock = page.locator('[data-kr-dock]');
    await expect(dock).toBeVisible();
    // The page is laid out 800 px wide and shown shrunk: the bar is grown back, so it is phone-sized (about 60 px high on the screen).
    const box = (await dock.boundingBox())!;
    const mic = (await page.getByRole('button', { name: /help on this page/i }).boundingBox())!;
    const view = await page.evaluate(() => ({ w: window.innerWidth, h: document.documentElement.clientHeight, scale: window.visualViewport!.scale }));
    expect(view.scale, 'the phone shows the 800 px page at about half size').toBeLessThan(0.6);
    expect(box.height * view.scale, 'tall enough for a thumb').toBeGreaterThan(55);
    expect(box.y + box.height, 'inside the screen, above its bottom edge').toBeLessThanOrEqual(view.h);
    expect(box.x + box.width, 'no overlap with the microphone').toBeLessThan(mic.x);
    // Section buttons sit in a row you can scroll; the first ones are on screen at once.
    const tabs = dock.getByRole('tab');
    await expect(tabs).toHaveCount(5);
    for (const t of await tabs.all()) expect((await t.boundingBox())!.height * view.scale, 'a tap target of 44 px or more').toBeGreaterThanOrEqual(44);
    // The sections at the top of the page are replaced by the bar, not shown twice.
    await expect(page.getByRole('tab', { name: 'Overview' })).toHaveCount(1);
    // Tapping a section opens it, and it becomes the white pill.
    await dock.getByRole('tab', { name: /Orders/ }).tap();
    await expect(dock.getByRole('tab', { name: /Orders/ })).toHaveAttribute('aria-selected', 'true');
    await expect(dock.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'false');
    // Reached by scrolling the bar sideways.
    await dock.getByRole('tab', { name: 'Payments' }).scrollIntoViewIfNeeded();
    await dock.getByRole('tab', { name: 'Payments' }).tap();
    await expect(dock.getByRole('tab', { name: 'Payments' })).toHaveAttribute('aria-selected', 'true');
    // Nothing makes the page wider than the phone.
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(view.w);
  });

  test('the page tells how much room the bar takes (so the end of the page is not hidden behind it)', async ({ page }) => {
    await asFarmerPortal(page);
    const room = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--kr-dock-h')));
    const dock = (await page.locator('[data-kr-dock]').boundingBox())!;
    const h = await page.evaluate(() => document.documentElement.clientHeight);
    expect(room).toBeGreaterThanOrEqual(h - dock.y - 2);
    // A large screen has no bar and takes no room (see below); here the variable is also cleared when the bar goes.
  });

  test('the bar, the greeting and the chat have readable colours', async ({ page }) => {
    await asFarmerPortal(page);
    await page.addScriptTag({ path: axePath });
    const bad = await page.evaluate(async () => {
      const axe = (window as unknown as { axe: { run: (c: unknown, o: unknown) => Promise<{ violations: { nodes: { target: string[]; any: { data?: { contrastRatio?: number } }[] }[] }[] }> } }).axe;
      const r = await axe.run('[data-kr-dock], [aria-label="Sample conversation"], [aria-label="Sidebar greeting"]', { runOnly: { type: 'rule', values: ['color-contrast'] } });
      return r.violations.flatMap((v) => v.nodes.map((n) => `${n.target.join(' ')} ${n.any[0]?.data?.contrastRatio ?? ''}`));
    });
    expect(bad, bad.join('\n')).toEqual([]);
  });
});

test.describe('large screen', () => {
  test.use({ viewport: { width: 1280, height: 860 } });

  test('no bottom bar (the sidebar has the sections) and no room kept for it', async ({ page }) => {
    await page.goto('/test-pages/shell', { waitUntil: 'load' });
    await expect(page.locator('[data-kr-dock]')).toBeHidden();
    await expect(page.getByRole('tab', { name: 'Overview' })).toBeVisible();
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--kr-dock-h'))).toBe('');
  });

  test('the sidebar greeting says hi with the first name and the initials', async ({ page }) => {
    await page.goto('/test-pages/shell', { waitUntil: 'load' });
    const greeting = page.getByLabel('Sidebar greeting');
    await expect(greeting).toContainText('Hi, Sample');
    await expect(greeting).toContainText('SG');
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
