/**
 * The security gate is quick and never stuck (components/security/SecurityGate):
 *  - with Cloudflare's test key (this computer, preview copies) the form opens
 *    within 5 s of the page on every portal's sign-in;
 *  - on the live site, where Cloudflare asks an automated browser to tap: while
 *    it waits for the tap there is no error and no Retry — only its own line;
 *  - KashRoot's gate answers within 5 s, and a refusal says "Security check
 *    failed: <reason>".
 * KR_BASE_URL says where the site runs. Screenshots: test-results/gate-speed-*.png
 */
import { expect, test } from '@playwright/test';

const LIVE = /^https:/.test(process.env.KR_BASE_URL ?? '');
const PORTALS = ['kissan', 'buyer', 'farmer', 'rental', 'admin'];

for (const portal of PORTALS) {
  test(`/login/${portal}: the gate opens the form within 5 s`, async ({ page }) => {
    test.skip(LIVE, 'Live, Cloudflare asks an automated browser to tap; this runs where the test key passes by itself.');
    const begun = Date.now();
    await page.goto(`/login/${portal}`);
    await expect(page.locator('[data-security-gate]')).toHaveCount(0, { timeout: 5_000 });
    await expect(page.locator('form input:not([type=hidden])').first()).toBeVisible({ timeout: 5_000 - (Date.now() - begun) });
    const took = Date.now() - begun;
    console.log(`/login/${portal}: form open after ${(took / 1000).toFixed(1)} s`);
    expect(took).toBeLessThan(5_000);
    await page.screenshot({ path: `test-results/gate-speed-${portal}.png` });
  });
}

test('live: while Cloudflare waits for a tap, no error and no Retry', async ({ page }) => {
  test.skip(!LIVE, 'Only on the live site.');
  test.setTimeout(60_000);
  await page.goto('/login/kissan');
  // Wait until Cloudflare asks for a tap (it does for an automated browser), or 30 s.
  await page.locator('[data-human-check="interactive"]').waitFor({ timeout: 30_000 }).catch(() => undefined);
  if ((await page.locator('[data-human-check="interactive"]').count()) === 0) test.skip(true, 'Cloudflare did not ask this browser to tap this time.');
  // Give the old 8-second timer every chance to fire: nothing but Cloudflare's own line.
  await page.waitForTimeout(12_000);
  await expect(page.locator('[data-human-check="interactive"]')).toBeVisible();
  await expect(page.getByText('One quick check: tap the box below')).toBeVisible();
  await expect(page.locator('[data-security-gate] [role="alert"]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Retry' })).toHaveCount(0);
  await page.screenshot({ path: 'test-results/gate-speed-waiting-for-tap.png' });
});

test('KashRoot’s gate answers within 5 s, and a refusal says why', async ({ request }) => {
  const t0 = Date.now();
  const got = await request.get('/api/gate');
  expect(got.ok()).toBe(true);
  expect(Date.now() - t0).toBeLessThan(5_000);
  test.skip(!LIVE, 'Locally the test secret passes any token.');
  const t1 = Date.now();
  const refused = await request.post('/api/gate', { data: { token: 'XXXX.fake', place: 'kissan' } });
  expect(Date.now() - t1).toBeLessThan(5_000);
  expect(refused.status()).toBe(403);
  expect(((await refused.json()) as { error: string }).error).toMatch(/^Security check failed: .+/);
});
