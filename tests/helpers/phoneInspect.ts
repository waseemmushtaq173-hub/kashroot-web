/**
 * Looks at a page the way a person holding a phone does: nothing wider than the screen, nothing cut off by its own box, no
 * placeholder cut short, no two pieces of text or two buttons on top of each other, and no chosen (pressed or selected) button whose
 * text cannot be read on its own background. Used by phone-structure.spec.ts (public
 * pages) and portal-phone.spec.ts (every portal, signed in).
 */
import type { Page } from '@playwright/test';

export interface Report {
  wider: string[];
  cut: string[];
  placeholder: string[];
  overlaps: string[];
  unreadable: string[];
}

/** Runs in the page. Decorative things (aria-hidden, pointer-events none, fixed/sticky bars) are left out. */
export async function inspect(page: Page): Promise<Report> {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const out: Report = { wider: [], cut: [], placeholder: [], overlaps: [], unreadable: [] };
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
      // A sticky or fixed bar counts here: a top bar whose last button runs off the screen is a real problem.
      if (!isThing(el) || scrollsSideways(el)) continue;
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
    // A chosen (pressed, selected, checked) control is painted by the site's own rule; its text must still be readable on every
    // colour of that paint (3:1 is the floor for large or bold text; a gradient is judged on its worst stop).
    const rgb = (s: string) => (s.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
    const lum = ([r, g, b]: number[]) => {
      const f = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const ratio = (a: number[], b: number[]) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
    for (const el of document.querySelectorAll('[aria-pressed="true"], [aria-checked="true"], [aria-selected="true"], [aria-current="page"]')) {
      if (!shown(el) || decorative(el)) continue;
      const cs = getComputedStyle(el);
      const stops = (cs.backgroundImage.match(/rgb\([^)]*\)/g) ?? []).map(rgb).filter((c) => c.length >= 3);
      const bgs = stops.length ? stops : [rgb(cs.backgroundColor)].filter((c) => c.length >= 3);
      if (!bgs.length) continue;
      for (const child of el.querySelectorAll('*')) {
        if (![...child.childNodes].some((n) => n.nodeType === 3 && n.textContent?.trim())) continue;
        const fg = rgb(getComputedStyle(child).color);
        if (fg.length < 3) continue;
        const worst = Math.min(...bgs.map((c) => ratio(fg, c)));
        if (worst < 3) out.unreadable.push(`${name(el)} text "${(child.textContent ?? '').trim().slice(0, 20)}" ${worst.toFixed(1)}:1`);
      }
    }
    return out;
  });
}

/**
 * A test browser on the live site cannot reach hCaptcha (the config blocks its host on purpose), so every login page it opens
 * reports "script-blocked" to /api/human, and that lands in the Admin "Sign-ins and traffic" counts as a failed "I am human"
 * check. The report is answered here instead, so test runs never add to what the Admin reads as real visitors.
 */
export async function keepOutOfAdminCounts(page: Page): Promise<void> {
  await page.route('**/api/human', (route) => route.fulfill({ status: 204, body: '' }));
}
