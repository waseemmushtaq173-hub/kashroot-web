/**
 * LOCAL test stack only (KR_LOCAL_TEST=1, KR_BASE_URL=http://localhost:…, .env.test from
 * scripts/seed-demo.mjs): saved payment details change only after two-step sign-in
 * (20261119000000_payout_two_step.sql), and the person is told exactly that — not to
 * "verify your identity", which they did when the details were first added.
 */
import { existsSync, readFileSync } from 'node:fs';

import { expect, test } from '@playwright/test';

const BASE = process.env.KR_BASE_URL ?? '';
const LOCAL = process.env.KR_LOCAL_TEST === '1' && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE) && existsSync('.env.test');
test.skip(!LOCAL, 'local test stack only (KR_LOCAL_TEST=1, KR_BASE_URL=http://localhost:…, .env.test)');

const env: Record<string, string> = LOCAL
  ? Object.fromEntries(
      readFileSync('.env.test', 'utf8')
        .split(/\r?\n/)
        .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/))
        .filter((m): m is RegExpMatchArray => Boolean(m))
        .map((m) => [m[1], m[2]]),
    )
  : {};

test('changing saved payment details without two-step sign-in says what is needed (cold store owner)', async ({ page }) => {
  test.setTimeout(120_000);
  // The Farmer portal's own form says so before sending; the cold store owner's Payment details had no such check.
  await page.goto('/login/rental');
  await page.getByLabel('Email address').fill('test-farmer@example.test', { timeout: 30_000 });
  await page.getByLabel('Password', { exact: true }).fill(env.TEST_FARMER_PASSWORD);
  await page.waitForTimeout(3_200); // a person takes a few seconds (lib/client/formGuard)
  await page.getByRole('button', { name: /^Sign in to/ }).click();
  await page.waitForURL(/\/rental\/dashboard/, { timeout: 60_000 });
  await page.getByText('I run a cold store', { exact: true }).filter({ visible: true }).first().click();
  await page.locator('[role="tab"]:visible').filter({ hasText: 'Payment details' }).first().click();
  const upi = page.getByLabel(/UPI ID/).first();
  await expect(upi).toBeVisible({ timeout: 30_000 });
  // The seeded farmer already has details saved: change the UPI ID.
  await upi.fill(`changed${Date.now() % 1000}@ybl`);
  await page.getByRole('button', { name: 'Save payment details' }).click();
  const toast = page.locator('[data-sonner-toast][data-type="error"]').first();
  await expect(toast).toContainText('needs two-step sign-in', { timeout: 20_000 });
  await expect(toast).not.toContainText('Verify your identity');
});
