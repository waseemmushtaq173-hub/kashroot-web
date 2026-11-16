/**
 * The official CIB&RC lists in TrueScan (src/lib/cibrcOfficial.ts): read row for row from the Government's five PDFs
 * (src/data/cibrc-official.json, made by scripts/extract-cibrc-lists.py). No server needed: the data is read from disk.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

import { identityWords, lookupCibrc, type CibrcData } from '@/lib/cibrcOfficial';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const data = JSON.parse(read('src/data/cibrc-official.json')) as CibrcData;
const meta = JSON.parse(read('src/data/cibrc-official-meta.json'));

test('the lists hold what the Government printed: counts and dates are those of its five PDFs', () => {
  expect(data.pesticides.rows).toHaveLength(371);
  expect(data.formulations.rows).toHaveLength(1160);
  expect(data.banned.banned).toHaveLength(50);
  expect(data.banned.banned_for_export_only).toHaveLength(5);
  expect(data.banned.withdrawn).toHaveLength(8);
  expect(data.banned.refused).toHaveLength(18);
  expect(data.banned.restricted).toHaveLength(16);
  expect(data.household.rows).toHaveLength(133);
  expect(data.locust.rows).toHaveLength(15);
  expect(meta.lists.pesticides.as_on).toBe('31.03.2026');
  expect(meta.lists.banned.as_on).toBe('31.10.2026');
  expect(meta.lists.household.as_on).toBe('31.7.2026');
  // The meta file agrees with the data it describes.
  expect(meta.lists.formulations.count).toBe(data.formulations.rows.length);
  expect(meta.lists.banned.restricted).toBe(data.banned.restricted.length);
  expect(data.source).toMatch(/Central Insecticides Board/);
  expect(data.page).toBe('https://ppqs.gov.in/divisions/cib-rc/registered-products');
});

test('a banned chemical is found by its name or from a label line, with its notification', () => {
  const paraquat = lookupCibrc(data, 'Paraquat 24% SL');
  expect(paraquat.banned.map((b) => b.row.name).sort()).toEqual(['Paraquat Dichloride', 'Paraquat Dimethyl Sulphate']);
  expect(paraquat.banned.find((b) => b.row.name === 'Paraquat Dichloride')?.row.notification).toMatch(/S\.O\. 5234\(E\) dated 22\.09\.2026/);
  expect(lookupCibrc(data, 'endosulfan').banned[0]).toMatchObject({ list: 'banned', row: { name: 'Endosulfan' } });
  expect(lookupCibrc(data, 'Parathion 50% EC').banned.map((b) => b.row.name).sort()).toEqual(['Ethyl Parathion', 'Methyl Parathion']);
  expect(lookupCibrc(data, 'DDT').restricted.map((r) => r.name)).toEqual(['Dicohlro Diphenyl Trichloroethane (DDT)']);
  expect(lookupCibrc(data, 'Dichlorvos').banned.map((b) => b.list).sort()).toContain('banned_for_export_only');
  expect(lookupCibrc(data, 'warfarin').banned[0].list).toBe('withdrawn');
  expect(lookupCibrc(data, 'azinphos methyl').banned[0].list).toBe('refused');
});

test('a common fungicide is never taken for a banned chemical that shares one word with it', () => {
  const copper = lookupCibrc(data, 'Copper Oxychloride 50% WP');
  expect(copper.banned).toEqual([]);
  expect(copper.pesticides.map((p) => p.name)).toContain('Copper Oxychloride');
  // Typed on its own, "copper" lists the names that contain it, each under its own heading.
  expect(lookupCibrc(data, 'copper').banned.map((b) => b.row.name)).toContain('Copper Acetoarsenite');
  expect(lookupCibrc(data, 'Sodium chloride').banned).toEqual([]);
});

test('a restricted chemical says what is restricted, and its registered formulations are listed', () => {
  const m = lookupCibrc(data, 'Mancozeb 75% WP');
  expect(m.restricted[0].details).toMatch(/Guava, Jowar and Tapioca/);
  expect(m.pesticides.map((p) => p.name)).toContain('Mancozeb');
  expect(m.formulations.length).toBeGreaterThan(10);
  // The formulation that matches the strength and form typed comes first.
  expect(m.formulations[0]).toMatchObject({ name: 'Mancozeb 75% WP', exact: true });
  expect(m.banned).toEqual([]);
  const malathion = lookupCibrc(data, 'malathion');
  expect(malathion.restricted[0].details).toMatch(/Sorghum/);
  expect(malathion.household.length).toBeGreaterThan(0);
  expect(malathion.locust.length).toBeGreaterThan(0);
  expect(lookupCibrc(data, 'chlorpyriphos').restricted[0].details).toMatch(/Ber, Citrus and Tobacco/);
});

test('plant growth regulators, bio-products and household insecticides are in the lists too', () => {
  const ga = lookupCibrc(data, 'gibberellic acid');
  expect(ga.formulations.some((f) => /Plant growth regulator/i.test(f.category))).toBe(true);
  expect(lookupCibrc(data, 'neem').pesticides.length).toBeGreaterThan(0);
  expect(lookupCibrc(data, 'warfarin').household.length + lookupCibrc(data, 'bromadiolone').household.length).toBeGreaterThan(0);
  expect(lookupCibrc(data, 'chlormequat').formulations.length).toBeGreaterThan(0);
});

test('what is not in the lists is said to be nothing, never invented; a near spelling is offered', () => {
  expect(lookupCibrc(data, 'Dithane M-45').total).toBe(0);
  expect(lookupCibrc(data, 'urea').total).toBe(0);
  expect(lookupCibrc(data, 'DAP 18-46-0').total).toBe(0);
  expect(lookupCibrc(data, 'CIR-12345/2019').total).toBe(0);
  expect(lookupCibrc(data, 'ab').total).toBe(0);
  const typo = lookupCibrc(data, 'endosulfen');
  expect(typo.total).toBe(0);
  expect(typo.didYouMean).toContain('Endosulfan');
  expect(identityWords('Mancozeb 75% WP 500 g')).toEqual(['mancozeb']);
});

test('the screen shows official data only: the lists browser replaces the legal-rules box, and the source is named', () => {
  const panel = read('src/components/fertilizer/OfficialCibrcPanel.tsx');
  expect(panel).toContain('Central Insecticides Board');
  expect(panel).toMatch(/they name chemicals and formulations, not brands|name chemicals and formulations, not brands/);
  expect(panel).not.toMatch(/typed (in )?by KashRoot|reference list/i);
  const ui = read('src/components/fertilizer/FertilizerChecker.tsx');
  expect(ui).not.toMatch(/Official checks \(Government of India rules\)/);
  const lib = read('src/lib/cibrcOfficial.ts');
  expect(lib).toContain("import('@/data/cibrc-official.json')");
});

test('a chemical on the banned list and in an older registered list is shown as banned, and says the ban applies', () => {
  const panel = read('src/components/fertilizer/OfficialCibrcPanel.tsx');
  expect(panel).toContain("answer.banned.some((x) => x.list === 'banned')");
  expect(panel).toContain('the ban applies');
  expect(lookupCibrc(data, 'paraquat dichloride').pesticides.length).toBeGreaterThan(0);
  expect(lookupCibrc(data, 'paraquat dichloride').banned.length).toBeGreaterThan(0);
});
