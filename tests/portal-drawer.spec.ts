/**
 * The menu a portal opens on a phone (every portal shares it): a slim panel on the left, light, with a soft rainbow, one pale
 * colour for each section: not a deep block of the portal's colour. The large screens keep the portal's deep sidebar. Uses the
 * portal-frame test page (made-up names only); needs a server started with KR_TEST_PAGES=1 (KR_BASE_URL says where).
 */
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

const axePath = join(process.cwd(), 'node_modules', 'axe-core', 'axe.min.js');

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

  test('the menu is a slim, light panel on the left with a colour for each section', async ({ page }) => {
    await page.goto('/test-pages/shell', { waitUntil: 'load' });
    await page.getByRole('button', { name: /^Menu/ }).first().click();
    const drawer = page.getByRole('dialog');
    await expect(drawer).toBeVisible();
    const box = (await drawer.boundingBox())!;
    expect(box.x, 'on the left').toBeLessThanOrEqual(1);
    expect(box.width, 'slim: the page stays visible beside it').toBeLessThanOrEqual(390 * 0.8);
    // Light, not a dark block.
    const [r, g, b] = (await drawer.evaluate((el) => getComputedStyle(el).backgroundColor)).match(/\d+/g)!.map(Number);
    expect(r + g + b, 'a light panel').toBeGreaterThan(690);
    // A rainbow: the sections wear different pale colours, and each row is at least 44 px to tap.
    const tabs = drawer.getByRole('tab');
    const count = await tabs.count();
    expect(count).toBeGreaterThanOrEqual(5);
    const hues = await drawer.locator('[data-hue]').evaluateAll((els) => els.map((e) => getComputedStyle(e).backgroundColor));
    expect(hues).toHaveLength(count);
    expect(new Set(hues).size, 'one colour for each section').toBe(count);
    for (let i = 0; i < count; i++) expect((await tabs.nth(i).boundingBox())!.height, `section ${i + 1} tap height`).toBeGreaterThanOrEqual(44);
    // Everything in it is readable (WCAG AA), and nothing runs sideways.
    await page.addScriptTag({ path: axePath });
    const bad = await page.evaluate(async () => {
      const axe = (window as unknown as { axe: { run: (c: unknown, o: unknown) => Promise<{ violations: { nodes: { target: string[]; any: { data?: { contrastRatio?: number } }[] }[] }[] }> } }).axe;
      const res = await axe.run('dialog', { runOnly: { type: 'rule', values: ['color-contrast'] } });
      return res.violations.flatMap((v) => v.nodes.map((n) => `${n.target.join(' ')} ${n.any[0]?.data?.contrastRatio ?? ''}`));
    });
    expect(bad, bad.join('\n')).toEqual([]);
    expect(await drawer.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
    // Choosing a section opens it and closes the panel; Escape closes it too.
    await drawer.getByRole('tab', { name: /Orders/ }).click();
    await expect(drawer).toHaveCount(0);
    await expect(page.getByRole('tab', { name: /Orders/ }).first()).toHaveAttribute('aria-selected', 'true');
    await page.getByRole('button', { name: /^Menu/ }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});

test.describe('on a large screen', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('the portal keeps its deep sidebar', async ({ page }) => {
    await page.goto('/test-pages/shell', { waitUntil: 'load' });
    const side = page.locator('aside').first();
    await expect(side).toBeVisible();
    const [r, g, b] = (await side.evaluate((el) => getComputedStyle(el).backgroundColor)).match(/\d+/g)!.map(Number);
    expect(r + g + b, 'the desktop sidebar is still the portal\'s deep colour').toBeLessThan(400);
    await expect(page.getByRole('button', { name: /^Menu/ })).toHaveCount(0);
  });
});
