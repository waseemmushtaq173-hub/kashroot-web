/**
 * What a person sees on a phone, page by page, at the three common widths (360, 390, 412 px): nothing wider than the screen,
 * nothing cut off by its own box, no placeholder cut short, no two pieces of text or two buttons on top of each other, and no
 * explanatory paragraph under a page title pushing the tool off the first screen. The floating microphone and the sticky header
 * are meant to float over the page, so they are not counted as "on top of" anything; the microphone is held small on a phone.
 * KR_BASE_URL says where the site runs.
 */
import { expect, test, type Page } from '@playwright/test';

const PAGES = ['/', '/login', '/login/farmer', '/register', '/forgot-password', '/compare-prices', '/mandi-weather', '/supplies/tester', '/escrow', '/support', '/privacy', '/terms', '/tracking', '/status', '/offline'];

interface Report {
  wider: string[];
  cut: string[];
  placeholder: string[];
  overlaps: string[];
}

/** Runs in the page. Decorative things (aria-hidden, pointer-events none, fixed/sticky bars) are left out. */
async function inspect(page: Page): Promise<Report> {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const out: Report = { wider: [], cut: [], placeholder: [], overlaps: [] };
    const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'PATH', 'DEFS', 'G', 'CIRCLE', 'RECT', 'LINE', 'POLYLINE', 'POLYGON', 'USE', 'TITLE', 'SVG']);
    const shown = (el: Element) => {
      const r = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      return r.width > 1 && r.height > 1 && st.visibility !== 'hidden' && st.display !== 'none' && st.opacity !== '0';
    };
    const name = (el: Element) => `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}"${(el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || '').trim().replace(/\s+/g, ' ').slice(0, 36)}"`;
    const decorative = (el: Element) => !!el.closest('[aria-hidden="true"], .sr-only, dialog:not([open]), [hidden], nextjs-portal, [data-nextjs-toast], details:not([open]) > :not(summary)') || (getComputedStyle(el).pointerEvents === 'none' && !el.textContent?.trim());
    const floating = (el: Element) => {
      for (let e: Element | null = el; e && e !== document.body; e = e.parentElement) {
        const p = getComputedStyle(e).position;
        if (p === 'fixed' || p === 'sticky') return true;
      }
      return false;
    };
    const scrollsSideways = (el: Element) => {
      for (let p = el.parentElement; p; p = p.parentElement) {
        const st = getComputedStyle(p);
        if (/(auto|scroll)/.test(st.overflowX) && p.scrollWidth > p.clientWidth + 1) return true;
      }
      return false;
    };
    const content = [...document.body.querySelectorAll('*')].filter((el) => !SKIP.has(el.tagName.toUpperCase()) && shown(el) && !decorative(el));
    const hasOwnText = (el: Element) => [...el.childNodes].some((n) => n.nodeType === 3 && (n.nodeValue ?? '').trim());
    const isThing = (el: Element) => hasOwnText(el) || /^(BUTTON|A|INPUT|SELECT|TEXTAREA|IMG)$/.test(el.tagName);

    // 1. Nothing wider than the screen (a table inside a sideways-scrolling box is fine).
    for (const el of content) {
      if (!isThing(el) || floating(el) || scrollsSideways(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.right > vw + 1.5 || r.left < -1.5) out.wider.push(`${name(el)} spans ${Math.round(r.left)}–${Math.round(r.right)} on a ${vw}px screen`);
    }

    // 2. Nothing cut off by the box that holds it: a thing inside an overflow-hidden box reaches past that box's edge.
    for (const box of content) {
      const st = getComputedStyle(box);
      if (!/(hidden|clip)/.test(st.overflowX) || box.tagName === 'HTML' || box.tagName === 'BODY') continue;
      const b = box.getBoundingClientRect();
      for (const el of box.querySelectorAll('*')) {
        if (!content.includes(el) || !isThing(el) || floating(el)) continue;
        const r = el.getBoundingClientRect();
        const ownBox = el.closest('[class*="overflow-hidden"]');
        if (ownBox && ownBox !== box && box.contains(ownBox)) continue; // judged against its own nearer box
        if (r.right > b.right + 2 || r.left < b.left - 2) {
          const ellipsis = getComputedStyle(el).textOverflow === 'ellipsis';
          out.cut.push(`${name(el)} ${ellipsis ? '(ends in "…") ' : ''}reaches ${Math.round(r.left)}–${Math.round(r.right)} outside its box ${Math.round(b.left)}–${Math.round(b.right)}`);
          break;
        }
      }
    }
    for (const el of content) {
      const st = getComputedStyle(el);
      if (st.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1 && el.textContent?.trim()) out.cut.push(`${name(el)} ends in "…" (needs ${el.scrollWidth}px, has ${el.clientWidth}px)`);
    }

    // 3. A placeholder is read whole.
    for (const el of document.querySelectorAll('input[placeholder]:not([type=hidden])')) {
      if (!shown(el) || decorative(el)) continue;
      const input = el as HTMLInputElement;
      const st = getComputedStyle(input);
      const ph = getComputedStyle(input, '::placeholder'); // the placeholder can be smaller and lighter than what is typed
      const ctx = document.createElement('canvas').getContext('2d')!;
      ctx.font = `${ph.fontWeight} ${ph.fontSize} ${ph.fontFamily}`;
      const need = ctx.measureText(input.placeholder).width + parseFloat(st.paddingLeft) + parseFloat(st.paddingRight);
      if (need > input.clientWidth + 1) out.placeholder.push(`${name(input)} needs ${Math.round(need)}px, has ${input.clientWidth}px`);
    }

    // 4. No two things on top of each other.
    interface Atom { el: Element; t: string; l: number; r: number; top: number; bottom: number }
    const atoms: Atom[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement;
      if (!el || !(n.nodeValue ?? '').trim() || !shown(el) || decorative(el) || floating(el)) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      for (const r of range.getClientRects()) if (r.width > 2 && r.height > 2) atoms.push({ el, t: (n.nodeValue ?? '').trim().slice(0, 28), l: r.left, r: r.right, top: r.top + scrollY, bottom: r.bottom + scrollY });
    }
    for (const el of document.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea')) {
      if (!shown(el) || decorative(el) || floating(el)) continue;
      // A link inside a sentence that wraps is one box per line, not one big box over the lines between.
      const rects = getComputedStyle(el).display === 'inline' ? [...el.getClientRects()] : [el.getBoundingClientRect()];
      for (const r of rects) atoms.push({ el, t: name(el), l: r.left, r: r.right, top: r.top + scrollY, bottom: r.bottom + scrollY });
    }
    atoms.sort((a, b) => a.top - b.top);
    for (let i = 0; i < atoms.length; i++) {
      const a = atoms[i];
      for (let j = i + 1; j < atoms.length && atoms[j].top < a.bottom; j++) {
        const b = atoms[j];
        if (a.el === b.el || a.el.contains(b.el) || b.el.contains(a.el)) continue;
        const w = Math.min(a.r, b.r) - Math.max(a.l, b.l);
        const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (w <= 3 || h <= 3) continue;
        // A show-password eye or a leading icon sits inside its field on purpose.
        const field = /^(INPUT|SELECT|TEXTAREA)$/;
        if ((field.test(a.el.tagName) && b.el.closest('div, label')?.contains(a.el)) || (field.test(b.el.tagName) && a.el.closest('div, label')?.contains(b.el))) continue;
        out.overlaps.push(`"${a.t}" over "${b.t}" (${Math.round(w)}×${Math.round(h)}px)`);
      }
    }
    return out;
  });
}

