/**
 * ToolShell — the bright glass frame for the three tool pages (Escrow, Live
 * Mandi Rates, Price Comparison), replacing their old flat/dark backgrounds.
 *
 * Named ToolShell, not PortalShell: PortalShell (the dark role-dashboard frame)
 * is used by ten dashboards and is left alone.
 *
 * Each tool gets its own palette from lib/tools.ts: a soft gradient canvas, two
 * blurred colour fields for depth, and a light frosted header. The wrapper also
 * carries `kr-light` + `data-tool`, which emit the design-token CSS variables
 * for this subtree (see globals.css), so existing kr-card / kr-input /
 * kr-btn-* classes render properly inside it. Content placed inside should use
 * those classes or GLASS.card with slate-900 / slate-600 text.
 *
 * Renders the site header and footer too, so a tool page is just
 * <ToolShell tool="escrow">…content…</ToolShell>.
 */
import type { ReactNode } from 'react';

import { SiteFooter, SiteHeader } from '@/components/layout/SiteHeader';
import { TOOLS, type ToolId } from '@/lib/tools';

interface ToolShellProps {
  tool: ToolId;
  /** Replaces the default tool header; pass `null` for none. */
  header?: ReactNode;
  children: ReactNode;
}

export function ToolShell({ tool, header, children }: ToolShellProps) {
  const { theme } = TOOLS[tool];
  return (
    <div
      data-tool={tool}
      className={`kr-light relative isolate flex min-h-screen flex-col overflow-hidden text-slate-900 ${theme.canvas}`}
    >
      <div
        aria-hidden
        className={`pointer-events-none absolute -left-32 -top-32 -z-10 h-[28rem] w-[28rem] rounded-full blur-3xl ${theme.glowA}`}
      />
      <div
        aria-hidden
        className={`pointer-events-none absolute -right-24 top-1/3 -z-10 h-[24rem] w-[24rem] rounded-full blur-3xl ${theme.glowB}`}
      />

      <SiteHeader tone="light" />

      {header === undefined ? <ToolHeader tool={tool} /> : header}

      <main id="main-content" className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </main>

      <SiteFooter tone="light" />
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

/**
 * Light frosted header: slate-900 title on a *-50 → white gradient. Not sticky:
 * the site header above it already is, and two stuck bars would eat the screen.
 */
export function ToolHeader({ tool, title, description, actions }: ToolHeaderProps) {
  const { theme, eyebrow, icon: Icon, title: toolTitle } = TOOLS[tool];
  return (
    <header className={`backdrop-blur-xl ${theme.header}`}>
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <div className="flex items-center gap-4">
          <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${theme.iconTile}`}>
            <Icon className="h-6 w-6" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${theme.eyebrow}`}>{eyebrow}</p>
            <h1 className="mt-1 font-sans text-2xl font-semibold tracking-tight text-slate-900">{title ?? toolTitle}</h1>
            {description && <p className="mt-0.5 max-w-2xl text-sm text-slate-600">{description}</p>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}
