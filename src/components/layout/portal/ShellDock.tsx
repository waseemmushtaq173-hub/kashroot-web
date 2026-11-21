'use client';

/**
 * The portal's sections as a floating bar at the bottom of a phone, in reach of the thumb: a dark rounded bar with
 * each section as an icon above its name (the open one a white pill, like the sidebar's), scrolling sideways when there
 * are many (the right edge fades while there is more to see). The round microphone helper sits to its right: the bar is
 * exactly as tall as that button and stops a hand's width short of it, so the two read as a pair.
 *
 * It gets out of the way of reading: it slides down while the page is scrolled down and comes back as soon as the page is
 * scrolled up, or near the top or the bottom of the page.
 *
 * Only below the large-screen breakpoint (the sidebar has these sections above it). It is fixed to the screen, so on a phone
 * (page shown at about half size, see app/layout) it is grown back with the same zoom as the microphone. While it is on
 * the page it tells the page how much room it takes (--kr-dock-h on <html>, used as the bottom padding of the
 * (dashboards) layout), so the last lines of the page and the footer are never hidden behind it.
 */
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import type { NavItem, PortalTab } from '@/components/layout/PortalShell';
import { ShellTabs } from '@/components/layout/portal/ShellTabs';
import { FOCUS, type PortalTheme } from '@/components/portal/kit';
import { usePhoneZoom } from '@/lib/client/phoneZoom';

/** How far the page must move before the bar reacts (a finger resting on the screen does not count). */
const SCROLL_STEP = 10;
/** Not hidden in the first stretch of the page, nor in the last. */
const EDGE = 160;

export function ShellDock({
  tabs,
  navItems,
  activeTab,
  onSelect,
  theme,
  title,
  idPrefix,
  panelId,
}: {
  tabs: PortalTab[];
  navItems: NavItem[];
  activeTab?: string;
  onSelect: (id: string) => void;
  theme: PortalTheme;
  title: string;
  idPrefix: string;
  panelId: string;
}) {
  const zoom = usePhoneZoom();
  const bar = useRef<HTMLElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const hiddenRef = useRef(false);
  const [hidden, setHidden] = useState(false);
  // More sections lie to the right: their edge fades, so a name is never just cut off.
  const [more, setMore] = useState(false);

  // Keep the open section in sight inside the bar (sideways only, never the page).
  useEffect(() => {
    const box = scroller.current;
    const tab = box?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!box || !tab || box.scrollWidth <= box.clientWidth) return;
    const t = tab.getBoundingClientRect();
    const b = box.getBoundingClientRect();
    const left = box.scrollLeft + t.left - b.left - (b.width - t.width) / 2;
    box.scrollTo({ left: Math.max(0, left), behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, [activeTab, zoom]);

  // Is there more to the right?
  useEffect(() => {
    const box = scroller.current;
    if (!box) return;
    const check = () => setMore(box.scrollLeft + box.clientWidth < box.scrollWidth - 4);
    check();
    box.addEventListener('scroll', check, { passive: true });
    const watch = new ResizeObserver(check);
    watch.observe(box);
    return () => {
      box.removeEventListener('scroll', check);
      watch.disconnect();
    };
  }, [zoom, tabs.length, navItems.length]);

  // Slides away while the page is read downwards; back on any scroll up, and near the top and the bottom.
  useEffect(() => {
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      const nearEnd = y + window.innerHeight >= document.documentElement.scrollHeight - EDGE;
      if (y < EDGE || nearEnd) {
        if (hiddenRef.current) setHidden((hiddenRef.current = false));
        last = y;
        return;
      }
      if (Math.abs(y - last) < SCROLL_STEP) return;
      const hide = y > last;
      last = y;
      if (hide !== hiddenRef.current) setHidden((hiddenRef.current = hide));
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Tell the page how much of its bottom the bar covers (from the bar's top edge to the bottom of the screen).
  useEffect(() => {
    const el = bar.current;
    if (!el) return;
    const root = document.documentElement;
    const measure = () => {
      // Slid away: keep the room it takes, or the page would jump under the finger.
      if (hiddenRef.current) return;
      const rect = el.getBoundingClientRect();
      // Hidden on large screens (display: none): nothing to make room for.
      if (rect.height === 0) return root.style.removeProperty('--kr-dock-h');
      root.style.setProperty('--kr-dock-h', `${Math.ceil(Math.max(0, root.clientHeight - rect.top))}px`);
    };
    measure();
    const watch = new ResizeObserver(measure);
    watch.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      watch.disconnect();
      window.removeEventListener('resize', measure);
      root.style.removeProperty('--kr-dock-h');
    };
  }, [zoom]);

  return (
    <nav
      ref={bar}
      data-kr-dock
      data-hidden={hidden || undefined}
      // The sidebar's dark buttons and the white pills of the page keep their own look (globals.css leaves data-kr-plain alone).
      data-kr-plain
      // Slid out of sight, it can be neither tapped nor reached with the keyboard.
      inert={hidden}
      aria-label={`${title} sections`}
      style={{
        zoom,
        // Same place as the microphone, in zoomed pixels: above the offline banner when it shows, clear of the phone's home bar.
        bottom: `calc(1rem + env(safe-area-inset-bottom) + var(--kr-bottom-bar, 0px) / ${zoom})`,
        left: 'calc(1rem + env(safe-area-inset-left))',
        // The microphone button is 4rem wide, 1rem from the edge: the bar ends 0.75rem before it.
        right: 'calc(5.75rem + env(safe-area-inset-right))',
      }}
      // 4rem high, like the microphone button.
      className={`fixed z-30 h-16 rounded-full border border-champagne/50 bg-forest-deep/95 shadow-[0_10px_24px_-8px_rgba(6,40,30,0.55)] backdrop-blur-xl transition-transform duration-200 ease-out motion-reduce:transition-none lg:hidden ${
        hidden ? 'translate-y-[calc(100%+2rem)]' : ''
      }`}
    >
      <div
        ref={scroller}
        className={`h-full overflow-x-auto overscroll-x-contain rounded-full p-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
          more ? '[mask-image:linear-gradient(to_right,#000_calc(100%-1.75rem),transparent)]' : ''
        }`}
      >
        <div className="flex h-full w-max items-stretch gap-1">
          {tabs.length > 0 && <ShellTabs tabs={tabs} activeTab={activeTab} onSelect={onSelect} theme={theme} orientation="horizontal" tone="dock" idPrefix={idPrefix} panelId={panelId} label={`${title} sections`} />}
          {navItems.map(({ label, href, icon: Icon, active }) => (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={`inline-flex h-full min-w-[4.25rem] max-w-[6rem] shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl px-2 text-center text-xs font-semibold leading-[14px] no-underline transition hover:no-underline ${FOCUS} focus-visible:outline-champagne ${
                active ? 'bg-forest-soft text-forest shadow-[inset_0_1px_0_#fff,0_3px_0_#C6A45B]' : 'text-white/90 hover:bg-white/10 hover:text-white'
              }`}
            >
              <Icon className="h-5 w-5 shrink-0" aria-hidden />
              <span className="line-clamp-2 [overflow-wrap:anywhere]">{label}</span>
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
