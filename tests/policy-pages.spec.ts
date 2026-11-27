/**
 * The Cancellation & Refund and Shipping & Delivery pages (model checks, no server needed).
 *
 * A payment gateway reads these pages before it approves a site, so they must say only what KashRoot does today:
 * the buyer pays the seller or owner directly, KashRoot holds no money, and no refund time or delivery date is promised
 * that nothing in the app keeps. When an escrow gateway is added, these pages and the Terms change together.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const refunds = read('src/app/refunds/page.tsx');
const delivery = read('src/app/delivery/page.tsx');
const terms = read('src/app/terms/page.tsx');
const privacy = read('src/app/privacy/page.tsx');
const sitemap = read('src/app/sitemap.ts');
const orderCard = read('src/components/market/OrderCard.tsx');

test.describe('what the pages say is what the app does', () => {
  test('both pages exist, are dated, and say KashRoot holds no money (as the Terms do)', () => {
    for (const page of [refunds, delivery]) expect(page).toMatch(/Last updated \d{1,2} [A-Z][a-z]+ 20\d\d/);
    expect(refunds).toContain('KashRoot does not hold, receive or release payments');
    expect(terms).toContain('KashRoot does not hold, receive or release payments');
  });

  test('every button the pages tell a person to press is on the order card', () => {
    const named = [...(refunds + delivery).matchAll(/“([^”]+)”/g)].map((m) => m[1]);
    expect(named).toEqual(expect.arrayContaining(['Report a problem', 'Confirm Delivery Received', 'I received the goods']));
    for (const label of named) expect(orderCard, `“${label}” is on the order card`).toContain(label);
    // The buyer can cancel only while the order is "placed" (before the seller accepts), as the page says.
    expect(orderCard).toMatch(/!sellerSide && o\.status === 'placed'[\s\S]{0,200}Cancel order/);
  });

  test('no refund time, delivery date or fee is promised that the app does not keep', () => {
    for (const page of [refunds, delivery]) {
      expect(page).not.toMatch(/within \d+\s*(working |business )?(days?|hours?)/i);
      expect(page).not.toMatch(/\b\d+\s*(to|-|–)\s*\d+\s*(working |business )?days\b/i);
      expect(page).not.toMatch(/free (shipping|delivery)/i);
    }
    expect(refunds).toContain('does not set or guarantee a refund time');
    expect(delivery).toContain('does not set or guarantee a delivery time');
  });

  test('the two pages are reachable: from Terms and Privacy, from each other, and in the sitemap', () => {
    for (const page of [terms, privacy]) {
      expect(page).toContain('href="/refunds"');
      expect(page).toContain('href="/delivery"');
    }
    expect(refunds).toContain('href="/delivery"');
    expect(delivery).toContain('href="/refunds"');
    expect(sitemap).toContain("page('/refunds'");
    expect(sitemap).toContain("page('/delivery'");
  });
});
