/**
 * The home page and Help do not download the Kashmiri / Urdu font (233 KB) or the Hindi font (117 KB) just to draw the
 * language buttons. Those web fonts load only where text in those scripts is really shown. Source guards, and a browser
 * check against a running server (KR_BASE_URL; a production build).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

test('every language picker draws its names through LangName, in the phone\'s own fonts', () => {
  for (const file of ['src/components/voice/VoiceButtons.tsx', 'src/components/voice/PageGuide.tsx', 'src/components/support/SupportCenter.tsx']) {
    const src = read(file);
    expect(src, file).toContain('<LangName lang={l} label=');
    // The raw label is never a button's text.
    expect(src, file).not.toMatch(/>\s*\{(LANG_LABEL|LABEL)\[l\]\}\s*</);
  }
  // Only the font stacks themselves (the comment explains why): the web fonts' generated names, and the plain "Noto Sans Devanagari"
  // (which is also the web font's own name, so naming it would fetch it), must not be in them.
  const stacks = read('src/components/voice/LangName.tsx')
    .split('\n')
    .filter((l) => /^\s*(ur|ks|hi|doi):/.test(l))
    .join('\n');
  expect(stacks).toContain('"Noto Naskh Arabic"');
  expect(stacks).not.toMatch(/--font-nastaliq|--font-devanagari|nastaliq/i);
  expect(stacks).not.toContain('"Noto Sans Devanagari"');
});

const NAMES: Record<string, string[]> = { '/': ['کٲشُر', 'اردو', 'हिन्दी'], '/support': ['اردو', 'हिन्दी'] };
for (const path of ['/', '/support']) {
  test(`${path}: the Kashmiri / Urdu and Hindi web fonts are not loaded`, async ({ page }) => {
    await page.goto(path, { waitUntil: 'load' });
    await page.waitForTimeout(2500);
    const loaded = await page.evaluate(() => [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family));
    expect(loaded.filter((f) => /nastaliq|devanagari/i.test(f)), `loaded: ${loaded.join(', ')}`).toEqual([]);
    // The language names are still there to tap.
    for (const name of NAMES[path]) await expect(page.getByRole('button', { name }).first()).toBeVisible();
  });
}
