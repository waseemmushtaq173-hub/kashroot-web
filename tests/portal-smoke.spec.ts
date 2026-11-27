/**
 * Every public page and every portal's door, signed out, at 390 px and 1280 px:
 * it answers (no server error), no script throws, and the page shows a
 * visible heading. Signed-out dashboards must send the visitor to sign in,
 * never to an error. The tracking portal is open to everyone (a consignment
 * is looked up by its code); the Admin pages go to /team/unlock, which shows
 * nothing at all to people outside the team.
 * KR_BASE_URL says where the site runs.
 */
import { expect, test } from '@playwright/test';

import { PORTAL_IDS } from '@/lib/auth/roles';

const PUBLIC = ['/', '/login', '/register', '/support', '/privacy', '/terms', '/refunds', '/delivery', '/status', '/tracking', '/mandi-weather', '/compare-prices', '/compare-prices?tab=universal', '/escrow', '/official', '/vehicle', '/contributions', '/forgot-password', '/offline', '/studio', '/tracking/dashboard', ...PORTAL_IDS.map((id) => `/login/${id}`)];
const DASHBOARDS = ['/farmer/dashboard', '/buyer/dashboard', '/kissan-tools/dashboard', '/rental/dashboard', '/dealer/dashboard', '/expert', '/trader/dashboard', '/admin/dashboard', '/hub/dashboard', '/business/dashboard', '/farmer/orchard-health', '/farmer/season-planner'];

for (const width of [390, 1280]) {
  test.describe(`${width} px`, () => {
    test.use({ viewport: { width, height: 860 } });
    for (const path of [...PUBLIC, ...DASHBOARDS]) {
      test(`${path} opens without an error`, async ({ page }) => {
        const errors: string[] = [];
        page.on('pageerror', (e) => errors.push(e.message));
        const res = await page.goto(path, { waitUntil: 'domcontentloaded' });
        await page.waitForLoadState('load');
        await page.waitForTimeout(1500);
        const status = res?.status() ?? 0;
        expect(status, 'no server error').toBeLessThan(500);
        expect(errors, errors.join(' | ')).toHaveLength(0);
        // Any heading a visitor can see (the first in the page may belong to a closed menu).
        if (path.startsWith('/admin') || path.startsWith('/hub')) return expect(page.url(), 'Admin and Hub pages need the team pass').toContain('/team/unlock');
        await expect(page.locator('h1:visible, h2:visible').first()).toBeVisible();
        if (DASHBOARDS.includes(path)) expect(page.url(), 'a signed-out dashboard goes to sign-in').toMatch(/\/(login|register)/);
      });
    }
  });
}
