/**
 * The Live GPS Tracking portal: a menu, real verification, and no invented data.
 *
 * Source-level checks need no server. The browser checks at the end read the site at KR_BASE_URL
 * (the menu on a phone and on a desktop). Nothing here writes to a database.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

const portal = read('src/components/tracking/UnifiedLiveTrackingPortal.tsx');
const menu = read('src/components/tracking/TrackingMenu.tsx');
const route = read('src/app/api/tracking/portal/route.ts');

test.describe('no invented data', () => {
  test('no example route, place or default PIN in the tracking screens or their route', () => {
    for (const [name, src] of [['portal', portal], ['menu', menu], ['route', route]] as const) {
      expect(src, `${name}: no Bengaluru example`).not.toMatch(/Bengaluru|Yeshwanthpur|Singena/);
      expect(src, `${name}: no "e.g. Shopian"`).not.toMatch(/e\.g\. Shopian/);
      expect(src, `${name}: no default PIN hint`).not.toMatch(/default 1234/i);
    }
    // The only "1234" left is the list of PINs a new driver may NOT choose.
    expect([...route.matchAll(/'1234'/g)]).toHaveLength(1);
    expect(route).toMatch(/\['1234', '4321'/);
    expect(portal).not.toMatch(/useState\('Shopian'\)/);
    expect(portal).not.toMatch(/placeholder="\+91-/);
  });

  test('the database drops every made-up default, and the old PIN 1234 is replaced', () => {
    const sql = read('supabase/migrations/20261126000000_no_fake_defaults.sql');
    for (const col of ['commodity_name', 'box_count', 'origin_name', 'destination_name', 'total_route_distance_km', 'buyer_access_pin', 'home_district', 'payload_capacity_kg', 'apple_variety']) {
      expect(sql, col).toMatch(new RegExp(`alter column ${col} drop default`));
    }
    expect(sql).toMatch(/buyer_access_pin = '1234'/);
    expect(read('supabase/RUN_THIS_ONCE.sql')).toContain('20261126000000_no_fake_defaults.sql');
  });

  test('the cleanup script shows first, matches only test marks, and ends in ROLLBACK', () => {
    const sql = read('supabase/cleanup/remove_test_data.sql');
    expect(sql.trim().split('\n').at(-1)).toMatch(/^rollback;/i);
    // Every delete is limited to the marked vehicles, drivers and their trips.
    for (const m of sql.matchAll(/^delete from ([a-z_.]+) where (.+);$/gim)) expect(m[2], m[1]).toMatch(/_qa_|id in \(select id from _qa_/);
    expect(sql).not.toMatch(/delete from public\.audit/i);
    expect(sql).not.toMatch(/truncate/i);
  });

  test('server routes no longer invent a name, grade, district, rate or bank', () => {
    const files: Record<string, string> = {
      price: read('src/app/api/price-comparison/route.ts'),
      cold: read('src/app/api/cold-storage/operations/route.ts'),
      org: read('src/app/api/admin/hierarchy/route.ts'),
    };
    for (const [k, src] of Object.entries(files)) {
      expect(src, k).not.toMatch(/'Verified (Orchardist|Grower|Seller)'/);
      expect(src, k).not.toMatch(/\|\| 'Shopian'/);
      expect(src, k).not.toMatch(/\|\| 'Kullu Delicious'/);
      expect(src, k).not.toMatch(/\|\| 'J&K Bank'/);
    }
    expect(files.cold).not.toMatch(/\|\| 35\b/);
    expect(read('src/components/rental/owner/SharedBinAndEngineeringDesk.tsx')).not.toMatch(/rate: '35'|book\.rate \|\| 35/);
  });
});

test.describe('the trip is private to whoever holds its PIN', () => {
  test('there is no public list of trips, and a lookup needs the 6-digit PIN', () => {
    expect(route).toContain("return NextResponse.json({ ok: true, availableShipments: [] })");
    expect(route).toMatch(/\^\\d\{6\}\$/);
    expect(route).toContain('timingSafeEqual');
    // The people's ids, phones and the PIN never go out with the trip.
    expect(route).toMatch(/buyer_access_pin: _pin, farmer_id: _f, buyer_id: _b, order_id: _o, farmer_phone: _fp, buyer_phone: _bp/);
    // A new trip gets a random PIN.
    expect(route).toMatch(/buyer_access_pin: String\(randomInt\(100000, 1000000\)\)/);
  });

  test('a new driver needs a one-time-code proof, and no PIN is assumed', async () => {
    expect(route).toMatch(/checkProof\(body\.otpProof, 'sms', mobile\)/);
    expect(route).not.toMatch(/\|\| '1234'/);
    expect(route).toMatch(/\^\\d\{4,8\}\$/);
    expect(route).toMatch(/This driver account has no PIN set/);
  });
});

test.describe('a verified-mobile proof', () => {
  test('is accepted only for its own number and channel, and not when changed', async () => {
    process.env.OTP_SECRET = 'a-long-secret-used-only-by-this-test-0123456789';
    // The server modules refuse to load in a browser bundle; a test runs on the server side, so that guard is stood in for.
    const guard = require.resolve('server-only');
    require.cache[guard] = { id: guard, filename: guard, loaded: true, exports: {}, children: [], paths: [] } as unknown as NodeJS.Module;
    const { checkProof, proofFor } = await import('../src/lib/server/otp');
    const proof = proofFor('sms', '6001234567');
    expect(checkProof(proof, 'sms', '6001234567')).toBe(true);
    expect(checkProof(proof, 'sms', '+91 60012 34567')).toBe(true);
    expect(checkProof(proof, 'sms', '6001234568')).toBe(false);
    expect(checkProof(proof, 'whatsapp', '6001234567')).toBe(false);
    expect(checkProof(`${proof}x`, 'sms', '6001234567')).toBe(false);
    expect(checkProof('', 'sms', '6001234567')).toBe(false);
    expect(checkProof(proof, 'sms', '6001234567', -1)).toBe(false);
  });
});

test.describe('the menu', () => {
  test('has a screen for each job, including Verification', () => {
    for (const label of ['Live shipment map', 'Driver sign-in', 'My vehicles', 'Orchard pickup jobs', 'Start a trip', 'Live GPS', 'GPS devices (AIS-140)', 'Verification']) {
      expect(menu, label).toContain(label);
    }
    expect(portal).toContain('<TrackingMenu');
    expect(portal).not.toMatch(/role="tablist" aria-label="Tracking portal sections"/);
    for (const section of ['MAP', 'SIGN_IN', 'VEHICLES', 'PICKUPS', 'TRIP', 'GPS', 'DEVICES', 'VERIFY']) expect(portal, section).toContain(`activeTab === '${section}'`);
  });

  test('says what is and is not verified, never calling a declared licence verified', () => {
    expect(menu).toMatch(/not checked against the Government’s registers by KashRoot|has not checked it against the Government’s licence register/);
    expect(menu).toContain('ADMIN_APPROVED');
    expect(menu).toMatch(/Only a KashRoot admin can mark a vehicle approved/);
  });
});

test.describe('in the browser', () => {
  for (const width of [390, 1280]) {
    test(`${width} px: the menu opens each screen, and nothing runs off the page`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/tracking', { waitUntil: 'load' });
      const nav = page.getByRole('navigation', { name: 'Tracking menu' });
      await expect(nav).toBeVisible();
      const phone = width < 1024;
      const toggle = nav.getByRole('button', { name: /^Menu/ });
      // A phone: a Menu button opens a slim coloured panel on the left. A large screen: the same list is always open.
      const drawer = page.getByRole('dialog', { name: 'Tracking menu' });
      const list = phone ? drawer : nav;
      if (phone) {
        await expect(toggle).toBeVisible();
        await expect(drawer).toHaveCount(0);
        await toggle.click();
        await expect(drawer).toBeVisible();
        const box = (await drawer.boundingBox())!;
        expect(box.x, 'the panel sits on the left').toBeLessThanOrEqual(1);
        expect(box.width, 'a slim panel, not the full screen').toBeLessThanOrEqual(width * 0.8);
        expect(box.width).toBeGreaterThan(200);
        // Soft and light, never a dark block of one colour.
        const [r, g, b] = (await drawer.evaluate((el) => getComputedStyle(el).backgroundColor)).match(/\d+/g)!.map(Number);
        expect(r + g + b, 'a light panel, not a dark one').toBeGreaterThan(690);
        // A rainbow: the eight sections wear (at least six) different colours.
        const hues = await drawer.locator('[data-hue]').evaluateAll((els) => els.map((e) => getComputedStyle(e).backgroundColor));
        expect(hues).toHaveLength(8);
        expect(new Set(hues).size, 'one soft colour for each section').toBeGreaterThanOrEqual(6);
        // Every section is there at once.
        await expect(drawer.getByRole('button', { name: /Live shipment map|Driver sign-in|My vehicles|Orchard pickup jobs|Start a trip|Live GPS|GPS devices|Verification/ })).toHaveCount(8);
        await expect(drawer.getByRole('button', { name: 'Close menu' })).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(drawer).toHaveCount(0);
      } else {
        await expect(toggle).toBeHidden();
      }
      await expect(list.getByRole('button', { name: /Live shipment map|Driver sign-in|My vehicles|Orchard pickup jobs|Start a trip|Live GPS|GPS devices|Verification/ })).toHaveCount(phone ? 0 : 8);

      /** Open the list (a phone's panel closes after each choice) and pick a section. */
      const pick = async (name: RegExp) => {
        if (phone) {
          await toggle.click();
          await expect(drawer).toBeVisible();
        }
        await list.getByRole('button', { name }).click();
        if (phone) await expect(drawer).toHaveCount(0);
      };

      await pick(/Driver sign-in/);
      await expect(page.getByRole('heading', { name: /sign in or register/i })).toBeVisible();
      await expect(page.getByLabel(/Mobile number/)).toBeVisible();
      if (phone) await expect(toggle).toContainText('Driver sign-in');
      // No PIN is suggested.
      await expect(page.getByText(/default 1234/i)).toHaveCount(0);
      expect(await page.getByLabel(/^PIN/).getAttribute('placeholder')).toBeNull();

      await pick(/My vehicles/);
      await expect(page.getByText(/Sign in as a driver first/)).toBeVisible();

      await pick(/Verification/);
      await expect(page.getByRole('heading', { name: /What KashRoot checks, and what it does not/ })).toBeVisible();

      await pick(/Live shipment map/);
      await expect(page.getByLabel('Tracking ID')).toBeVisible();
      await expect(page.getByLabel(/6-digit PIN/)).toBeVisible();
      expect(await page.content()).not.toMatch(/Bengaluru/);

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, 'no sideways scrolling').toBeLessThanOrEqual(1);
    });
  }
});
