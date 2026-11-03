/**
 * The security check (components/security/HumanCheck) on every form that
 * uses it: a token is fetched in the background, the submit button is never
 * held back by the check, and when Cloudflare's script cannot load (Brave
 * Shields, an ad blocker) a plain message with a Retry button follows the
 * automatic retries. On the live site: the page never uses Cloudflare's test
 * key, and fake tokens are refused. KR_BASE_URL says where the site runs
 * (a local build made with the test key, or the live site). With
 * KR_CAPTCHA_ON=1, Supabase's CAPTCHA is checked to refuse a fake token too.
 * Screenshots: test-results/human-check-*.png
 */
import { expect, test, type Page } from '@playwright/test';

const FORMS: { path: string; button: RegExp }[] = [
  { path: '/login/buyer', button: /Sign in to Buyer/ },
  { path: '/login/farmer', button: /Sign in to Farmer/ },
  { path: '/login/rental', button: /Sign in to/ },
  { path: '/register/farmer', button: /Create account/ },
  { path: '/forgot-password', button: /Send reset link/ },
  { path: '/support', button: /Send to KashRoot/ },
];
const LIVE = /^https:/.test(process.env.KR_BASE_URL ?? '');
const TEST_KEY = '1x00000000000000000000AA';

async function checkIsOn(page: Page): Promise<boolean> {
  const res = await page.request.get('/api/human');
  return Boolean(((await res.json()) as { on?: boolean }).on);
}
const cloudflareFrames = (page: Page) => page.frames().filter((f) => f.url().includes('challenges.cloudflare.com'));

