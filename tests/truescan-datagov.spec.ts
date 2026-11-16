/**
 * TrueScan on data.gov.in (src/lib/dataGovTruescan.ts): the typed word is looked for in the Government's pesticide and
 * fertiliser datasets, read with the site's key. No network: a stand-in for data.gov.in answers. The datasets and rows
 * below are made up for the test only.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

import { dataGovCache, isSkuastDataset, parseTable, searchDataGov, wordsOf } from '@/lib/dataGovTruescan';
import { skuastLookup, skuastSearch } from '@/lib/skuast-kashmir-recommendations';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const KEY = 'test-key-9876543210';
const ENV = { DATA_GOV_IN_API_KEY: KEY };
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** A stand-in portal: a catalogue of three datasets (one not about these subjects) and their tables. */
function portal(opts: { catalogueDown?: boolean; failResource?: string[] } = {}) {
  const calls: string[] = [];
  const fetcher = async (u: string) => {
    calls.push(u);
    const url = new URL(u);
    if (url.pathname === '/lists') {
      if (opts.catalogueDown) return json({}, 503);
      const word = url.searchParams.get('filters[title]');
      const all = [
        { index_name: A, title: 'Fertilizer sales by state', org: ['Department of Fertilizers'], updated: '2026-03-01' },
        { index_name: B, title: 'Pesticide consumption by state', org: ['Ministry of Agriculture'], updated: '2026-02-10' },
        { index_name: C, title: 'Cinema halls by district', org: ['Culture'], updated: '2026-01-01' },
      ];
      return json({ records: all.filter((e) => e.title.toLowerCase().includes(String(word).toLowerCase()) || (word === 'fertiliser' && e.index_name === A) || (word === 'pesticide' && e.index_name === C)) });
    }
    const id = url.pathname.split('/').pop() ?? '';
    if (opts.failResource?.includes(id)) return json({}, 500);
    if (id === A) return json({ title: 'Fertilizer sales by state', org: 'Department of Fertilizers', updated_date: '2026-03-01', field: [{ id: 'state', name: 'State' }, { id: 'product', name: 'Product' }, { id: 'tonnes', name: 'Tonnes' }], records: [{ state: 'Punjab', product: 'Urea', tonnes: '1000' }, { state: 'Bihar', product: 'DAP', tonnes: '200' }, ...Array.from({ length: 8 }, (_, i) => ({ state: `S${i}`, product: 'Urea', tonnes: String(i) }))] });
    if (id === B) return json({ title: 'Pesticide consumption by state', org: 'Ministry of Agriculture', records: [{ state: 'Punjab', year: '2024-25', quantity: '5000' }] });
    return json({ title: 'Cinema halls', records: [{ district: 'Pune', halls: '3' }] });
  };
  return { fetcher, calls };
}

test.beforeEach(() => {
  dataGovCache.catalogue = null;
  dataGovCache.tables.clear();
});

test('the words typed, and a table read from an answer', () => {
  expect(wordsOf('Urea 46%')).toEqual(['urea', '46']);
  expect(wordsOf(' a ')).toEqual([]);
  const t = parseTable({ title: 'T', org: 'O', field: [{ id: 'a', name: 'Alpha' }, { id: 'b', name: 'Beta' }], records: [{ a: 1, b: 'x' }, { a: 2 }] });
  expect(t).toMatchObject({ title: 'T', org: 'O', columns: ['Alpha', 'Beta'], rows: [['1', 'x'], ['2', '']] });
  expect(parseTable('nonsense').columns).toEqual([]);
  expect(parseTable({ records: [{ p: 'v' }] }).columns).toEqual(['p']);
});

test('without the key, or a word, nothing is asked', async () => {
  const p = portal();
  expect(await searchDataGov('urea', {}, p.fetcher)).toMatchObject({ ok: false, reason: 'no_key' });
  expect(await searchDataGov(' ', ENV, p.fetcher)).toMatchObject({ ok: false, reason: 'bad_query' });
  expect(p.calls).toEqual([]);
});

test('rows that mention every word are shown, with their dataset, and a dataset that is not about these subjects is left out', async () => {
  const p = portal();
  const a = await searchDataGov('urea', ENV, p.fetcher);
  expect(a.ok).toBe(true);
  if (!a.ok) return;
  expect(a.datasets.map((d) => d.title).sort()).toEqual(['Fertilizer sales by state', 'Pesticide consumption by state']);
  expect(a.hits).toHaveLength(1);
  expect(a.hits[0].dataset).toMatchObject({ id: A, org: 'Department of Fertilizers', updated: '2026-03-01' });
  expect(a.hits[0].columns).toEqual(['State', 'Product', 'Tonnes']);
  // Ten rows say Urea: five are shown. Nothing about DAP.
  expect(a.hits[0].rows).toHaveLength(5);
  expect(a.hits[0].rows.every((r) => r.includes('Urea'))).toBe(true);
  expect(a.checkedRows).toBe(11);
  // Two words must both be in the same row.
  const both = await searchDataGov('urea punjab', ENV, p.fetcher);
  expect(both.ok && both.hits[0].rows).toEqual([['Punjab', 'Urea', '1000']]);
  // A word nobody mentions: honest, with the datasets that were looked in.
  const none = await searchDataGov('mancozeb', ENV, p.fetcher);
  expect(none.ok && none.hits).toEqual([]);
  expect(none.ok && none.datasets).toHaveLength(2);
});

