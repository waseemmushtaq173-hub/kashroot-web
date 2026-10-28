/**
 * The assistant runs on KashRoot's own answers (no AI): it guides people on
 * the page they are on, says honestly when it does not know, and is in every
 * portal with the page's guide shown and read aloud. KR_BASE_URL says where
 * the site runs. Screenshots: test-results/assistant-*.png
 */
import { expect, test } from '@playwright/test';

const ask = async (request: import('@playwright/test').APIRequestContext, body: Record<string, unknown>) => {
  const res = await request.post('/api/ai', { data: body });
  expect(res.ok()).toBe(true);
  return (await res.json()) as { reply: string; lang: string; own?: boolean; unknown?: boolean };
};

test('help on a page is that page’s guide, in the language asked', async ({ request }) => {
  const en = await ask(request, { query: 'help, what do I do here', lang: 'en', exact: true, path: '/farmer/dashboard?tab=orders' });
  expect(en.own).toBe(true);
  expect(en.reply).toContain('Mark shipped');
  const hi = await ask(request, { query: 'यहाँ क्या करूँ, मदद', lang: 'hi', exact: true, path: '/tracking/dashboard' });
  expect(hi.reply).toContain('Track by code');
  expect(hi.reply).toMatch(/[ऀ-ॿ]/);
  const ur = await ask(request, { query: 'مدد', lang: 'ur', exact: true, path: '/rental/dashboard?tab=requests' });
  expect(ur.reply).toContain('Money received');
});

test('a question it cannot answer is answered honestly, never made up', async ({ request }) => {
  const a = await ask(request, { query: 'who won the football world cup in 1986', lang: 'en', exact: true });
  expect(a.unknown).toBe(true);
  expect(a.reply).toMatch(/I don’t have an answer to that yet/);
});

test('the server voice says whether it is set up (no secrets)', async ({ request }) => {
  const res = await request.get('/api/speak');
  const body = await res.json();
  expect(Object.keys(body)).toEqual(['configured']);
  const bad = await request.get('/api/speak?l=xx&t=hello');
  expect(bad.status()).toBe(400);
});

for (const width of [1280, 390]) {
  test(`every portal has the assistant with the page’s guide (${width} px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 860 });
    // Tracking opens without an account (following a load by its code).
    await page.goto('/tracking/dashboard');
    const open = page.getByRole('button', { name: /Help on this page/ });
    await expect(open).toBeVisible({ timeout: 30_000 });
    const box = await open.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    await open.click();
    const guide = page.locator('[data-page-guide]');
    await expect(guide).toContainText('Track by code');
    // Readable in the other languages too, with buttons big enough to tap.
    await guide.getByRole('button', { name: 'हिन्दी' }).click();
    await expect(guide).toContainText('Track by code');
    await expect(guide.locator('p').first()).toContainText(/[ऀ-ॿ]/);
    await guide.getByRole('button', { name: 'اردو' }).click();
    await expect(guide.locator('p').first()).toHaveAttribute('dir', 'rtl');
    await expect(guide.getByRole('button', { name: /سنیں|روکیں/ })).toBeVisible();
    await page.screenshot({ path: `test-results/assistant-portal-${width}.png` });
    const scrollX = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(scrollX).toBeLessThanOrEqual(0);
  });
}
