/**
 * The three tool cards on the home page (Pay After Delivery, Live Mandi Rates, Price Comparison Engine): at every width a
 * phone, a large phone or a tablet may have, each button stays inside its card with room at both edges, is 44 px or taller,
 * and the two buttons of a card line up (same left edge and width when stacked). A long label ("How escrow payment works")
 * wraps; it never runs past the card. KR_BASE_URL says where the site runs.
 */
import { expect, test } from '@playwright/test';

for (const width of [320, 360, 390, 412, 600, 768, 895, 1024, 1280]) {
  test(`the home page's tool cards hold their buttons at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/', { waitUntil: 'load' });
    await page.waitForTimeout(1500);
    const cards = await page.evaluate(() =>
      [...document.querySelectorAll('section[aria-label="KashRoot tools"] article')].map((a) => {
        const c = a.getBoundingClientRect();
        return {
          title: a.querySelector('h2')?.textContent?.trim() ?? '',
          links: [...a.querySelectorAll('a')].map((l) => {
            const r = l.getBoundingClientRect();
            return { text: l.textContent?.trim() ?? '', left: r.left - c.left, right: c.right - r.right, width: r.width, height: r.height, top: r.top };
          }),
        };
      }),
    );
    expect(cards).toHaveLength(3);
    for (const card of cards) {
      expect(card.links, card.title).toHaveLength(2);
      for (const l of card.links) {
        expect(l.left, `${card.title} / ${l.text}: room at the left edge`).toBeGreaterThanOrEqual(12);
        expect(l.right, `${card.title} / ${l.text}: room at the right edge`).toBeGreaterThanOrEqual(12);
        expect(l.height, `${card.title} / ${l.text}: 44 px or taller`).toBeGreaterThanOrEqual(44);
      }
      const [a, b] = card.links;
      // Stacked: one under the other with the same width; side by side: the same height. Either way, lined up.
      if (Math.abs(a.top - b.top) > 4) expect(Math.abs(a.width - b.width), `${card.title}: stacked buttons are the same width`).toBeLessThanOrEqual(1);
      else expect(Math.abs(a.height - b.height), `${card.title}: side-by-side buttons are the same height`).toBeLessThanOrEqual(1);
    }
    const scrollX = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(scrollX, 'no sideways scroll').toBeLessThanOrEqual(0);
  });
}
