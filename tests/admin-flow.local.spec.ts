/**
 * The way into Admin, end to end, on a LOCAL test stack only (npx supabase start;
 * node scripts/seed-demo.mjs; the site built and started with scripts/with-test-env.mjs).
 * Runs only with KR_LOCAL_TEST=1 and KR_BASE_URL on this computer. Uses the TEST accounts in
 * .env.test (never printed). Each test is a fresh browser: a new, unmarked device.
 *
 *   KR_LOCAL_TEST=1 KR_BASE_URL=http://localhost:3600 npx playwright test tests/admin-flow.local.spec.ts
 */
import { execFileSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

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
const SHOTS = process.env.KR_SHOTS_DIR ?? join('test-results', 'admin-flow');
const shot = (page: Page, name: string) => page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
const psql = (sql: string) => execFileSync('docker', ['exec', '-i', 'supabase_db_kashroot-web', 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-q', '-tA'], { input: sql, encoding: 'utf8' });

function totp(b32: string, at = Date.now()) {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of b32) bits += A.indexOf(c).toString(2).padStart(5, '0');
  const key = Buffer.from((bits.match(/.{8}/g) ?? []).map((b) => parseInt(b, 2)));
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(Math.floor(at / 30000)));
  const h = createHmac('sha1', key).update(msg).digest();
  const o = h[h.length - 1] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

/** The portal's own sign-in: the security check passes by itself (hCaptcha test key), then email and password. */
async function signIn(page: Page, portal: string, key: string, next?: string) {
  await page.goto(`/login/${portal}${next ? `?next=${encodeURIComponent(next)}` : ''}`);
  await page.getByLabel('Email address').fill(`test-${key.toLowerCase()}@example.test`, { timeout: 30_000 });
  await page.getByLabel('Password', { exact: true }).fill(env[`TEST_${key}_PASSWORD`]);
  await page.getByRole('button', { name: /^Sign in to/ }).click();
}

test.describe.configure({ mode: 'serial' });
test.use({ viewport: { width: 1280, height: 900 } });

test('signed out, a new device: /admin goes to the unlock page, which asks to sign in (no loop)', async ({ page }) => {
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/team\/unlock\?next=%2Fadmin/);
  await expect(page.getByText('Please sign in first.')).toBeVisible();
  await shot(page, '1-signed-out-admin');
  const api = await page.request.post('/api/team/session');
  expect(api.status()).toBe(401);
});

test('the Super Admin on a new device: password, authenticator code, admin code, then the Super Admin tab', async ({ page }) => {
  test.setTimeout(180_000);
  psql(`delete from public.admin_lock where user_id = (select id from auth.users where email = 'test-admin@example.test');`);
  await page.goto('/admin/dashboard');
  await expect(page).toHaveURL(/\/team\/unlock/);
  await page.getByRole('link', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/login\/admin\?next=/);
  await page.getByLabel('Email address').fill('test-admin@example.test', { timeout: 30_000 });
  await page.getByLabel('Password', { exact: true }).fill(env.TEST_ADMIN_PASSWORD);
  await page.getByRole('button', { name: /^Sign in to/ }).click();
  // Two-step sign-in: the authenticator code (where the sign-in asks for it, or at the Admin lock).
  const twoStep = page.locator('[data-two-step="verify"]').first();
  await twoStep.waitFor({ timeout: 60_000 });
  await shot(page, '2-two-step');
  await twoStep.locator('input').first().click();
  await page.keyboard.type(totp(env.TEST_ADMIN_TOTP_SECRET));
  await twoStep.getByRole('button', { name: /Continue/ }).click().catch(() => undefined);
  // The admin code: created at the first unlock, asked every time after.
  await page.getByLabel('Admin code').fill(env.TEST_ADMIN_ACCESS_CODE, { timeout: 60_000 });
  const again = page.getByLabel('Type it again');
  if (await again.isVisible()) await again.fill(env.TEST_ADMIN_ACCESS_CODE);
  await shot(page, '3-admin-code');
  await page.getByRole('button', { name: /Save code and open|Open Admin portal/ }).click();
  await expect(page).toHaveURL(/\/admin\/dashboard/, { timeout: 60_000 });
  await expect(page.getByRole('tab', { name: /Super Admin/ }).first()).toBeVisible({ timeout: 60_000 });
  await page.getByRole('tab', { name: /Super Admin/ }).first().click();
  await shot(page, '4-super-admin-tab');
  const cookies = await page.context().cookies();
  const pass = cookies.find((c) => c.name === 'kr_team');
  expect(pass?.httpOnly).toBe(true);
});

// Everyone outside the team: farmer, buyer, dealer, cold store (business) owner, staff — each through their own portal.
const OUTSIDERS = [
  { key: 'FARMER', portal: 'farmer', home: /\/farmer\/dashboard/ },
  { key: 'BUYER', portal: 'buyer', home: /\/buyer\/dashboard/ },
  { key: 'DEALER', portal: 'dealer', home: /\/dealer\/dashboard/ },
  { key: 'COLDOWNER', portal: 'rental', home: /\/rental\/dashboard/ },
  { key: 'STAFF', portal: 'trader', home: /\/trader\/dashboard/ },
] as const;

/** The signed-in session's access token (from Supabase's own storage). */
const tokenOf = (page: Page) =>
  page.evaluate(() => {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i) ?? '';
      if (/auth-token$/.test(k)) return (JSON.parse(localStorage.getItem(k) ?? '{}') as { access_token?: string }).access_token ?? '';
    }
    return '';
  });

