/**
 * Staff roles and the speed of opening a portal. The database answer takes about a second (measured from the server: a plain
 * read 860 ms), and a portal that waited for it showed nothing meanwhile, on every page load, for the many people who have
 * no staff role. This device now remembers each account's last answer ("none" too): ordinary portals open at once on it and
 * ask again in the background; Admin and the KashRoot Hub still wait for a fresh answer. No server needed: the database
 * and the browser's storage are stood in for.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

/** A browser's storage, in memory. */
const storage = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, String(v)), removeItem: (k: string) => void m.delete(k), clear: () => m.clear(), key: () => null, length: 0 };
};
const g = globalThis as unknown as Record<string, unknown>;
g.localStorage = storage();
g.sessionStorage = storage();

let asked: string[] = [];
let answer: { status: number; body: unknown } = { status: 200, body: [] };
g.fetch = async (input: RequestInfo | URL) => {
  asked.push(String(input));
  return new Response(JSON.stringify(answer.body), { status: answer.status, headers: { 'content-type': 'application/json' } });
};

// require, not import(): the paths inside the source files ("@/…") are resolved for require.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const load = () => require('@/lib/auth/staffRoles') as typeof import('@/lib/auth/staffRoles');
const wait = (ms = 80) => new Promise((r) => setTimeout(r, ms));

test.beforeEach(() => {
  (g.localStorage as ReturnType<typeof storage>).clear();
  (g.sessionStorage as ReturnType<typeof storage>).clear();
  load().forgetStaffRoles();
  asked = [];
  answer = { status: 200, body: [] };
});

test('never asked on this device: the database is asked, and the answer — "none" too — is remembered', async () => {
  const { staffRolesQuick, staffRolesKnown } = load();
  expect(await staffRolesQuick('farmer-1')).toEqual([]);
  expect(asked).toHaveLength(1);
  expect(staffRolesKnown('farmer-1')?.roles).toEqual([]);
});

test('a remembered answer is returned at once, without asking the database', async () => {
  const { staffRolesQuick } = load();
  await staffRolesQuick('farmer-2'); // asks once, remembers
  asked = [];
  const t = Date.now();
  expect(await staffRolesQuick('farmer-2')).toEqual([]);
  expect(Date.now() - t).toBeLessThan(20);
  await wait();
  expect(asked, 'fresh enough: no new question').toHaveLength(0);
});

test('an answer more than a minute old is used at once and renewed in the background; a new role shows from the next visit', async () => {
  const { staffRolesQuick, staffRolesKnown } = load();
  (g.localStorage as ReturnType<typeof storage>).setItem('kr_staff_roles_known', JSON.stringify({ id: 'expert-1', roles: [], at: Date.now() - 120_000 }));
  answer = { status: 200, body: [{ role: 'EXPERT' }] };
  // This visit: what the device knew, without waiting.
  expect(await staffRolesQuick('expert-1')).toEqual([]);
  await wait();
  expect(asked, 'asked again in the background').toHaveLength(1);
  // The next visit: the new role.
  expect(staffRolesKnown('expert-1')?.roles).toEqual(['EXPERT']);
  expect(await staffRolesQuick('expert-1')).toEqual(['EXPERT']);
});

test('one account\'s remembered answer is never used for another', async () => {
  const { staffRolesQuick } = load();
  (g.localStorage as ReturnType<typeof storage>).setItem('kr_staff_roles_known', JSON.stringify({ id: 'admin-1', roles: ['ADMIN'], at: Date.now() }));
  answer = { status: 200, body: [] };
  expect(await staffRolesQuick('farmer-3')).toEqual([]);
  expect(asked).toHaveLength(1);
});

test('a failed database answer is not remembered as "no roles"', async () => {
  const { staffRolesOf, staffRolesKnown } = load();
  answer = { status: 500, body: { message: 'down' } };
  expect(await staffRolesOf('farmer-4')).toEqual([]);
  expect(staffRolesKnown('farmer-4')).toBeNull();
});

test('the strict way (Admin and Hub, sign-in) ignores what the device remembered and asks the database', async () => {
  const { staffRolesOf } = load();
  (g.localStorage as ReturnType<typeof storage>).setItem('kr_staff_roles_known', JSON.stringify({ id: 'admin-2', roles: [], at: Date.now() }));
  answer = { status: 200, body: [{ role: 'ADMIN' }] };
  expect(await staffRolesOf('admin-2')).toEqual(['ADMIN']);
  expect(asked).toHaveLength(1);
});

test('signing out forgets it', async () => {
  const { staffRolesQuick, staffRolesKnown, forgetStaffRoles } = load();
  await staffRolesQuick('farmer-5');
  expect(staffRolesKnown('farmer-5')).not.toBeNull();
  forgetStaffRoles();
  expect(staffRolesKnown('farmer-5')).toBeNull();
});

test('only Admin and the KashRoot Hub make the portal wait for the database; every other portal opens at once', () => {
  const layout = readFileSync(join(process.cwd(), 'src/app/(dashboards)/layout.tsx'), 'utf8');
  expect(layout).toContain("const team = ['admin', 'hub'] as const;");
  expect(layout).toMatch(/restoreSession\(\{ quickRoles: Boolean\(here\) && !\(team as readonly string\[\]\)\.includes\(here \?\? ''\) \}\)/);
  // The only team-decided check in the portal code is Admin and Hub membership.
  const access = readFileSync(join(process.cwd(), 'src/lib/auth/portalAccess.ts'), 'utf8');
  expect(access).toContain("if (portal === 'admin' || portal === 'hub') return roles.includes('ADMIN');");
  const session = readFileSync(join(process.cwd(), 'src/lib/auth/session.ts'), 'utf8');
  expect(session).toContain('options.quickRoles ? staffRolesQuick(user.id) : staffRolesOf(user.id)');
});
