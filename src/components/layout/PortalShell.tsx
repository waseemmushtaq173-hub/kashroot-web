'use client';

/**
 * PortalShell — the frame every role portal renders inside, laid out like a
 * work dashboard:
 *   - on large screens a white sidebar: the KashRoot logo and the portal's
 *     name, its sections as the MENU (counts as badges), GENERAL (My details,
 *     Help, Home, Sign out) and the "Install the KashRoot app" card;
 *   - a top bar: search (jumps to a section or button by name, ⌘K) and who is
 *     signed in;
 *   - the page: title, description and its main buttons, the numbers as stat
 *     cards, then the open section.
 * On smaller screens (phones lay pages out 800px wide, see app/layout) the
 * sidebar opens as a drawer from the Menu button, Sign out stays in the top
 * bar, and the sections are pills that scroll sideways.
 *
 * Behind it, faintly and in the portal's own colours, the valley: chinar
 * leaves, the Zabarwan ridge and a shikara on Dal Lake (portal/KashmirBackdrop).
 *
 * Same props as before, so every portal keeps working:
 *   - `tabs` / `activeTab` / `onTabChange` for in-page sections;
 *   - `actions` for the page's main buttons;
 *   - `standalone` for pages outside the (dashboards) group (mandi rates,
 *     TrueScan…), which keep the site header and footer and have no sidebar.
 * The wrapper is `kr-light`, so kr-* design-token classes inside render properly.
 */
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Children, Fragment, isValidElement, useEffect, useId, useRef, useState, type ElementType, type ReactNode } from 'react';

import { SiteFooter, SiteHeader } from '@/components/layout/SiteHeader';
import { KashmirBackdrop } from '@/components/layout/portal/KashmirBackdrop';
import type { SearchItem } from '@/components/layout/portal/ShellSearch';
import { SidebarContent, SidebarDrawer } from '@/components/layout/portal/ShellSidebar';
import { ShellTabs } from '@/components/layout/portal/ShellTabs';
import { ShellTopBar } from '@/components/layout/portal/ShellTopBar';
import { StatCards } from '@/components/layout/portal/StatCards';
import { shellLook } from '@/components/layout/portal/look';
import { useShellUser } from '@/components/layout/portal/useShellUser';
import { MyDetailsPanel } from '@/components/portal/MyDetailsPanel';
import { FloatingVoice } from '@/components/voice/FloatingVoice';
import { MY_DETAILS } from '@/components/portal/myDetailsConfig';
import { FOCUS, TitleAction, resolveTheme } from '@/components/portal/kit';
import { loginHref, PORTALS, portalOfPath } from '@/lib/auth/roles';
import { signOutOfPortal } from '@/lib/auth/session';

export interface KPI {
  label: string;
  value: string;
  trend?: string;
  /** Makes the card a button (e.g. open the tab with the details). */
  onClick?: () => void;
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
  /** Links to other pages, shown with the sections. */
  navItems?: NavItem[];
  /** In-page sections, shown as tabs (sidebar menu, or pills on smaller screens). */
  tabs?: PortalTab[];
  activeTab?: string;
  onTabChange?: (id: string) => void;
  /** The page's main buttons, beside the title. */
  actions?: ReactNode;
  /** A choice above the numbers (e.g. Cold Storage: farmer or owner). */
  switcher?: ReactNode;
  /** Render the site header/footer (pages outside the dashboards layout). */
  standalone?: boolean;
  /** Legacy prop — ignored. */
  bgImage?: string;
  children: ReactNode;
}