test('the catalogue and the tables are kept, so a second search asks nothing again', async () => {
  const p = portal();
  await searchDataGov('urea', ENV, p.fetcher);
  const first = p.calls.length;
  expect(first).toBeGreaterThan(2);
  await searchDataGov('dap', ENV, p.fetcher);
  expect(p.calls.length).toBe(first);
  // After the tables' hour they are read again.
  await searchDataGov('dap', ENV, p.fetcher, Date.now() + 2 * 3600_000);
  expect(p.calls.length).toBeGreaterThan(first);
});

test('named datasets are used as they are, and a failed catalogue is not remembered', async () => {
  const named = portal();
  const r = await searchDataGov('punjab', { ...ENV, TRUESCAN_DATAGOV_RESOURCES: `${B}, not-an-id` }, named.fetcher);
  expect(r.ok && r.datasets.map((d) => d.id)).toEqual([B]);
  expect(named.calls.every((u) => !u.includes('/lists'))).toBe(true);

  dataGovCache.tables.clear();
  const down = portal({ catalogueDown: true });
  expect(await searchDataGov('urea', ENV, down.fetcher)).toMatchObject({ ok: false, reason: 'no_datasets' });
  expect(dataGovCache.catalogue).toBeNull();
  const up = portal();
  expect((await searchDataGov('urea', ENV, up.fetcher)).ok).toBe(true);
});

test('when data.gov.in cannot be reached the answer says so, and the key is never in an answer', async () => {
  const bad = portal({ failResource: [A, B] });
  const r = await searchDataGov('urea', ENV, bad.fetcher);
  expect(r).toMatchObject({ ok: false, reason: 'unreachable' });
  const some = portal({ failResource: [A] });
  const partial = await searchDataGov('punjab', ENV, some.fetcher);
  expect(partial.ok && partial.datasets.map((d) => d.id)).toEqual([B]);
  const boom = await searchDataGov('urea', ENV, async (u) => {
    throw new Error(`connect failed ${u}`);
  });
  for (const a of [r, partial, boom, await searchDataGov('urea', ENV, portal().fetcher)]) expect(JSON.stringify(a)).not.toContain(KEY);
});

test('the route is held to a few searches a minute, and TrueScan shows the panel under its answer', () => {
  const route = read('src/app/api/truescan/datagov/route.ts');
  expect(route).toContain("ipLimited(request, 'truescan-datagov', 12)");
  expect(route).toContain("'cache-control': 'no-store'");
  const checker = read('src/components/fertilizer/FertilizerChecker.tsx');
  expect(checker).toContain('<DataGovPanel');
  const panel = read('src/components/fertilizer/DataGovPanel.tsx');
  expect(panel).toMatch(/not a register of products/);
  expect(panel).not.toMatch(/api-key|DATA_GOV_IN_API_KEY/);
});

test('a dataset published by SKUAST-Kashmir is looked for, found and named', async () => {
  const D = '44444444-4444-4444-8444-444444444444';
  const fetcher = async (u: string) => {
    const url = new URL(u);
    if (url.pathname === '/lists') {
      return json({ records: String(url.searchParams.get('filters[title]')).toLowerCase() === 'skuast' ? [{ index_name: D, title: 'SKUAST-K apple spray schedule', org: ['SKUAST-Kashmir'], updated: '2026-04-01' }] : [] });
    }
    return json({ title: 'SKUAST-K apple spray schedule', org: 'SKUAST-Kashmir', field: [{ id: 'molecule', name: 'Molecule' }, { id: 'dose', name: 'Dose' }], records: [{ molecule: 'Dodine', dose: '60 g / 100 L' }] });
  };
  const r = await searchDataGov('dodine', ENV, fetcher);
  expect(r.ok).toBe(true);
  if (!r.ok) return;
  expect(r.hits).toHaveLength(1);
  expect(isSkuastDataset(r.hits[0].dataset)).toBe(true);
  expect(r.hits[0].rows).toEqual([['Dodine', '60 g / 100 L']]);
  expect(isSkuastDataset({ title: 'Fertilizer sales', org: 'Department of Fertilizers' })).toBe(false);
});

test('the registers and SKUAST datasets are asked for first, so many others cannot crowd them out', () => {
  const src = read('src/lib/dataGovTruescan.ts');
  expect(src).toMatch(/const SUBJECTS = \[\s*'banned pesticide', 'registered pesticide', 'CIBRC', 'Insecticides Act', 'plant growth regulator'/);
  expect(src).toMatch(/'SKUAST', 'Sher-e-Kashmir', 'spray schedule',\s*'pesticide'/);
});

test('the SKUAST-K schedule is searched on its own, by a molecule, a pest or the longer name a pesticide list gives', () => {
  expect(skuastSearch('dodine').map((r) => r.molecule)).toEqual(['Dodine']);
  expect(skuastSearch('apple scab').map((r) => r.molecule)).toContain('Dodine');
  expect(skuastSearch('mancozeb').map((r) => r.molecule)).toContain('Mancozeb');
  expect(skuastSearch('zzzz-nothing')).toEqual([]);
  expect(skuastSearch('ab')).toEqual([]);
  // "DODINE 65% WP / 40% SC" (the CIB&RC list's name) finds the SKUAST entry; an unrelated name does not.
  expect(skuastLookup('DODINE 65% WP / 40% SC')?.molecule).toBe('Dodine');
  expect(skuastLookup('Gibberellic Acid 1.8% EC')).toBeNull();
  expect(skuastLookup('')).toBeNull();
  const checker = read('src/components/fertilizer/FertilizerChecker.tsx');
  expect(checker).toContain('skuastSearch(typed.text)');
});

