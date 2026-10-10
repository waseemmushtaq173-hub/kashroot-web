'use client';

import Link from 'next/link';
import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { LayoutGrid, ChevronDown, Home, LogIn, LogOut, Menu, UserPlus, UserRound, X } from 'lucide-react';
import { BrandMark } from '@/components/brand/Shikara';
import { MyDetailsPanel } from '@/components/portal/MyDetailsPanel';
import { MY_DETAILS } from '@/components/portal/myDetailsConfig';
import { authApi } from '@/lib/api/auth';
import { loginHref, PORTAL_IDS, PORTALS, type PortalId } from '@/lib/auth/roles';

/**
 * `dark` (default) is the original look for the dark dashboards. `light` is for
 * the bright pages — landing and the three tools — and swaps every colour to
 * explicit slate/white classes, because the kr-* text and surface variables the
 * dark look relies on are only defined inside .kr-light.
 */
export type SiteTone = 'dark' | 'light';

/**
 * Portal menu — every portal on the site is reachable from the top nav.
 * Rendered as a glassmorphic dropdown so the homepage hero never has to
 * carry portal cards.
 */
const MENU_ITEMS = [
  ...PORTAL_IDS.map((id) => ({ title: `${PORTALS[id].label} portal`, href: PORTALS[id].home, desc: PORTALS[id].tagline })),
  { title: 'Orchard Health', href: '/orchard-health', desc: 'Risk map, diagnosis & spray logs' },
  { title: 'Season Planner', href: '/season-planner', desc: 'Calendar & ROI calculator' },
  { title: 'Traceability', href: '/traceability', desc: 'Origin, cold chain & grades' },
];

/** Public pages and tools, for the phone menu (the bar has no room for them). */
const EXPLORE_ITEMS = [
  { title: 'Produce marketplace', href: '/buyer/discover' },
  { title: 'Supplies', href: '/supplies' },
  { title: 'Compare prices', href: '/compare-prices' },
  { title: 'Mandi rates & weather', href: '/mandi-weather' },
  { title: 'Escrow-protected trade', href: '/escrow' },
];

/**
 * Phone menu: one button opens everything the desktop bar shows — sign in,
 * create account, the public pages and every portal — so nothing on the site
 * needs "Desktop site" to be reached.
 */
