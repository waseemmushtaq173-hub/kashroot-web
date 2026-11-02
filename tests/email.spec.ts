/**
 * What KashRoot's emails say (lib/emailLetters): each queued kind becomes the
 * right email to the right address, with no password, code, Aadhaar or bank
 * number, a link back to the site and the anti-phishing line. Plus the email
 * endpoints on a running copy (KR_BASE_URL): the status shows no secret, the
 * test email is for admins only, and the queue can be flushed by anyone
 * without saying more than counts. Model tests need no server.
 */
import { expect, test } from '@playwright/test';

import { deviceName, letterFor, redactForEmail, render, type Queued } from '@/lib/emailLetters';
import { NEVER_ASKS, SUPPORT_EMAIL } from '@/lib/supportEmail';

const SITE = 'https://kashroot-web.vercel.app';
const INBOX = 'kashrootsupport@gmail.com';
const base: Omit<Queued, 'kind'> = { id: 1, ref: null, detail: null, created_at: '2026-11-02T10:00:00Z', to: null, help: null };

test('the official address is kashrootsupport@gmail.com, and the warning does not spread it', () => {
  expect(SUPPORT_EMAIL).toBe('kashrootsupport@gmail.com');
  expect(NEVER_ASKS).toContain('never asks for your password, OTP, UPI PIN or card number');
  expect(NEVER_ASKS).not.toContain('@');
});

test('a customer’s words lose passwords, codes and long numbers, nothing else', () => {
  expect(redactForEmail('My password is Apple@123 please help')).toBe('My password is [hidden] please help');
  expect(redactForEmail('OTP 482913 did not work')).toBe('OTP [hidden] did not work');
  expect(redactForEmail('the code does not come')).toBe('the code does not come');
  expect(redactForEmail('my pincode is 190001')).toBe('my pincode is 190001');
  expect(redactForEmail('Aadhaar 1234 5678 9012 and account 001234567890')).toBe('Aadhaar [number hidden] and account [number hidden]');
  expect(redactForEmail('call me on 98765 43210')).toBe('call me on 98765 43210');
  expect(redactForEmail('मेरा पासवर्ड है kash123')).toBe('मेरा पासवर्ड है [hidden]');
  expect(redactForEmail('400 boxes at ₹120')).toBe('400 boxes at ₹120');
});

