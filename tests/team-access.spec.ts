/**
 * Only the Super Admin and the KashRoot team reach Admin (20261117000000_kashroot_team.sql,
 * lib/server/teamPass, proxy.ts):
 *  - an Admin page without the team pass goes to /team/unlock and shows nothing of Admin;
 *  - a forged pass is refused; the pass is given only when the database confirms the team;
 *  - opening the Admin sign-in no longer makes this device show the Admin card;
 *  - the team functions refuse anyone not signed in, and a fake token.
 * Signed-in outsiders (dealer, business owner and staff, farmer) and a team member with one
 * section ticked: supabase/tests/99d_kashroot_team.sql (the database decides; accounts there
 * are made without hCaptcha, which a test on the live site cannot do).
 * KR_BASE_URL says where the site runs.
 */
import { expect, test } from '@playwright/test';

for (const path of ['/admin/dashboard', '/admin/dashboard?tab=super', '/admin']) {
  test(`${path}: without the team pass, nothing of Admin`, async ({ page }) => {
    await page.goto(path);
    await expect(page).toHaveURL(/\/team\/unlock\?next=/);
    await expect(page.getByText('Please sign in first.')).toBeVisible();
    for (const word of ['Governance console', 'Super Admin', 'Approvals', 'Help desk', 'Platform numbers']) await expect(page.getByText(word)).toHaveCount(0);
  });
}

test('a forged or expired team pass opens nothing', async ({ request }) => {
  const exp = Math.floor(Date.now() / 1000) + 600;
  for (const cookie of [`kr_team=${exp}.AAAAAAAAAAAAAAAA.BBBBBBBBBBBBBBBB.forged`, `kr_team=1.AAAAAAAAAAAAAAAA.BBBBBBBBBBBBBBBB.x`, 'kr_team=garbage']) {
    const res = await request.get('/admin/dashboard', { headers: { cookie }, maxRedirects: 0 });
    expect(res.status(), cookie).toBe(307);
    expect(res.headers().location, cookie).toContain('/team/unlock');
  }
});

test('the team pass is given only when the database confirms the team', async ({ request }) => {
  // headers() leaves Set-Cookie out; headersArray() has it.
  const cookies = (r: { headersArray: () => { name: string; value: string }[] }) =>
    r.headersArray().filter((h) => h.name.toLowerCase() === 'set-cookie').map((h) => h.value).join(' | ');
  const none = await request.post('/api/team/session');
  expect(none.status()).toBe(401);
  expect(cookies(none)).toContain('kr_team=;');
  const fake = await request.post('/api/team/session', { headers: { authorization: 'Bearer not-a-real-token' } });
  // Live: refused by the database (403). A local copy without Supabase settings: not available (503).
  expect(/^https:/.test(process.env.KR_BASE_URL ?? '') ? [403, 429] : [403, 429, 503]).toContain(fake.status());
  expect(cookies(fake)).not.toMatch(/kr_team=[^;]/);
});

test('opening the Admin sign-in does not show Admin to anyone on this device', async ({ page }) => {
  await page.goto('/login/admin');
  await page.goto('/');
  await page.waitForTimeout(1500);
  await expect(page.locator('a[href="/admin/dashboard"], a[href="/login/admin"]')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('kr_admin_device'))).toBeNull();
});
