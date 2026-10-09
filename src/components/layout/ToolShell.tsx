/**
 * ToolShell — the bright glass frame for the three public tools (Escrow, Mandi
 * Rates, Price Comparison), replacing their old dark and `kr-*` chrome.
 *
 * Each tool gets its own palette from lib/tools.ts: a soft gradient canvas, two
 * blurred colour fields for depth, and a light frosted header. Content placed
 * inside should use GLASS.card surfaces with slate-900/slate-600 text.
 *
 * This is the web-overhaul stub's PortalShell under a new name. The repo
 * already has a different src/components/layout/PortalShell.tsx that ten
 * dashboards render, so the stub's version could not take that name.
 *
 * Two deliberate departures from the stub:
 *
 *   - ToolHeader is NOT sticky. These pages already render the sticky
 *     SiteHeader above them, and two stacked sticky bars fight each other for
 *     the top of the viewport.
 *   - The shell is `flex-1`, not `min-h-screen`, because it sits between
 *     SiteHeader and SiteFooter inside a flex column rather than owning the
 *     whole page.
 */
import type { ReactNode } from 'react';

import { TOOLS, type ToolId } from '@/lib/tools';

interface ToolShellProps {
  tool: ToolId;
  /** Replaces the default header; pass `null` for none. */
  header?: ReactNode;
  children: ReactNode;
}

export function ToolShell({ tool, header, children }: ToolShellProps) {
  const { theme } = TOOLS[tool];
  return (
    <div className={`relative isolate flex flex-1 flex-col overflow-hidden text-slate-900 ${theme.canvas}`}>
      <div
        aria-hidden
        className={`pointer-events-none absolute -left-32 -top-32 -z-10 h-[28rem] w-[28rem] rounded-full blur-3xl ${theme.glowA}`}
      />
      <div
        aria-hidden
        className={`pointer-events-none absolute -right-24 top-1/3 -z-10 h-[24rem] w-[24rem] rounded-full blur-3xl ${theme.glowB}`}
      />

      {header === undefined ? <ToolHeader tool={tool} /> : header}

      <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}

interface ToolHeaderProps {
  tool: ToolId;
  title?: string;
  description?: string;
  /** Buttons on the right — e.g. the "List your products" CTA. */
  actions?: ReactNode;
}

/** Light frosted header: slate-900 title on a *-50 → white gradient. */
export function ToolHeader({ tool, title, description, actions }: ToolHeaderProps) {
  const { theme, eyebrow, icon: Icon, title: toolTitle } = TOOLS[tool];
  return (
    <header className={`backdrop-blur-xl ${theme.header}`}>
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <div className="flex items-center gap-4">
          <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${theme.iconTile}`}>
            <Icon className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            <p className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${theme.eyebrow}`}>
              {eyebrow}
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">{title ?? toolTitle}</h1>
            {description && <p className="mt-0.5 text-sm text-slate-600">{description}</p>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}
