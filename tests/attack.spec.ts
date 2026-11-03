/**
 * KashRoot's attack test suite: what an attacker would try, each expected to
 * be refused. Safe on the live site — small numbers, made-up accounts, no
 * real data touched; the burst test pauses only the tester's own network,
 * for one minute. KR_BASE_URL says where the site runs; KR_CAPTCHA_ON=1 when
 * Supabase's CAPTCHA is on (then password guesses never reach Supabase at all).
 * (Database-level IDOR, every table and function: supabase/tests, run in CI.)
 */
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

import { safeNextPath } from '@/lib/auth/roles';

const LIVE = Boolean(process.env.KR_BASE_URL);
const CAPTCHA_ON = process.env.KR_CAPTCHA_ON === '1';
const madeUp = () => `kr-attack-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.invalid`;

/** The public anon key every visitor's browser has, read from the page's own scripts. */
async function anonKey(page: Page): Promise<string> {
  let key = '';
  page.on('response', async (r) => {
    if (key || !/\.js(\?|$)/.test(r.url())) return;
    for (const k of (await r.text().catch(() => '')).match(/sb_publishable_[\w-]+|eyJhbGciOi[\w-]+\.[\w-]+\.[\w-]+/g) ?? []) {
      try {
        if (k.startsWith('sb_') || JSON.parse(Buffer.from(k.split('.')[1], 'base64url').toString()).role === 'anon') key = k;
      } catch {
        /* not a key */
      }
    }
  });
  await page.goto('/login/buyer', { waitUntil: 'load' });
  await expect.poll(() => key, { timeout: 20_000 }).not.toBe('');
  return key;
}

const signIn = (request: APIRequestContext, apikey: string, email: string, extra: Record<string, unknown> = {}) =>
  request.post('/api/supabase/auth/v1/token?grant_type=password', { headers: { apikey }, data: { email, password: 'not-the-password-1', ...extra } });