/** The main buttons, each told its place: the last is the main one (fragments flattened). */
function titleActions(actions: ReactNode) {
  const all = Children.toArray(actions).flatMap((child) =>
    isValidElement<{ children?: ReactNode }>(child) && child.type === Fragment ? Children.toArray(child.props.children) : [child],
  );
  return all.map((child, i) => (
    <TitleAction.Provider key={isValidElement(child) && child.key !== null ? child.key : i} value={i === all.length - 1 ? 'main' : 'other'}>
      {child}
    </TitleAction.Provider>
  ));
}

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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
  switcher,
  standalone = false,
  children,
}: PortalShellProps) {
  const theme = resolveTheme(themeId);
  const look = shellLook(themeId);
  const router = useRouter();
  const pathname = usePathname() ?? '';
  const portal = standalone ? null : portalOfPath(pathname);
  const { signedIn, name } = useShellUser(portal);
  const ids = useId();
  const panelId = `${ids}-panel`;
  const panelRef = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const switcherRef = useRef<HTMLDivElement>(null);
  const [drawer, setDrawer] = useState(false);
  const [details, setDetails] = useState(false);

  const portalLabel = portal ? `${PORTALS[portal].label} portal` : null;
  const hasDetails = Boolean(portal && MY_DETAILS[portal]) && signedIn === true;
  const canSignOut = Boolean(portal) && signedIn === true;
  // A page inside a portal other than its dashboard (Orchard health…): the way back.
  const dashboard = portal && pathname !== PORTALS[portal].home ? { href: PORTALS[portal].home, label: `${PORTALS[portal].label} dashboard` } : undefined;
  const activeLabel = tabs.find((t) => t.id === activeTab)?.label;

  // The drawer is for smaller screens only: widening the window closes it.
  useEffect(() => {
    if (!drawer) return;
    const wide = window.matchMedia('(min-width: 1024px)');
    const onChange = () => {
      if (wide.matches) setDrawer(false);
    };
    wide.addEventListener('change', onChange);
    return () => wide.removeEventListener('change', onChange);
  }, [drawer]);

  const signOut = async () => {
    if (!portal) return;
    await signOutOfPortal(portal);
    router.replace(loginHref(portal));
  };

  /** Open a section. One opened from further down the page starts at its top, under the top bar. */
  const select = (id: string, fromSearch = false) => {
    setDrawer(false);
    onTabChange?.(id);
    // From the search box the cursor moves on to the section (now, so a key pressed next goes where the person is).
    if (fromSearch) panelRef.current?.focus({ preventScroll: true });
    // Scrolled once the section has drawn.
    window.requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const top = panel.getBoundingClientRect().top;
      if (top < 0 || (fromSearch && top > window.innerHeight * 0.6)) {
        window.scrollTo({ top: Math.max(0, window.scrollY + top - 96), behavior: reducedMotion() ? 'auto' : 'smooth' });
      }
    });
  };

  /** What the search box can jump to: sections, cards that open something, the page's buttons, the menu. */
  const searchItems = (): SearchItem[] => {
    const items: SearchItem[] = tabs.map((t) => ({ key: `tab-${t.id}`, label: t.label, kind: 'Section', run: () => select(t.id, true) }));
    const taken = new Set(items.map((i) => i.label.toLowerCase()));
    const add = (item: SearchItem) => {
      if (taken.has(item.label.toLowerCase())) return;
      taken.add(item.label.toLowerCase());
      items.push(item);
    };
    for (const k of kpis) if (k.onClick) add({ key: `kpi-${k.label}`, label: k.label, kind: 'Card', run: k.onClick });
    // The page's own buttons at the top (and the Cold Storage choice), by the words on them.
    [actionsRef.current, switcherRef.current].forEach((box, b) =>
      box?.querySelectorAll<HTMLElement>('button, a[href]').forEach((el, i) => {
        const label = (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim();
        if (label && !el.hasAttribute('disabled')) add({ key: `button-${b}-${i}`, label, kind: 'Button', run: () => el.click() });
      }),
    );
    if (dashboard) add({ key: 'dashboard', label: dashboard.label, kind: 'Menu', run: () => router.push(dashboard.href) });
    if (hasDetails) add({ key: 'details', label: 'My details', kind: 'Menu', run: () => setDetails(true) });
    add({ key: 'help', label: 'Help', kind: 'Menu', run: () => router.push('/support') });
    add({ key: 'home', label: 'Home', kind: 'Menu', run: () => router.push('/') });
    if (canSignOut) add({ key: 'sign-out', label: 'Sign out', kind: 'Menu', run: () => void signOut() });
    return items;
  };

  const page = (
    <>
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 max-w-3xl">
          {eyebrow && <p className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] ${theme.soft}`}>{eyebrow}</p>}
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">{title}</h1>
          <p className="mt-2 max-w-2xl text-base leading-relaxed text-slate-600">{description}</p>
        </div>
        {actions && (
          <div ref={actionsRef} data-kr-title-actions className="flex shrink-0 flex-wrap gap-2">
            {titleActions(actions)}
          </div>
        )}
      </div>

      {switcher && (
        <div ref={switcherRef} className="mt-6">
          {switcher}
        </div>
      )}

      {kpis.length > 0 && (
        <div className="mt-6">
          <StatCards kpis={kpis} theme={theme} look={look} />
        </div>
      )}

      {/* Sections as pills: on smaller screens (the sidebar has them on large ones), and on standalone pages. */}
      {(tabs.length > 0 || navItems.length > 0) && (
        <nav
          aria-label={`${title} sections`}
          className={`-mx-4 mt-6 overflow-x-auto px-4 pb-1 pt-1 [scrollbar-width:none] sm:-mx-6 sm:px-6 [&::-webkit-scrollbar]:hidden ${standalone ? '' : 'lg:hidden'}`}
        >
          <div className="flex w-max gap-2">
            {tabs.length > 0 && <ShellTabs tabs={tabs} activeTab={activeTab} onSelect={(id) => select(id)} theme={theme} orientation="horizontal" idPrefix={`${ids}-pill`} panelId={panelId} label="Sections" />}
            {navItems.map(({ label, href, icon: Icon, active }) => (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={`inline-flex min-h-12 shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-5 text-base font-semibold no-underline ring-1 transition hover:no-underline ${FOCUS} ${theme.outline} ${
                  active ? `${theme.solid} ring-transparent` : 'bg-white/90 text-slate-700 ring-slate-900/10 hover:bg-white'
                }`}
              >
                <Icon className="h-[18px] w-[18px]" aria-hidden />
                {label}
              </Link>
            ))}
          </div>
        </nav>
      )}

      <div
        ref={panelRef}
        id={panelId}
        // The open section, for the assistant's "Guide me on this page" (components/voice/PageGuide).
        data-portal-tab={activeTab}
        role={tabs.length > 0 ? 'tabpanel' : undefined}
        aria-label={tabs.length > 0 ? activeLabel ?? title : undefined}
        tabIndex={tabs.length > 0 ? -1 : undefined}
        className="mt-6 min-w-0 outline-none"
      >
        {children}
      </div>
    </>
  );

  if (standalone) {
    return (
      <div data-kr-shell="standalone" className={`kr-light relative isolate min-h-screen text-slate-900 ${theme.canvas}`}>
        <KashmirBackdrop ink={look.ink} leaf={theme.leaf} />
        <SiteHeader tone="light" />
        <main id="main-content" className="mx-auto max-w-7xl px-4 pb-16 pt-8 sm:px-6 lg:px-8">
          {page}
        </main>
        <SiteFooter tone="light" />
      </div>
    );
  }

  const sidebar = (idPrefix: string, large = false) => (
    <SidebarContent
      theme={theme}
      look={look}
      portalLabel={portalLabel}
      title={title}
      tabs={tabs}
      activeTab={activeTab}
      onSelect={(id) => select(id)}
      idPrefix={idPrefix}
      panelId={panelId}
      navItems={navItems}
      dashboard={dashboard}
      onDetails={
        hasDetails
          ? () => {
              setDrawer(false);
              setDetails(true);
            }
          : undefined
      }
      onSignOut={canSignOut ? () => void signOut() : undefined}
      onNavigate={() => setDrawer(false)}
      large={large}
    />
  );

  return (
    <div data-kr-shell="portal" className={`kr-light relative isolate min-h-screen text-slate-900 ${theme.canvas}`}>
      <KashmirBackdrop ink={look.ink} leaf={theme.leaf} />
      <div className="lg:flex">
        <aside
          aria-label={portalLabel ?? title}
          className="sticky top-0 hidden h-svh w-60 shrink-0 self-start overflow-y-auto border-r border-slate-900/5 bg-white/90 shadow-[10px_0_40px_-28px_rgba(15,23,42,0.35)] backdrop-blur-xl lg:block xl:w-64"
        >
          {sidebar(`${ids}-side`)}
        </aside>

        <div className="min-w-0 flex-1">
          <ShellTopBar
            theme={theme}
            look={look}
            portalName={portal ? PORTALS[portal].label : null}
            signedIn={signedIn}
            name={name}
            menuOpen={drawer}
            onMenu={() => setDrawer(true)}
            onDetails={hasDetails ? () => setDetails(true) : undefined}
            onSignOut={canSignOut ? () => void signOut() : undefined}
            signInHref={portal ? loginHref(portal, PORTALS[portal].home) : undefined}
            searchItems={searchItems}
            searchExample={tabs[1]?.label ?? tabs[0]?.label}
          />
          <main id="main-content" className="mx-auto max-w-7xl px-4 pb-16 pt-6 sm:px-6 sm:pt-8 xl:px-8">
            {page}
          </main>
        </div>
      </div>
      {/* The assistant, in every portal: a guide to this page, read aloud, and answers to questions. */}
      <FloatingVoice />

      {drawer && (
        <SidebarDrawer onClose={() => setDrawer(false)} label={`${portalLabel ?? title} menu`}>
          {sidebar(`${ids}-drawer`, true)}
        </SidebarDrawer>
      )}
      {details && portal && <MyDetailsPanel portal={portal} open onClose={() => setDetails(false)} />}
    </div>
  );
}
