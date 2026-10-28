'use client';

/**
 * The portal sidebar: the KashRoot logo and the portal's name, its sections
 * (MENU), the GENERAL links (My details, Help, Home, Sign out) and the
 * "Install the KashRoot app" card. Fixed at the left on large screens; on
 * smaller ones the same content opens as a drawer from the Menu button.
 */
import Link from 'next/link';
import { useEffect, useRef, type ElementType, type ReactNode } from 'react';
import { ArrowLeft, Home, LifeBuoy, LogOut, UserRound, X } from 'lucide-react';

import { BrandMark } from '@/components/brand/Shikara';
import { ChinarLeaf } from '@/components/brand/ChinarLeaf';
import { FOCUS, type PortalTheme } from '@/components/portal/kit';
import type { NavItem, PortalTab } from '@/components/layout/PortalShell';
import { InstallAppCard } from '@/components/layout/portal/InstallAppCard';
import { ShellTabs } from '@/components/layout/portal/ShellTabs';
import type { ShellLook } from '@/components/layout/portal/look';
import { liftToasts } from '@/lib/client/toastLayer';

const HEADING = 'px-3 pb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400';
const ITEM = `flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-left font-semibold no-underline transition hover:no-underline ${FOCUS}`;
/** Row height and text: the drawer (phones, laid out 800 px wide and shown at about half size) gets bigger rows. */
const SIZE = { normal: 'min-h-11 text-[15px]', large: 'min-h-14 text-lg' };
const IDLE = 'text-slate-600 hover:bg-slate-900/[0.04] hover:text-slate-900';

export interface SidebarProps {
  theme: PortalTheme;
  look: ShellLook;
  /** "Farmer portal"; null outside a portal. */
  portalLabel: string | null;
  /** Names the menu for screen readers ("Welcome, Ghulam menu"). */
  title: string;
  tabs: PortalTab[];
  activeTab?: string;
  onSelect: (id: string) => void;
  /** Keeps the tab ids unique between the sidebar and the drawer. */
  idPrefix: string;
  panelId: string;
  navItems: NavItem[];
  /** On a page inside a portal other than its dashboard: the way back to it. */
  dashboard?: { href: string; label: string };
  /** Shown when the portal has a details form and the person is signed in. */
  onDetails?: () => void;
  /** Shown when signed in to this portal. */
  onSignOut?: () => void;
  /** A link was followed (the drawer closes). */
  onNavigate?: () => void;
  /** Bigger rows, for the drawer. */
  large?: boolean;
}

function MenuLink({ href, icon: Icon, children, onNavigate, outline, size, current = false }: { href: string; icon: ElementType; children: ReactNode; onNavigate?: () => void; outline: string; size: string; current?: boolean }) {
  return (
    <Link href={href} onClick={onNavigate} aria-current={current ? 'page' : undefined} className={`${ITEM} ${size} ${outline} ${IDLE}`}>
      <Icon className="h-5 w-5 shrink-0 text-slate-400" aria-hidden />
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </Link>
  );
}

export function SidebarContent(props: SidebarProps) {
  const { theme, look, portalLabel, title, tabs, activeTab, onSelect, idPrefix, panelId, navItems, dashboard, onDetails, onSignOut, onNavigate, large = false } = props;
  const size = large ? SIZE.large : SIZE.normal;
  const hasMenu = tabs.length > 0 || navItems.length > 0 || Boolean(dashboard);

  return (
    <div className="relative flex min-h-full flex-col gap-7 px-4 pb-5 pt-6">
      {/* Logo and the portal's name */}
      <div className="px-2">
        <Link href="/" onClick={onNavigate} aria-label="KashRoot home" className={`inline-flex min-h-12 items-center rounded-xl text-slate-900 no-underline hover:no-underline ${FOCUS} ${theme.outline}`}>
          <BrandMark />
        </Link>
        {portalLabel && (
          <p className={`mt-3 flex w-fit max-w-full items-center gap-2 rounded-2xl px-3 py-1 text-xs font-semibold leading-snug ${theme.soft}`}>
            <ChinarLeaf className="h-3.5 w-3.5 shrink-0" color={theme.leaf} />
            {/* Long names ("Cold Storage Booking portal") wrap rather than lose their end. */}
            <span>{portalLabel}</span>
          </p>
        )}
      </div>

      {hasMenu && (
        <nav aria-label={`${title} menu`}>
          <p className={HEADING} aria-hidden>
            Menu
          </p>
          <div className="space-y-1">
            {dashboard && (
              <MenuLink href={dashboard.href} icon={ArrowLeft} onNavigate={onNavigate} outline={theme.outline} size={size}>
                {dashboard.label}
              </MenuLink>
            )}
            {tabs.length > 0 && (
              <ShellTabs tabs={tabs} activeTab={activeTab} onSelect={onSelect} theme={theme} orientation="vertical" idPrefix={idPrefix} panelId={panelId} label={`${title} sections`} large={large} />
            )}
            {navItems.map(({ label, href, icon, active }) => (
              <MenuLink key={href} href={href} icon={icon} onNavigate={onNavigate} outline={theme.outline} size={size} current={active}>
                {label}
              </MenuLink>
            ))}
          </div>
        </nav>
      )}

      <nav aria-label="General">
        <p className={HEADING} aria-hidden>
          General
        </p>
        <ul className="space-y-1">
          {onDetails && (
            <li>
              <button type="button" onClick={onDetails} className={`${ITEM} ${size} ${theme.outline} ${IDLE}`}>
                <UserRound className="h-5 w-5 shrink-0 text-slate-400" aria-hidden /> My details
              </button>
            </li>
          )}
          <li>
            <MenuLink href="/support" icon={LifeBuoy} onNavigate={onNavigate} outline={theme.outline} size={size}>
              Help &amp; support
            </MenuLink>
          </li>
          <li>
            <MenuLink href="/" icon={Home} onNavigate={onNavigate} outline={theme.outline} size={size}>
              Home
            </MenuLink>
          </li>
          {onSignOut && (
            <li>
              <button type="button" onClick={onSignOut} className={`${ITEM} ${size} ${theme.outline} ${IDLE}`}>
                <LogOut className="h-5 w-5 shrink-0 text-slate-400" aria-hidden /> Sign out
              </button>
            </li>
          )}
        </ul>
      </nav>

      <div className="mt-auto">
        <InstallAppCard feature={look.feature} accent={theme.accent} />
      </div>
    </div>
  );
}

/** Smaller screens: the sidebar as a drawer (a native modal dialog: Escape and the shade close it). */
export function SidebarDrawer({ onClose, label, children }: { onClose: () => void; label: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);

  // Mounted only while open; taking it off the page closes it.
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || dialog.open) return;
    dialog.showModal();
    liftToasts();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-label={label}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="kr-drawer fixed inset-y-0 left-0 m-0 h-full max-h-none w-[min(26rem,90vw)] max-w-none overflow-y-auto border-0 bg-white p-0 text-slate-900 shadow-[0_30px_90px_rgba(15,23,42,0.35)] backdrop:bg-slate-900/40 backdrop:backdrop-blur-sm"
    >
      <div className="relative flex min-h-full flex-col">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close menu"
          className={`absolute right-3 top-4 z-10 grid h-12 w-12 cursor-pointer place-items-center rounded-xl text-slate-600 ring-1 ring-slate-900/10 transition hover:bg-slate-100 hover:text-slate-900 ${FOCUS} focus-visible:outline-slate-700`}
        >
          <X className="h-5 w-5" aria-hidden />
        </button>
        {children}
      </div>
    </dialog>
  );
}
