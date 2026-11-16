/**
 * Soil and lab tests (20261128000000_soil_lab_tests.sql and the screens on it). The database rules themselves were
 * checked on a real Postgres with a farmer, a lab owner, lab staff, a stranger, an expert and the Super Admin; these are
 * the pure helpers and the source guards that keep those rules from being undone. No server needed.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

import { letterFor, type Queued } from '@/lib/emailLetters';
import { cleanResults, dataUrlToBlob, fileProblem, LAB_STATUS_LABEL, MAX_FILE_BYTES, totalFee, USUAL_SOIL_VALUES } from '@/lib/db/lab';
import { ratingTone } from '@/components/lab/LabReportView';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const SQL = read('supabase/migrations/20261128000000_soil_lab_tests.sql');
const fn = (name: string) => {
  const i = SQL.indexOf(`create or replace function public.${name}(`);
  expect(i, name).toBeGreaterThan(-1);
  return SQL.slice(i, SQL.indexOf('revoke all on function', i));
};

test('the values are kept as typed, trimmed, with blank rows dropped; a file is a PDF or photo of up to 2 MB', () => {
  expect(cleanResults([
    { parameter: ' pH ', value: ' 6.2 ', unit: '', rating: 'Neutral ' },
    { parameter: '', value: '', unit: '', rating: '' },
    { parameter: 'Zinc (Zn)', value: '  ', unit: '', rating: '' },
    { parameter: 'Organic carbon', value: '0.45', unit: '%', rating: 'Low' },
  ])).toEqual([
    { parameter: 'pH', value: '6.2', unit: '', rating: 'Neutral' },
    { parameter: 'Organic carbon', value: '0.45', unit: '%', rating: 'Low' },
  ]);
  expect(fileProblem({ size: 500_000, type: 'application/pdf' })).toBeNull();
  expect(fileProblem({ size: 1_900_000, type: 'image/jpeg' })).toBeNull();
  expect(fileProblem({ size: MAX_FILE_BYTES + 1, type: 'application/pdf' })).toMatch(/larger than 2 MB/);
  expect(fileProblem({ size: 100, type: 'application/x-msdownload' })).toMatch(/PDF or a photo/);
  // The names offered for a soil report are labels only: no number is ever filled in for the lab.
  expect(USUAL_SOIL_VALUES.every((n) => !/\d/.test(n.replace(/\(.*\)/, '')))).toBe(true);
  expect(totalFee(450, 100)).toBe(550);
});

test('the lab\'s own rating words are coloured by what they say, and the words are never changed', () => {
  expect(ratingTone('Low')).toBe('amber');
  expect(ratingTone('Very low')).toBe('red');
  expect(ratingTone('Deficient')).toBe('red');
  expect(ratingTone('Normal')).toBe('green');
  expect(ratingTone('Sufficient')).toBe('green');
  expect(ratingTone('whatever the lab wrote')).toBe('slate');
  expect(Object.keys(LAB_STATUS_LABEL)).toEqual(['requested', 'accepted', 'sample_collected', 'report_ready', 'declined', 'cancelled']);
});

test('the emails name only the booking code, the test and the district, and each goes to the right page', () => {
  const q = (kind: Queued['kind'], detail: string): Queued => ({ id: 1, kind, ref: 'LT-AB12CD', detail, created_at: '2026-11-20T04:30:00Z', to: 'someone@example.test', help: null });
  const site = 'https://kashroot.example';
  const lab = letterFor(q('lab_booking_new', 'Soil: pH, EC · Shopian'), site, 'inbox@example.test');
  expect(lab?.subject).toBe('New test request LT-AB12CD');
  expect(lab?.action?.href).toBe(`${site}/business/dashboard`);
  expect(lab?.lines.join(' ')).toContain('Soil: pH, EC · Shopian');
  const upd = letterFor(q('lab_booking_update', 'Accepted: visit 24 Nov 10:00'), site, 'inbox@example.test');
  expect(upd?.subject).toContain('Accepted: visit 24 Nov 10:00');
  expect(upd?.action?.href).toBe(`${site}/farmer/dashboard?tab=tests`);
  const rep = letterFor(q('lab_report_ready', 'Soil: pH, EC'), site, 'inbox@example.test');
  expect(rep?.subject).toBe('Your test report is ready (LT-AB12CD)');
  expect(rep?.lines.join(' ')).not.toMatch(/\d\s*%|pH \d/);
  expect(letterFor(q('lab_booking_cancelled', 'Soil · Shopian'), site, 'inbox@example.test')?.action?.href).toBe(`${site}/business/dashboard`);
  // Nowhere to send: no letter.
  expect(letterFor({ ...q('lab_booking_new', 'x'), to: null }, site, 'inbox@example.test')).toBeNull();
});

test('nobody reads or writes the tables directly: every one is locked down and every function checks who is asking', () => {
  for (const t of ['lab_profiles', 'lab_tests', 'lab_bookings', 'lab_reports']) expect(SQL).toContain(`alter table public.${t} enable row level security;`);
  expect(SQL).toContain('revoke all on public.lab_profiles, public.lab_tests, public.lab_bookings, public.lab_reports from anon, authenticated;');
  expect(SQL).not.toMatch(/create policy/i);
  // Every function is security definer with a fixed search_path (the SQL gate checks this too) and none is open to anon.
  const names = [...SQL.matchAll(/create or replace function public\.(kr_lab_\w+)\(/g)].map((m) => m[1]);
  expect(names.length).toBeGreaterThanOrEqual(15);
  for (const n of names) {
    const body = fn(n);
    expect(body, n).toMatch(/security definer set search_path = public/);
    expect(SQL, n).toMatch(new RegExp(`revoke all on function public\\.${n}\\([^)]*\\) from public, anon`));
  }
  // The report's file is fetched on its own, and only who may read the report may fetch it.
  expect(fn('kr_lab_report')).not.toContain('file_data,');
  expect(fn('kr_lab_report')).toContain('kr_lab_can_read(p_booking)');
  expect(fn('kr_lab_report_file')).toContain('kr_lab_can_read(p_booking)');
  expect(fn('kr_lab_my_bookings')).not.toContain('file_data');
  expect(fn('kr_lab_org_bookings')).not.toContain('file_data');
});

test('who may read a report: the farmer, the lab\'s people, the Super Admin, and an expert only once the farmer asked', () => {
  const can = fn('kr_lab_can_read');
  expect(can).toContain('b.farmer_id = auth.uid()');
  expect(can).toContain('public.kr_org_role(b.org_id) is not null');
  expect(can).toContain('public.kr_is_super_admin()');
  expect(can).toMatch(/kr_has_role\('EXPERT'\) and exists \(select 1 from public\.advisory_requests a where a\.lab_booking_id = b\.id\)/);
  // Oversight has no phone numbers or addresses.
  const o = fn('kr_lab_oversight');
  expect(o).not.toMatch(/farmer_phone|visit_address|visit_lat/);
  expect(o).toContain("kr_team_can('businesses')");
});

test('a booking is checked in the database: a lab that serves the district, not your own lab, not more than 10 open, a real day', () => {
  const b = fn('kr_lab_book');
  expect(b).toContain('public.kr_org_role(o.id) is not null');
  expect(b).toMatch(/lower\(d\) = lower\(dist\)/);
  expect(b).toMatch(/>= 10 then/);
  expect(b).toContain('p_date < today or p_date > today + 60');
  expect(b).toContain("o.suspended_at is not null");
  // The lab people are emailed, with the code and the test and district only.
  expect(b).toContain("'lab_booking_new'");
  expect(b).toContain('left(b.test_name || \' · \' || b.district, 80)');
  expect(SQL).toMatch(/'lab_booking_new', 'lab_booking_cancelled', 'lab_booking_update', 'lab_report_ready'\)\)/);
  // Staff cannot change prices or details; staff can take requests and upload reports.
  expect(fn('kr_lab_save_test')).toContain('kr_lab_org_ok(p_org, true)');
  expect(fn('kr_lab_save_profile')).toContain('kr_lab_org_ok(p_org, true)');
  expect(fn('kr_lab_set_status')).toContain('kr_lab_org_ok(b.org_id, false)');
  expect(fn('kr_lab_add_report')).toContain('kr_lab_org_ok(b.org_id, false)');
  // A suspended business changes nothing.
  expect(fn('kr_lab_org_ok')).toContain('kr_org_writable(p_org)');
});

test('no SQL here passes Postgres more than 100 arguments to one call, and the file it is part of keeps re-running safely', () => {
  const widest = (sql: string) => {
    let w = 0;
    for (const m of sql.replace(/--[^\n]*/g, '').matchAll(/\bj?sonb?_build_object\s*\(/g)) {
      const text = sql.replace(/--[^\n]*/g, '');
      let depth = 1, args = 1, quoted = false;
      for (let i = (m.index ?? 0) + m[0].length; i < text.length && depth > 0; i++) {
        const ch = text[i];
        if (ch === "'") quoted = !quoted;
        else if (!quoted) { if (ch === '(') depth++; else if (ch === ')') depth--; else if (ch === ',' && depth === 1) args++; }
      }
      w = Math.max(w, args);
    }
    return w;
  };
  expect(widest(SQL)).toBeLessThanOrEqual(100);
  const once = read('supabase/RUN_THIS_ONCE.sql');
  expect(once).toContain('-- ════════ 20261128000000_soil_lab_tests.sql ════════');
  expect(once).toContain("(52, 'Soil and lab tests: labs, bookings, reports, expert advice'");
  // Older sections re-add the email-kind rule with their shorter list: they must not fail once lab emails exist.
  const adds = [...once.matchAll(/alter table public\.email_outbox add constraint email_outbox_kind_check check \(kind in \([\s\S]*?\)\)( not valid)?;/g)];
  expect(adds.length).toBeGreaterThanOrEqual(5);
  for (const a of adds) if (!a[0].includes('lab_booking_new')) expect(a[0], 'an older email-kind rule must skip rows already there').toContain('not valid;');
  // The setup file's step rows must not name a table that a fresh database does not have yet (a regclass cast fails there).
  expect(once.slice(once.indexOf('create or replace function public.kr_setup_rows'), once.indexOf('revoke all on function public.kr_setup_rows'))).not.toMatch(/::regclass/);
});

