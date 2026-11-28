/**
 * Design Studio lengths: what people type becomes a checked millimetre value,
 * and values print back the way they were typed. Pure: no browser.
 * Run: npx playwright test tests/cad-units.spec.ts
 */
import { expect, test } from '@playwright/test';

import { formatMm, formatNumber, parseLength, roundMm, type LengthRules } from '@/features/cad/types/units';
import { GRID_LIMITS } from '@/features/cad/utils/grid';

function accepts(input: string, mm: number, rules?: LengthRules) {
  expect(parseLength(input, rules), `"${input}"`).toEqual({ ok: true, mm });
}

function refuses(input: string, message: RegExp, rules?: LengthRules) {
  const result = parseLength(input, rules);
  expect(result.ok, `"${input}" should be refused`).toBe(false);
  if (!result.ok) expect(result.error, `"${input}"`).toMatch(message);
}

test.describe('parseLength', () => {
  test('reads plain millimetres', () => {
    accepts('12000', 12000);
    accepts('  8000 ', 8000);
    accepts('12.5', 12.5);
    accepts('.5', 0.5);
  });

  test('reads Western and Indian digit grouping and spaced digits', () => {
    accepts('12,000', 12000);
    accepts('1,20,000', 120000);
    accepts('12 000', 12000);
    accepts('12 000', 12000);
    accepts('12,000.25', 12000.25);
  });

  test('reads metres and centimetres', () => {
    accepts('12 m', 12000);
    accepts('12m', 12000);
    accepts('250 cm', 2500);
    accepts('40 mm', 40);
    accepts('0.5 M', 500);
    accepts('1.2345 m', 1234.5);
  });

  test('keeps values to the micrometre', () => {
    accepts('0.12345', 0.123);
    accepts('12000.0004', 12000);
  });

  test('refuses empty input, words and ambiguous numbers', () => {
    refuses('', /Enter a length/);
    refuses('   ', /Enter a length/);
    refuses('abc', /Enter a number/);
    refuses('1e3', /Enter a number/);
    refuses('12.', /Enter a number/);
    refuses('Infinity', /Enter a number/);
    refuses('12000mmm', /Enter a number/);
    refuses('12 ft', /Enter a number/);
    refuses('12,5', /dot for decimals/);
    refuses('1,2345', /dot for decimals/);
  });

  test('refuses zero and negative lengths', () => {
    refuses('0', /more than 0 mm/);
    refuses('0 m', /more than 0 mm/);
    refuses('0.0001', /more than 0 mm/);
    refuses('-5', /negative/);
    refuses('−5', /negative/);
    refuses('0.004', /at least 0.01 mm/);
    accepts('0', 0, { allowZero: true });
  });

  test('applies limits and names them in the message', () => {
    refuses('2,000,000', /at most 10,00,000 mm/);
    refuses('0.5', /at least 1 mm/, GRID_LIMITS);
    refuses('20 m', /at most 10,000 mm/, GRID_LIMITS);
    accepts('10 m', 10000, GRID_LIMITS);
  });
});

test.describe('formatting', () => {
  test('uses Indian digit grouping and up to three decimals', () => {
    expect(formatMm(12000)).toBe('12,000 mm');
    expect(formatMm(120000)).toBe('1,20,000 mm');
    expect(formatMm(12.5)).toBe('12.5 mm');
    expect(formatMm(0.1234)).toBe('0.123 mm');
    expect(formatNumber(-300)).toBe('-300');
  });

  test('never prints minus zero', () => {
    expect(formatMm(-0.0001)).toBe('0 mm');
    expect(Object.is(roundMm(-0.0004), 0)).toBe(true);
  });

  test('a formatted value reads back as the same value', () => {
    for (const mm of [1, 12.5, 12000, 120000, 999999.999]) {
      expect(parseLength(formatNumber(mm)), String(mm)).toEqual({ ok: true, mm });
    }
  });
});