test('a new help request goes to the support inbox, with the Help desk link and the words made safe', () => {
  const l = letterFor(
    { ...base, kind: 'help_new', ref: 'H-3F9A2C1B', help: { name: 'Ali', phone: '9876543210', email: 'ali@test.in', topic: 'login', portal: 'farmer', lang: 'ur', message: 'OTP 123456 never came, Aadhaar 1234 5678 9012', signed_in: false } },
    SITE,
    INBOX,
  )!;
  expect(l.to).toBe(INBOX);
  expect(l.replyTo).toBe('ali@test.in');
  expect(l.subject).toBe('KashRoot help request H-3F9A2C1B — Signing in');
  const { text, html } = render(l);
  expect(text).toContain('9876543210');
  expect(text).not.toContain('123456');
  expect(text).not.toContain('1234 5678 9012');
  expect(text).toContain(`${SITE}/admin/dashboard?tab=help`);
  expect(text).toContain('Received: 2 Nov 2026');
  expect(html).toContain(NEVER_ASKS.replace(/'/g, '&#39;'));
});

test('a reply email carries the reply and a link to answer or settle it', () => {
  const l = letterFor({ ...base, kind: 'help_reply', ref: 'H-3F9A2C1B', to: 'ali@test.in', reply: 'Please try again now.' }, SITE, INBOX)!;
  expect(l.to).toBe('ali@test.in');
  expect(l.subject).toBe('Your KashRoot request H-3F9A2C1B has a reply');
  expect(render(l).text).toContain('Please try again now.');
  expect(l.action!.href).toBe(`${SITE}/support?code=H-3F9A2C1B#check-title`);
  expect(l.replyTo).toBeUndefined(); // the sender sets Reply-To: the support inbox
});

test('the person hears "we got it" and "resolved"', () => {
  const help = { name: 'Ali', phone: '9876543210', email: 'ali@test.in', topic: 'payment', portal: null, lang: 'en', message: 'x', signed_in: false };
  const ack = letterFor({ ...base, kind: 'help_ack', ref: 'H-3F9A2C1B', to: 'ali@test.in', help }, SITE, INBOX)!;
  expect(ack.subject).toBe('We got your request H-3F9A2C1B');
  expect(render(ack).text).toContain('(Payment)');
  const done = letterFor({ ...base, kind: 'help_resolved', ref: 'H-3F9A2C1B', to: 'ali@test.in', help }, SITE, INBOX)!;
  expect(done.subject).toBe('Your KashRoot request H-3F9A2C1B is resolved');
  expect(render(done).text).toContain('Still need help');
  // KashRoot's address is only in Help & support (and the Reply-To): never written in an email's words.
  for (const l of [ack, done]) expect(render(l).text).not.toContain(INBOX);
});

test('security notices go to the account, say what changed and what to do', () => {
  for (const kind of ['payout_changed', 'password_changed', 'email_changed', 'phone_changed', 'new_signin'] as const) {
    const l = letterFor({ ...base, kind, to: 'farmer@test.in', detail: kind === 'new_signin' ? 'Chrome on Android, Srinagar' : null }, SITE, INBOX)!;
    expect(l.to).toBe('farmer@test.in');
    const { text } = render(l);
    expect(text).toContain('If it was not you');
    expect(text).toContain(`${SITE}/support`);
    expect(text).not.toContain(INBOX);
    expect(text).toContain('2 Nov 2026');
  }
  expect(render(letterFor({ ...base, kind: 'new_signin', to: 'f@test.in', detail: 'Chrome on Android, Srinagar' }, SITE, INBOX)!).text).toContain('new device: Chrome on Android, Srinagar');
});

test('nowhere to send: no email', () => {
  expect(letterFor({ ...base, kind: 'help_reply', ref: 'H-1' }, SITE, INBOX)).toBeNull();
  expect(letterFor({ ...base, kind: 'help_new', ref: 'H-1' }, SITE, INBOX)).toBeNull();
});

test('the device is named plainly', () => {
  expect(deviceName('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36', 'Srinagar')).toBe('Chrome on Android, Srinagar');
  expect(deviceName('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1', 'New%20Delhi')).toBe('Safari on iPhone, New Delhi');
  expect(deviceName('', '<script>')).toBe('a browser, script');
});

test.describe('the email endpoints', () => {
  test.skip(!process.env.KR_BASE_URL, 'Set KR_BASE_URL to test a running copy.');

  test('the status says whether email is set up, never a password', async ({ request }) => {
    const res = await request.get('/api/email');
    expect(res.ok()).toBe(true);
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(['configured', 'from', 'inbox', 'settings']);
    // Which settings exist, as true/false (and the port, and which pair is used) — never a value.
    for (const [name, v] of Object.entries(body.settings as Record<string, unknown>)) {
      if (name === 'port') expect(typeof v).toBe('number');
      else if (name === 'using') expect(['SMTP_*', 'GMAIL_*', 'none']).toContain(v);
      else expect(typeof v, name).toBe('boolean');
    }
    expect(JSON.stringify(body)).not.toMatch(/secret/i);
  });

  test('the test email is for admins only', async ({ request }) => {
    expect((await request.post('/api/email', { data: { action: 'test' } })).status()).toBe(403);
    expect((await request.post('/api/email', { data: { action: 'test' }, headers: { authorization: 'Bearer not-a-real-token' } })).status()).toBe(403);
    expect((await request.post('/api/email', { data: { action: 'send', to: 'x@test.in' } })).status()).toBe(400);
  });

  test('anyone may flush the queue; the answer is counts only', async ({ request }) => {
    const res = await request.post('/api/email/flush');
    expect([200, 429]).toContain(res.status());
    if (res.ok()) {
      const body = await res.json();
      expect(Object.keys(body).sort()).toEqual(['codes', 'failed', 'sent']);
      // Short codes only: no mail-server sentences, no addresses.
      for (const c of body.codes as string[]) expect(c).toMatch(/^[a-z_]+: [A-Za-z0-9 -]+$/);
    }
  });
});
