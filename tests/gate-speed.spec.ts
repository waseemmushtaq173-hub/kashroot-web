/**
 * The security gate is quick and never stuck (components/security/SecurityGate):
 *  - with Cloudflare's test key (this computer, preview copies) the form opens
 *    within 5 s of the page on every portal's sign-in;
 *  - on the live site, where Cloudflare asks an automated browser to tap: while
 *    it waits for the tap there is no error and no Retry — only its own line;
 *  - KashRoot's gate answers within 5 s, and a refusal says "Security check
 *    failed: <reason>"; the form opens within about 1 s of "Success!";
 *  - a failing check: no spinner while it waits to try again, then "Couldn't
 *    confirm you're human", what to try in this browser, and Retry.
 * KR_BASE_URL says where the site runs. Screenshots: test-results/gate-speed-*.png
 */
import { expect, test } from '@playwright/test';

const LIVE = /^https:/.test(process.env.KR_BASE_URL ?? '');
const PORTALS = ['kissan', 'buyer', 'farmer', 'rental', 'admin'];
// One at a time: several browsers loading Cloudflare at once on one machine would time the machine, not the gate.
test.describe.configure({ mode: 'serial' });

for (const portal of PORTALS) {
  test(`/login/${portal}: the gate opens the form within 5 s`, async ({ page }) => {
    test.skip(LIVE, 'Live, Cloudflare asks an automated browser to tap; this runs where the test key passes by itself.');
    // The server's very first page load (compiling, a cold start) is not the gate's time.
    await page.request.get(`/login/${portal}`);
    await page.request.get('/api/gate');
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

test('after 2 failures a simpler way is offered, with help for this browser', async ({ page }) => {
  test.skip(LIVE, 'Blocks Cloudflare in this browser; run where the test key is used.');
  test.setTimeout(240_000);
  await page.route('https://challenges.cloudflare.com/**', (route) => route.abort('blockedbyclient'));
  await page.goto('/login/kissan');
  const alert = page.locator('[data-human-check="failed"] [role="alert"]');
  await expect(alert).toBeVisible({ timeout: 90_000 });
  // The spinner has stopped beside the failure.
  await expect(page.locator('[data-security-gate] .animate-spin')).toHaveCount(0);
  await expect(page.locator('[data-check-simple]')).toHaveCount(0);
  await alert.getByRole('button', { name: 'Retry' }).click();
  await expect(alert).toBeVisible({ timeout: 90_000 });
  const simple = page.locator('[data-check-simple]');
  await expect(simple).toBeVisible();
  expect((await simple.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await page.screenshot({ path: 'test-results/gate-speed-simpler-way.png' });
  // Unblocked, the simpler way draws Cloudflare's box again.
  await page.unroute('https://challenges.cloudflare.com/**');
  await simple.click();
  await expect.poll(() => page.frames().filter((f) => f.url().includes('challenges.cloudflare.com')).length, { timeout: 30_000 }).toBeGreaterThan(0);
});

test('the form opens within about 1 s of Cloudflare’s “Success!”', async ({ page }) => {
  test.skip(LIVE, 'Live, Cloudflare asks an automated browser to tap; this runs where the test key passes by itself.');
  await page.request.get('/api/gate');
  const lines: string[] = [];
  page.on('console', (m) => lines.push(m.text()));
  await page.goto('/login/buyer');
  await expect(page.locator('[data-security-gate]')).toHaveCount(0, { timeout: 15_000 });
  // "[KashRoot] security gate passed: form open 2.0 s after the page (Cloudflare 1.9 s, KashRoot's check 0.1 s)."
  await expect.poll(() => lines.find((l) => l.includes('security gate passed')), { timeout: 5_000 }).toBeTruthy();
  const m = lines.find((l) => l.includes('security gate passed'))!.match(/form open ([\d.]+) s .*Cloudflare ([\d.]+) s/)!;
  const afterSuccess = Number(m[1]) - Number(m[2]);
  console.log(`form open ${afterSuccess.toFixed(1)} s after "Success!"`);
  expect(afterSuccess).toBeLessThanOrEqual(1.2);
});

test('a failing check: no spinner while it tries again by itself, then the reason and what to try in this browser', async ({ page }) => {
  test.skip(LIVE, 'Blocks Cloudflare in this browser; run where the test key is used.');
  test.setTimeout(120_000);
  await page.route('https://challenges.cloudflare.com/**', (route) => route.abort('blockedbyclient'));
  await page.goto('/login/buyer');
  const gate = page.locator('[data-security-gate]');
  // Waiting between the automatic tries: it says so, and nothing spins.
  await expect(page.locator('[data-check-auto-try]')).toBeVisible({ timeout: 30_000 });
  await expect(gate.getByText('Trying the check again…')).toBeVisible();
  await expect(gate.locator('.animate-spin')).toHaveCount(0);
  // After the 3 tries: "Couldn't confirm", the steps for this browser, and Retry — still no spinner.
  const alert = page.locator('[data-human-check="failed"] [role="alert"]');
  await expect(alert).toBeVisible({ timeout: 60_000 });
  await expect(gate.getByText('Couldn’t confirm you’re human', { exact: true })).toBeVisible();
  await expect(gate.locator('.animate-spin')).toHaveCount(0);
  const help = alert.locator('[data-check-help] li');
  expect(await help.count()).toBeGreaterThanOrEqual(3);
  await expect(alert.locator('[data-check-help]')).toContainText('VPN');
  await expect(alert.locator('[data-check-help]')).toContainText('extensions');
  await page.screenshot({ path: 'test-results/gate-speed-failed-help.png', fullPage: true });
  // Retry draws a brand-new Cloudflare box.
  await page.unroute('https://challenges.cloudflare.com/**');
  await alert.getByRole('button', { name: 'Retry' }).click();
  await expect(gate).toHaveCount(0, { timeout: 30_000 });
});
