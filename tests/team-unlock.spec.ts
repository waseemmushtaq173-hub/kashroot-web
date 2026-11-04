/**
 * The way into Admin (app/team/unlock): after the unlock it goes only to an Admin or team page of
 * this site — never another address, never the unlock page again (no loop). And with KR_BASE_URL:
 * the unlock page and every "page not found" are readable (dark text on a light card), signed out.
 */
import { expect, test } from '@playwright/test';

import { safeTeamNext } from '@/lib/teamNext';

test('the next page is only an Admin or team page of this site', () => {
  for (const ok of ['/admin/dashboard', '/admin', '/admin?tab=team', '/team/members']) expect(safeTeamNext(ok)).toBe(ok);
  for (const bad of [null, '', 'https://evil.example/admin', '//evil.example/admin', '/\evil.example', '/login/admin', '/team/unlock', '/team/unlock?next=/admin', '/administrator', '/admin\n/x', 'javascript:alert(1)']) {
    expect(safeTeamNext(bad), String(bad)).toBe('/admin/dashboard');
  }
});

for (const path of ['/team/unlock?next=%2Fadmin%2Fdashboard', '/no-such-page-here']) {
  test(`${path}: readable on a light card, signed out`, async ({ page }) => {
    test.skip(!process.env.KR_BASE_URL, 'needs a running site (KR_BASE_URL)');
    await page.emulateMedia({ colorScheme: 'dark' });
    const res = await page.goto(path);
    if (path.startsWith('/no-such')) expect(res?.status()).toBe(404);
    const text = path.startsWith('/team') ? page.getByText('Please sign in first.') : page.getByRole('heading', { name: 'Page not found' });
    await expect(text).toBeVisible({ timeout: 15_000 });
    const [fg, bg] = await text.evaluate((el) => {
      let box: Element | null = el;
      let bg = 'rgba(0, 0, 0, 0)';
      while (box && /rgba\(0, 0, 0, 0\)|transparent/.test(bg)) {
        bg = getComputedStyle(box).backgroundColor;
        box = box.parentElement;
      }
      return [getComputedStyle(el).color, bg];
    });
    const lum = (c: string) => {
      const [r, g, b] = (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number).map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const ratio = (Math.max(lum(fg), lum(bg)) + 0.05) / (Math.min(lum(fg), lum(bg)) + 0.05);
    expect(ratio, `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
  });
}
