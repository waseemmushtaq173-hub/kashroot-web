/**
 * Signing in never hangs without an answer: after 4 seconds the person is told the connection is slow, and after 25 seconds
 * it stops with a plain message so they can press Sign in again. Source guards, no server needed.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

test('sign-in tells the person when it is slow and stops after a time limit', () => {
  const form = readFileSync(join(process.cwd(), 'src/components/auth/RoleLoginForm.tsx'), 'utf8');
  expect(form).toContain('const SLOW_AFTER_MS = 4_000;');
  expect(form).toContain('const SIGN_IN_LIMIT_MS = 25_000;');
  expect(form).toContain('Promise.race([');
  expect(form).toContain('reject(new Error(`${SIGN_IN_TOO_SLOW}');
  expect(form).toContain('Your connection is slow: this can take up to 25 seconds. Please wait.');
  // It says which call it is waiting for, and where the time went once it finishes slow.
  expect(form).toContain('STEP_NOW[stepNow]');
  expect(form).toContain('describeTimings(timingEntries(');
  expect(form).toContain('(It stopped at ${STOPPED_AT[waitingFor]}.)');
  // Both timers are cleared however the attempt ends, and the spinner is released.
  const finallyBlock = form.slice(form.indexOf('window.clearTimeout(slowTimer);'), form.indexOf('/** One-time code to the account'));
  expect(finallyBlock).toContain('window.clearTimeout(limitTimer);');
  expect(finallyBlock).toContain('if (!navigating) setPending(false);');
});
