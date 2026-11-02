/**
 * One address for the real site (src/proxy.ts): on a production deployment, a
 * page asked for on any other address goes, before anything loads, to the
 * same path and query on https://kashroot-web.vercel.app; the real address,
 * listed custom domains and the API are left alone.
 * Needs a production build started with VERCEL_ENV=production (and, to test
 * a custom domain, NEXT_PUBLIC_SITE_HOSTS=shop.example.in), then
 * KR_PROXY_TEST=1 KR_BASE_URL=http://localhost:<port>.
 */
import { expect, test } from '@playwright/test';

test.skip(process.env.KR_PROXY_TEST !== '1', 'Set KR_PROXY_TEST=1 against a build started with VERCEL_ENV=production.');

const asked = (request: import('@playwright/test').APIRequestContext, path: string, host: string) => request.get(path, { headers: { host }, maxRedirects: 0 });

test('a deployment link, www. or an old domain goes to the real site, same path and query', async ({ request }) => {
  for (const host of ['kashroot-jud8kobzs-team-alpha-d0b5.vercel.app', 'kashroot-web-fh1x.vercel.app', 'www.kashroot-web.vercel.app', 'old.example.com']) {
    const res = await asked(request, '/login/admin?next=%2Fadmin%2Fdashboard', host);
    expect(res.status(), host).toBe(308);
    expect(res.headers().location, host).toBe('https://kashroot-web.vercel.app/login/admin?next=%2Fadmin%2Fdashboard');
  }
});

test('the real address is served as it is', async ({ request }) => {
  const res = await asked(request, '/login/buyer', 'kashroot-web.vercel.app');
  expect(res.status()).toBe(200);
});

test('a listed custom domain is served as it is', async ({ request }) => {
  test.skip(!(process.env.NEXT_PUBLIC_SITE_HOSTS ?? '').includes('shop.example.in'), 'Start the build with NEXT_PUBLIC_SITE_HOSTS=shop.example.in.');
  expect((await asked(request, '/login/buyer', 'shop.example.in')).status()).toBe(200);
});

test('the API and files are never redirected', async ({ request }) => {
  for (const path of ['/api/health', '/sw.js', '/manifest.webmanifest']) {
    expect((await asked(request, path, 'kashroot-jud8kobzs-team-alpha-d0b5.vercel.app')).status(), path).not.toBe(308);
  }
});
