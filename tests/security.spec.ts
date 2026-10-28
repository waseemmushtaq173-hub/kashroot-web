/**
 * Security at the edges: the headers every page sends, the AI photo checks
 * refusing strangers, the Supabase proxy forwarding only auth and data, input
 * that does not fit refused, and no secret in what browsers download.
 * KR_BASE_URL says where the site runs.
 */
import { expect, test } from '@playwright/test';

test('every page sends the security headers', async ({ request }) => {
  const res = await request.get('/');
  const h = res.headers();
  expect(h['strict-transport-security']).toContain('max-age=63072000');
  expect(h['x-frame-options']).toBe('DENY');
  expect(h['x-content-type-options']).toBe('nosniff');
  expect(h['cross-origin-opener-policy']).toBe('same-origin-allow-popups');
  const csp = h['content-security-policy'];
  expect(csp).toContain("object-src 'none'");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toMatch(/script-src 'self' 'unsafe-inline' https:\/\/challenges\.cloudflare\.com(;| )/);
});

test('the AI photo checks refuse anyone not signed in', async ({ request }) => {
  const jpeg = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD';
  expect((await request.post('/api/diagnose', { data: { photo: jpeg } })).status()).toBe(401);
  expect((await request.post('/api/advisory/ai', { data: { question: 'Scab on my apples' } })).status()).toBe(401);
  // A forged token is refused too.
  expect((await request.post('/api/diagnose', { data: { photo: jpeg }, headers: { authorization: 'Bearer not-a-real-token' } })).status()).toBe(401);
});

test('the Supabase proxy forwards only sign-in and data', async ({ request }) => {
  for (const path of ['storage/v1/bucket', 'functions/v1/x', 'pg/query', 'auth/v1/%2e%2e/admin/users', 'rest/v1/%2e%2e%2fpg']) {
    expect((await request.get(`/api/supabase/${path}`)).status(), path).toBe(404);
  }
});

test('input that does not fit is refused', async ({ request }) => {
  expect((await request.get('/api/ifsc?code=%27%20OR%201%3D1--')).status()).toBe(400);
  expect((await request.get('/api/speak?l=en&t=' + 'a'.repeat(500))).status()).toBe(413);
  expect((await request.post('/api/otp/send', { data: { channel: 'sms', to: '<script>' } })).status()).toBe(400);
  expect((await request.post('/api/support', { data: { action: 'status', code: "H-1'; drop table x;--", phone: '9876543210' } })).status()).toBeGreaterThanOrEqual(400);
  // An SVG "photo" is not an image KashRoot accepts.
  const svg = `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>').toString('base64')}`;
  expect((await request.post('/api/label', { data: { photo: svg } })).status()).toBeGreaterThanOrEqual(400);
});

test('no secret reaches the browser', async ({ page }) => {
  const bodies: string[] = [];
  page.on('response', async (r) => {
    if (/\.(js|html)(\?|$)|\/$/.test(r.url()) || r.request().resourceType() === 'document') bodies.push(await r.text().catch(() => ''));
  });
  await page.goto('/');
  await page.goto('/login/farmer');
  // Not "network idle": the "I am human" check keeps a connection to Cloudflare open.
  await page.waitForLoadState('load');
  await page.waitForTimeout(3000);
  const all = bodies.join('\n');
  expect(all).not.toMatch(/sk-ant-[A-Za-z0-9_-]{10}|sb_secret_[A-Za-z0-9]{10}|SUPABASE_SERVICE_ROLE|KYC_DB_SECRET\s*[:=]\s*["'][^"']+|TURNSTILE_SECRET_KEY\s*[:=]\s*["'][^"']+/);
  // Any Supabase JWT in the page is the public anon key, never a service-role one.
  for (const jwt of all.match(/eyJ[\w-]{10,}\.eyJ[\w-]{10,}\.[\w-]{10,}/g) ?? []) {
    expect(JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString()).role).not.toBe('service_role');
  }
});
