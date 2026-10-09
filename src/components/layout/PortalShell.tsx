'use client';

/**
 * PortalShell — the bright frame every role portal renders inside.
 *
 * Replaces the old dark shell (black rail, black KPI tiles, hotlinked Unsplash
 * art). Same props, so existing callers keep working, plus:
 *   - `tabs` / `activeTab` / `onTabChange` for in-page sections, which is how
 *     portals now offer "Catalog", "Orders"… without routes that never existed;
 *   - `actions` for hero buttons;
 *   - `standalone` for pages outside the (dashboards) group, which then get
 *     the site header and footer from the shell.
 *
 * The hero is a live 3D valley (ValleyScene) in the portal's season mood, over
 * the season photograph as a no-WebGL fallback, with a chinar leaf watermark; the canvas carries a faint khatamband lattice. The wrapper
 * is `kr-light`, so kr-* design-token classes used inside render properly.
 */
import Image from 'next/image';
import Link from 'next/link';
import type { ElementType, ReactNode } from 'react';

import { ChinarLeaf } from '@/components/brand/ChinarLeaf';
import { Tilt3D } from '@/components/three/Tilt3D';
import { ValleyScene } from '@/components/three/ValleyScene';
import { SiteFooter, SiteHeader } from '@/components/layout/SiteHeader';
import { FOCUS, GLASS_CARD, LATTICE_BG, resolveTheme } from '@/components/portal/kit';

export interface KPI {
  label: string;
  value: string;
  trend?: string;
}

export interface NavItem {
  label: string;
  href: string;
  icon: ElementType;
  active?: boolean;
}

export interface PortalTab {
  id: string;
  label: string;
  icon?: ElementType;
  count?: number;
}

export interface PortalShellProps {
  title: string;
  description: string;
  /** Palette key from PORTAL_THEMES (farmer, buyer, seller, kissan, rental …). */
  theme: string;
  eyebrow?: string;
  kpis?: KPI[];
  /** Links to other pages, shown as pills. */
  navItems?: NavItem[];
  /** In-page sections, shown as tabs. */
  tabs?: PortalTab[];
  activeTab?: string;
  onTabChange?: (id: string) => void;
  /** Buttons on the hero. */
  actions?: ReactNode;
  /** Render the site header/footer (pages outside the dashboards layout). */
  standalone?: boolean;
  /** Legacy prop — ignored; heroes use the local season photographs. */
  bgImage?: string;
  children: ReactNode;
}

export function PortalShell({
  title,
  description,
  theme: themeId,
  eyebrow,
  kpis = [],
  navItems = [],
  tabs = [],
  activeTab,
  onTabChange,
  actions,
  standalone = false,
  children,
}: PortalShellProps) {
  const theme = resolveTheme(themeId);

  return (
    <div className={`kr-light relative isolate min-h-screen text-slate-900 ${theme.canvas}`}>
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10" style={LATTICE_BG} />
      {standalone && <SiteHeader tone="light" />}

      <div className="mx-auto max-w-7xl px-4 pb-16 pt-6 sm:px-6 lg:px-8">
        {/* Hero */}
        <section className="relative isolate overflow-hidden rounded-[2rem] shadow-[0_20px_60px_rgba(15,23,42,0.18)]">
          <Image
            src={theme.photo}
            alt=""
            fill
            sizes="(min-width: 1280px) 1216px, 100vw"
            priority
            className="-z-20 object-cover"
            style={{ objectPosition: theme.focus }}
          />
          <ValleyScene mood={theme.mood} className="-z-20" />
          <div aria-hidden className={`absolute inset-0 -z-10 bg-gradient-to-r ${theme.heroTint}`} />
          <ChinarLeaf
            className="pointer-events-none absolute -right-6 -top-8 -z-10 h-56 w-56 rotate-12 opacity-30"
            color="#FDE68A"
          />

          <div className="flex min-h-[260px] flex-col justify-end gap-5 p-6 sm:min-h-[320px] sm:flex-row sm:items-end sm:justify-between sm:p-9">
            <div className="max-w-2xl">
              {eyebrow && (
                <p className={`inline-flex rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] backdrop-blur ${theme.eyebrow}`}>
                  {eyebrow}
                </p>
              )}
              <h1 className="mt-3 text-3xl font-bold tracking-tight text-white drop-shadow-sm sm:text-4xl">{title}</h1>
              <p className="mt-2 text-base text-white/90">{description}</p>
            </div>
            {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
          </div>
        </section>

        {/* KPIs */}
        {kpis.length > 0 && (
          <div className={`relative z-10 -mt-6 mx-3 grid gap-3 sm:mx-6 ${kpis.length >= 4 ? 'grid-cols-2 lg:grid-cols-4' : kpis.length === 3 ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-2'}`}>
            {kpis.map((kpi) => (
              <Tilt3D key={kpi.label} className="rounded-2xl" max={7}>
                <div className={`${GLASS_CARD} h-full p-4 [transform-style:preserve-3d]`}>
                  <p className="text-xs font-medium uppercase tracking-wider text-slate-500">{kpi.label}</p>
                  <p data-depth className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{kpi.value}</p>
                  {kpi.trend && <p className={`mt-0.5 text-xs font-medium ${theme.accent}`}>{kpi.trend}</p>}
                </div>
              </Tilt3D>
            ))}
          </div>
        )}

        {/* Navigation: page links + in-page tabs */}
        {(navItems.length > 0 || tabs.length > 0) && (
          <nav
            aria-label={`${title} sections`}
            className="mt-6 flex flex-wrap gap-1.5 rounded-2xl bg-white/60 p-1.5 ring-1 ring-slate-900/5 backdrop-blur"
          >
            {tabs.map(({ id, label, icon: Icon, count }) => {
              const active = id === activeTab;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onTabChange?.(id)}
                  aria-pressed={active}
                  className={`inline-flex cursor-pointer items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition ${FOCUS} ${theme.outline} ${
                    active ? theme.tabActive : 'text-slate-600 hover:bg-white/70 hover:text-slate-900'
                  }`}
                >
                  {Icon && <Icon className="h-4 w-4" aria-hidden />}
                  {label}
                  {typeof count === 'number' && (
                    <span className="rounded-full bg-slate-900/5 px-1.5 text-xs tabular-nums">{count}</span>
                  )}
                </button>
              );
            })}
            {navItems.map(({ label, href, icon: Icon, active }) => (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold no-underline transition hover:no-underline ${FOCUS} ${theme.outline} ${
                  active ? theme.tabActive : 'text-slate-600 hover:bg-white/70 hover:text-slate-900'
                }`}
              >
                <Icon className="h-4 w-4" aria-hidden />
                {label}
              </Link>
            ))}
          </nav>
        )}

        <div className="mt-6">{children}</div>
      </div>

      {standalone && <SiteFooter tone="light" />}
    </div>
  );
}
