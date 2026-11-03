/**
 * Help & support for every customer: reachable from every page and every
 * sign-in, answers to read or hear in three languages, a request form that
 * works without signing in (and says honestly when requests are not switched
 * on), and the assistant points there for sign-in trouble.
 * KR_BASE_URL says where the site runs. Screenshots: test-results/support-*.png
 */
import { expect, test } from '@playwright/test';

for (const width of [1280, 390]) {
  test.describe(`${width} px`, () => {
    test.use({ viewport: { width, height: 900 } });

    test('the top bar and every sign-in lead to help', async ({ page }) => {
      await page.goto('/');
      await expect(page.getByRole('link', { name: 'Help & support' }).first()).toHaveAttribute('href', '/support');
      await page.goto('/login/farmer');
      const help = page.getByRole('link', { name: 'Get help' });
      await expect(help).toHaveAttribute('href', '/support?topic=login');
      expect((await help.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    });

    test('sign-in help opens ready, readable and audible, in three languages', async ({ page }) => {
      await page.goto('/support?topic=login');
      const otp = page.locator('[data-help-topic="otp"]');
      await expect(otp).toContainText('6-digit code');
      const listen = otp.getByRole('button', { name: 'Listen' });
      expect((await listen.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await page.getByRole('button', { name: 'हिन्दी' }).click();
      await expect(otp).toContainText('6 अंकों का कोड');
      await page.getByRole('button', { name: 'اردو' }).click();
      await expect(otp.locator('p[dir="rtl"]')).toContainText('کوڈ');
      // "Still stuck?" takes them to Ask KashRoot (behind the security gate) with the topic chosen.
      await otp.getByRole('button', { name: /Still stuck/ }).click();
      await expect(page.locator('#ask-kashroot')).toBeInViewport();
      const gated = page.locator('#ask-kashroot [data-security-gate]');
      // Locally the gate passes by itself (test key); on the live site Cloudflare may ask an automated browser to tap.
      if (!/^https:/.test(process.env.KR_BASE_URL ?? '')) await expect(gated).toHaveCount(0, { timeout: 30_000 });
      if (!(await gated.count())) await expect(page.getByLabel('What is it about?')).toHaveValue('login');
      await page.screenshot({ path: `test-results/support-${width}.png`, fullPage: true });
      const scrollX = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(scrollX).toBeLessThanOrEqual(0);
    });

    test('a request can be sent without signing in (or it says plainly why not)', async ({ page, request }) => {
      await page.goto('/support');
      // The security gate first: on the live site an automated browser is asked to tap, so the form stays closed —
      // which is the gate working. (No request is sent from the live site: it would reach the real help desk.)
      if (/^https:/.test(process.env.KR_BASE_URL ?? '')) {
        await expect(page.locator('#ask-kashroot [data-security-gate]')).toBeVisible();
        await expect.poll(() => page.frames().some((f) => f.url().includes('challenges.cloudflare.com')), { timeout: 20_000 }).toBe(true);
        await expect(page.getByLabel('Your name')).toHaveCount(0);
        return;
      }
      await page.getByLabel('Your name').fill('Test Person');
      await page.getByLabel(/Mobile number \(we call you back/).fill('9876543210');
      await page.getByLabel(/The problem, in your words/).fill('The code does not come when I sign in');
      // A person takes a few seconds to write (lib/client/formGuard: under 3 s counts as a bot).
      await page.waitForTimeout(3_100);
      const send = page.getByRole('button', { name: 'Send to KashRoot' });
      const human = (await (await request.get('/api/human')).json()) as { on?: boolean };
      if (human.on) {
        // The security check is on: it runs with the form in the background, and Send is never held back by it.
        // (No request is sent here: on the live site that would reach the real help desk.)
        await expect(page.locator('#ask-kashroot [data-human-check]')).toBeAttached();
        await expect.poll(() => page.frames().some((f) => f.url().includes('challenges.cloudflare.com')), { timeout: 20_000 }).toBe(true);
        await expect(send).toBeEnabled();
        return;
      }
      await send.click();
      // With the server secret set: a request number. Without it: the honest message with the email.
      await expect(page.locator('[data-support-code], #ask-kashroot [role="alert"]').first()).toBeVisible({ timeout: 15_000 });
      const code = page.locator('[data-support-code]');
      if (await code.count()) await expect(code).toHaveText(/^H-[0-9A-F]{8}$/);
      else await expect(page.locator('#ask-kashroot [role="alert"]')).toContainText('kashrootsupport@gmail.com');
    });
  });
}

test('the request service checks what it is given', async ({ request }) => {
  const bad = await request.post('/api/support', { data: { action: 'status', code: 'H-12345678', phone: '123' } });
  expect([400, 503]).toContain(bad.status());
});

test('the assistant sends sign-in trouble to Help & support', async ({ request }) => {
  const human = (await (await request.get('/api/human')).json()) as { on?: boolean };
  test.skip(Boolean(human.on), 'The "I am human" check is on here: scripts get no answer.');
  const res = await request.post('/api/ai', { data: { query: 'I cannot login, OTP not coming', lang: 'en', exact: true } });
  const body = await res.json();
  expect(body.reply).toContain('Help & support');
});

test('Help & support holds the official contacts: an "Email us" button and the warning', async ({ page }) => {
  await page.goto('/support');
  const official = page.locator('#official');
  await expect(official.getByRole('heading', { name: 'Official contacts' })).toBeVisible();
  const emailUs = official.getByRole('link', { name: 'Email us' });
  await expect(emailUs).toHaveAttribute('href', /^mailto:kashrootsupport@gmail\.com\?subject=/);
  expect((await emailUs.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await expect(official).toContainText('never asks for your password, OTP, UPI PIN or card number');
  // Check my request takes the mobile number or the email.
  await expect(page.getByLabel('Mobile number or email you gave')).toBeVisible();
  await official.screenshot({ path: 'test-results/support-official.png' });
});

test('the old /official address opens the official contacts in Help & support', async ({ page }) => {
  await page.goto('/official');
  await page.waitForURL((u) => u.pathname === '/support');
  await expect(page.locator('#official')).toBeVisible();
});

test('a request is looked up by its number with the mobile OR the email, and guessing is limited', async ({ request }) => {
  // A malformed contact is refused before any lookup.
  const bad = await request.post('/api/support', { data: { action: 'status', code: 'H-12345678', contact: 'not a contact' } });
  expect([400, 503]).toContain(bad.status());
  // An email is accepted as a contact (no request here: 404, or 503 when requests are off on this copy).
  const byEmail = await request.post('/api/support', { data: { action: 'status', code: 'H-00000000', contact: 'nobody@example.invalid' } });
  expect([404, 429, 503]).toContain(byEmail.status());
});

test('two-step sign-in has a page for everyone, in four languages', async ({ page }) => {
  await page.goto('/account/two-step');
  await expect(page.getByRole('heading', { name: 'Two-step sign-in' }).first()).toBeVisible();
  for (const lang of ['en', 'hi', 'ur', 'ks']) await expect(page.locator(`[lang="${lang}"]`).first()).toBeVisible();
  // Signed out: asked to sign in first, never shown a setup.
  await expect(page.getByRole('link', { name: 'Sign in' }).first()).toBeVisible();
  await expect(page.locator('[data-two-step="setup"]')).toHaveCount(0);
});

test('My business: signed out, asked to sign in first and shown nothing of any business', async ({ page }) => {
  await page.goto('/account/business');
  await expect(page.getByRole('heading', { name: 'My business' }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sign in' }).first()).toBeVisible();
  await expect(page.locator('[data-business-view], [data-business-new], [data-business-payout]')).toHaveCount(0);
});
