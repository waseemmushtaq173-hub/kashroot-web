/**
 * The public top bar has no Produce / Supplies / Compare links, and has Help &
 * support next to Sign in (on phones too, down to 320 px; 44 px or more; also
 * in every portal's and every sign-in page's top bar). KashRoot's support
 * email and official contacts are only on the Help & support page. The
 * footer holds only the brand, © and the social pages. Each portal tab those
 * links used to open is still reached (signed out: that portal's sign-in,
 * which returns to the tab); the old /compare-prices?category= links still
 * open, with a clear choice; /compare-prices is still Price Comparison.
 * KR_BASE_URL says where the site runs. Screenshots: test-results/header-*.png
 */
import { expect, test } from '@playwright/test';

const PORTAL_TABS = [
  { label: 'Buy produce', href: '/buyer/dashboard?tab=shop', login: '/login/buyer' },
  { label: 'Sell your harvest', href: '/farmer/dashboard?tab=lots', login: '/login/farmer' },
  { label: 'Farm supplies', href: '/kissan-tools/dashboard?tab=shop', login: '/login/kissan' },
];

for (const width of [1280, 390, 360]) {
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

    test('Help & support is in the top bar, 44 px or more, and opens Help & support', async ({ page }) => {
      for (const path of ['/', '/login', '/login/buyer', '/forgot-password', '/tracking/dashboard']) {
        await page.goto(path);
        const help = page.getByRole('link', { name: 'Help & support' }).first();
        await expect(help).toBeVisible();
        expect((await help.boundingBox())!.height, `${path}: 44 px or taller`).toBeGreaterThanOrEqual(44);
      }
      await page.goto('/');
      await page.locator('header').first().screenshot({ path: `test-results/header-help-${width}.png` });
      await page.getByRole('link', { name: 'Help & support' }).first().click();
      await page.waitForURL((u) => u.pathname === '/support');
    });

    test('on the home page, Help & support sits next to Sign in', async ({ page }) => {
      await page.goto('/');
      const bar = page.locator('nav[aria-label="Primary"]');
      const help = (await bar.locator('[data-help-button]').boundingBox())!;
      const sign = bar.locator('[data-signin-link]');
      await expect(sign).toBeVisible();
      const s = (await sign.boundingBox())!;
      expect(s.height).toBeGreaterThanOrEqual(44);
      expect(Math.abs(s.y - help.y), 'on the same line').toBeLessThan(4);
      expect(s.x - (help.x + help.width), 'right beside it').toBeLessThan(16);
    });

    test('the support email is only on the Help & support page', async ({ page }) => {
      for (const path of ['/', '/login', '/login/buyer', '/mandi-weather', '/privacy', '/terms']) {
        await page.goto(path);
        await expect(page.locator('body'), path).not.toContainText('kashrootsupport@gmail.com');
      }
      await page.goto('/support');
      await expect(page.locator('body')).toContainText('kashrootsupport@gmail.com');
    });

    test('the footer holds only the brand, © and the social pages', async ({ page }) => {
      await page.goto('/');
      const footer = page.locator('footer').last();
      // Besides the brand, only the three social pages, shown as their logos (components/layout/SocialIcons).
      const names = await footer.getByRole('link').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? e.textContent?.trim() ?? ''));
      expect(names.filter((n) => !/^KashRoot$/i.test(n)).sort()).toEqual(['KashRoot on Facebook', 'KashRoot on Instagram', 'KashRoot on LinkedIn']);
      await expect(footer).toContainText('© 2026 KashRoot Pvt Ltd');
      await expect(footer).not.toContainText('@');
      for (const name of ['Instagram', 'Facebook', 'LinkedIn']) {
        const link = footer.getByRole('link', { name: `KashRoot on ${name}` });
        const box = (await link.boundingBox())!;
        expect(box.height, `${name}: 44 px to tap`).toBeGreaterThanOrEqual(44);
        expect(box.width, `${name}: 44 px to tap`).toBeGreaterThanOrEqual(44);
        await expect(link).toHaveAttribute('title', `KashRoot on ${name}`);
        await expect(link).toHaveAttribute('target', '_blank');
        await expect(link).toHaveAttribute('rel', 'noopener noreferrer me');
        await expect(link.locator('svg')).toHaveAttribute('aria-hidden', 'true');
      }
      const scrollX = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(scrollX).toBeLessThanOrEqual(0);
      await footer.screenshot({ path: `test-results/footer-${width}.png` });
    });

    test('the portal tabs the old footer links opened still open, through their own sign-in', async ({ page }) => {
      for (const p of PORTAL_TABS) {
        await page.goto(p.href);
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
