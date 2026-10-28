/**
 * The public top bar has no Produce / Supplies / Compare links; each former
 * link now opens its portal's tab (signed out: that portal's sign-in, which
 * returns to the tab); the old /compare-prices?category= links still open, with
 * a clear choice; /compare-prices is still Price Comparison.
 * KR_BASE_URL says where the site runs. Screenshots: test-results/header-*.png
 */
import { expect, test } from '@playwright/test';

const PORTAL_TABS = [
  { label: 'Buy produce', href: '/buyer/dashboard?tab=shop', login: '/login/buyer' },
  { label: 'Sell your harvest', href: '/farmer/dashboard?tab=lots', login: '/login/farmer' },
  { label: 'Farm supplies', href: '/kissan-tools/dashboard?tab=shop', login: '/login/kissan' },
];

for (const width of [1280, 390]) {
  test.describe(`${width} px`, () => {
    test.use({ viewport: { width, height: 800 } });

    test('the top bar has no Produce, Supplies or Compare links', async ({ page }) => {
      await page.goto('/');
      const bar = page.locator('nav[aria-label="Primary"]');
      for (const name of ['Produce', 'Supplies', 'Compare']) await expect(bar.getByRole('link', { name, exact: true })).toHaveCount(0);
      await expect(bar.getByRole('link', { name: /KashRoot/ }).first()).toBeVisible();
      await page.locator('header').first().screenshot({ path: `test-results/header-after-${width}.png` });
      const scrollX = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(scrollX).toBeLessThanOrEqual(0);
    });

    test('footer links open each portal’s tab, through its own sign-in when signed out', async ({ page }) => {
      for (const p of PORTAL_TABS) {
        await page.goto('/');
        const link = page.locator('footer').getByRole('link', { name: p.label, exact: true });
        await expect(link).toHaveAttribute('href', p.href);
        const box = await link.boundingBox();
        expect(box!.height, `${p.label} is 44 px or taller`).toBeGreaterThanOrEqual(44);
        await link.click();
        // Signed out: that portal's own sign-in, carrying the very tab to come back to.
        await page.waitForURL((u) => u.pathname === p.login, { timeout: 30_000 });
        expect(new URL(page.url()).searchParams.get('next')).toBe(p.href);
      }
    });

    test('old produce / supplies links still open, with a clear choice', async ({ page }) => {
      for (const cat of ['produce', 'supplies']) {
        await page.goto(`/compare-prices?category=${cat}`);
        const choice = page.getByRole('navigation', { name: 'Where to buy and sell' });
        await expect(choice).toBeVisible();
        for (const p of PORTAL_TABS) await expect(choice.getByRole('link', { name: new RegExp(p.label) })).toHaveAttribute('href', p.href);
        // Price Comparison itself is still there, under the choice.
        await expect(page.getByRole('tab', { name: 'Compare prices' })).toBeVisible();
      }
      await page.goto('/compare-prices?category=produce');
      await page.screenshot({ path: `test-results/old-produce-link-${width}.png` });
    });

    test('/compare-prices is still Price Comparison', async ({ page }) => {
      await page.goto('/compare-prices');
      await expect(page.getByRole('tab', { name: 'Compare prices' })).toBeVisible();
      await expect(page.getByRole('navigation', { name: 'Where to buy and sell' })).toHaveCount(0);
    });

    test('old supplies pages go to the Kissan Tools shop', async ({ page }) => {
      await page.goto('/supplies');
      await page.waitForURL((u) => u.pathname === '/login/kissan' || u.pathname === '/kissan-tools/dashboard', { timeout: 30_000 });
      const u = new URL(page.url());
      expect(u.pathname === '/kissan-tools/dashboard' ? u.search : u.searchParams.get('next')).toContain('tab=shop');
    });
  });
}
