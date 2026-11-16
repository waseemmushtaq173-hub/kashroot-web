/**
 * The fleet overview and its two admin actions (src/app/api/tracking/portal/route.ts).
 * Source-level guards, no server needed:
 *  - no `select('*')` on the tables that hold secrets (a driver's password hash, a device's secret hash,
 *    a buyer's tracking PIN), because the whole row would reach the browser;
 *  - approving a vehicle and certifying a device ask the database whether the caller is the Super Admin
 *    (the team pass only opens pages), and the overview says whether the caller may manage.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

const route = readFileSync(join(process.cwd(), 'src/app/api/tracking/portal/route.ts'), 'utf8');

test('the fleet overview never selects every column of a table that holds a secret', () => {
  for (const table of ['drivers', 'gps_devices', 'gps_shipments', 'vehicles', 'tracking_sessions', 'tracking_events']) {
    expect(route, `${table} must list its columns`).not.toMatch(new RegExp(`from\\('${table}'\\)\\s*\\.select\\('\\*'\\)\\s*\\.order`));
  }
  const overview = route.slice(route.indexOf("mode === 'SUPER_ADMIN_OVERVIEW'"), route.indexOf('// 3. Buyer / farmer authorized shipment lookup'));
  expect(overview).not.toMatch(/select\('\*'\)/);
  for (const secret of ['password_hash', 'api_secret_token_hash', 'buyer_access_pin']) expect(overview, secret).not.toContain(secret);
});

test('vehicle approval and device certification are the Super Admin\'s alone, asked of the database', () => {
  const guard = route.slice(route.indexOf("body.action === 'ADMIN_APPROVE_VEHICLE' ||"), route.indexOf("// ACTION 1: driver registration"));
  expect(guard).toContain('hasTeamPass');
  expect(guard).toContain('isSuperAdminCaller(request)');
  expect(route).toContain('canManage');
});
