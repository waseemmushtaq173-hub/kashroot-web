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

    test('the footer and every sign-in lead to help', async ({ page }) => {
      await page.goto('/');
      await expect(page.locator('footer').getByRole('link', { name: 'Help & support' })).toHaveAttribute('href', '/support');
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
      // "Still stuck?" takes them to the form with the topic chosen.
      await otp.getByRole('button', { name: /Still stuck/ }).click();
      await expect(page.getByLabel('What is it about?')).toHaveValue('login');
      await page.screenshot({ path: `test-results/support-${width}.png`, fullPage: true });
      const scrollX = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(scrollX).toBeLessThanOrEqual(0);
    });

    test('a request can be sent without signing in (or it says plainly why not)', async ({ page }) => {
      await page.goto('/support');
      await page.getByLabel('Your name').fill('Test Person');
      await page.getByLabel(/Mobile number \(we call you back/).fill('9876543210');
      await page.getByLabel(/The problem, in your words/).fill('The code does not come when I sign in');
      await page.getByRole('button', { name: 'Send to KashRoot' }).click();
      // With the server secret set: a request number. Without it: the honest message with the email.
      await expect(page.locator('[data-support-code], #ask-kashroot [role="alert"]').first()).toBeVisible({ timeout: 15_000 });
      const code = page.locator('[data-support-code]');
      if (await code.count()) await expect(code).toHaveText(/^H-[0-9A-F]{8}$/);
      else await expect(page.locator('#ask-kashroot [role="alert"]')).toContainText('support@kashroot.com');
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
