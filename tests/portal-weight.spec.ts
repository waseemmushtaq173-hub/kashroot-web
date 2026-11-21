/**
 * Portal weight: what a farmer or buyer has to download before the Overview shows. The screens of tabs that are not open (Safe
 * payment, Soil tests, the stored-apples desk, the shop, the order form) and the identity-check window are each their own download,
 * fetched when needed (next/dynamic), not part of every portal's first load. Source guards, no server needed.
 * Measured on the production build (gzip, first-load scripts of the dashboard): Farmer 300 → 200 KB, Buyer 277 → 232 KB, every
 * portal about 19 KB less from the identity-check window alone.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
/** Static (non-type) imports of a module path in this source. */
const staticImports = (source: string, from: RegExp) =>
  [...source.matchAll(/^import\s+(?!type\b)[^;]*?from\s+'([^']+)';/gm)].map((m) => m[1]).filter((p) => from.test(p));

const FARMER = 'src/app/(dashboards)/farmer/dashboard/page.tsx';
const BUYER = 'src/app/(dashboards)/buyer/dashboard/page.tsx';
const LAYOUT = 'src/app/(dashboards)/layout.tsx';

test('the Farmer dashboard fetches the code of each tab only when it is needed', () => {
  const src = read(FARMER);
  expect(staticImports(src, /SafePayment|SoilLabTests|SharedBinAndEngineeringDesk|market\/SellerDesk/)).toEqual([]);
  for (const part of ['payments/SafePayment', 'lab/SoilLabTests', 'rental/owner/SharedBinAndEngineeringDesk', 'market/SellerDesk']) {
    expect(src, part).toContain(`import('@/components/${part}')`);
  }
  // The seller desk also feeds the numbers at the top: its code is asked for at the start, in parallel with the account, never after it.
  expect(src).toMatch(/void loadSellerDesk\(\)[\s\S]{0,80}loadAccount\(\)/);
  // No tab shows a blank while its code arrives.
  expect(src).toContain("loading: tabLoading");
});

test('the Buyer dashboard fetches the shop, the order form and Safe payment only when needed', () => {
  const src = read(BUYER);
  expect(staticImports(src, /shop\/ListingBrowser|shop\/OrderModal|payments\/SafePayment/)).toEqual([]);
  for (const part of ['market/shop/ListingBrowser', 'market/shop/OrderModal', 'payments/SafePayment']) {
    expect(src, part).toContain(`import('@/components/${part}')`);
  }
  // Opening the shop starts the order form's code travelling, so it is there when a box is chosen.
  expect(src).toMatch(/tab === 'shop'\) void loadOrderModal\(\)/);
});

test('the identity-check window is its own download in every portal, and is fetched before the reminder is tapped', () => {
  const src = read(LAYOUT);
  expect(staticImports(src, /auth\/KYCPanel/)).toEqual([]);
  expect(src).toContain("import('@/components/auth/KYCPanel')");
  // Not in the page until the check has been opened once; every way of opening it goes through openKyc.
  expect(src).toContain('{kycOpened && (');
  expect(src.match(/setShowKyc\(true\)/g)).toHaveLength(1);
  // The reminder banner is showing: the window is fetched a moment later, off the first load.
  expect(src).toMatch(/reminding[\s\S]{0,300}loadKycPanel\(\)/);
});
