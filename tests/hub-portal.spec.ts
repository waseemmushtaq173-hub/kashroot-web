/**
 * The KashRoot Hub: what staff see by the sections the Super Admin ticked, and the per-hub load table counted from real
 * orders. Source guards and pure functions, no server needed.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

import { NO_HUB, hubLoads } from '@/lib/hubLoads';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

test('loads are counted per hub from real orders, per unit, and an unrecorded hub is never dropped', () => {
  const rows = hubLoads([
    { pickup_stage: 'AWAITING_HUB_VEHICLE', assigned_hub_name: 'Shopian Hub', quantity: 100, unit: 'box' },
    { pickup_stage: 'CONSOLIDATED_AT_KASHROOT_HUB', assigned_hub_name: 'Shopian Hub', quantity: '250', unit: 'box' },
    { pickup_stage: 'IN_TRANSIT_TO_BUYER', assigned_hub_name: ' Shopian Hub ', quantity: 40, unit: 'kg' },
    { pickup_stage: 'DELIVERED', assigned_hub_name: 'Shopian Hub', quantity: 999, unit: 'box' },
    { pickup_stage: 'AWAITING_HUB_VEHICLE', assigned_hub_name: null, quantity: 10, unit: 'box' },
    { pickup_stage: null, assigned_hub_name: 'Shopian Hub', quantity: 5000, unit: 'box' },
  ]);
  expect(rows.map((r) => r.hub)).toEqual(['Shopian Hub', NO_HUB]);
  const [shopian, none] = rows;
  expect(shopian).toMatchObject({ orders: 4, open: 3, quantity: { box: 350, kg: 40 } });
  expect(shopian.byStage).toEqual({ AWAITING_HUB_VEHICLE: 1, CONSOLIDATED_AT_KASHROOT_HUB: 1, IN_TRANSIT_TO_BUYER: 1, DELIVERED: 1 });
  expect(none).toMatchObject({ orders: 1, open: 1, quantity: { box: 10 } });
  expect(hubLoads([])).toEqual([]);
});

test('a bad quantity never becomes a number in the table', () => {
  const [r] = hubLoads([{ pickup_stage: 'AWAITING_HUB_VEHICLE', assigned_hub_name: 'A', quantity: 'abc', unit: 'box' }, { pickup_stage: 'AWAITING_HUB_VEHICLE', assigned_hub_name: 'A', quantity: -5, unit: 'box' }]);
  expect(r).toMatchObject({ orders: 2, open: 2, quantity: {} });
});

const strip = (sql: string) => sql.replace(/--[^\n]*/g, '');

/** The largest argument count of any jsonb_build_object / json_build_object call (Postgres allows 100). */
function widestBuildObject(sql: string): number {
  const text = strip(sql);
  let widest = 0;
  for (const m of text.matchAll(/\bj?sonb?_build_object\s*\(/g)) {
    let depth = 1;
    let args = 1;
    let quoted = false;
    for (let i = (m.index ?? 0) + m[0].length; i < text.length && depth > 0; i++) {
      const ch = text[i];
      if (ch === "'") quoted = !quoted;
      else if (!quoted) {
        if (ch === '(') depth++;
        else if (ch === ')') depth--;
        else if (ch === ',' && depth === 1) args++;
      }
    }
    widest = Math.max(widest, args);
  }
  return widest;
}

test('the Hub shows only the parts the Super Admin ticked, and keeps the Super Admin\'s own powers out', () => {
  const hub = read('src/app/(dashboards)/hub/dashboard/page.tsx');
  for (const section of ['orders', 'accounts', 'businesses', 'coldstores']) expect(hub).toContain(`section: '${section}'`);
  expect(hub).toMatch(/sections\.includes\('\*'\) \|\| sections\.includes\(v\.section\)/);
  // Read-only: no escrow release, no suspending a business, none of the Super Admin's own panels.
  expect(hub).toContain('<AdminOrdersPanel canRelease={false} />');
  expect(hub).toContain('<BusinessesPanel />');
  expect(hub).toContain("import { BusinessesPanel } from '@/components/admin/SuperAdminPanel';");
  expect(hub).not.toMatch(/canSuspend|<SuperAdminPanel|TeamPanel|GateSettingsPanel/);
  // "Orders" can be ticked for a team member.
  expect(read('src/components/admin/SuperAdminPanel.tsx')).toMatch(/\{ id: 'orders', label: 'Orders, pickups and live fleet/);
});

test('the orders answer only the Super Admin and a team member with Orders ticked, in the list and in the table', () => {
  const sql = read('supabase/migrations/20261127000000_hub_orders_section.sql');
  expect(sql).toMatch(/'settings', 'orders'\)/);
  const fn = sql.slice(sql.indexOf('create or replace function public.kr_admin_orders'), sql.indexOf('grant execute on function public.kr_admin_orders'));
  expect(fn).toContain("public.kr_team_can('orders')");
  expect(fn).not.toContain("kr_has_role('ADMIN')");
  expect(sql).toMatch(/create policy "Admins see every order" on public\.market_orders for select to authenticated\s+using \(public\.kr_team_can\('orders'\)\)/);
  // Part of the one-file setup, with a check row.
  const once = read('supabase/RUN_THIS_ONCE.sql');
  expect(once).toContain('-- ════════ 20261127000000_hub_orders_section.sql ════════');
  expect(once).toContain("(51, 'Hub: Orders is a section the Super Admin ticks");
});

test('no SQL passes Postgres more than 100 arguments to one jsonb_build_object (the order list did, and failed for everyone)', () => {
  expect(widestBuildObject('select jsonb_build_object(' + Array.from({ length: 101 }, (_, i) => `'k${i}'`).join(', ') + ')')).toBe(101);
  const fn = read('supabase/migrations/20261127000000_hub_orders_section.sql');
  expect(widestBuildObject(fn)).toBeLessThanOrEqual(100);
  expect(fn).toContain('|| jsonb_build_object(');
  // The setup file's last definition is the fixed one: the two older, too-wide ones are replaced by it.
  const once = read('supabase/RUN_THIS_ONCE.sql');
  const last = once.slice(once.lastIndexOf('-- ════════ 20261127000000_hub_orders_section.sql ════════'));
  expect(widestBuildObject(last)).toBeLessThanOrEqual(100);
});

test('the live fleet needs the Orders section (asked of the database as the person), not only a team pass', () => {
  const route = read('src/app/api/tracking/portal/route.ts');
  const overview = route.slice(route.indexOf("mode === 'SUPER_ADMIN_OVERVIEW' && adminView"), route.indexOf('// 3. Buyer / farmer authorized shipment lookup'));
  expect(overview).toContain("teamCanCaller(request, 'orders')");
  expect(overview.indexOf("teamCanCaller(request, 'orders')")).toBeLessThan(overview.indexOf("from('drivers')"));
  const helper = read('src/lib/server/callerRole.ts');
  expect(helper).toContain('/rest/v1/rpc/kr_team_can');
  expect(helper).toContain("/^[a-z]{2,20}$/.test(section)");
});
