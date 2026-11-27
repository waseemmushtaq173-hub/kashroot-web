'use client';

/**
 * The portal's sections as tabs: a vertical list in the sidebar (MENU) or a
 * row of pills that scrolls sideways on smaller screens. Both are real tabs
 * (role="tab", aria-selected) for one panel, with the arrow keys moving
 * between them and Enter opening one. A count shows as a badge and is part of
 * the tab's name ("Orders 3"), as before.
 */
import { useEffect, useRef, type KeyboardEvent } from 'react';

import { FOCUS, type PortalTheme } from '@/components/portal/kit';
import type { PortalTab } from '@/components/layout/PortalShell';
import { SPECTRUM } from '@/components/layout/portal/spectrum';

export function ShellTabs({
  tabs,
  activeTab,
  onSelect,
  theme,
  orientation,
  idPrefix,
  panelId,
  label,
  large = false,
  light = false,
}: {
  tabs: PortalTab[];
  activeTab?: string;
  onSelect: (id: string) => void;
  theme: PortalTheme;
  orientation: 'vertical' | 'horizontal';
  /** Makes the tab ids unique when the same tabs show twice on the page. */
  idPrefix: string;
  panelId: string;
  label: string;
  /** Bigger rows (the drawer on phones). */
  large?: boolean;
  /** The phone drawer's soft look: a pale colour chip behind each icon, a tint for the open section, no dark block. */
  light?: boolean;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const vertical = orientation === 'vertical';
  // The tab Tab-key focus lands on: the open one, else the first.
  const current = tabs.some((t) => t.id === activeTab) ? activeTab : tabs[0]?.id;

  // Pills: keep the open tab in sight when it changes (sideways only, never the page).
  useEffect(() => {
    const list = listRef.current;
    if (vertical || !list) return;
    const tab = list.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!tab) return;
    // The nearest ancestor that really scrolls sideways (the tab row sits inside a wrapper that only sizes it).
    let box: HTMLElement | null = list.parentElement;
    while (box && !(/(auto|scroll)/.test(getComputedStyle(box).overflowX) && box.scrollWidth > box.clientWidth)) box = box.parentElement;
    if (!box) return;
    const t = tab.getBoundingClientRect();
    const b = box.getBoundingClientRect();
    // Centred, so a neighbour shows on each side; a tab wider than the box starts at the left edge instead.
    const centred = box.scrollLeft + t.left - b.left - (b.width - t.width) / 2;
    const left = t.width >= b.width - 24 ? box.scrollLeft + t.left - b.left - 12 : centred;
    box.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
  }, [activeTab, vertical]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const keys = vertical ? ['ArrowUp', 'ArrowDown', 'Home', 'End'] : ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
    if (!keys.includes(e.key)) return;
    const all = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? []);
    const at = all.indexOf(document.activeElement as HTMLButtonElement);
    if (!all.length) return;
    e.preventDefault();
    const back = e.key === 'ArrowUp' || e.key === 'ArrowLeft';
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? all.length - 1 : (at + (back ? -1 : 1) + all.length) % all.length;
    all[next]?.focus();
  };

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={label}
      aria-orientation={orientation}
      onKeyDown={onKeyDown}
      className={vertical ? 'flex flex-col gap-1' : 'flex w-max gap-2'}
    >
      {tabs.map(({ id, label: name, icon: Icon, count }, index) => {
        const hue = SPECTRUM[index % SPECTRUM.length];
        const active = id === activeTab;
        const badge = typeof count === 'number' && (
          <span
            className={`ml-auto inline-grid min-w-[1.6rem] place-items-center rounded-full px-1.5 py-0.5 text-xs font-bold tabular-nums ${
              active ? (vertical ? theme.solid : 'bg-white/25 text-white') : 'bg-slate-900/[0.06] text-slate-700'
            }`}
          >
            {count}
          </span>
        );
        return vertical && light ? (
          <button
            key={id}
            id={`${idPrefix}-${id}`}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={panelId}
            tabIndex={id === current ? 0 : -1}
            onClick={() => onSelect(id)}
            className={`relative flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-2 py-1.5 text-left font-semibold transition ${large ? 'min-h-12 text-base' : 'min-h-11 text-[15px]'} ${FOCUS} focus-visible:outline-slate-500 ${
              active ? `${hue.on} text-slate-900 ring-1` : 'text-slate-700 hover:bg-slate-900/[0.04] hover:text-slate-900'
            }`}
          >
            {Icon && (
              <span data-hue={index % SPECTRUM.length} className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${hue.chip}`}>
                <Icon className="h-4 w-4" aria-hidden />
              </span>
            )}
            <span className="min-w-0 flex-1 leading-snug [overflow-wrap:anywhere]">{name}</span>
            {badge}
          </button>
        ) : vertical ? (
          <button
            key={id}
            id={`${idPrefix}-${id}`}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={panelId}
            tabIndex={id === current ? 0 : -1}
            onClick={() => onSelect(id)}
            className={`relative flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-left font-semibold transition ${large ? 'min-h-12 text-base' : 'min-h-11 text-[15px]'} ${FOCUS} ${theme.outline} ${
              active ? 'bg-forest-soft text-forest shadow-[inset_0_1px_0_#fff,0_3px_0_#C6A45B]' : 'text-white/85 hover:bg-white/10 hover:text-white'
            }`}
          >
            {/* The coloured bar at the sidebar's edge marks the open section. */}
            {active && <span aria-hidden className={`absolute -left-4 top-1/2 h-8 w-1.5 -translate-y-1/2 rounded-r-full ${theme.solid}`} />}
            {Icon && <Icon className={`h-5 w-5 shrink-0 ${active ? '' : 'text-champagne'}`} aria-hidden />}
            {/* A long name wraps onto a second line rather than being cut off ("Bookings to co…"). */}
            <span className="min-w-0 flex-1 leading-snug [overflow-wrap:anywhere]">{name}</span>
            {badge}
          </button>
        ) : (
          <button
            key={id}
            id={`${idPrefix}-${id}`}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={panelId}
            tabIndex={id === current ? 0 : -1}
            onClick={() => onSelect(id)}
            className={`inline-flex min-h-12 shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap rounded-full px-5 text-base font-semibold ring-1 transition ${FOCUS} ${theme.outline} ${
              active ? `${theme.solid} shadow-md ring-transparent` : 'bg-white/90 text-slate-700 shadow-sm ring-slate-900/10 hover:bg-white hover:text-slate-900'
            }`}
          >
            {Icon && <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden />}
            {name}
            {badge}
          </button>
        );
      })}
    </div>
  );
}