/** Admin as the database sees this person: the sections open, an admin function, admin-only rows. */
async function databaseAdmin(page: Page, token: string) {
  const headers = { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  const base = env.NEXT_PUBLIC_SUPABASE_URL;
  const sections = await (await page.request.post(`${base}/rest/v1/rpc/kr_team_sections`, { headers, data: {} })).json();
  const summary = await page.request.post(`${base}/rest/v1/rpc/kr_security_summary`, { headers, data: { p_hours: 24 } });
  const events = await (await page.request.get(`${base}/rest/v1/security_events?select=id&limit=5`, { headers })).json();
  const team = await (await page.request.get(`${base}/rest/v1/team_sections?select=user_id&limit=5`, { headers })).json();
  return { sections, summaryStatus: summary.status(), events, team };
}

for (const { key, portal, home } of OUTSIDERS) {
  test(`a ${key.toLowerCase()} sees no Admin, gets "Page not found", and the server and database refuse`, async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, portal, key);
    await page.waitForURL(home, { timeout: 60_000 });
    // Not shown anywhere: the portal grid, the Portals menu.
    await page.goto('/');
    await expect(page.locator('a[href^="/admin"]')).toHaveCount(0);
    await page.getByRole('button', { name: /Portals/ }).first().click().catch(() => undefined);
    await expect(page.getByRole('link', { name: /^Admin/ })).toHaveCount(0);
    await page.goto('/admin/dashboard');
    await expect(page).toHaveURL(/\/team\/unlock/);
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible({ timeout: 30_000 });
    await shot(page, `5-${key.toLowerCase()}-admin`);
    const token = await tokenOf(page);
    expect(token, 'signed in').not.toBe('');
    const api = await page.request.post('/api/team/session', { headers: { authorization: `Bearer ${token}` } });
    expect(api.status()).toBe(403);
    expect(api.headers()['set-cookie'] ?? '').not.toMatch(/kr_team=[^;]+\./);
    const db = await databaseAdmin(page, token);
    expect(db.sections, 'no Admin section open').toEqual([]);
    expect(db.summaryStatus, 'admin function refused').toBeGreaterThanOrEqual(400);
    expect(db.events, 'no security events').toEqual([]);
    expect(db.team, 'no one else’s team rows').toEqual([]);
  });
}

test('writing "ADMIN" into one’s own profile opens nothing', async ({ page }) => {
  test.setTimeout(120_000);
  await signIn(page, 'farmer', 'FARMER');
  await page.waitForURL(/\/farmer\/dashboard/, { timeout: 60_000 });
  const token = await tokenOf(page);
  const headers = { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  // The farmer's own metadata (any user can write it): role and roles say ADMIN.
  const meta = await (await page.request.get(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/user`, { headers })).json();
  const put = (data: Record<string, unknown>) => page.request.put(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/user`, { headers, data: { data } });
  expect((await put({ ...meta.user_metadata, role: 'ADMIN', roles: [...(meta.user_metadata.roles ?? []), 'ADMIN'], portals: [...(meta.user_metadata.portals ?? []), 'admin'] })).ok()).toBe(true);
  try {
    await page.goto('/login/admin');
    await page.getByLabel('Email address').fill('test-farmer@example.test', { timeout: 30_000 });
    await page.getByLabel('Password', { exact: true }).fill(env.TEST_FARMER_PASSWORD);
    await page.waitForTimeout(3_200); // a person takes a few seconds (lib/client/formGuard)
    await page.getByRole('button', { name: /^Sign in to/ }).click();
    await expect(page.getByText('This account is not a KashRoot admin.')).toBeVisible({ timeout: 30_000 });
    await page.goto('/');
    await expect(page.locator('a[href^="/admin"]')).toHaveCount(0);
    await page.goto('/admin/dashboard');
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible({ timeout: 30_000 });
    const db = await databaseAdmin(page, token);
    expect(db.sections).toEqual([]);
    expect(db.summaryStatus).toBeGreaterThanOrEqual(400);
  } finally {
    await put(meta.user_metadata);
  }
});

test('an admin whose database lacks the team update is told what to run (not "Page not found")', async ({ page }) => {
  test.setTimeout(120_000);
  psql('alter function public.kr_team_member() rename to kr_team_member_hidden; notify pgrst, \'reload schema\';');
  try {
    await page.waitForTimeout(1500);
    await signIn(page, 'admin', 'ADMIN', '/team/unlock?next=%2Fadmin%2Fdashboard');
    const twoStep = page.locator('[data-two-step="verify"]').first();
    await twoStep.waitFor({ timeout: 60_000 });
    await twoStep.locator('input').first().click();
    await page.keyboard.type(totp(env.TEST_ADMIN_TOTP_SECRET));
    await twoStep.getByRole('button', { name: /Continue/ }).click().catch(() => undefined);
    await page.waitForURL(/\/team\/unlock/, { timeout: 60_000 });
    await expect(page.getByRole('heading', { name: 'Admin is waiting for a database update' })).toBeVisible({ timeout: 60_000 });
    await shot(page, '6-needs-update');
  } finally {
    psql('alter function public.kr_team_member_hidden() rename to kr_team_member; notify pgrst, \'reload schema\';');
  }
});

test('page not found is readable, also when the phone forces dark mode', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  const res = await page.goto('/no-such-page-here');
  expect(res?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  await shot(page, '7-not-found');
});
