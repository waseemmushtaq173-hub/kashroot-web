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

test('the Portals menu does not list the staff portals; the footer has the business sign-in', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Portals/ }).first().click();
  const menu = page.locator('nav, [role="menu"], header').first();
  const html = await page.locator('header').first().innerText();
  expect(html).not.toContain('KashRoot Hub');
  expect(html).not.toContain('Business admin');
  void menu;
  const footerLink = page.getByRole('link', { name: 'Business admin sign-in' });
  await expect(footerLink).toHaveAttribute('href', '/login/business');
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
