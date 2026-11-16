/**
 * Where a slow sign-in spends its time (lib/auth/signinTiming), what the sign-in proxy tells the browser, and the speed check
 * in Admin → Setup check. The numbers below are made up for these tests.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

import { describeTimings, stepNameOf, STEP_NOW, type TimingEntry } from '@/lib/auth/signinTiming';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const row = (o: Partial<TimingEntry>): TimingEntry => ({ name: 'https://kashroot.example/api/supabase/auth/v1/token?grant_type=password', duration: 100, waiting: 0, connecting: 0, serverTiming: [], ...o });

test('the calls of a sign-in are named as a person would, and only those', () => {
  expect(stepNameOf('https://x.test/api/supabase/auth/v1/token?grant_type=password')).toBe('password check');
  expect(stepNameOf('https://x.test/api/supabase/rest/v1/staff_roles?select=role&user_id=eq.1')).toBe('account lookup');
  expect(stepNameOf('https://x.test/api/otp/send')).toBe('sending the code');
  expect(stepNameOf('https://x.test/_next/static/chunks/app.js')).toBeNull();
  expect(STEP_NOW.password).toBe('Still checking your password…');
  expect(STEP_NOW.account).toBe('Still loading your account…');
});

test('a slow step says how long, and whether the wait was the connection, KashRoot\'s checks or Supabase', () => {
  const lines = describeTimings([
    row({ duration: 6100, waiting: 5600, connecting: 400, serverTiming: [{ name: 'guard', duration: 200 }, { name: 'upstream', duration: 5300 }] }),
    row({ name: 'https://kashroot.example/api/supabase/rest/v1/staff_roles?select=role', duration: 300, waiting: 280 }),
  ]);
  expect(lines).toEqual([
    'password check 6.1 s (connecting 0.4 s, waiting for KashRoot 5.6 s: its checks 0.2 s, Supabase 5.3 s)',
    'account lookup 0.3 s (waiting for KashRoot 0.3 s)',
  ]);
  // A fast step has nothing to explain; a long download is named too; nothing measured gives nothing.
  expect(describeTimings([row({ duration: 60, waiting: 40 })])).toEqual(['password check 0.1 s']);
  expect(describeTimings([row({ duration: 4000, waiting: 100, connecting: 0 })])[0]).toContain('downloading 3.9 s');
  expect(describeTimings([])).toEqual([]);
});

test('the form names the call it waits for, stops at the limit saying which, and the proxy times its parts', () => {
  const form = read('src/components/auth/RoleLoginForm.tsx');
  expect(form).toContain("authApi.login({ email: email.trim(), password }, (s) => {");
  expect(form).toContain('const startedAt = event.timeStamp;');
  expect(read('src/lib/api/auth.ts')).toContain("onStep?.('password');");
  expect(read('src/lib/api/auth.ts')).toContain("onStep?.('account');");
  const proxy = read('src/app/api/supabase/[...path]/route.ts');
  // Server-Timing: the guard and Supabase, on the password sign-in only.
  expect(proxy).toContain("out.set('server-timing', `guard;dur=${guardMs}, upstream;dur=${Date.now() - tUp}`)");
  // Forgetting earlier wrong passwords is done after the answer, not waited for.
  expect(proxy).toContain('after(forget);');
  expect(proxy).not.toMatch(/await rightPassword\(/);
  // The wrong-password counts still work: recorded before the answer, as before.
  expect(proxy).toContain('await recordWrongPassword(request, who, whoKey, ip);');
});

test('Admin → Setup check measures the speed of the database and the sign-in service from the server', () => {
  const health = read('src/app/api/health/route.ts');
  expect(health).toContain("searchParams.get('speed') === '1'");
  expect(health).toContain('/auth/v1/health');
  expect(health).toContain('VERCEL_REGION');
  const panel = read('src/components/admin/SetupCheckPanel.tsx');
  expect(panel).toContain('<SignInSpeed />');
  expect(panel).toContain("fetch('/api/health?speed=1'");
  expect(panel).toContain('Project Settings → General');
  expect(panel).not.toMatch(/Math\.random|faker|lorem/i);
});