for (const width of [360, 390, 412]) {
  test.describe(`${width} px`, () => {
    test.use({ viewport: { width, height: 800 }, isMobile: true, hasTouch: true });
    for (const path of PAGES) {
      test(`${path} is laid out cleanly`, async ({ page }) => {
        await page.route('**/api/supabase/**', (route) => route.fulfill({ json: [] }));
        await page.route('**/api/mandi?*', (route) => route.fulfill({ json: { records: [], total: 0, usingSampleKey: false, fetchedAt: new Date().toISOString(), source: 'test', agmarknet: 'ok' } }));
        await page.route('**/api/mandi/commodities', (route) => route.fulfill({ json: { commodities: [], varieties: {}, count: 0 } }));
        await page.route('**/api/weather**', (route) => route.fulfill({ status: 503, json: { error: 'not in this test' } }));
        await page.route('**/api/v1/weather**', (route) => route.fulfill({ status: 503, json: { error: 'not in this test' } }));
        await page.goto(path, { waitUntil: 'load' });
        await page.waitForTimeout(2200);
        const r = await inspect(page);
        const found = [...r.wider.map((x) => `WIDER: ${x}`), ...r.cut.map((x) => `CUT OFF: ${x}`), ...r.placeholder.map((x) => `PLACEHOLDER: ${x}`), ...r.overlaps.map((x) => `ON TOP: ${x}`)];
        expect([...new Set(found)].slice(0, 12), `${path} at ${width}px`).toEqual([]);
      });
    }
  });
}

test.describe('on a phone, the page opens on the tool, not on a paragraph', () => {
  test.use({ viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true });

  test('TrueScan: its title, two cards and the box to type in are all in the first screen', async ({ page }) => {
    await page.route('**/api/supabase/**', (route) => route.fulfill({ json: [] }));
    await page.goto('/supplies/tester', { waitUntil: 'load' });
    await page.waitForTimeout(1500);
    const input = page.locator('#truescan-text');
    await expect(input).toBeVisible();
    const box = (await input.boundingBox())!;
    expect(box.y + box.height, 'the text box ends inside a 800px screen').toBeLessThan(800);
    // The card counts the lists that are really in the app; it never says "Not yet" next to 1,531 listed entries.
    await expect(page.getByText('Not yet', { exact: true })).toHaveCount(0);
    await expect(page.getByText('1,531', { exact: true })).toBeVisible();
    // The line under the title is for screen readers only.
    const line = page.locator('p.sr-only', { hasText: 'type the registration number or the name from the label' });
    await expect(line).toHaveCount(1);
    expect((await line.boundingBox())!.width).toBeLessThanOrEqual(2);
  });

  test('the floating microphone is a small button on a phone', async ({ page }) => {
    await page.goto('/escrow', { waitUntil: 'load' });
    const mic = page.getByRole('button', { name: /Speak to KashRoot|Help on this page/ });
    await expect(mic).toBeVisible();
    const b = (await mic.boundingBox())!;
    expect(b.width).toBeLessThanOrEqual(52);
    expect(b.width).toBeGreaterThanOrEqual(44);
  });

  test('register: each role has its own colour (a farmer is not indigo)', async ({ page }) => {
    await page.goto('/register', { waitUntil: 'load' });
    const colour = (name: string) => page.getByRole('button', { name: new RegExp(`^${name}`) }).locator('span').first().evaluate((e) => getComputedStyle(e).backgroundImage);
    const farmer = await colour('Farmer');
    const buyer = await colour('Buyer');
    expect(farmer).not.toEqual(buyer);
    expect(farmer).toMatch(/rgb\((225|244|251|220|239)/); // rose / orange family
    expect(buyer).toMatch(/rgb\((37|59|14|6|8)/); // blue / cyan family
  });
});
