/**
 * The "I am human" check (components/security/HumanCheck) on every form that
 * uses it: always visible while it is on — never a "complete the check" with
 * no check in sight — and, when Cloudflare's script cannot load (Brave
 * Shields, an ad blocker), a plain message with a Retry button. A fake token
 * is refused by the server. KR_BASE_URL says where the site runs; with
 * KR_CAPTCHA_ON=1 the Supabase CAPTCHA is also checked to refuse a fake token.
 * Screenshots: test-results/human-check-*.png
 */
import { expect, test, type Page } from '@playwright/test';

const FORMS = ['/login/buyer', '/login/farmer', '/register/farmer', '/forgot-password', '/support'];

async function checkIsOn(page: Page): Promise<boolean> {
  const res = await page.request.get('/api/human');
  return Boolean(((await res.json()) as { on?: boolean }).on);
}

for (const width of [1280, 390]) {
  test.describe(`${width} px`, () => {
    test.use({ viewport: { width, height: 900 } });

    for (const path of FORMS) {
      test(`${path}: the check is on screen`, async ({ page }) => {
        test.skip(!(await checkIsOn(page)), 'The check is off on this server.');
        await page.goto(path);
        const check = page.locator('[data-human-check]').first();
        await check.scrollIntoViewIfNeeded();
        // Cloudflare's box is drawn (Verifying… / Success! / a tick box) — never an empty space.
        await expect.poll(() => page.frames().some((f) => f.url().includes('challenges.cloudflare.com')), { timeout: 30_000 }).toBe(true);
        await expect(check).toHaveAttribute('data-human-check', /shown|passed/);
        const box = await check.boundingBox();
        expect(box!.height, 'the check has room on the page').toBeGreaterThanOrEqual(60);
        await expect(page.getByText(/complete the .I am human. check/i)).toHaveCount(0);
        await page.screenshot({ path: `test-results/human-check${path.replace(/\//g, '-')}-${width}.png`, fullPage: false });
      });
    }

    test('blocked by Shields or an ad blocker: a plain message and Retry, not a dead end', async ({ page }) => {
      test.skip(!(await checkIsOn(page)), 'The check is off on this server.');
      await page.route('https://challenges.cloudflare.com/**', (route) => route.abort('blockedbyclient'));
      await page.goto('/login/buyer');
      const alert = page.locator('[data-human-check="blocked"] [role="alert"]');
      await expect(alert).toContainText('couldn’t load', { timeout: 25_000 });
      await expect(alert).toContainText('Shields or ad-block');
      const retry = alert.getByRole('button', { name: 'Retry' });
      expect((await retry.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await expect(page.getByRole('button', { name: /Sign in to Buyer/ })).toBeDisabled();
      await page.screenshot({ path: `test-results/human-check-blocked-${width}.png` });
      // Unblocked again, Retry brings the check.
      await page.unroute('https://challenges.cloudflare.com/**');
      await retry.click();
      await expect.poll(() => page.frames().some((f) => f.url().includes('challenges.cloudflare.com')), { timeout: 30_000 }).toBe(true);
    });
  });
}

test('a fake token is refused by KashRoot’s server', async ({ request }) => {
  const on = Boolean(((await (await request.get('/api/human')).json()) as { on?: boolean }).on);
  test.skip(!on, 'The check is off on this server.');
  // On this computer the server may use Cloudflare's test secret, which passes any token.
  test.skip(!/^https:/.test(process.env.KR_BASE_URL ?? ''), 'Only meaningful on the live site.');
  expect((await request.post('/api/human', { data: { token: 'fake' } })).status()).toBe(403);
  expect((await request.post('/api/otp/send', { data: { channel: 'email', to: 'nobody@example.invalid', human: 'fake' } })).status()).toBe(403);
});

test('with Supabase CAPTCHA on, a sign-in with a fake token is refused', async ({ page }) => {
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
  for (const res of [await tryWith({}), await tryWith({ gotrue_meta_security: { captcha_token: 'fake' } })]) {
    expect(res.status()).toBe(400);
    expect((await res.text()).toLowerCase()).toContain('captcha');
  }
});