for (const width of [1280, 390]) {
  test.describe(`${width} px`, () => {
    test.use({ viewport: { width, height: 900 } });

    for (const { path, button } of FORMS) {
      test(`${path}: the security gate first, then the form, with its own fresh check`, async ({ page }) => {
        test.skip(!(await checkIsOn(page)), 'The check is off on this server.');
        await page.goto(path);
        // The gate shows first; the form is not there yet.
        await expect(page.locator('[data-security-gate]')).toBeVisible();
        await expect.poll(() => cloudflareFrames(page).length, { timeout: 30_000 }).toBeGreaterThan(0);
        await expect(page.getByText(/complete the .I am human. check/i)).toHaveCount(0);
        await page.screenshot({ path: `test-results/gate${path.replace(/\//g, '-')}-${width}.png` });
        // Locally (test key) the gate passes by itself; on the live site Cloudflare may ask an automated browser to tap.
        if (LIVE) return;
        await expect(page.locator('[data-security-gate]')).toHaveCount(0, { timeout: 30_000 });
        const submit = page.getByRole('button', { name: button }).first();
        await expect(submit).toBeVisible();
        if (!path.startsWith('/register')) await expect(submit).toBeEnabled();
        // The form's own check then fetches a separate token for Supabase.
        await expect(page.locator('[data-human-check="ready"]').first()).toBeAttached({ timeout: 30_000 });
        // The first field has the focus.
        expect(await page.evaluate(() => document.activeElement?.tagName)).toMatch(/INPUT|TEXTAREA|SELECT/);
        await page.screenshot({ path: `test-results/human-check${path.replace(/\//g, '-')}-${width}.png` });
      });
    }

    test('blocked by Shields or an ad blocker: retried, then a plain message and Retry', async ({ page }) => {
      test.setTimeout(90_000);
      test.skip(!(await checkIsOn(page)), 'The check is off on this server.');
      await page.route('https://challenges.cloudflare.com/**', (route) => route.abort('blockedbyclient'));
      await page.goto('/login/buyer');
      // 3 automatic tries (2, 5 and 10 s apart) first.
      const alert = page.locator('[data-human-check="failed"] [role="alert"]');
      await expect(alert).toContainText('couldn’t load', { timeout: 45_000 });
      await expect(alert).toContainText('Brave Shields / ad-block');
      const retry = alert.getByRole('button', { name: 'Retry' });
      expect((await retry.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      // The gate stays, with the reason — the form never shows without it, and nothing is dead.
      await expect(page.locator('[data-security-gate]')).toBeVisible();
      await expect(page.getByRole('button', { name: /Sign in to Buyer/ })).toHaveCount(0);
      await page.screenshot({ path: `test-results/human-check-blocked-${width}.png` });
      // Unblocked again, Retry brings the check back.
      await page.unroute('https://challenges.cloudflare.com/**');
      await retry.click();
      await expect.poll(() => cloudflareFrames(page).length, { timeout: 30_000 }).toBeGreaterThan(0);
    });
  });
}

test('the live site never uses Cloudflare’s test key', async ({ page }) => {
  test.skip(!LIVE, 'Only on the live site.');
  const said: string[] = [];
  page.on('console', (m) => m.text().includes('[KashRoot] security check') && said.push(m.text()));
  for (const path of ['/login/buyer', '/login/farmer', '/login/rental']) {
    await page.goto(path);
    await expect.poll(() => cloudflareFrames(page).length, { timeout: 30_000 }).toBeGreaterThan(0);
    const urls = cloudflareFrames(page).map((f) => f.url());
    expect(urls.some((u) => u.includes(TEST_KEY)), `${path} loaded the test key`).toBe(false);
    expect(urls.some((u) => /\/0x4[\w-]+\//.test(u)), `${path} loaded the real key`).toBe(true);
    await expect(page.getByText('For testing only')).toHaveCount(0);
  }
  expect(said.join('\n')).toContain('real key');
});

test('a fake token is refused by KashRoot’s server', async ({ request }) => {
  const on = Boolean(((await (await request.get('/api/human')).json()) as { on?: boolean }).on);
  test.skip(!on, 'The check is off on this server.');
  // On this computer the server may use Cloudflare's test secret, which passes any token.
  test.skip(!LIVE, 'Only meaningful on the live site.');
  expect((await request.post('/api/human', { data: { token: 'fake' } })).status()).toBe(403);
  expect((await request.post('/api/otp/send', { data: { channel: 'email', to: 'nobody@example.invalid', human: 'fake' } })).status()).toBe(403);
  const diagnosis = await (await request.post('/api/human', { data: { diagnose: 'fake' } })).json();
  expect(diagnosis.success).toBe(false);
  expect(diagnosis.codes).toContain('invalid-input-response'); // the secret itself is valid
});

test('with Supabase CAPTCHA on, a sign-in with no token or a fake token is refused', async ({ page }) => {
  test.skip(process.env.KR_CAPTCHA_ON !== '1', 'Set KR_CAPTCHA_ON=1 once CAPTCHA is on in Supabase.');
  // The public anon key every visitor's browser has, from the page's own scripts.
  let apikey = '';
  page.on('response', async (r) => {
    if (apikey || !/\.js(\?|$)/.test(r.url())) return;
    const m = (await r.text().catch(() => '')).match(/sb_publishable_[\w-]+|eyJhbGciOi[\w-]+\.[\w-]+\.[\w-]+/g) ?? [];
    for (const k of m) {
      try {
        if (k.startsWith('sb_') || JSON.parse(Buffer.from(k.split('.')[1], 'base64url').toString()).role === 'anon') apikey = k;
      } catch {
        /* not a key */
      }
    }
  });
  await page.goto('/login/buyer', { waitUntil: 'load' });
  await expect.poll(() => apikey, { timeout: 20_000 }).not.toBe('');
  const tryWith = (body: Record<string, unknown>) =>
    page.request.post('/api/supabase/auth/v1/token?grant_type=password', { headers: { apikey }, data: { email: 'nobody-kr-probe@example.invalid', password: 'not-a-real-pass-1', ...body } });
  // Without the security gate the request never reaches Supabase; either way, refused.
  const none = await tryWith({});
  expect(none.status()).toBeGreaterThanOrEqual(400);
  expect(await none.text()).toMatch(/security check runs first|no captcha_token found/);
  const fake = await tryWith({ gotrue_meta_security: { captcha_token: 'fake' } });
  expect(fake.status()).toBeGreaterThanOrEqual(400);
  expect(await fake.text()).toMatch(/security check runs first|invalid-input-response/);
});