function MobileMenu({ showAuth }: { showAuth: boolean }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onOutside = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onOutside);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('pointerdown', onOutside);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  const close = () => setOpen(false);
  const item = 'block rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-900 no-underline transition-colors hover:bg-slate-900/5 hover:no-underline';
  const heading = 'px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500';

  return (
    <div className="md:hidden" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="mobile-menu"
        className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-900/10 bg-white/85 px-3 py-2 text-sm font-semibold text-slate-800 backdrop-blur-md transition hover:bg-white"
      >
        {open ? <X className="h-4 w-4" aria-hidden /> : <Menu className="h-4 w-4" aria-hidden />}
        Menu
      </button>

      {open && (
        <div
          id="mobile-menu"
          className="absolute inset-x-0 top-full z-50 max-h-[calc(100svh-4.5rem)] overflow-y-auto border-b border-slate-900/10 bg-white px-3 pb-4 pt-2 shadow-[0_24px_60px_-20px_rgba(15,23,42,0.35)]"
        >
          {showAuth && (
            <div className="grid grid-cols-2 gap-2 p-1">
              <Link href="/login" onClick={close} className="flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-3 py-3 text-sm font-semibold text-white no-underline shadow-sm hover:bg-emerald-800 hover:no-underline">
                <LogIn className="h-4 w-4" aria-hidden /> Sign in
              </Link>
              <Link href="/register" onClick={close} className="flex items-center justify-center gap-2 rounded-xl bg-white px-3 py-3 text-sm font-semibold text-slate-900 no-underline ring-1 ring-slate-900/15 hover:bg-slate-50 hover:no-underline">
                <UserPlus className="h-4 w-4" aria-hidden /> Create account
              </Link>
            </div>
          )}
          <p className={heading}>Explore</p>
          {EXPLORE_ITEMS.map((p) => (
            <Link key={p.href} href={p.href} onClick={close} className={item}>{p.title}</Link>
          ))}
          <p className={heading}>Portals & tools</p>
          {MENU_ITEMS.map((p) => (
            <Link key={p.href} href={p.href} onClick={close} className={item}>
              {p.title}
              <span className="block text-xs font-normal text-slate-500">{p.desc}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function PortalMenu({ onOpenPortals, tone }: { onOpenPortals?: () => void; tone: SiteTone }) {
  const light = tone === 'light';
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  return (
    <div className="relative" ref={wrapRef}>
      <button
        onClick={() => (onOpenPortals ? onOpenPortals() : setOpen((v) => !v))}
        aria-expanded={open}
        aria-haspopup="menu"
        className={
          light
            ? 'flex items-center gap-1.5 rounded-lg border border-slate-900/10 bg-white/80 px-3 py-2 text-label font-semibold text-slate-800 backdrop-blur-md transition-all hover:bg-white'
            : 'flex items-center gap-1.5 rounded-lg border border-white/30 bg-white/15 px-3 py-2 text-label font-semibold text-kr-text-primary backdrop-blur-md transition-all hover:border-[#D4AF37] hover:bg-white/25'
        }
      >
        <LayoutGrid className="w-4 h-4" />
        Portals
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="menu"
          className={`absolute right-0 top-full mt-2 w-[22rem] max-w-[calc(100vw-2rem)] max-h-[70vh] overflow-y-auto rounded-2xl border p-2 backdrop-blur-xl ${
            light
              ? 'border-slate-900/10 bg-white/90 shadow-[0_24px_60px_-20px_rgba(15,23,42,0.35)]'
              : 'border-white/25 bg-white/15 shadow-[0_24px_60px_-20px_rgba(7,11,26,0.6)]'
          }`}
        >
          {MENU_ITEMS.map((p) => (
            <Link
              key={p.href}
              href={p.href}
              role="menuitem"
              onClick={() => setOpen(false)}
              className={`block rounded-xl px-3 py-2.5 no-underline transition-colors hover:no-underline ${light ? 'hover:bg-slate-900/5' : 'hover:bg-white/30'}`}
            >
              <span className={`block text-sm font-semibold ${light ? 'text-slate-900' : 'text-kr-text-primary'}`}>{p.title}</span>
              <span className={`block text-xs ${light ? 'text-slate-600' : 'text-kr-text-secondary'}`}>{p.desc}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function SiteHeader({
  hideSignIn = false,
  onOpenPortals,
  tone = 'dark',
  showRoleSignIn = false,
  portal,
}: {
  hideSignIn?: boolean;
  onOpenPortals?: () => void;
  tone?: SiteTone;
  /** Light tone only: show a "Sign in" link in the bar. */
  showRoleSignIn?: boolean;
  /** Inside a portal: show only that portal, Home and Sign out — no portal picker. */
  portal?: PortalId | null;
}) {
  const light = tone === 'light';

  if (portal) {
    return <PortalHeader portal={portal} />;
  }

  const navLink = light
    ? 'rounded-lg px-3 py-2 text-label font-medium text-slate-700 no-underline transition-colors hover:bg-white hover:text-slate-900 hover:no-underline'
    : 'rounded-lg px-3 py-2 text-label text-kr-text-secondary transition-colors hover:bg-white/40 hover:text-kr-text-primary';

  return (
    <header
      className={
        light
          ? 'sticky top-0 z-40 border-b border-slate-900/5 bg-white/70 backdrop-blur-xl shadow-[0_8px_30px_-12px_rgba(15,23,42,0.15)]'
          : 'sticky top-0 z-40 border-b border-white/25 bg-kr-bg-surface/75 backdrop-blur-xl supports-[backdrop-filter]:bg-kr-bg-surface/65 shadow-[0_8px_30px_-12px_rgba(7,11,26,0.35)]'
      }
    >
      <nav
        className={
          light
            ? 'mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8'
            : 'kr-container flex items-center justify-between gap-4 py-3'
        }
        aria-label="Primary"
      >
        <Link href="/" className={`shrink-0 ${light ? 'text-slate-900 no-underline hover:no-underline' : ''}`}>
          <BrandMark />
        </Link>

        <div className="hidden items-center gap-1 md:flex">
          <Link href="/buyer/discover" className={navLink}>
            Produce
          </Link>
          <Link href="/supplies" className={navLink}>
            Supplies
          </Link>
          <Link href="/compare-prices" className={navLink}>
            Compare
          </Link>
        </div>

        <div className="flex items-center gap-2">
          {light && showRoleSignIn && !hideSignIn && (
            <Link href="/login" className={`${navLink} hidden md:inline-flex`}>
              Sign in
            </Link>
          )}
          <div className="hidden md:block">
            <PortalMenu onOpenPortals={onOpenPortals} tone={tone} />
          </div>
          <MobileMenu showAuth={!hideSignIn} />
        </div>
      </nav>
    </header>
  );
}

/**
 * Public site footer. Mirrors the header's information architecture so the two
 * verticals are reachable from the bottom of every public page as well.
 */
export function SiteFooter({ tone = 'dark' }: { tone?: SiteTone }) {
  const light = tone === 'light';
  const footLink = light
    ? 'text-slate-600 no-underline transition-colors hover:text-slate-900 hover:no-underline'
    : 'text-kr-text-secondary transition-colors hover:text-kr-text-brand';

  return (
    <footer
      className={
        light
          ? 'border-t border-slate-900/5 bg-white/70 backdrop-blur-xl'
          : 'border-t border-white/25 bg-kr-bg-surface/70 backdrop-blur-xl supports-[backdrop-filter]:bg-kr-bg-surface/60'
      }
    >
      <div
        className={`flex flex-col items-start justify-between gap-4 py-8 sm:flex-row sm:items-center ${
          light ? 'mx-auto max-w-7xl px-4 sm:px-6 lg:px-8' : 'kr-container'
        }`}
      >
        <div className={light ? 'text-slate-900' : ''}>
          <BrandMark size="sm" />
          <p className={`mt-2 text-caption ${light ? 'text-slate-600' : 'text-kr-text-secondary'}`}>
            &copy; {new Date().getFullYear()} KashRoot Technologies Pvt. Ltd.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-caption">
          <Link href="/buyer/discover" className={footLink}>
            Produce marketplace
          </Link>
          <Link href="/supplies" className={footLink}>
            Horticulture supplies
          </Link>
          <Link href="/farmer/dashboard" className={footLink}>
            For farmers
          </Link>
        </div>
      </div>
    </footer>
  );
}

/** Inside a portal: brand, the portal's name, My details, Home and Sign out — no portal picker. */
function PortalHeader({ portal }: { portal: PortalId }) {
  const router = useRouter();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const hasDetailsForm = Boolean(MY_DETAILS[portal]);
  const signOut = async () => {
    await authApi.logout();
    router.replace(loginHref(portal));
  };
  return (
    <header className="sticky top-0 z-40 border-b border-slate-900/5 bg-white/75 shadow-[0_8px_30px_-12px_rgba(15,23,42,0.15)] backdrop-blur-xl">
      <nav aria-label="Portal" className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/" aria-label="KashRoot home" className="shrink-0 text-slate-900 no-underline hover:no-underline">
            <BrandMark compactOnPhone />
          </Link>
          <span className="hidden truncate rounded-full bg-slate-900/5 px-3 py-1 text-xs font-semibold text-slate-700 sm:inline">
            {PORTALS[portal].label} portal
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
          {hasDetailsForm && (
            <button type="button" onClick={() => setDetailsOpen(true)} className="inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-2 text-sm font-semibold text-slate-800 transition hover:bg-white sm:px-3">
              <UserRound className="h-4 w-4" aria-hidden /> <span>My details</span>
            </button>
          )}
          <Link href="/" className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-2 text-sm font-medium text-slate-700 no-underline transition hover:bg-white hover:text-slate-900 hover:no-underline">
            <Home className="h-4 w-4" aria-hidden /> Home
          </Link>
          <button type="button" onClick={signOut} className="inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-900/10 bg-white/80 px-3 py-2 text-sm font-semibold text-slate-800 transition hover:bg-white">
            <LogOut className="h-4 w-4" aria-hidden /> Sign out
          </button>
        </div>
      </nav>
      {detailsOpen && <MyDetailsPanel portal={portal} open onClose={() => setDetailsOpen(false)} />}
    </header>
  );
}
