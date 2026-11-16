/**
 * The queued emails (hub, order, lab, help) go out through Resend when it is set up and through SMTP otherwise, and one
 * dead route does not stop the other. No mail server is contacted: Resend is a stubbed fetch, SMTP is left unset.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

// 'server-only' refuses to load outside the server build; under this test it is made an empty module.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const serverOnly = require.resolve('server-only');
require.cache[serverOnly] = { id: serverOnly, filename: serverOnly, loaded: true, exports: {}, children: [], paths: [], path: '' } as unknown as NodeJS.Module;

// The "@/" shortcut for src/ in the server files this test loads at run time.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const nodeModule = require('node:module') as { _resolveFilename: (request: string, ...rest: unknown[]) => string };
const resolveFilename = nodeModule._resolveFilename;
nodeModule._resolveFilename = function (request: string, ...rest: unknown[]) {
  return resolveFilename.call(this, request.startsWith('@/') ? join(process.cwd(), 'src', request.slice(2)) : request, ...rest);
};

const KEYS = ['RESEND_API_KEY', 'RESEND_FROM', 'SMTP_USER', 'SMTP_PASS', 'SMTP_HOST', 'SMTP_PORT', 'GMAIL_USER', 'GMAIL_APP_PASSWORD', 'SUPPORT_EMAIL'] as const;
const saved: Record<string, string | undefined> = {};
const realFetch = globalThis.fetch;
test.beforeEach(() => {
  for (const k of KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});
test.afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  globalThis.fetch = realFetch;
});

const letter = { to: 'someone@example.test', subject: 'Order ABCD1234 coming to the hub', lines: ['100 box Apple'] };

type Call = { url: string; body: Record<string, unknown> | null; auth: string | null };
function stubResend(status: number, restricted = false): Call[] {
  const calls: Call[] = [];
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : null, auth: new Headers(init?.headers).get('authorization') });
    return new Response(restricted ? JSON.stringify({ name: 'restricted_api_key', message: 'sending only' }) : '{}', { status });
  }) as typeof fetch;
  return calls;
}

test('nothing is set up: it says so and sends nothing', async () => {
  const { mailStatus, sendLetter } = await import('../src/lib/server/mail');
  expect(mailStatus()).toMatchObject({ configured: false, from: null });
  const r = await sendLetter(letter);
  expect(r).toMatchObject({ ok: false });
  expect((r as { reason: string }).reason).toMatch(/^email is not set up \(RESEND_API_KEY and RESEND_FROM, or SMTP_USER and SMTP_PASS/);
});

test('Resend with a sender is enough: no Gmail App Password needed, and the letter has the sender, the address and a reply-to', async () => {
  process.env.RESEND_API_KEY = 're_test_key';
  process.env.RESEND_FROM = 'KashRoot <alerts@mail.example.test>';
  const calls = stubResend(200);
  const { mailStatus, sendLetter } = await import('../src/lib/server/mail');
  expect(mailStatus()).toMatchObject({ configured: true, from: 'alerts@mail.example.test' });
  expect(mailStatus().settings.using).toBe('Resend');
  expect(await sendLetter(letter)).toEqual({ ok: true });
  expect(calls).toHaveLength(1);
  expect(calls[0].url).toBe('https://api.resend.com/emails');
  expect(calls[0].auth).toBe('Bearer re_test_key');
  expect(calls[0].body).toMatchObject({ from: 'KashRoot <alerts@mail.example.test>', to: ['someone@example.test'], subject: letter.subject });
  expect(String(calls[0].body?.html)).toContain('100 box Apple');
  // A bare address gets the KashRoot name.
  process.env.RESEND_FROM = 'alerts@mail.example.test';
  await sendLetter(letter);
  expect(calls[1].body?.from).toBe('KashRoot <alerts@mail.example.test>');
});

test('a key with no sender is not used (Resend would only reach its own account holder)', async () => {
  process.env.RESEND_API_KEY = 're_test_key';
  const calls = stubResend(200);
  const { mailStatus, sendLetter } = await import('../src/lib/server/mail');
  expect(mailStatus().configured).toBe(false);
  expect((await sendLetter(letter)).ok).toBe(false);
  expect(calls).toHaveLength(0);
});

test('a refusal is reported by its status and what to check, never by Resend\'s own words', async () => {
  process.env.RESEND_API_KEY = 're_test_key';
  process.env.RESEND_FROM = 'alerts@mail.example.test';
  for (const [status, text] of [[401, /check RESEND_API_KEY/], [403, /verified in Resend/], [422, /verified in Resend/], [429, /sending limit/]] as const) {
    stubResend(status);
    const { sendLetter } = await import('../src/lib/server/mail');
    const r = (await sendLetter(letter)) as { ok: false; reason: string };
    expect(r.ok).toBe(false);
    expect(r.reason).toContain(`Resend ${status}`);
    expect(r.reason).toMatch(text);
    expect(r.reason).not.toContain('re_test_key');
  }
  globalThis.fetch = (async () => {
    throw new Error('network down');
  }) as typeof fetch;
  const { sendLetter } = await import('../src/lib/server/mail');
  expect(((await sendLetter(letter)) as { reason: string }).reason).toMatch(/^Resend unreachable/);
});

test('the login check: a good key passes, a key limited to sending passes, a rejected key says its status', async () => {
  process.env.RESEND_API_KEY = 're_test_key';
  process.env.RESEND_FROM = 'alerts@mail.example.test';
  const { verifyLogin } = await import('../src/lib/server/mail');
  const calls = stubResend(200);
  expect(await verifyLogin()).toEqual({ ok: true });
  expect(calls[0].url).toBe('https://api.resend.com/domains');
  stubResend(401, true);
  expect(await verifyLogin()).toEqual({ ok: true });
  stubResend(401);
  expect(await verifyLogin()).toEqual({ ok: false, code: 'resend 401' });
});

test('the screens and settings name the Resend route', () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
  expect(read('src/components/admin/SetupCheckPanel.tsx')).toContain('RESEND_API_KEY and RESEND_FROM');
  expect(read('.env.example')).toMatch(/RESEND_API_KEY=/);
  // The queue sends when either route is set up, not only SMTP.
  expect(read('src/lib/server/mail.ts')).toContain('if (!smtp() && !resend()) return');
});
