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

test('SKUAST-Kashmir doses are shown as typed by KashRoot, never as the university\'s own official text', () => {
  const ui = read('src/components/fertilizer/FertilizerChecker.tsx');
  expect(ui).not.toMatch(/SKUAST-Kashmir Official Dosage/);
  expect(ui).not.toMatch(/aria-label="SKUAST-Kashmir official recommendation"/);
  expect(ui).toContain('as typed by KashRoot');
  const data = read('src/lib/skuast-kashmir-recommendations.ts');
  expect(data).not.toMatch(/Nothing here is invented by KashRoot — these are the official/);
});

