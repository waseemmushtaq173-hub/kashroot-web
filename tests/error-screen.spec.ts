/**
 * The screen people see when a page crashes ("Something went wrong!"): its words must be readable and its
 * three buttons visible and easy to tap, on the light pages every portal now has, at phone and desktop width.
 * Needs the server started with KR_TEST_PAGES=1 (src/app/test-pages/error). KR_BASE_URL says where it runs.
 */
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

const axePath = join(process.cwd(), 'node_modules', 'axe-core', 'axe.min.js');

for (const width of [390, 1280]) {
  test(`the error screen is readable and its buttons can be seen, at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 860 });
    await page.goto('/test-pages/error', { waitUntil: 'load' });
    await expect(page.getByRole('heading', { name: 'Something went wrong!' })).toBeVisible();
    await expect(page.getByText("Cannot read properties of undefined (reading 'replace')")).toBeVisible();
    for (const name of [/Try Again/, /Return Home/, /Clear Portal State/]) {
      const b = page.getByRole(name.source.startsWith('Return') ? 'link' : 'button', { name });
      await expect(b).toBeVisible();
      expect((await b.boundingBox())!.height, String(name)).toBeGreaterThanOrEqual(44);
    }
    await page.addScriptTag({ path: axePath });
    const bad = await page.evaluate(async () => {
      const axe = (window as unknown as { axe: { run: (c: unknown, o: unknown) => Promise<{ violations: { id: string; nodes: { target: string[]; any: { data?: { contrastRatio?: number } }[] }[] }[] }> } }).axe;
      const r = await axe.run(document, { runOnly: { type: 'rule', values: ['color-contrast'] } });
      return r.violations.flatMap((v) => v.nodes.map((n) => `${n.target.join(' ')} ${n.any[0]?.data?.contrastRatio ?? ''}`));
    });
    expect(bad, bad.join('\n')).toEqual([]);
  });
}
