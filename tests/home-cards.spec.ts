/**
 * The three tool cards on the home page (Pay After Delivery, Live Mandi Rates, Price Comparison Engine).
 *
 * A phone (under 640 px): three SQUARE tiles side by side, each with its icon and name, the whole tile opening the tool, and the
 * second action in a chip right under the tile (same width, 44 px or taller). Nothing in a tile is cut off by the tile.
 * From 640 px: full cards where each button stays inside its card with room at both edges, is 44 px or taller, and the two
 * buttons of a card line up. A long label ("How escrow payment works") wraps; it never runs past the card.
 * KR_BASE_URL says where the site runs.
 */
import { expect, test } from '@playwright/test';

for (const width of [320, 360, 390, 412, 600, 768, 895, 1024, 1280]) {
  test(`the home page's tool cards hold their buttons at ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/', { waitUntil: 'load' });
    await page.waitForTimeout(1500);
    const cols = await page.evaluate(() =>
      [...document.querySelectorAll('section[aria-label="KashRoot tools"] > div')].map((col) => {
        const a = col.querySelector('article') as HTMLElement;
        const c = a.getBoundingClientRect();
        const h2 = a.querySelector('h2') as HTMLElement;
        const t = h2.getBoundingClientRect();
        return {
          title: h2.textContent?.trim() ?? '',
          card: { width: c.width, height: c.height, bottom: c.bottom },
          titleInside: t.left >= c.left - 0.5 && t.right <= c.right + 0.5 && t.bottom <= c.bottom + 0.5,
          // Only what is on screen: the button for wide screens and the tile link for phones are each hidden on the other.
          links: [...col.querySelectorAll('a')]
            .filter((l) => l.getBoundingClientRect().width > 0)
            .map((l) => {
              const r = l.getBoundingClientRect();
              return { text: (l.getAttribute('aria-label') || l.textContent || '').trim(), left: r.left - c.left, right: c.right - r.right, width: r.width, height: r.height, top: r.top, inCard: a.contains(l) };
            }),
        };
      }),
    );
    expect(cols).toHaveLength(3);

    if (width < 640) {
      for (const col of cols) {
        expect(Math.abs(col.card.width - col.card.height), `${col.title}: the tile is square (${Math.round(col.card.width)}×${Math.round(col.card.height)})`).toBeLessThanOrEqual(6);
        expect(col.titleInside, `${col.title}: the name stays inside its tile`).toBe(true);
        expect(col.links, col.title).toHaveLength(2);
        const tile = col.links.find((l) => l.inCard)!;
        const chip = col.links.find((l) => !l.inCard)!;
        expect(tile, `${col.title}: the tile itself is a link`).toBeTruthy();
        expect(tile.height, `${col.title}: the tile link is 44 px or taller`).toBeGreaterThanOrEqual(44);
        expect(Math.abs(tile.width - col.card.width), `${col.title}: the tile link covers the tile`).toBeLessThanOrEqual(1);
        expect(chip.height, `${col.title} / ${chip.text}: the chip is 44 px or taller`).toBeGreaterThanOrEqual(44);
        expect(Math.abs(chip.width - col.card.width), `${col.title}: the chip is as wide as its tile`).toBeLessThanOrEqual(1);
        expect(chip.top, `${col.title}: the chip is under the tile`).toBeGreaterThanOrEqual(col.card.bottom - 1);
      }
    } else {
      for (const card of cols) {
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
    }
    const scrollX = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(scrollX, 'no sideways scroll').toBeLessThanOrEqual(0);
  });
}
