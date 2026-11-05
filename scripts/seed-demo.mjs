#!/usr/bin/env node
/**
 * LOCAL TEST DATA ONLY. Fills a local Supabase (`npx supabase start`) with clearly fake test
 * accounts and sample data, so signed-in screens can be screenshotted and measured.
 *
 *   npx supabase start
 *   node scripts/seed-demo.mjs          (again: refreshes the test data)
 *
 * Refuses unless the Supabase URL is localhost / 127.0.0.1: it never touches the live database.
 * Writes .env.test (gitignored by `.env.*`): the local Supabase URL and keys, local-only signing
 * secrets, hCaptcha's public TEST keys, and the test accounts' random passwords. Prints none of
 * them. Every test account is @example.test; every row it writes says "TEST" in a visible field.
 *
 * Build and run the site against it (process env overrides .env.local):
 *   node scripts/with-test-env.mjs npx next build --webpack
 *   node scripts/with-test-env.mjs npx next start -p 3600
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const ENV_FILE = '.env.test';
const DB_CONTAINER = 'supabase_db_kashroot-web';

// ── Where: the local Supabase only ──
const status = spawnSync('npx supabase status -o env', { encoding: 'utf8', shell: true });
if (status.status !== 0) {
  console.error('Local Supabase is not running. Start it with: npx supabase start');
  process.exit(1);
}
const local = Object.fromEntries(
  status.stdout
    .split(/\r?\n/)
    .map((l) => l.match(/^([A-Z_]+)="?([^"]*)"?$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
);
const URL_ = local.API_URL;
const ANON = local.ANON_KEY;
const SERVICE = local.SERVICE_ROLE_KEY;
if (!URL_ || !ANON || !SERVICE) {
  console.error('Could not read the local Supabase URL and keys (npx supabase status -o env).');
  process.exit(1);
}
const host = new URL(URL_).hostname;
if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
  console.error(`Refusing: ${host} is not this computer. This script only seeds a local Supabase.`);
  process.exit(1);
}

// ── .env.test: kept values (passwords stay the same between runs) ──
const kept = existsSync(ENV_FILE)
  ? Object.fromEntries(
      readFileSync(ENV_FILE, 'utf8')
        .split(/\r?\n/)
        .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/))
        .filter(Boolean)
        .map((m) => [m[1], m[2]]),
    )
  : {};
const secret = (name, make) => (kept[name] ||= make());
const password = () => `Test-${randomBytes(12).toString('base64url')}!9a`;
const base32 = (buf) => {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const b of buf) bits += b.toString(2).padStart(8, '0');
  return (bits.match(/.{1,5}/g) ?? []).map((c) => A[parseInt(c.padEnd(5, '0'), 2)]).join('');
};

export const USERS = [
  { key: 'FARMER', email: 'test-farmer@example.test', name: 'TEST Farmer (Shopian)', role: 'FARMER', portals: ['farmer', 'kissan', 'rental', 'tracking'] },
  { key: 'BUYER', email: 'test-buyer@example.test', name: 'TEST Buyer (Delhi)', role: 'BUYER', portals: ['buyer', 'kissan', 'tracking'] },
  { key: 'DEALER', email: 'test-dealer@example.test', name: 'TEST Dealer (Sopore)', role: 'DEALER', portals: ['dealer', 'kissan', 'tracking'] },
  { key: 'COLDOWNER', email: 'test-coldowner@example.test', name: 'TEST Cold Store Owner', role: 'FARMER', portals: ['rental', 'farmer'] },
  { key: 'STAFF', email: 'test-staff@example.test', name: 'TEST Staff / Mandi Helper', role: 'BUYER', portals: ['buyer', 'rental', 'trader', 'expert', 'tracking'] },
  { key: 'ADMIN', email: 'test-admin@example.test', name: 'TEST Super Admin', role: 'ADMIN', portals: [] },
];
for (const u of USERS) secret(`TEST_${u.key}_PASSWORD`, password);
secret('TEST_ADMIN_ACCESS_CODE', () => String(100000 + (randomBytes(4).readUInt32BE() % 900000)));
secret('TEST_ADMIN_TOTP_SECRET', () => base32(randomBytes(20)));

const env = {
  NEXT_PUBLIC_SUPABASE_URL: URL_,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON,
  // Seeding only, on this computer. Never set in Vercel.
  LOCAL_SUPABASE_SERVICE_ROLE_KEY: SERVICE,
  // hCaptcha's public test keys (always pass).
  NEXT_PUBLIC_HCAPTCHA_SITE_KEY: '10000000-ffff-ffff-ffff-000000000001',
  HCAPTCHA_SECRET_KEY: '0x0000000000000000000000000000000000000000',
  OTP_SECRET: secret('OTP_SECRET', () => randomBytes(32).toString('base64url')),
  KYC_DB_SECRET: secret('KYC_DB_SECRET', () => randomBytes(32).toString('base64url')),
  NEXT_PUBLIC_SITE_URL: 'http://localhost:3600',
  KR_TEST_PAGES: '1',
  // No real email or SMS from the local test site (these override .env.local with nothing).
  RESEND_API_KEY: '',
  GMAIL_USER: '',
  GMAIL_APP_PASSWORD: '',
  SMTP_HOST: '',
  FAST2SMS_API_KEY: '',
  USE_REAL_SMS: '',
  TWILIO_AUTH_TOKEN: '',
  WHATSAPP_TOKEN: '',
};
const out = { ...kept, ...env };
writeFileSync(
  ENV_FILE,
  '# LOCAL TEST ENVIRONMENT ONLY (scripts/seed-demo.mjs). Gitignored. Never commit, never copy to Vercel.\n' +
    Object.entries(out)
      .map(([k, v]) => `${k}=${v}`)
      .join('\n') +
    '\n',
);

// ── Accounts ──
const admin = async (path, init = {}) => {
  const r = await fetch(`${URL_}/auth/v1/admin${path}`, { ...init, headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}`, 'content-type': 'application/json', ...(init.headers ?? {}) } });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${path}: ${r.status} ${body.msg ?? body.message ?? ''}`);
  return body;
};
const existing = (await admin('/users?per_page=200')).users ?? [];
const ids = {};
for (const u of USERS) {
  const meta = { full_name: u.name, role: u.role, roles: [u.role], portals: u.portals, kyc_status: 'submitted', test_data: true };
  const found = existing.find((e) => e.email === u.email);
  const body = { email: u.email, password: out[`TEST_${u.key}_PASSWORD`], email_confirm: true, user_metadata: meta };
  const user = found ? await admin(`/users/${found.id}`, { method: 'PUT', body: JSON.stringify(body) }) : await admin('/users', { method: 'POST', body: JSON.stringify(body) });
  ids[u.key] = user.id ?? user.user?.id;
}

const sql = (text) => execFileSync('docker', ['exec', '-i', DB_CONTAINER, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-q', '-tA'], { input: text, encoding: 'utf8' });

// The server secret, the same in the local database as in .env.test (help requests, shared limits and the
// security log need both halves; base64url, so it is safe inside the quotes).
if (!/^[\w-]+$/.test(env.KYC_DB_SECRET)) throw new Error('KYC_DB_SECRET has unexpected characters');
sql(`update public.kr_settings set kyc_secret = '${env.KYC_DB_SECRET}', updated_at = now() where id = 1;`);

// Admin role and Super Admin (the same SQL the owner runs live), with a fresh admin code next unlock.
sql(`select public.kr_set_super_admin('test-admin@example.test');
delete from public.admin_lock where user_id = '${ids.ADMIN}';
delete from auth.mfa_factors where user_id = '${ids.ADMIN}';
insert into public.staff_roles (user_id, role) values ('${ids.DEALER}', 'DEALER') on conflict do nothing;`);

// Two-step sign-in (TOTP) for the test admin: enrol with the secret above, verify with its code.
const totp = (b32, at = Date.now()) => {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of b32) bits += A.indexOf(c).toString(2).padStart(5, '0');
  const key = Buffer.from((bits.match(/.{8}/g) ?? []).map((b) => parseInt(b, 2)));
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(Math.floor(at / 30000)));
  const h = createHmac('sha1', key).update(msg).digest();
  const o = h[h.length - 1] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, '0');
};
const signIn = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: ANON, 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'test-admin@example.test', password: out.TEST_ADMIN_PASSWORD }),
}).then((r) => r.json());
if (!signIn.access_token) throw new Error('Test admin could not sign in locally.');
const userApi = (path, body) =>
  fetch(`${URL_}/auth/v1${path}`, { method: 'POST', headers: { apikey: ANON, authorization: `Bearer ${signIn.access_token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());
const factor = await userApi('/factors', { factor_type: 'totp', friendly_name: 'TEST authenticator' });
if (!factor.id) throw new Error('Could not add the test authenticator.');
// Use our own secret: GoTrue made one; replace it so the code generator in .env.test matches.
sql(`update auth.mfa_factors set secret = '${out.TEST_ADMIN_TOTP_SECRET}' where id = '${factor.id}';`);
const challenge = await userApi(`/factors/${factor.id}/challenge`, {});
const verified = await userApi(`/factors/${factor.id}/verify`, { challenge_id: challenge.id, code: totp(out.TEST_ADMIN_TOTP_SECRET) });
if (!verified.access_token) throw new Error('Could not verify the test authenticator.');

console.log(`Seeded ${USERS.length} TEST accounts on the local Supabase (${host}). Passwords and keys are in ${ENV_FILE} (gitignored).`);

// ── Sample data, made the way the site makes it: as each TEST user, through the API (RLS applies) ──
const idList = Object.values(ids)
  .map((i) => `'${i}'`)
  .join(',');
// Start clean (only TEST users' rows), and give each TEST user a verified identity check: last 4 digits only.
sql(`delete from public.market_orders where buyer_id in (${idList}) or seller_id in (${idList});
delete from public.market_listings where seller_id in (${idList});
delete from public.rental_bookings where renter_id in (${idList}) or owner_id in (${idList});
delete from public.rental_listings where owner_id in (${idList});
delete from public.payout_accounts where user_id in (${idList});
delete from public.support_requests where user_id in (${idList}) or code like 'TEST-%';
delete from public.mandi_rates where posted_by in (${idList});
delete from public.advisory_requests where farmer_id in (${idList});
insert into public.identity_checks (user_id, aadhaar_last4, aadhaar_name, aadhaar_method, aadhaar_verified_at)
select id, '0000', 'TEST ' || split_part(email, '@', 1), 'test-seed', now() from auth.users where id in (${idList})
on conflict (user_id) do update set aadhaar_verified_at = excluded.aadhaar_verified_at;`);

const tokens = {};
async function tokenOf(key) {
  if (tokens[key]) return tokens[key];
  const u = USERS.find((x) => x.key === key);
  const r = await fetch(`${URL_}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: ANON, 'content-type': 'application/json' }, body: JSON.stringify({ email: u.email, password: out[`TEST_${key}_PASSWORD`] }) }).then((x) => x.json());
  if (!r.access_token) throw new Error(`${u.email} could not sign in`);
  return (tokens[key] = r.access_token);
}
async function api(key, method, path, body) {
  const r = await fetch(`${URL_}/rest/v1/${path}`, {
    method,
    headers: { apikey: ANON, authorization: `Bearer ${await tokenOf(key)}`, 'content-type': 'application/json', prefer: 'return=representation' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${path.split('?')[0]}: ${r.status} ${text.slice(0, 160)}`);
  return text ? JSON.parse(text) : null;
}
const steps = [];
async function step(name, fn) {
  try {
    await fn();
    steps.push(`ok       ${name}`);
  } catch (e) {
    steps.push(`skipped  ${name}: ${String(e.message ?? e).slice(0, 200)}`);
  }
}
const one = (rows) => (Array.isArray(rows) ? rows[0] : rows);

await step('payout details (farmer, cold store owner, dealer)', async () => {
  await api('FARMER', 'POST', 'payout_accounts', { account_name: 'TEST Farmer', upi_id: 'testfarmer@ybl' });
  await api('COLDOWNER', 'POST', 'payout_accounts', { account_name: 'TEST Cold Store Owner', upi_id: 'testcoldstore@ybl' });
  await api('DEALER', 'POST', 'payout_accounts', { account_name: 'TEST Dealer', upi_id: 'testdealer@ybl' });
});

const listings = {};
await step('produce listings (farmer)', async () => {
  const base = { seller_name: 'TEST Farmer (Shopian)', phone: '9000000003', district: 'Shopian', category: 'produce', details: 'TEST sample listing (local test data, not for sale).' };
  listings.apple = one(await api('FARMER', 'POST', 'market_listings', { ...base, product: 'Apple (TEST)', variety: 'Delicious', grade: 'A', unit: 'box', price: 1100, quantity: 300 }));
  listings.walnut = one(await api('FARMER', 'POST', 'market_listings', { ...base, product: 'Walnut (TEST)', variety: 'Kagzi', unit: 'kg', price: 650, quantity: 500 }));
  listings.pear = one(await api('FARMER', 'POST', 'market_listings', { ...base, product: 'Pear (TEST)', variety: 'Babugosha', grade: 'B', unit: 'box', price: 700, quantity: 120 }));
});
await step('farm inputs in the Kissan Tools shop (dealer)', async () => {
  const base = { seller_name: 'TEST Dealer (Sopore)', phone: '9000000004', district: 'Baramulla', category: 'supplies', details: 'TEST sample product (local test data, not for sale).' };
  listings.npk = one(await api('DEALER', 'POST', 'market_listings', { ...base, product: 'NPK 19:19:19 (TEST)', unit: 'bag', price: 1450, quantity: 80 }));
  listings.sprayer = one(await api('DEALER', 'POST', 'market_listings', { ...base, product: 'Knapsack sprayer (TEST)', unit: 'piece', price: 3200, quantity: 12 }));
});
await step('orders (buyer → farmer and dealer)', async () => {
  const order = (l, qty, note) =>
    api('BUYER', 'POST', 'market_orders', { listing_id: l.id, seller_id: l.seller_id, buyer_name: 'TEST Buyer (Delhi)', buyer_phone: '9000000005', delivery_address: 'TEST address, Azadpur Mandi, Delhi (sample data)', quantity: qty, buyer_note: note });
  const a = one(await order(listings.apple, 40, 'TEST order: 40 boxes'));
  await order(listings.walnut, 25, 'TEST order: 25 kg');
  await order(listings.npk, 4, 'TEST order: 4 bags');
  // The farmer accepts the first one, as on the site.
  const r = await fetch(`${URL_}/rest/v1/rpc/kr_order_action`, { method: 'POST', headers: { apikey: ANON, authorization: `Bearer ${await tokenOf('FARMER')}`, 'content-type': 'application/json' }, body: JSON.stringify({ p_order: a.id, p_action: 'accept' }) });
  if (!r.ok) throw new Error(`accept: ${r.status} ${(await r.text()).slice(0, 120)}`);
});

let store = null;
await step('cold store with chambers and floors (cold store owner, as the owner wizard saves it)', async () => {
  const { createRequire } = await import('node:module');
  const path = await import('node:path');
  const require = createRequire(import.meta.url);
  const jiti = require('jiti')(path.resolve('scripts/seed-demo.mjs'), { alias: { '@': path.resolve('src') }, interopDefault: true });
  const sample = jiti('./demo/coldStoreSample.ts').demoColdStore();
  store = one(await api('COLDOWNER', 'POST', 'rental_listings', { kind: 'cold_store', unit: 'box_month', capacity: 1, available: 0, rate: 0, min_units: 1, active: false, ...sample.store, building: undefined }));
  await api('COLDOWNER', 'PATCH', `rental_listings?id=eq.${store.id}`, { building: sample.building });
  const r = await fetch(`${URL_}/rest/v1/rpc/kr_save_cold_chambers`, { method: 'POST', headers: { apikey: ANON, authorization: `Bearer ${await tokenOf('COLDOWNER')}`, 'content-type': 'application/json' }, body: JSON.stringify({ p_listing: store.id, p_rows: sample.rows }) });
  if (!r.ok) throw new Error(`chambers: ${r.status} ${(await r.text()).slice(0, 160)}`);
  await api('COLDOWNER', 'PATCH', `rental_listings?id=eq.${store.id}`, { active: true });
});
await step('cold store bookings (farmer books 40 bins; buyer books 600 crates)', async () => {
  if (!store) throw new Error('no store');
  const chambers = await api('COLDOWNER', 'GET', `cold_chambers?listing_id=eq.${store.id}&select=id,chamber_no,floor,rows,cols,boxes_per_slot,storage&order=chamber_no,floor`);
  const bins = chambers.find((c) => c.storage === 'bins');
  const crates = chambers.find((c) => c.storage === 'crates');
  const start = new Date().toISOString().slice(0, 10);
  const places = (c, total, from) => {
    const list = [];
    for (let i = from; total > 0; i++) {
      const slot = `${Math.floor(i / c.cols) + 1}${String.fromCharCode(65 + (i % c.cols))}`;
      const n = Math.min(c.boxes_per_slot, total);
      list.push(`${c.id}:${slot}:${n}`);
      total -= n;
    }
    return list;
  };
  const book = async (key, name, phone, p) => {
    const r = await fetch(`${URL_}/rest/v1/rpc/kr_book_cold_places`, { method: 'POST', headers: { apikey: ANON, authorization: `Bearer ${await tokenOf(key)}`, 'content-type': 'application/json' }, body: JSON.stringify({ p_listing: store.id, p_places: p, p_start: start, p_months: 6, p_name: name, p_phone: phone }) });
    if (!r.ok) throw new Error(`book: ${r.status} ${(await r.text()).slice(0, 160)}`);
  };
  await book('FARMER', 'TEST Farmer (Shopian)', '9000000003', places(bins, 40, 0));
  await book('BUYER', 'TEST Buyer (Delhi)', '9000000005', places(crates, 600, 0));
});
await step('help requests (as the help form saves them)', async () => {
  sql(`insert into public.support_requests (code, user_id, name, phone, email, topic, portal, message, status) values
  ('TEST-0001', '${ids.FARMER}', 'TEST Farmer', '9000000003', 'test-farmer@example.test', 'order', 'farmer', 'TEST help request: a buyer has not confirmed delivery yet (sample data).', 'open'),
  ('TEST-0002', '${ids.COLDOWNER}', 'TEST Cold Store Owner', '9000000001', 'test-coldowner@example.test', 'cold_storage', 'rental', 'TEST help request: how do I add a third floor? (sample data)', 'answered');`);
});
await step('mandi rates (posted as a Mandi Helper)', async () => {
  sql(`insert into public.staff_roles (user_id, role) values ('${ids.STAFF}', 'REPORTER') on conflict do nothing;`);
  const base = { reporter_name: 'TEST Mandi Helper', state: 'Jammu and Kashmir', district: 'Baramulla', mandi: 'TEST Sopore Fruit Mandi', unit: 'box', box_kg: 16, note: 'TEST sample rate (local test data).' };
  await api('STAFF', 'POST', 'mandi_rates', { ...base, commodity: 'Apple', variety: 'Delicious', grade: 'A', min_price: 900, modal_price: 1050, max_price: 1200 });
  await api('STAFF', 'POST', 'mandi_rates', { ...base, commodity: 'Apple', variety: 'American', grade: 'B', min_price: 600, modal_price: 720, max_price: 850 });
});
console.log(steps.join('\n'));
export { totp };
