/**
 * The staff portals are apart from the customer portals: the Business admin
 * (a cold store, dealership or shop team) has its own sign-in, the KashRoot Hub
 * and Admin need the team pass, and a customer sees none of them in the
 * sign-in chooser, the Portals menu or a portal's sidebar. KR_BASE_URL says where the site runs.
 */
import { expect, test } from '@playwright/test';

test('the customers\' sign-in chooser lists the customer portals only', async ({ page }) => {
  await page.goto('/login');
  const list = page.getByRole('list').filter({ hasText: 'Farmer' }).first();
  await expect(list).toBeVisible();
  const text = await list.innerText();
  for (const staff of ['Business admin', 'KashRoot Hub', 'Admin']) expect(text, `chooser must not list ${staff}`).not.toContain(staff);
  for (const customer of ['Farmer', 'Buyer', 'Cold Storage', 'Agro-dealer']) expect(text).toContain(customer);
});

test('a visitor is shown nothing of the Business admin: not in the Portals menu, not in the footer, not on the Cold Storage page', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Portals/ }).first().click();
  const html = await page.locator('header').first().innerText();
  expect(html).not.toContain('KashRoot Hub');
  expect(html).not.toContain('Business admin');
  await expect(page.getByRole('link', { name: /Business admin/ })).toHaveCount(0);
  await expect(page.locator('footer').last()).not.toContainText('Business admin');
  // The customer Cold Storage portal has no owner side: an older owner link goes to the Business admin sign-in.
  await page.goto('/rental/dashboard?as=owner&tab=stores');
  await page.waitForURL((u) => /^\/(login\/(rental|business)|business\/cold-store)/.test(u.pathname), { timeout: 20_000 });
  await expect(page.getByText('I run a cold store')).toHaveCount(0);
});

test('Business admin has its own sign-in page, apart from the customers\'', async ({ page }) => {
  await page.goto('/login/business');
  await expect(page.getByText('Business admin').first()).toBeVisible();
  await expect(page.getByText(/not the customer sign-in/i)).toBeVisible();
  await expect(page.getByLabel(/email/i).first()).toBeVisible();
});

test('the KashRoot Hub shows nothing without the team pass', async ({ page }) => {
  for (const path of ['/hub', '/hub/dashboard']) {
    await page.goto(path);
    await page.waitForLoadState('load');
    expect(page.url(), `${path} goes to the team unlock`).toContain('/team/unlock');
    await expect(page.getByText('Pickups by step')).toHaveCount(0);
  }
  await page.goto('/login/hub');
  await expect(page.getByText('KashRoot Hub').first()).toBeVisible();
});