test.describe('the attack suite', () => {
  test.skip(!LIVE, 'Set KR_BASE_URL to a running copy (the live site is safe).');

  test('password guessing is refused: by CAPTCHA, or by the growing waits', async ({ page, request }) => {
    const apikey = await anonKey(page);
    const email = madeUp();
    const answers: number[] = [];
    for (let i = 0; i < 5; i++) {
      const res = await signIn(request, apikey, email);
      answers.push(res.status());
    }
    // A script never passed the security gate: every guess is refused before Supabase even sees it
    // (with the gate off: by CAPTCHA, or after the 3rd wrong one by a wait, 429).
    expect(answers.every((s) => s >= 400)).toBe(true);
    if (!CAPTCHA_ON) expect(answers.some((s) => s === 403 || s === 429)).toBe(true);
  });

  test('a fake CAPTCHA token is refused (KashRoot’s server and Supabase)', async ({ page, request }) => {
    expect((await request.post('/api/human', { data: { token: 'XXXX.fake' } })).status()).toBe(403);
    if (!CAPTCHA_ON) return;
    const res = await signIn(request, await anonKey(page), madeUp(), { gotrue_meta_security: { captcha_token: 'XXXX.fake' } });
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(await res.text()).toMatch(/security check runs first|invalid-input-response/);
  });

  test('a signed-out visitor reads no private table (IDOR through the data API)', async ({ page, request }) => {
    const apikey = await anonKey(page);
    for (const table of ['payout_accounts', 'support_requests', 'support_messages', 'email_outbox', 'security_events', 'security_log', 'rate_buckets', 'kr_settings', 'staff_roles', 'identity_checks', 'market_orders', 'rental_bookings', 'cold_slot_bookings', 'call_signals', 'advisory_messages', 'admin_unlocks', 'organisations', 'org_members', 'org_invites', 'org_payout_accounts']) {
      const res = await request.get(`/api/supabase/rest/v1/${table}?select=*&limit=1`, { headers: { apikey } });
      const body = await res.text();
      // Refused outright, or an empty list — never a row.
      expect(res.status() >= 400 || body.trim() === '[]', `${table}: ${res.status()} ${body.slice(0, 80)}`).toBe(true);
    }
  });

  test('nobody but an admin reaches admin functions (no token, a fake token)', async ({ page, request }) => {
    const apikey = await anonKey(page);
    for (const [fn, args] of [
      ['kr_setup_status', {}],
      ['kr_email_status', {}],
      ['kr_support_set_status', { p_id: '00000000-0000-0000-0000-000000000000', p_status: 'closed' }],
      ['kr_support_note', { p_id: '00000000-0000-0000-0000-000000000000', p_body: 'x' }],
      // Businesses: the Super Admin's list and switch, and an owner's bank details.
      ['kr_super_orgs', {}],
      ['kr_super_suspend_org', { p_org: '00000000-0000-0000-0000-000000000000', p_reason: 'test', p_suspend: true }],
      ['kr_org_set_payout', { p_org: '00000000-0000-0000-0000-000000000000', p_name: 'x', p_upi: 'x@bank', p_account: null, p_ifsc: null, p_bank: null }],
      ['kr_org_payout', { p_org: '00000000-0000-0000-0000-000000000000' }],
    ] as const) {
      for (const authorization of [undefined, 'Bearer not-a-real-token']) {
        const res = await request.post(`/api/supabase/rest/v1/rpc/${fn}`, { headers: { apikey, ...(authorization ? { authorization } : {}) }, data: args });
        expect(res.status(), `${fn} ${authorization ? 'fake token' : 'no token'}`).toBeGreaterThanOrEqual(400);
      }
    }
    // The admin test email too.
    expect((await request.post('/api/email', { data: { action: 'test' }, headers: { authorization: 'Bearer not-a-real-token' } })).status()).toBe(403);
  });

  test('script in the address bar never runs (XSS)', async ({ page }) => {
    let ran = false;
    page.on('dialog', async (d) => {
      ran = true;
      await d.dismiss();
    });
    const payload = encodeURIComponent('"><img src=x onerror=alert(1)><script>alert(2)</script>');
    for (const path of [`/support?code=${payload}&topic=${payload}`, `/compare-prices?q=${payload}&category=${payload}`, `/login/buyer?next=${payload}`, `/tracking/dashboard?code=${payload}`]) {
      await page.goto(path);
      await page.waitForTimeout(800);
      expect(await page.locator('img[src="x"]').count(), path).toBe(0);
    }
    expect(ran).toBe(false);
  });

  test('uploads: an SVG, a script dressed as an image, and an oversized body are refused', async ({ request }) => {
    const svg = `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>').toString('base64')}`;
    expect((await request.post('/api/label', { data: { photo: svg } })).status()).toBeGreaterThanOrEqual(400);
    const fakePng = `data:image/png;base64,${Buffer.from('<script>alert(1)</script>').toString('base64')}`;
    expect((await request.post('/api/label', { data: { photo: fakePng } })).status()).toBeGreaterThanOrEqual(400);
    const huge = 'x'.repeat(3_000_000);
    expect((await request.post('/api/support', { data: { action: 'open', name: 'x', phone: '9876543210', message: huge } })).status()).toBeGreaterThanOrEqual(400);
  });

  test('path tricks on the Supabase proxy go nowhere', async ({ request }) => {
    for (const path of ['/api/supabase/..%2F..%2Fadmin', '/api/supabase/auth/v1/..%2F..%2Fstorage/v1/object', '/api/supabase/storage/v1/object/list', '/api/supabase/rest/v1/%2e%2e/config']) {
      const res = await request.get(path);
      expect(res.status(), path).toBeGreaterThanOrEqual(400);
    }
  });

  test('the security gate: no cookie, a fake gate token or a forged cookie gets nothing', async ({ request }) => {
    // No gate passed in this "browser": the proxy refuses sign-up and reset emails too.
    expect((await request.get('/api/gate')).ok()).toBe(true);
    expect(((await (await request.get('/api/gate')).json()) as { passed: boolean }).passed).toBe(false);
    // (On this computer Cloudflare's test secret passes any token: a fake one is refused on the live site only.)
    if (/^https:/.test(process.env.KR_BASE_URL ?? '')) expect((await request.post('/api/gate', { data: { token: 'XXXX.fake', place: 'buyer' } })).status()).toBe(403);
    expect((await request.post('/api/gate', { data: { token: 'XXXX.fake', place: '../admin' } })).status()).toBe(400);
    const forged = await request.get('/api/gate', { headers: { cookie: `kr_gate=buyer.${Math.floor(Date.now() / 1000) + 600}.AAAAAAAAAAAAAAAA.forged` } });
    expect(((await forged.json()) as { passed: boolean }).passed).toBe(false);
    const help = await request.post('/api/support', { data: { action: 'open', name: 'x', phone: '9876543210', message: 'gate test', ms: 5000 } });
    expect(help.status()).toBeGreaterThanOrEqual(400);
  });

  test('a burst of request-number guesses is stopped (rate limit)', async ({ request }) => {
    const statuses: number[] = [];
    for (let i = 0; i < 24; i++) statuses.push((await request.post('/api/support', { data: { action: 'status', code: `H-${String(i).padStart(8, '0')}`, contact: '9876543210' } })).status());
    expect(statuses).toContain(429);
  });
});

test('sign-in only ever returns to a page on KashRoot (open redirects)', () => {
  for (const evil of ['https://evil.example', '//evil.example', '/\\evil.example', '/\t/evil.example', 'javascript:alert(1)', '/%2F%2Fevil.example']) {
    const to = safeNextPath(evil, '/home');
    expect(to.startsWith('/') && !to.startsWith('//') && !to.startsWith('/\\'), `${evil} → ${to}`).toBe(true);
  }
  expect(safeNextPath('/buyer/dashboard?tab=shop', '/home')).toBe('/buyer/dashboard?tab=shop');
});
