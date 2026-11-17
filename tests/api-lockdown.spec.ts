/**
 * The doors of the server that lead to private records (the cold store, the business admin, live tracking, photo checks,
 * the price board) ask who is calling and decide from the database, never from a field the request carries; and the browser
 * never asks the database for a column it must not read. A live check of the project (a signed-out visitor with the public
 * key) had read drivers and their PIN hashes, vehicles, live GPS pings, cold-store bookings with farmers' phones, a
 * business's PAN, and the payout account (UPI id, bank account) of a farmer's listing: these tests keep that from coming back.
 * They read the source: no server and no database are needed.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const walk = (dir: string, out: string[] = []): string[] => {
  for (const f of readdirSync(join(process.cwd(), dir))) {
    const p = `${dir}/${f}`;
    if (statSync(join(process.cwd(), p)).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(f)) out.push(p);
  }
  return out;
};

const PRIVATE_ROUTES = [
  'src/app/api/admin/hierarchy/route.ts',
  'src/app/api/cold-storage/operations/route.ts',
  'src/app/api/cold-storage/book-units/route.ts',
  'src/app/api/logistics/track/route.ts',
  'src/app/api/products/verify-photo/route.ts',
  'src/app/api/photos/geo-verify/route.ts',
  'src/app/api/price-comparison/route.ts',
];

test('every private route signs the caller in, and none of them keeps its own anon-key database client', () => {
  for (const f of PRIVATE_ROUTES) {
    const s = read(f);
    expect(s, `${f} must verify the caller`).toContain('verifiedCaller');
    expect(s, `${f} must not make its own database client`).not.toMatch(/function getSupabase(Server)?\(/);
    expect(s, `${f} must not fall back to the public key by itself`).not.toContain('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }
});

test('the caller is the database\'s answer: no role, farmer, actor or rate is taken from the address or the body', () => {
  const ops = read('src/app/api/cold-storage/operations/route.ts');
  expect(ops).not.toContain("searchParams.get('viewerRole')");
  expect(ops).not.toContain("searchParams.get('farmerId')");
  expect(ops).toContain('runsFacility');
  const h = read('src/app/api/admin/hierarchy/route.ts');
  expect(h).not.toMatch(/body\.actorName|body\.actorRole/);
  expect(h).not.toContain('Waseem');
  expect(h).toContain('access.superAdmin');
  expect(h, 'a business is opened only by its owner, its staff or the Super Admin').toContain('access.orgIds.includes');
  // The oversight flag is honoured only for the Super Admin.
  expect(h).toMatch(/isSuperadminOversight = access\.superAdmin && /);
  const units = read('src/app/api/cold-storage/book-units/route.ts');
  expect(units, 'a farmer\'s request can never say it is paid').toContain('Only the cold storage owner can mark places as paid.');
  expect(units).toContain('kr-booking-${payload.bookingId}');
  expect(units, 'the booking must be the caller\'s').toContain("renter_id");
  const track = read('src/app/api/logistics/track/route.ts');
  expect(track).toContain('Only the driver of this trip can send its location.');
  expect(track).toContain('The fleet registry is for the KashRoot team.');
  const price = read('src/app/api/price-comparison/route.ts');
  expect(price).toContain('seller_id: caller.id');
  expect(price).not.toMatch(/seller_id: q\.sellerId/);
});

test('an e-mail is matched exactly, never as a pattern', () => {
  const auth = read('src/lib/server/callerAuth.ts');
  expect(auth, 'ilike would let "_" or "%" in an address match other addresses').not.toContain('ilike');
  expect(auth).toContain(".eq('owner_email', caller.email)");
});

test('a reply never carries the database\'s own words (table, column or policy names)', () => {
  for (const f of walk('src/app/api')) {
    if (!f.endsWith('route.ts')) continue;
    const s = read(f);
    // `error: <something>.message` is a database message on its way to the screen (errors of our own classes are fine).
    const bad = s.split('\n').filter((l) => /error:\s*(?:[a-zA-Z]+Err|error|err|e)\??\.message/.test(l) && !/instanceof/.test(l));
    expect(bad, `${f} returns a raw database message`).toEqual([]);
  }
});

test('the browser asks for named columns of the listings, never *, and never for the payout account', () => {
  for (const f of walk('src')) {
    if (f.startsWith('src/app/api') || f.startsWith('src/lib/server')) continue;
    const s = read(f);
    expect(s, `${f} reads market_listings with *`).not.toMatch(/from\('market_listings'\)\s*\.select\('\*'\)/);
  }
  const biz = read('src/components/business/BusinessConsole.tsx');
  expect(biz).toContain('MARKET_COLUMNS');
  expect(biz).not.toContain("const cols = '*'");
  const cols = read('src/lib/db/listingColumns.ts');
  const list = /MARKET_COLUMNS =\s*([\s\S]*?);\n/.exec(cols)![1];
  for (const secret of ['payout_upi', 'bank_account_name', 'bank_account_no', 'bank_ifsc']) expect(list, `${secret} must not be readable`).not.toContain(secret);
  expect(list, 'photos are fetched apart, a batch at a time').not.toMatch(/\bphoto\b|\bphotos\b/);
  // A signed-out visitor is never asked for a phone or a cold store's payout account.
  const phones = read('src/lib/db/phones.ts');
  for (const c of ['phone', 'manager_phone', 'owner_payout_upi', 'owner_bank_account_no', 'owner_bank_ifsc']) expect(phones).toContain(`'${c}'`);
});

test('the screens send the sign-in with every call to a private route', () => {
  // [file, route address, how many calls it makes: every one must be an authFetch (a bare fetch is a call with no sign-in)]
  const need: [string, string, number][] = [
    ['src/components/rental/OwnerAdminConsole.tsx', '/api/admin/hierarchy', 4],
    ['src/components/admin/OwnerHierarchyPanel.tsx', '/api/admin/hierarchy', 2],
    ['src/components/rental/ColdBooking.tsx', '/api/cold-storage/book-units', 2],
    ['src/components/tracking/DriverConsole.tsx', '/api/logistics/track', 3],
    ['src/components/tracking/LiveGpsTrips.tsx', '/api/logistics/track', 2],
    ['src/components/market/ProductForm.tsx', '/api/products/verify-photo', 1],
  ];
  for (const [file, url, count] of need) {
    const s = read(file);
    expect(s, `${file} must use authFetch`).toContain("from '@/lib/auth-fetch'");
    const calls = [...s.matchAll(new RegExp(`([A-Za-z]*[fF]etch)\\(\\s*[\`'"]${url.replace(/\//g, '\\/')}`, 'g'))].map((m) => m[1]);
    expect(calls.length, `${file}: calls to ${url}`).toBe(count);
    expect(calls.filter((c) => c !== 'authFetch'), `${file}: a call to ${url} with no sign-in`).toEqual([]);
  }
  // The price board's reading is open; posting an offer is the signed-in seller's.
  const board = read('src/components/market/UniversalPriceBoard.tsx');
  expect(board).toMatch(/authFetch\('\/api\/price-comparison', \{\s*method: 'POST'/);
});

test('the database step closes every always-true policy and hides the payout account', () => {
  const sql = read('supabase/migrations/20261201000000_close_open_tables.sql');
  const bundle = read('supabase/RUN_THIS_ONCE.sql');
  expect(bundle).toContain('-- ════════ 20261201000000_close_open_tables.sql ════════');
  expect(bundle).toContain("(55, 'Closed tables:");
  for (const t of ['drivers', 'vehicles', 'gps_devices', 'tracking_sessions', 'gps_location_updates', 'cold_storage_bookings', 'shared_bin_allocations', 'cold_storage_organizations', 'facility_financial_transactions', 'platform_audit_logs', 'cold_storage_unit_allocations'])
    expect(sql, `${t} must be closed`).toContain(`'${t}'`);
  expect(sql).toMatch(/kr_limit_columns\('market_listings', array\['phone'\], array\['payout_upi', 'bank_account_name', 'bank_account_no', 'bank_ifsc'\]\)/);
  expect(sql).toMatch(/kr_limit_columns\('rental_listings'[^;]*'owner_bank_account_no'/);
  // The helpers are for the migration only: nobody can call them from a browser.
  expect(sql).toContain('revoke all on function public.kr_close_table(text) from public, anon, authenticated;');
  expect(sql).toContain('revoke all on function public.kr_limit_columns(text, text[], text[]) from public, anon, authenticated;');
  // The step row must not need a table a fresh database lacks.
  const rows = bundle.slice(bundle.indexOf('create or replace function public.kr_setup_rows'), bundle.indexOf('revoke all on function public.kr_setup_rows'));
  expect(rows).not.toMatch(/::regclass/);
});

test('KashRoot\'s typed list is never stamped as the Government\'s: the sync job is off and not scheduled', () => {
  const cron = read('src/app/api/cron/sync-gov-registry/route.ts');
  expect(cron).toContain('410');
  expect(cron, 'the job writes nothing to the official-list tables').not.toContain(".from('gov_");
  expect(cron, 'and does not even load the typed list').not.toMatch(/^import .*gov-agro-registry/m);
  expect(read('vercel.json')).not.toContain('sync-gov-registry');
  expect(read('.github/workflows/sync-gov-registry.yml')).not.toMatch(/^\s*schedule:/m);
  // The way to clear what earlier runs left: reviewable, and a rollback until the person changes it.
  const cleanup = read('supabase/cleanup/remove_typed_registry_rows.sql');
  expect(cleanup.trim().split('\n').at(-1)).toMatch(/^rollback;/i);
  expect(cleanup).toContain('imported_by is null');
});
