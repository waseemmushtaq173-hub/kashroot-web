/**
 * The CIB&RC lists keep themselves current: which file of each list is the newest, which fetched file is newer than the
 * one in use, and that an old list under a new name is not taken. The scripts are plain Python and are run here as the
 * weekly job runs them. Needs python3 only (no PDFs are read).
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

const py = (code: string) => execFileSync('python3', ['-c', code], { cwd: join(process.cwd(), 'scripts'), encoding: 'utf8' }).trim();

test('the newest file of each list is chosen by the date in its name, whatever the year spelling', () => {
  const out = py(`
import json, os, tempfile
from cibrc_files import newest
d = tempfile.mkdtemp()
for n in ['list_of_pesticides_as_on_31.03.2026.pdf', 'list_of_pesticides_as_on_30.09.2026.pdf', 'list_of_pesticides_as_on_31.03.2025.pdf',
          'list_of_pesticides_which_are_banned_refused_registration_and_restricted_in_use_31.10.26.pdf',
          'list_of_pesticides_which_are_banned_refused_registration_and_restricted_in_use_30.04.2027.pdf',
          '7._formulation_approved_for_public_health_household_and_rodenticideUpdated_31.07.2026.pdf',
          'approved_pesticides_for_desert_locust_control.pdf', 'notes.txt', 'something_else_01.01.2030.pdf']:
    open(os.path.join(d, n), 'w').close()
print(json.dumps(newest(d)))
`);
  const got = JSON.parse(out) as Record<string, string>;
  expect(got.pesticides).toBe('list_of_pesticides_as_on_30.09.2026.pdf');
  expect(got.banned).toContain('30.04.2027');
  expect(got.household).toContain('31.07.2026');
  expect(got.locust).toBe('approved_pesticides_for_desert_locust_control.pdf');
  expect(Object.keys(got).sort()).toEqual(['banned', 'household', 'locust', 'pesticides']);
});

test('only a list newer than the one in use is taken, and only if it is a real PDF', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cibrc-'));
  const from = join(dir, 'fetched');
  const to = join(dir, 'in-use');
  mkdirSync(from);
  mkdirSync(to);
  const pdf = (folder: string, name: string, body = '%PDF-1.4 ' + 'x'.repeat(20_000)) => writeFileSync(join(folder, name), body);
  pdf(to, 'list_of_pesticides_as_on_31.03.2026.pdf');
  pdf(to, 'approved_pesticides_for_desert_locust_control.pdf');
  pdf(from, 'list_of_pesticides_as_on_31.03.2026.pdf'); // same date: not newer
  pdf(from, 'list_of_pesticides_as_on_30.09.2025.pdf'); // older
  pdf(from, 'list_of_pesticides_as_on_30.09.2026.pdf'); // newer
  pdf(from, 'list_pf_pesticide_formulations_registered_as_on_30.09.2026.pdf', 'This is a web page, not a PDF. ' + 'x'.repeat(20_000));
  pdf(from, 'approved_pesticides_for_desert_locust_control.pdf'); // undated and already held
  const out = execFileSync('python3', ['scripts/update-cibrc-lists.py', '--from', from, '--to', to], { cwd: process.cwd(), encoding: 'utf8' });
  expect(out).toContain('NEW list_of_pesticides_as_on_30.09.2026.pdf');
  expect(out).toContain('SKIP list_pf_pesticide_formulations_registered_as_on_30.09.2026.pdf');
  expect(out).not.toContain('NEW list_of_pesticides_as_on_30.09.2025.pdf');
  expect(readdirSync(to).sort()).toEqual(['approved_pesticides_for_desert_locust_control.pdf', 'list_of_pesticides_as_on_30.09.2026.pdf', 'list_of_pesticides_as_on_31.03.2026.pdf']);
  // Run again: nothing newer, nothing changes.
  expect(execFileSync('python3', ['scripts/update-cibrc-lists.py', '--from', from, '--to', to], { cwd: process.cwd(), encoding: 'utf8' })).toContain('Nothing newer');
});

test('a list named for one date but printed with another is refused (an old list under a new name)', () => {
  const out = py(`
from cibrc_files import printed_date_matches as ok
print(ok('list_of_pesticides_as_on_30.09.2026.pdf', '30.09.2026'), ok('list_of_pesticides_as_on_30.09.2026.pdf', '31.03.2026'),
      ok('7._formulation_approved_for_public_health_household_and_rodenticideUpdated_31.07.2026.pdf', '31.7.2026'),
      ok('list_of_pesticides_which_are_banned_refused_registration_and_restricted_in_use_31.10.26.pdf', '31.10.2026'),
      ok('approved_pesticides_for_desert_locust_control.pdf', None))
`);
  expect(out).toBe('True False True True True');
});

test('the weekly job only offers a pull request: it never pushes to main or merges', () => {
  const wf = readFileSync(join(process.cwd(), '.github/workflows/update-cibrc-lists.yml'), 'utf8');
  expect(wf).toContain('schedule:');
  expect(wf).toMatch(/git push origin "\$branch"/);
  expect(wf).not.toMatch(/git push origin (main|HEAD)/);
  expect(wf).not.toMatch(/gh pr merge/);
});
