/**
 * TrueScan's QR check. A farmer who was online scanned a drink bottle's QR (a link to the maker's plant-address page) and
 * was told "Offline" and "Unknown product / Unknown manufacturer / not_found". Two faults:
 *  1. The server asked `navigator.onLine`, which does not exist there (Node has a global `navigator`, but `onLine` is
 *     undefined), so every scan was "offline" and the online checks never ran.
 *  2. A QR that is only a web link was judged like a product: "not in the official lists, may be counterfeit".
 * Now the phone alone says whether it is offline, and a QR that carries no product is called what it is.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

// The route imports `server-only`, which throws outside Next's own build: stub it for this test, then load the route.
const stub = require.resolve('server-only');
require.cache[stub] = { id: stub, filename: stub, loaded: true, exports: {} } as unknown as NodeJS.Module;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { POST } = require('@/app/api/truescan/verify-qr/route') as { POST: (request: Request) => Promise<Response> };

const ask = async (body: Record<string, unknown>, ip: string) => {
  const res = await POST(
    new Request('http://localhost/api/truescan/verify-qr', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
      body: JSON.stringify(body),
    }),
  );
  return (await res.json()) as Record<string, unknown>;
};

test('an online scan is not treated as offline just because the server has no navigator.onLine', async () => {
  // Node's own global navigator has no onLine: the old check `!navigator?.onLine` was therefore always true.
  expect((globalThis as { navigator?: { onLine?: boolean } }).navigator?.onLine).toBeUndefined();
  const r = await ask({ qrText: 'https://www.hccb.in/plantaddress', isOffline: false }, '10.0.0.11');
  expect(r.offline, 'the phone said it is online').toBeFalsy();
  expect(r.source).not.toContain('offline');
});

test('a QR that is only a web link says so plainly and is not called counterfeit', async () => {
  const r = await ask({ qrText: 'https://www.hccb.in/plantaddress', isOffline: false }, '10.0.0.12');
  expect(r.outcome).toBe('UNRECOGNISED_QR');
  expect(String(r.details)).toContain('www.hccb.in');
  expect(String(r.details)).toContain('type the registration number');
  expect(String(r.details).toLowerCase()).not.toContain('counterfeit');
  expect(r.productName, 'no made-up "Unknown product"').toBe('');
  expect(r.manufacturer).toBe('');
});

test('the same link while the phone is offline is also named as a link, and is still marked offline', async () => {
  const r = await ask({ qrText: 'https://www.hccb.in/plantaddress', isOffline: true }, '10.0.0.13');
  expect(r.outcome).toBe('UNRECOGNISED_QR');
  expect(r.offline).toBe(true);
});

test('plain text that is not in the lists is still "not found" online and "saved list" offline', async () => {
  const on = await ask({ qrText: 'zzqqxx-not-a-product', isOffline: false }, '10.0.0.14');
  expect(on.outcome).toBe('NOT_FOUND');
  const off = await ask({ qrText: 'zzqqxx-not-a-product', isOffline: true }, '10.0.0.15');
  expect(off.outcome).toBe('OFFLINE_SAVED_LIST');
  expect(off.offline).toBe(true);
});

test('the result card shows words, not raw keys, and hides rows with nothing to say', () => {
  const card = readFileSync(join(process.cwd(), 'src/components/fertilizer/QRCodeScanner.tsx'), 'utf8');
  expect(card).toContain('CIBRC_STATUS_WORDS[result.cibrcStatus]');
  expect(card).toContain('{result.productName && <div>');
  expect(card).toContain('{result.manufacturer && <div>');
  expect(card, 'no fake report or lab test offered for a QR that is not a product').toContain("result.outcome !== 'UNRECOGNISED_QR'");
  const route = readFileSync(join(process.cwd(), 'src/app/api/truescan/verify-qr/route.ts'), 'utf8');
  expect(route, 'the server must not decide online or offline from navigator').not.toMatch(/!\s*navigator/);
  expect(route).not.toContain("'Unknown product'");
});
