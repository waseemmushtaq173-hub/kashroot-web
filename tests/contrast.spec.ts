/**
 * WCAG AA colour contrast (4.5:1 for text, 3:1 for large text) on every public page and every
 * portal's sign-in, at 390 px and 1280 px, checked by axe-core's own rule. Text over photographs
 * and the 3D valley is left to axe's judgement ("needs review" is not a failure).
 * KR_BASE_URL says where the site runs.
 */
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

import { PORTAL_IDS } from '@/lib/auth/roles';

const axePath = join(process.cwd(), 'node_modules', 'axe-core', 'axe.min.js');
const PAGES = ['/', '/login', '/register', '/support', '/privacy', '/terms', '/status', '/tracking', '/mandi-weather', '/compare-prices', '/forgot-password', '/offline', ...PORTAL_IDS.map((id) => `/login/${id}`)];

for (const width of [390, 1280]) {
  test.describe(`${width} px`, () => {
    test.use({ viewport: { width, height: 860 } });
    for (const path of PAGES) {
      test(`${path}: text meets WCAG AA contrast`, async ({ page }) => {
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.goto(path, { waitUntil: 'load' });
        await page.waitForTimeout(1500);
        await page.addScriptTag({ path: axePath });
        const bad = await page.evaluate(async () => {
          const axe = (window as unknown as { axe: { run: (ctx: unknown, opts: unknown) => Promise<{ violations: { nodes: { target: string[]; any: { data?: { contrastRatio?: number; fgColor?: string; bgColor?: string; expectedContrastRatio?: string } }[] }[] }[] }> } }).axe;
          const r = await axe.run(document, { runOnly: { type: 'rule', values: ['color-contrast'] } });
          return r.violations.flatMap((v) =>
            v.nodes.map((n) => {
              const d = n.any[0]?.data ?? {};
              return `${n.target.join(' ')} — ${d.fgColor} on ${d.bgColor} is ${d.contrastRatio}:1, needs ${d.expectedContrastRatio}`;
            }),
          );
        });
        expect(bad, bad.join('\n')).toEqual([]);
      });
    }
  });
}
