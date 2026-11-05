import { defineConfig } from '@playwright/test';

/**
 * KashRoot's Playwright tests (tests/). Pure model tests need no server; browser
 * tests read the site's address from KR_BASE_URL (default http://localhost:3000).
 * Against the live site (https), the test browser cannot reach hCaptcha at all:
 * automated tests never run the live widget (they check KashRoot's own pages and
 * server; on this computer hCaptcha's test key is used instead).
 */
const LIVE = /^https:/.test(process.env.KR_BASE_URL ?? '');

export default defineConfig({
  testDir: 'tests',
  timeout: 120_000,
  reporter: 'list',
  use: {
    baseURL: process.env.KR_BASE_URL ?? 'http://localhost:3000',
    launchOptions: {
      args: [
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
        '--ignore-gpu-blocklist',
        ...(LIVE ? ['--host-resolver-rules=MAP hcaptcha.com ~NOTFOUND, MAP *.hcaptcha.com ~NOTFOUND'] : []),
      ],
    },
  },
});
