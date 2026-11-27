'use client';

/**
 * The portal's numbers (KPIs) as neat stat cards: name, big value, one line
 * of context. The first card is filled with the portal's deep colour; a card
 * that opens something (e.g. the tab with the details) is a button and shows
 * an arrow.
 */
import { ArrowUpRight } from 'lucide-react';

import { ChinarLeaf } from '@/components/brand/ChinarLeaf';
import { FOCUS, type PortalTheme } from '@/components/portal/kit';
import type { KPI } from '@/components/layout/PortalShell';
import type { ShellLook } from '@/components/layout/portal/look';

export function StatCards({ kpis, theme }: { kpis: KPI[]; theme: PortalTheme; look?: ShellLook }) {
  // A phone: two cards side by side, small (a lone last card of three takes the full row); from 640 px the usual sizes.
  const cols = kpis.length >= 4 ? 'grid-cols-2 xl:grid-cols-4' : kpis.length === 3 ? 'grid-cols-2 sm:grid-cols-3' : kpis.length === 2 ? 'grid-cols-2' : 'grid-cols-1';
  return (
    <div className={`grid gap-2 sm:gap-4 ${cols}`}>
      {kpis.map((kpi, i) => {
        // Forest green and soft sage in turn (globals.css .kr-kpi): never a row of white boxes.
        const lead = i % 2 === 0;
        const body = (
          <>
            {i === 0 && <ChinarLeaf className="pointer-events-none absolute -bottom-6 -right-4 -z-10 h-28 w-28 -rotate-12 opacity-25" color="#FDE68A" />}
            <span className="flex items-start justify-between gap-3">
              <span className="kr-kpi-label text-xs font-semibold sm:text-sm">{kpi.label}</span>
              {kpi.onClick && (
                <span aria-hidden className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ring-1 transition sm:h-8 sm:w-8 ${lead ? 'bg-white/15 text-white ring-white/30' : 'bg-white text-slate-700 ring-slate-900/10 group-hover:bg-slate-900 group-hover:text-white'}`}>
                  <ArrowUpRight className="h-4 w-4" />
                </span>
              )}
            </span>
            <span className="kr-kpi-value mt-1.5 block break-words text-2xl font-bold leading-tight tracking-tight tabular-nums sm:mt-3 sm:text-3xl">{kpi.value}</span>
            {/* The line's room is kept while its words load, so the cards do not grow later. */}
            <span className="kr-kpi-hint mt-1 block min-h-4 text-[11px] font-medium leading-snug sm:mt-2 sm:text-xs">{kpi.trend ?? ''}</span>
          </>
        );
        // Every card lifts a little under the pointer (the buttons a little more clearly, with their arrow).
        const face = 'kr-kpi group relative isolate block h-full overflow-hidden rounded-2xl p-3 text-left transition-[transform,box-shadow] sm:p-5 duration-200 ease-out hover:-translate-y-[5px] hover:shadow-xl motion-reduce:transition-none motion-reduce:hover:translate-y-0';
        return kpi.onClick ? (
          <button
            key={kpi.label}
            type="button"
            onClick={kpi.onClick}
            className={`${face} w-full cursor-pointer ${FOCUS} ${theme.outline}`}
          >
            {body}
          </button>
        ) : (
          <div key={kpi.label} className={face}>
            {body}
          </div>
        );
      })}
    </div>
  );
}
