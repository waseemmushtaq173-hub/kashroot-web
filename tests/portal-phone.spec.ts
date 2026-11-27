/**
 * Every portal on a phone, signed in as a stand-in account (nothing is real: the account is written into the browser's
 * storage, the database's answers are empty lists, so what shows is what a new account sees). For each portal's home, and
 * for each of its section buttons in turn: nothing wider than the screen, nothing cut off by its own box, no two things on top
 * of each other, no script error. Needs the site started with KR_TEST_PAGES=1 and a dummy Supabase address (see the README of
 * the test pages); KR_BASE_URL says where it runs.
 */
import { expect, test, type Page } from '@playwright/test';

import { PORTALS, type PortalId } from '@/lib/auth/roles';

import { inspect } from './helpers/phoneInspect';

const USER_ID = '11111111-2222-4333-8444-555555555555';
const SUPA_REF = 'testproject';

const PUBLIC: PortalId[] = ['farmer', 'buyer', 'kissan', 'rental', 'tracking', 'dealer', 'expert', 'trader', 'business'];
const TEAM: PortalId[] = ['admin', 'hub'];

/** Signs the stand-in account in to one portal (as a person who has already joined it and signed in a moment ago). */
async function signIn(page: Page, portal: PortalId) {
  const role = PORTALS[portal].requiredRole;
  const isTeam = TEAM.includes(portal);
  const roles = isTeam ? ['ADMIN'] : role ? [role] : ['FARMER'];
  await page.addInitScript(
    ({ id, ref, portalId, roles: r, mainRole }) => {
      const now = Date.now();
      const session = {
        access_token: 'header.payload.signature',
        refresh_token: 'refresh',
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: Math.floor(now / 1000) + 3600,
        user: {
          id,
          aud: 'authenticated',
          role: 'authenticated',
          email: 'test.person@example.com',
          created_at: new Date(now - 864e5).toISOString(),
          app_metadata: {},
          user_metadata: { full_name: 'Test Person', portals: [portalId], roles: r },
        },
      };
      localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify(session));
      localStorage.setItem('kr_portal_signins', JSON.stringify({ [id]: { [portalId]: now } }));
      localStorage.setItem('kr_portal_signins_since', String(now - 1000));
      localStorage.setItem('kr_last_active', String(now));
      localStorage.setItem('user_roles', JSON.stringify(r));
      localStorage.setItem('user_role', mainRole);
      localStorage.setItem('kyc_status', 'submitted');
    },
    { id: USER_ID, ref: SUPA_REF, portalId: portal, roles, mainRole: roles[0] },
  );
  // The database answers with nothing; a team portal is told the account is an Admin.
  await page.route('**/api/supabase/**', (route) => {
    const url = route.request().url();
    if (/\/rest\/v1\/rpc\//.test(url)) return route.fulfill({ json: isTeam ? [{ role: 'ADMIN' }] : [] });
    if (/\/rest\/v1\/(user_roles|staff_roles|staff)/.test(url)) return route.fulfill({ json: isTeam ? [{ role: 'ADMIN' }] : [] });
    if (/\/auth\/v1\//.test(url)) return route.fulfill({ json: {} });
    return route.fulfill({ json: [] });
  });
}

for (const portal of [...PUBLIC, ...TEAM]) {
  test.describe(`${portal} portal`, () => {
    test.use({ viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true });

    test(`${portal}: its home and every section button lay out cleanly`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)));
      await signIn(page, portal);
      await page.goto(PORTALS[portal].home, { waitUntil: 'load' });
      await page.waitForTimeout(3500);
      // Still on its own page, not sent back to the sign-in.
      expect(new URL(page.url()).pathname.startsWith('/login'), `${portal} stayed signed in (ended on ${page.url()})`).toBe(false);

      const findings: string[] = [];
      const check = async (where: string) => {
        const r = await inspect(page);
        for (const x of [...r.wider.map((s) => `WIDER: ${s}`), ...r.cut.map((s) => `CUT OFF: ${s}`), ...r.placeholder.map((s) => `PLACEHOLDER: ${s}`), ...r.overlaps.map((s) => `ON TOP: ${s}`)]) findings.push(`[${where}] ${x}`);
      };
      await check('home');

      // The section buttons (tabs) of the portal: each one opened in turn.
      const tabs = page.getByRole('tab');
      const count = await tabs.count();
      await page.screenshot({ path: `test-results/portal-${portal}.png` });
      // The portal really opened (not a spinner or the sign-in): its section buttons are there.
      expect(count, `${portal} opened with its section buttons`).toBeGreaterThan(0);
      for (let i = 0; i < Math.min(count, 14); i++) {
        const tab = tabs.nth(i);
        const label = ((await tab.textContent()) ?? `tab ${i}`).trim().replace(/\s+/g, ' ').slice(0, 30);
        if (!(await tab.isVisible())) continue;
        await tab.scrollIntoViewIfNeeded().catch(() => undefined);
        await tab.click({ timeout: 4000 }).catch(() => undefined);
        await page.waitForTimeout(900);
        await check(label);
      }
      expect([...new Set(findings)].slice(0, 15), `${portal} on a 390px phone`).toEqual([]);
      expect(errors, 'no script errors').toEqual([]);
    });
  });
}
