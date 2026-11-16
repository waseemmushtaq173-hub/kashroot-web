/**
 * Buttons are as big as their job: the many small and secondary buttons inside portals and tools are a compact face,
 * the main button stays full size, and every one keeps a 44 px tap area. Source checks need no server; the browser
 * check reads KR_BASE_URL.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

test('the button kit has three sizes, each with a 44 px tap area', () => {
  const kit = read('src/components/portal/kit.tsx');
  expect(kit).toMatch(/size: 'sm' \| 'md' \| 'lg'/);
  expect(kit).toContain("'kr-btn-sm min-h-11 px-3 py-1.5 text-xs'");
  expect(kit).toContain("'min-h-12 px-6 py-3 text-base'");
  expect(kit).toContain("'min-h-11 px-4 py-2.5 text-sm'");
});

test('the compact face is drawn inside the tap area, and the main button is left alone', () => {
  const css = read('src/app/globals.css');
  const rule = css.slice(css.indexOf('Button sizes: each one as big as its job'));
  expect(rule).toContain('border-block: 4px solid transparent');
  expect(rule).toContain('background-clip: padding-box');
  expect(rule).toContain(':not(.kr-btn-primary)');
  expect(rule).toContain(':not([data-kr-plain] *)');
});

test('the tracking menu keeps a 44 px tap area under a compact face', () => {
  const menu = read('src/components/tracking/TrackingMenu.tsx');
  expect(menu).toContain('min-h-11');
  expect(menu).toContain('before:inset-y-1');
  expect(menu).toContain('data-kr-plain');
});

for (const width of [390, 1280]) {
  test(`${width} px: secondary buttons in a tool are compact but still 44 px to tap`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/mandi-weather', { waitUntil: 'load' });
    await page.waitForTimeout(1500);
    const sample = await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll<HTMLElement>('main .kr-btn-secondary'));
      return els.slice(0, 6).map((el) => {
        const cs = getComputedStyle(el);
        return { h: Math.round(el.getBoundingClientRect().height), border: cs.borderTopWidth, clip: cs.backgroundClip, text: (el.textContent ?? '').trim().slice(0, 24) };
      });
    });
    expect(sample.length).toBeGreaterThan(0);
    for (const b of sample) {
      expect(b.h, `${b.text}: tap area`).toBeGreaterThanOrEqual(44);
      expect(b.border, `${b.text}: the transparent edge that makes the face compact`).toBe('4px');
      expect(b.clip, b.text).toBe('padding-box');
    }
  });
}
