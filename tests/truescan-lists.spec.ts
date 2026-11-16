/**
 * TrueScan answers from the Government pesticide / fertiliser lists and nothing else.
 *
 * The data.gov.in key (DATA_GOV_IN_API_KEY) is for Agmarknet mandi prices. That dataset holds
 * crop prices, not pesticide or fertiliser registrations, so a TrueScan search must never turn a
 * mandi row into a "registered" product. Source-level guards, no server needed.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

import { searchAllEmbedded } from '@/lib/gov-agro-registry';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

const MANDI_RESOURCE = '9ef84268-d588-465a-a308-a864a43d0070';

test('no TrueScan route or the registry calls the data.gov.in mandi dataset', () => {
  for (const file of [
    'src/app/api/truescan/route.ts',
    'src/app/api/truescan/directory/route.ts',
    'src/lib/gov-agro-registry.ts',
    'scripts/ingest-complete-gov-skuast-catalog.mjs',
  ]) {
    const src = read(file);
    expect(src, `${file} must not fetch api.data.gov.in`).not.toMatch(/api\.data\.gov\.in/);
    expect(src, `${file} must not use the mandi resource id`).not.toContain(MANDI_RESOURCE);
    expect(src, `${file} must not read the data.gov.in key`).not.toMatch(/process\.env\.DATA_GOV_IN_API_KEY/);
    expect(src, `${file} must not label mandi rows as registered products`).not.toContain('data.gov.in (Agmarknet)');
  }
});

test('the mandi price code keeps the data.gov.in key', () => {
  const mandi = read('src/lib/server/mandi.ts') + read('src/lib/server/agmarknet.ts');
  expect(mandi).toMatch(/DATA_GOV_IN_API_KEY/);
});

test('TrueScan never writes a looked-up record back into the registry table', () => {
  const route = read('src/app/api/truescan/route.ts');
  expect(route).not.toContain('kr_cibrc_upsert');
  expect(route).not.toContain('.rpc(');
});

test('an unmatched search finds nothing instead of inventing a product', () => {
  expect(searchAllEmbedded('zzzz-no-such-product-qqqq')).toEqual([]);
  // A crop that is traded at the mandi is not, by itself, a registered pesticide.
  const hits = searchAllEmbedded('Tomato');
  for (const h of hits) expect(h.source ?? '').not.toMatch(/Agmarknet|data\.gov\.in/i);
});

test('the answer names its source as a KashRoot reference list, never as the official register', () => {
  for (const file of ['src/app/api/truescan/route.ts', 'src/app/api/truescan/directory/route.ts']) {
    const src = read(file);
    expect(src, file).toContain('REFERENCE_SOURCE');
    expect(src, `${file} must not claim a live Government check`).not.toMatch(/live resolution|auto-upsert|synced:\s*true/);
  }
});

test('TrueScan shows no SKUAST-Kashmir dose that KashRoot typed: only official data is put in front of a farmer', () => {
  const ui = read('src/components/fertilizer/FertilizerChecker.tsx');
  expect(ui).not.toMatch(/SKUAST-Kashmir Official Dosage/);
  expect(ui).not.toMatch(/skuast/i);
  const data = read('src/lib/skuast-kashmir-recommendations.ts');
  expect(data).not.toMatch(/Nothing here is invented by KashRoot — these are the official/);
});

test('KashRoot\'s typed reference entries are never headed as registered with, or approved by, the Government', () => {
  const ui = read('src/components/fertilizer/FertilizerChecker.tsx');
  expect(ui).not.toMatch(/Official Govt-Approved/);
  expect(ui).not.toMatch(/Synced with official/);
  // A reference entry gets its own heading; "Registered with the Government" is for imported official lists only.
  expect(ui).toContain('const isReference = (h: { source: string }) => h.source === REFERENCE_SOURCE || /typed by KashRoot/i.test(h.source);');
  expect(ui).toMatch(/isReference\(h\) \? REFERENCE_HEADING : REGISTERED\[h\.kind\]/);
});


test('TrueScan\'s answer is built from official data only: nothing KashRoot typed is searched or shown, and the 3 MB typed list is not loaded for a check', () => {
  const ui = read('src/components/fertilizer/FertilizerChecker.tsx');
  // No import of the typed registry at all (the lab tab fetches it lazily, through registryLazy, for its fertiliser standards).
  expect(ui).not.toMatch(/from '@\/lib\/gov-agro-registry'/);
  expect(ui).toContain("import { loadRegistry } from '@/lib/fertilizer/registryLazy';");
  expect(ui).not.toMatch(/(?<![.\w])(searchAllEmbedded|cibrcLookupRegistered|cibrcLookupBanned|agroRegistryStats)\(/);
  // A check looks up the official CIB&RC lists and the officially imported rows, and an entry typed by KashRoot is dropped.
  const scan = ui.slice(ui.indexOf('async function scan(raw: string)'), ui.indexOf('export function FertilizerChecker('));
  expect(scan).toContain('searchRegistry(typed.text)');
  expect(scan).toMatch(/filter\(\(h\) => !isReference\(h\)\)/);
  expect(scan).not.toMatch(/loadRegistry|searchAllEmbedded/);
  expect(ui).toContain('lookupCibrc(d, typed.text)');
  // The typed brand/company entries, the typed banned list, the typed SKUAST schedule and the legal-rules box are gone.
  expect(ui).not.toMatch(/ReferenceProduct|cibrcResult|skuastResult|OfficialChecks|Browse the reference list/);
  expect(ui).toContain('<OfficialCibrcLists />');
  const lazy = read('src/lib/fertilizer/registryLazy.ts');
  expect(lazy).toContain("import('@/lib/gov-agro-registry')");
  expect(lazy).not.toMatch(/^import [^t].*gov-agro-registry/m);
});
