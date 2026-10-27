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

export function StatCards({ kpis, theme, look }: { kpis: KPI[]; theme: PortalTheme; look: ShellLook }) {
  const cols = kpis.length >= 4 ? 'grid-cols-2 xl:grid-cols-4' : kpis.length === 3 ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2';
  return (
    <div className={`grid gap-3 sm:gap-4 ${cols}`}>
      {kpis.map((kpi, i) => {
        const lead = i === 0;
        const body = (
          <>
            {lead && <ChinarLeaf className="pointer-events-none absolute -bottom-6 -right-4 -z-10 h-28 w-28 -rotate-12 opacity-25" color="#FDE68A" />}
            <span className="flex items-start justify-between gap-3">
              <span className={`text-sm font-semibold ${lead ? 'text-white/90' : 'text-slate-600'}`}>{kpi.label}</span>
              {kpi.onClick && (
                <span aria-hidden className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ring-1 transition ${lead ? 'bg-white/15 text-white ring-white/30' : 'bg-white text-slate-700 ring-slate-900/10 group-hover:bg-slate-900 group-hover:text-white'}`}>
                  <ArrowUpRight className="h-4 w-4" />
                </span>
              )}
            </span>
            <span className={`mt-3 block break-words text-3xl font-bold leading-tight tracking-tight tabular-nums ${lead ? 'text-white' : 'text-slate-900'}`}>{kpi.value}</span>
            {kpi.trend && <span className={`mt-2 block text-xs font-medium leading-snug ${lead ? 'text-white/90' : theme.accent}`}>{kpi.trend}</span>}
          </>
        );
        const face = `group relative isolate block h-full overflow-hidden rounded-2xl p-5 text-left ${
          lead ? `${look.feature} shadow-lg` : 'bg-white/85 shadow-[0_8px_30px_rgba(15,23,42,0.06)] ring-1 ring-slate-900/5 backdrop-blur'
        }`;
        return kpi.onClick ? (
          <button
            key={kpi.label}
            type="button"
            onClick={kpi.onClick}
            className={`${face} w-full cursor-pointer transition hover:-translate-y-0.5 hover:shadow-xl motion-reduce:hover:translate-y-0 ${FOCUS} ${theme.outline}`}
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