test('the screens: a farmer\'s tab, the lab\'s own section, the report on the advice thread, the Hub\'s read-only view', () => {
  const farmer = read('src/app/(dashboards)/farmer/dashboard/page.tsx');
  expect(farmer).toContain("{ id: 'tests', label: 'Soil & lab tests', icon: FlaskConical }");
  expect(farmer).toContain("{tab === 'tests' && <SoilLabTests account={account} />}");
  const biz = read('src/components/business/BusinessConsole.tsx');
  expect(biz).toContain("{ value: 'soil_lab', label: 'Lab / soil testing' }");
  expect(biz).toContain("org.kind === 'soil_lab' && !suspended && <LabConsole");
  const hub = read('src/app/(dashboards)/hub/dashboard/page.tsx');
  expect(hub).toContain("{ id: 'labs', label: 'Soil & lab tests', icon: FlaskConical, section: 'businesses' }");
  // The advice desk opens before the update is run: the booking link is fetched on its own and quietly.
  const adv = read('src/lib/db/advisory.ts');
  const columns = adv.match(/const COLUMNS = '([^']*)'/)?.[1] ?? '';
  expect(columns).not.toContain('lab_booking_id');
  expect(adv).toContain('export async function labBookingOf');
  expect(read('src/components/advisory/RequestThread.tsx')).toContain('<LabReportView bookingId={labBooking} />');
  // Honest wording: the price is paid to the lab, the results are the lab's own.
  const form = read('src/components/lab/SoilLabTests.tsx');
  expect(form).toContain('You pay the lab directly; KashRoot does not take the money.');
  expect(read('src/components/lab/LabReportView.tsx')).toContain('These are the lab’s own results. KashRoot does not change them.');
  // Before the SQL is run, the farmer is told what to do instead of seeing a broken page.
  expect(read('src/lib/db/lab.ts')).toContain('the KashRoot team must run supabase/RUN_THIS_ONCE.sql (step 52)');
});

test('the lab\'s file is decoded here, never fetched from a data: address (the site\'s security policy blocks that)', async () => {
  const blob = dataUrlToBlob('data:application/pdf;base64,JVBERi0xLjQK');
  expect(blob.type).toBe('application/pdf');
  expect(Buffer.from(await blob.arrayBuffer()).toString('latin1')).toBe('%PDF-1.4\n');
  expect(() => dataUrlToBlob('not a data address')).toThrow(/could not be read/);
  const view = read('src/components/lab/LabReportView.tsx');
  expect(view).toContain('dataUrlToBlob(f.data)');
  expect(view).not.toMatch(/fetch\(/);
  expect(read('next.config.ts')).not.toMatch(/connect-src[^\n]*data:/);
});
