/**
 * A page that works says nothing in the browser's console. Found on the live site and fixed: every page warned
 * "Unrecognized feature: 'bluetooth'" (the Permissions-Policy header), the 3D backdrops warned that THREE.Clock is deprecated,
 * and the Studio made a second Supabase client ("Multiple GoTrueClient instances"). These tests keep them gone: source checks
 * need no server; the browser check visits the public pages and fails on any console error, warning or page error. (A request that
 * fails because the test machine cannot reach the network is not the page's doing, and is left out.) KR_BASE_URL says where.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

test('the Permissions-Policy header names only features browsers know', () => {
  const config = read('next.config.ts');
  const header = /key: 'Permissions-Policy', value: '([^']+)'/.exec(config)?.[1] ?? '';
  expect(header).not.toBe('');
  const known = new Set(['camera', 'microphone', 'geolocation', 'payment', 'usb', 'serial', 'interest-cohort', 'accelerometer', 'gyroscope', 'magnetometer', 'fullscreen', 'autoplay']);
  for (const part of header.split(',')) {
    const name = part.trim().split('=')[0];
    expect(known.has(name), `"${name}" is not a Permissions-Policy feature browsers recognise (they warn in the console)`).toBe(true);
  }
});

test('nothing uses the deprecated THREE.Clock', () => {
  const sources = ['src/components/three/ValleyScene.tsx'];
  for (const f of sources) expect(read(f), f).not.toMatch(/\bnew (THREE|T)\.Clock\(/);
});

test('the Studio uses the site\'s one browser Supabase client, not a second one', () => {
  const persistence = read('src/lib/studio/persistence.ts');
  expect(persistence).toContain("from '@/lib/supabase'");
  expect(persistence).not.toContain('createBrowserClient');
  expect(persistence).not.toMatch(/createClient\(/);
});

const PAGES = ['/', '/login', '/login/farmer', '/register', '/compare-prices', '/mandi-weather', '/supplies/tester', '/escrow', '/support', '/tracking', '/official', '/status', '/privacy', '/terms', '/studio', '/offline'];
/**
 * Things the page is not to blame for: only the test machine causes the first group (no route to the outside, the CAPTCHA and the
 * Government feeds, a made-up database address, a software graphics driver). The second group comes from the 3D library
 * (@react-three/fiber 9.8.2, the latest release, still builds its clock from the deprecated THREE.Clock, and in the development
 * server React's double render makes it unmount a canvas "while rendering"; the live production site shows neither of the unmount).
 */
const NOT_THE_PAGES = /ERR_TUNNEL|ERR_NAME_NOT_RESOLVED|ERR_CONNECTION|ERR_INTERNET|Failed to load resource|recaptcha|hcaptcha|^Event$|JSHandle@|Commodity discovery failed|placeholder\.supabase|testproject\.supabase|GL Driver Message|GPU stall|THREE\.Clock: This module has been deprecated|Attempted to synchronously unmount a root/i;

for (const [label, context] of [
  ['a phone', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }],
  ['a computer', { viewport: { width: 1280, height: 800 } }],
] as const) {
  test.describe(label, () => {
    test.use(context);
    test('the public pages say nothing in the console', async ({ page }) => {
      test.setTimeout(240_000);
      const said: string[] = [];
      page.on('pageerror', (e) => said.push(`error on the page: ${e.message}`));
      page.on('console', (m) => {
        if (!['error', 'warning'].includes(m.type()) || NOT_THE_PAGES.test(m.text())) return;
        said.push(`${m.type()}: ${m.text().slice(0, 200)} (${page.url().replace(/^https?:\/\/[^/]+/, '')})`);
      });
      for (const path of PAGES) {
        await page.goto(path, { waitUntil: 'load' });
        await page.waitForTimeout(1500);
      }
      expect(said, said.join('\n')).toEqual([]);
    });
  });
}
