import { defineConfig } from '@playwright/test';

/**
 * KashRoot's Playwright tests (tests/). Pure model tests need no server; browser
 * tests read the site's address from KR_BASE_URL (default http://localhost:3000).
 */
export default defineConfig({
  testDir: 'tests',
  timeout: 120_000,
  reporter: 'list',
  use: {
    baseURL: process.env.KR_BASE_URL ?? 'http://localhost:3000',
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
  },
});
