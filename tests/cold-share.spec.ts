/**
 * Sharing a bin needs the first farmer's yes (supabase/migrations/20261202000000_cold_share_consent.sql, lib/db/coldShare,
 * components/rental/ShareConsent). The database's own behaviour is tested in supabase/tests/99h_cold_share.sql; here: the words
 * the farmers read, the e-mails (never a surname or phone), the screens (answer yes or no, waiting, told no) and the guards that
 * keep the pieces joined. The browser part needs a server started with KR_TEST_PAGES=1 (KR_BASE_URL says where).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

import { letterFor, type Queued } from '@/lib/emailLetters';
import { waitingText } from '@/lib/db/coldShare';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

test('what the farmer waiting reads: one farmer, several, a no, and nothing when there is nothing to wait for', () => {
  const s = (state: 'none' | 'asked' | 'declined' | 'allowed', waiting = 0) => ({ booking_id: 'x', state, waiting });
  expect(waitingText(s('asked', 1))).toMatch(/as soon as they say yes/);
  expect(waitingText(s('asked', 3))).toMatch(/3 farmers/);
  expect(waitingText(s('declined'))).toMatch(/said no.*cancelled/);
  expect(waitingText(s('allowed'))).toBeNull();
  expect(waitingText(s('none'))).toBeNull();
  expect(waitingText(undefined)).toBeNull();
});

const q = (kind: Queued['kind'], detail: string): Queued => ({ id: 1, kind, ref: 'CS-1A2B3C4D', detail, created_at: '2026-11-22T08:00:00Z', to: 'farmer@example.test', help: null });
const site = 'https://kashroot.test';

test('the two e-mails: who is asked, and who is told, with the place and how many and no one\'s name', () => {
  const ask = letterFor(q('cold_share_ask', '40 crates · Chamber 1 · Row 3, stack 2'), site, 'inbox@example.test');
  expect(ask?.to).toBe('farmer@example.test');
  expect(ask?.subject).toContain('40 crates');
  expect(ask?.lines.join('\n')).toMatch(/only if you say yes/);
  expect(ask?.lines.join('\n')).toMatch(/24 hours/);
  expect(ask?.action?.href).toBe(`${site}/rental/dashboard?tab=bookings`);
  const yes = letterFor(q('cold_share_answer', 'Yes: 40 crates · Chamber 1 · Row 3, stack 2'), site, 'inbox@example.test');
  expect(yes?.lines.join('\n')).toMatch(/pay the owner now/);
  const no = letterFor(q('cold_share_answer', 'No: 40 crates · Chamber 1 · Row 3, stack 2'), site, 'inbox@example.test');
  expect(no?.lines.join('\n')).toMatch(/cancelled/);
  // Nobody to send to: nothing is sent.
  expect(letterFor({ ...q('cold_share_ask', 'x'), to: null }, site, 'inbox@example.test')).toBeNull();
});

test('the database pieces are joined: closed table, pay and confirm wait for the yes, the newest e-mail list, the run-once step', () => {
  const sql = read('supabase/migrations/20261202000000_cold_share_consent.sql');
  // Closed to every browser key; read and changed only through the functions.
  expect(sql).toContain('alter table public.cold_share_requests enable row level security;');
  expect(sql).toContain("select public.kr_close_table('cold_share_requests');");
  // Both ways to move money forward wait for the yes (a no also stops them).
  expect(sql).toMatch(/share := public\.kr_cold_share_state\(b\.id\);[\s\S]*share = 'asked'[\s\S]*share = 'declined'/);
  expect(sql).toContain("public.kr_cold_share_state(b.id) in ('asked', 'declined')");
  // Only the farmer asked may answer, with the same words for a request that does not exist.
  expect(sql).toContain('r.holder_id <> auth.uid()');
  expect(sql.match(/not yours to answer/g)?.length).toBe(1);
  // Never a surname or a phone in the inbox or the e-mails.
  expect(sql).toContain("split_part(btrim(b.renter_name), ' ', 1)");
  expect(sql.slice(sql.indexOf('create or replace function public.kr_cold_share_inbox'))).not.toMatch(/renter_phone/);
  // Each e-mail trigger catches its own errors: a booking never fails because an e-mail could not be queued.
  expect(sql.match(/exception when others then/g)?.length).toBe(2);
  // Every function that is not a trigger is guarded (search path fixed, closed to the signed-out).
  expect(sql.match(/set search_path = public/g)?.length).toBeGreaterThanOrEqual(8);
  expect(sql).toContain('revoke all on function public.kr_cold_share_inbox() from public, anon;');
  expect(sql).toContain('revoke all on function public.kr_cold_share_state(uuid) from public, anon, authenticated;');
  // This migration holds the newest, strict list of e-mail kinds; the one before it skips rows already there.
  expect(sql).toContain("'hub_order_new', 'hub_order_packed',\n  'cold_share_ask', 'cold_share_answer'));");
  const once = read('supabase/RUN_THIS_ONCE.sql');
  expect(once).toContain('-- ════════ 20261202000000_cold_share_consent.sql ════════');
  expect(once).toContain("(56, 'Cold store: sharing a bin needs the first farmer''s yes', '20261202000000_cold_share_consent.sql'");
  const adds = [...once.matchAll(/alter table public\.email_outbox add constraint email_outbox_kind_check check \(kind in \([\s\S]*?\)\)( not valid)?;/g)];
  adds.slice(0, -1).forEach((a) => expect(a[0], 'an older email-kind rule must skip rows already there').toContain('not valid;'));
  expect(adds[adds.length - 1][0]).not.toContain('not valid');
  expect(adds[adds.length - 1][0]).toContain("'cold_share_answer'");
});

test('the screens use it: both places that take a payment wait for the yes, the owner cannot press "Money received" early', () => {
  const booking = read('src/components/rental/ColdBooking.tsx');
  expect(booking).toContain('useShareStatus(booked?.id');
  expect(booking).toMatch(/\{!waitingOnShare && \(\s*<div className="rounded-xl bg-white p-4 ring-1 ring-slate-200">/);
  const dash = read('src/app/(dashboards)/rental/dashboard/page.tsx');
  expect(dash).toContain("share?.state !== 'asked' && share?.state !== 'declined' && (");
  expect(dash).toContain('disabled={busy || waitingOnShare}');
  expect(dash).toContain('<ShareRequests onChange');
});

test.describe('the screens', () => {
  const inbox = [
    { request_id: '11111111-1111-4111-8111-111111111111', store: 'Test Cold Store', chamber: 'Chamber 1', place: 'Chamber 1 · Row 3, stack 2', storage: 'crates', boxes: 40, months: 3, start_date: '2026-12-01', asker: 'Bashir', state: 'asked', asked_at: '2026-11-22T08:00:00Z', ends_at: '2026-11-23T08:00:00Z' },
    { request_id: '22222222-2222-4222-8222-222222222222', store: 'Test Cold Store', chamber: 'Chamber 1', place: 'Chamber 1 · Row 1, stack 1', storage: 'crates', boxes: 10, months: 2, start_date: '2026-12-01', asker: 'Mushtaq', state: 'declined', asked_at: '2026-11-21T08:00:00Z', ends_at: '2026-11-22T08:00:00Z' },
  ];
  const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) });

  test('the farmer asked sees first name and how many, and a Yes that is saved', async ({ page }) => {
    const answers: unknown[] = [];
    await page.route('**/api/supabase/**', async (route) => {
      const url = route.request().url();
      if (url.includes('/rpc/kr_cold_share_inbox')) return route.fulfill(json(inbox));
      if (url.includes('/rpc/kr_cold_share_decide')) {
        answers.push(JSON.parse(route.request().postData() ?? '{}'));
        return route.fulfill(json('allowed'));
      }
      return route.fulfill(json([]));
    });
    await page.goto('/test-pages/share', { waitUntil: 'load' });
    const request = page.getByTestId('share-request');
    await expect(request).toHaveCount(1);
    await expect(request).toContainText('Bashir asks for 40 crates in your bin');
    await expect(request).toContainText('Chamber 1 · Row 3, stack 2');
    await expect(request).toContainText('Answer before');
    // Never a phone, a surname or the other farmer's booking.
    await expect(page.getByLabel('Answered requests')).toContainText('You said no · Mushtaq, 10 crates');
    await request.getByRole('button', { name: /Yes, allow/ }).click();
    await expect.poll(() => answers.length).toBe(1);
    expect(answers[0]).toEqual({ p_request: '11111111-1111-4111-8111-111111111111', p_allow: true });
  });

  test('a No is sent as a no, and an answer the database refuses is told in its own words', async ({ page }) => {
    const answers: { p_allow: boolean }[] = [];
    await page.route('**/api/supabase/**', async (route) => {
      const url = route.request().url();
      if (url.includes('/rpc/kr_cold_share_inbox')) return route.fulfill(json(inbox));
      if (url.includes('/rpc/kr_cold_share_decide')) {
        answers.push(JSON.parse(route.request().postData() ?? '{}'));
        return route.fulfill(json({ message: 'This request has ended: the other farmer’s 24 hours are over', code: 'P0001' }, 400));
      }
      return route.fulfill(json([]));
    });
    await page.goto('/test-pages/share', { waitUntil: 'load' });
    await page.getByTestId('share-request').getByRole('button', { name: 'No', exact: true }).click();
    await expect.poll(() => answers.length).toBe(1);
    expect(answers[0].p_allow).toBe(false);
    await expect(page.getByText('This request has ended').first()).toBeVisible();
  });

  test('the farmer waiting is told to wait, how many, and told no; nothing shows when there is nothing to wait for', async ({ page }) => {
    await page.route('**/api/supabase/**', (route) => route.fulfill(json([])));
    await page.goto('/test-pages/share', { waitUntil: 'load' });
    await expect(page.getByLabel('Waiting, one farmer').getByTestId('share-waiting')).toContainText('Waiting for the other farmer’s yes');
    await expect(page.getByLabel('Waiting, one farmer').getByRole('button', { name: 'Check again' })).toBeVisible();
    await expect(page.getByLabel('Waiting, two farmers').getByTestId('share-waiting')).toContainText('2 farmers already have bins');
    const no = page.getByLabel('Said no').getByTestId('share-waiting');
    await expect(no).toContainText('The other farmer said no');
    await expect(no.getByRole('button', { name: 'Check again' })).toHaveCount(0);
    await expect(page.getByLabel('Nothing to wait for').getByTestId('share-waiting')).toHaveCount(0);
  });
});
