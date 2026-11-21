'use client';

/**
 * The portal's sections as a floating bar at the bottom of a phone, in reach of the thumb: a dark rounded bar with
 * each section as an icon above its name (the open one a white pill, like the sidebar's), scrolling sideways when there
 * are many. The round microphone helper sits to its right, so the bar leaves that room.
 *
 * Only below the large-screen breakpoint (the sidebar has these sections above it). It is fixed to the screen, so on a phone
 * (page shown at about half size, see app/layout) it is grown back with the same zoom as the microphone. While it is on
 * the page it tells the page how much room it takes (--kr-dock-h on <html>, used as the bottom padding of the
 * (dashboards) layout), so the last lines of the page and the footer are never hidden behind it.
 */
import Link from 'next/link';
import { useEffect, useRef } from 'react';

import type { NavItem, PortalTab } from '@/components/layout/PortalShell';
import { ShellTabs } from '@/components/layout/portal/ShellTabs';
import { FOCUS, type PortalTheme } from '@/components/portal/kit';
import { usePhoneZoom } from '@/lib/client/phoneZoom';

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

  // Tell the page how much of its bottom the bar covers (from the bar's top edge to the bottom of the screen).
  useEffect(() => {
    const el = bar.current;
    if (!el) return;
    const root = document.documentElement;
    const measure = () => {
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
      // The sidebar's dark buttons and the white pills of the page keep their own look (globals.css leaves data-kr-plain alone).
      data-kr-plain
      aria-label={`${title} sections`}
      style={{
        zoom,
        // Same place as the microphone, in zoomed pixels: above the offline banner when it shows, clear of the phone's home bar.
        bottom: `calc(1rem + env(safe-area-inset-bottom) + var(--kr-bottom-bar, 0px) / ${zoom})`,
        left: 'calc(1rem + env(safe-area-inset-left))',
        // The room the round microphone button takes at the right.
        right: 'calc(5.75rem + env(safe-area-inset-right))',
      }}
      className="fixed z-30 rounded-[2rem] border border-champagne/50 bg-forest-deep/90 shadow-[0_14px_32px_-10px_rgba(6,40,30,0.55)] backdrop-blur-xl lg:hidden"
    >
      <div ref={scroller} className="overflow-x-auto overscroll-x-contain p-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex w-max items-center gap-1">
          {tabs.length > 0 && <ShellTabs tabs={tabs} activeTab={activeTab} onSelect={onSelect} theme={theme} orientation="horizontal" tone="dock" idPrefix={idPrefix} panelId={panelId} label={`${title} sections`} />}
          {navItems.map(({ label, href, icon: Icon, active }) => (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={`inline-flex min-h-14 min-w-[4.75rem] max-w-[7rem] shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl px-2.5 py-1.5 text-center text-xs font-semibold leading-tight no-underline transition hover:no-underline ${FOCUS} focus-visible:outline-champagne ${
                active ? 'bg-forest-soft text-forest shadow-[inset_0_1px_0_#fff,0_3px_0_#C6A45B]' : 'text-white/90 hover:bg-white/10 hover:text-white'
              }`}
            >
              <Icon className="h-6 w-6 shrink-0" aria-hidden />
              <span className="[overflow-wrap:anywhere]">{label}</span>
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
