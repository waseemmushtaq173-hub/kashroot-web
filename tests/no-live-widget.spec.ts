/**
 * Against the live site the test browser cannot reach hCaptcha (playwright.config.ts):
 * automated tests never run the live widget. KR_BASE_URL says where the site runs.
 */
import { expect, test } from '@playwright/test';

test('on the live site, the test browser cannot load hCaptcha', async ({ page }) => {
  test.skip(!/^https:/.test(process.env.KR_BASE_URL ?? ''), 'Only against the live site.');
  const loaded: string[] = [];
  page.on('requestfinished', (r) => r.url().includes('hcaptcha.com') && loaded.push(r.url()));
  await page.goto('/login/buyer');
  await page.waitForTimeout(5_000);
  expect(loaded, 'no hCaptcha file was loaded').toEqual([]);
});
