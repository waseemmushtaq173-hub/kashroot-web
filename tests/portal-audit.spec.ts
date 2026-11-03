/**
 * Every public page and every portal's sign-in, signed out, at 390 px and 1280 px:
 *   - it opens (no server error) and has a page heading;
 *   - no script error on the page;
 *   - nothing scrolls sideways;
 *   - buttons and links you tap are 44 px tall or more (inline links inside text are left out);
 *   - images have alt text, inputs have a label.
 * Signed-in parts of the portals (dashboards, money steps) are covered by the database tests in
 * supabase/tests (what each account may see and do), since accounts cannot be made here without
 * the Cloudflare check. KR_BASE_URL says where the site runs. Screenshots: test-results/audit-*.png
 */
import { expect, test } from '@playwright/test';

import { PORTAL_IDS } from '@/lib/auth/roles';

const PAGES = ['/', '/login', '/register', '/support', '/privacy', '/terms', '/status', '/tracking', '/mandi-weather', '/compare-prices', '/official', '/forgot-password', '/offline', ...PORTAL_IDS.map((id) => `/login/${id}`)];

for (const width of [390, 1280]) {
  test.describe(`${width} px`, () => {
    test.use({ viewport: { width, height: 860 } });
    for (const path of PAGES) {
      test(`${path} opens cleanly`, async ({ page }) => {
        const errors: string[] = [];
        page.on('pageerror', (e) => errors.push(e.message));
        const res = await page.goto(path, { waitUntil: 'domcontentloaded' });
        expect(res?.status(), 'no server error').toBeLessThan(500);
        await page.waitForLoadState('load');
        await page.waitForTimeout(1200);
        await expect(page.locator('h1, h2').first()).toBeVisible();
        const report = await page.evaluate(() => {
          const shown = (el: Element) => {
            const r = el.getBoundingClientRect();
            const st = getComputedStyle(el);
            return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none';
          };
          const label = (el: Element) => (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
          // A link inside a sentence is a text link, not a tap target.
          const inText = (el: Element) => el.tagName === 'A' && !!el.closest('p, li, dd, td, label, figcaption') && getComputedStyle(el).display === 'inline';
          const small = [...document.querySelectorAll('button, a[href], [role="button"], select, input:not([type=hidden]):not([type=checkbox]):not([type=radio])')]
            // The bots' trap field (kr_website) is out of sight and out of the tab order: never tapped.
            .filter((el) => shown(el) && !inText(el) && !el.closest('iframe, [data-turnstile], .cf-turnstile') && !(el.tagName === 'INPUT' && el.getAttribute('tabindex') === '-1'))
            // Screen-reader-only controls (1 px) are not tapped.
            .filter((el) => el.getBoundingClientRect().width > 2 && el.getBoundingClientRect().height < 43.5)
            .map((el) => `${el.tagName.toLowerCase()} "${label(el)}" ${Math.round(el.getBoundingClientRect().height)}px`);
          const noAlt = [...document.querySelectorAll('img')].filter((i) => shown(i) && !i.hasAttribute('alt')).map((i) => i.getAttribute('src')?.slice(0, 60) ?? '');
          const unlabeled = [...document.querySelectorAll('input:not([type=hidden]), select, textarea')]
            .filter((el) => shown(el))
            .filter((el) => !el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby') && !el.closest('label') && !(el.id && document.querySelector(`label[for="${el.id}"]`)))
            .map((el) => `${el.tagName.toLowerCase()}[name=${el.getAttribute('name') ?? ''}]`);
          return { scrollX: document.documentElement.scrollWidth - document.documentElement.clientWidth, small, noAlt, unlabeled };
        });
        await page.screenshot({ path: `test-results/audit-${width}${path.replace(/\//g, '-') || '-home'}.png` });
        expect(errors, errors.join(' | ')).toHaveLength(0);
        expect(report.scrollX, 'no sideways scroll').toBeLessThanOrEqual(0);
        expect(report.small, 'tap targets under 44 px').toEqual([]);
        expect(report.noAlt, 'images without alt text').toEqual([]);
        expect(report.unlabeled, 'inputs without a label').toEqual([]);
      });
    }
  });
}
