/**
 * The mandi price list (model checks, no server needed).
 *
 * What went wrong on the live site: the page showed only Apple rows even for Potato, said "no mandi has reported"
 * when it simply could not read Agmarknet (which now asks every visitor to solve a CAPTCHA), and the feed's state
 * names ("Keralam", "Uttarakhand") no longer matched the ones people type ("Kerala", "Uttrakhand").
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

import { parseMandi, recentOnly, sameState, stateKey, type MandiRecord } from '@/lib/mandi-shared';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

const rec = (over: Partial<MandiRecord>): MandiRecord => ({ state: 'Punjab', district: 'Amritsar', market: 'Amritsar APMC', commodity: 'Potato', variety: 'Other', grade: 'FAQ', arrivalDate: '2026-11-27', minPrice: 1000, maxPrice: 1200, modalPrice: 1100, ...over });

test.describe('state names', () => {
  test('every spelling of a state is the same state', () => {
    const same: [string, string][] = [
      ['Keralam', 'Kerala'],
      ['Uttarakhand', 'Uttrakhand'],
      ['Chhattisgarh', 'Chattisgarh'],
      ['NCT of Delhi', 'Delhi'],
      ['Jammu and Kashmir', 'Jammu & Kashmir'],
      ['Jammu and Kashmir', 'jammu and kashmir'],
      ['Andaman and Nicobar', 'Andaman and Nicobar Islands'],
      ['Puducherry', 'Pondicherry'],
      ['Odisha', 'Orissa'],
    ];
    for (const [a, b] of same) expect(sameState(a, b), `${a} = ${b}`).toBe(true);
  });

  test('different states stay different', () => {
    const different: [string, string][] = [
      ['Uttar Pradesh', 'Uttarakhand'],
      ['Madhya Pradesh', 'Uttar Pradesh'],
      ['Himachal Pradesh', 'Arunachal Pradesh'],
      ['Punjab', 'Haryana'],
      ['Jammu and Kashmir', 'Himachal Pradesh'],
      ['Goa', 'Gujarat'],
    ];
    for (const [a, b] of different) expect(sameState(a, b), `${a} ≠ ${b}`).toBe(false);
    // No state asked for: every state matches.
    expect(sameState('Punjab', undefined)).toBe(true);
    expect(stateKey('Jammu & Kashmir')).toBe(stateKey('Jammu and Kashmir'));
  });

  test('a typed "Kerala" finds the feed\'s "Keralam" rows and nobody else\'s', () => {
    const json = { records: [
      { state: 'Keralam', district: 'Ernakulam', market: 'Aluva', commodity: 'Banana', variety: 'Nendra', grade: 'FAQ', arrival_date: '27/11/2026', min_price: '4000', max_price: '5000', modal_price: '4500' },
      { state: 'Tamil Nadu', district: 'Salem', market: 'Ammapet', commodity: 'Banana', variety: 'Other', grade: 'Local', arrival_date: '27/11/2026', min_price: '3000', max_price: '3200', modal_price: '3100' },
    ] };
    const got = parseMandi(json, { state: 'Kerala', commodity: 'Banana' });
    expect(got.map((r) => r.market)).toEqual(['Aluva']);
    expect(got[0].arrivalDate).toBe('2026-11-27');
    expect(got[0].modalPrice).toBe(4500);
  });

  test('"Apple" never matches "Custard Apple"', () => {
    const json = { records: [
      { state: 'Punjab', district: 'x', market: 'a', commodity: 'Custard Apple', arrival_date: '27/11/2026', min_price: '1', max_price: '2', modal_price: '2' },
      { state: 'Punjab', district: 'x', market: 'b', commodity: 'Apple', arrival_date: '27/11/2026', min_price: '1', max_price: '2', modal_price: '2' },
    ] };
    expect(parseMandi(json, { commodity: 'Apple' }).map((r) => r.market)).toEqual(['b']);
  });
});

test.describe('reports are as old as their date says', () => {
  const now = Date.parse('2026-11-27T10:00:00+05:30');

  test('only the last 7 days come back as the latest reports', () => {
    const list = [rec({ arrivalDate: '2026-11-27' }), rec({ arrivalDate: '2026-11-20' }), rec({ arrivalDate: '2026-11-19' }), rec({ arrivalDate: '2026-11-08' })];
    expect(recentOnly(list, 7, now).map((r) => r.arrivalDate)).toEqual(['2026-11-27', '2026-11-20']);
  });

  test('the day changes at midnight in India, not in UTC', () => {
    // 00:30 on the 28th in India is still the 27th in UTC.
    const lateNight = Date.parse('2026-11-28T00:30:00+05:30');
    expect(recentOnly([rec({ arrivalDate: '2026-11-21' })], 7, lateNight)).toHaveLength(1);
    expect(recentOnly([rec({ arrivalDate: '2026-11-20' })], 7, lateNight)).toHaveLength(0);
  });
});

test.describe('the server and the page say what is true', () => {
  const server = read('src/lib/server/mandi.ts');
  const page = read('src/app/mandi-weather/page.tsx');
  const route = read('src/app/api/mandi/diagnose/route.ts');
  const home = read('src/app/page.tsx');

  test('an empty answer is not kept over the last good reports, and a kept copy is dated and flagged', () => {
    expect(server).toContain('if (live?.records.length)');
    expect(server).toMatch(/recentOnly\(kept\.body\.records, 7\)/);
    expect(server).toMatch(/stale: true/);
  });

  test('a CAPTCHA at Agmarknet is remembered for a while instead of asked again on every request', () => {
    expect(server).toMatch(/captchaUntil = Date\.now\(\) \+ CAPTCHA_PAUSE_MS/);
    expect(server).toMatch(/if \(Date\.now\(\) < captchaUntil\)/);
    // It is never worked around: no CAPTCHA answer is ever sent, it is only noticed.
    expect(server + read('src/lib/server/agmarknet.ts')).not.toMatch(/captcha[_-]?(key|value|token)['"]?\s*[:=]/i);
  });

  test('the page lists the crop asked for (not only Apple) and never mixes crops', () => {
    expect(page).not.toMatch(/=== 'apple'\s*\n?\s*\)/);
    expect(page).toContain('cropKey(r.commodity) === want');
    expect(page).toContain('Never mixed crops');
  });

  test('the empty message no longer claims no mandi reported; it says Agmarknet cannot be read', () => {
    expect(page).not.toContain('No mandi has reported');
    expect(page).toContain("mandiQ.data.agmarknet === 'captcha'");
    expect(page).toContain('asks every visitor to solve a CAPTCHA');
  });

  test('the diagnose route shows what both data.gov.in lists hold without showing the key', () => {
    expect(route).toContain('35985678-0d79-46b4-9ed6-6f13308a1d24');
    expect(route).toContain("'api-key': key");
    expect(route).not.toMatch(/NextResponse\.json\([^;]*\bkey\b/);
  });

  test('the home page strip shows a count only when it is real and above zero', () => {
    expect(home).toContain('metrics.rates != null && metrics.rates > 0');
    expect(home).not.toContain('mandi rates today');
  });
});
