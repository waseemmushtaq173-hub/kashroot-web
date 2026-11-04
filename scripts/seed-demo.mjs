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
 * secrets, Cloudflare's public TEST keys, and the test accounts' random passwords. Prints none of
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
  { key: 'DEALER', email: 'test-dealer@example.test', name: 'TEST Dealer (Sopore)', role: 'DEALER', portals: ['dealer', 'kissan'] },
  { key: 'COLDOWNER', email: 'test-coldowner@example.test', name: 'TEST Cold Store Owner', role: 'FARMER', portals: ['rental', 'farmer'] },
  { key: 'STAFF', email: 'test-staff@example.test', name: 'TEST Staff', role: 'BUYER', portals: ['buyer', 'rental'] },
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
  // Cloudflare Turnstile's public test keys (always pass).
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: '1x00000000000000000000AA',
  TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA',
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
  const meta = { full_name: u.name, role: u.role, roles: [u.role], portals: u.portals, test_data: true };
  const found = existing.find((e) => e.email === u.email);
  const body = { email: u.email, password: out[`TEST_${u.key}_PASSWORD`], email_confirm: true, user_metadata: meta };
  const user = found ? await admin(`/users/${found.id}`, { method: 'PUT', body: JSON.stringify(body) }) : await admin('/users', { method: 'POST', body: JSON.stringify(body) });
  ids[u.key] = user.id ?? user.user?.id;
}

const sql = (text) => execFileSync('docker', ['exec', '-i', DB_CONTAINER, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-q', '-tA'], { input: text, encoding: 'utf8' });

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
export { totp };
