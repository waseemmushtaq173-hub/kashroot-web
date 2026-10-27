'use client';

/**
 * The portal's top bar: search, and who is signed in. On smaller screens it
 * is the whole frame — Menu (opens the sidebar as a drawer), the logo, the
 * portal's name, search, and Sign out — since the sidebar is hidden there.
 * Someone not signed in (Tracking opens for anyone) sees Sign in instead.
 */
import Link from 'next/link';
import { LogIn, LogOut, Menu } from 'lucide-react';

import { Emblem } from '@/components/brand/Emblem';
import { FOCUS, type PortalTheme } from '@/components/portal/kit';
import { ShellSearch, type SearchItem } from '@/components/layout/portal/ShellSearch';
import { initialsOf, type ShellLook } from '@/components/layout/portal/look';

export function ShellTopBar({
  theme,
  look,
  portalName,
  signedIn,
  name,
  menuOpen,
  onMenu,
  onDetails,
  onSignOut,
  signInHref,
  searchItems,
  searchExample,
}: {
  theme: PortalTheme;
  look: ShellLook;
  /** The portal's name ("Farmer"), beside the logo on smaller screens. */
  portalName: string | null;
  signedIn: boolean | null;
  name: string | null;
  menuOpen: boolean;
  onMenu: () => void;
  onDetails?: () => void;
  onSignOut?: () => void;
  signInHref?: string;
  searchItems: () => SearchItem[];
  searchExample?: string;
}) {
  const ring = `${FOCUS} ${theme.outline}`;
  const who = name && (
    <>
      <span aria-hidden className={`grid h-11 w-11 shrink-0 place-items-center rounded-full text-sm font-bold text-white shadow-sm ring-2 ring-white ${look.feature}`}>
        {initialsOf(name)}
      </span>
      <span className="hidden min-w-0 text-left lg:block">
        <span className="block max-w-[11rem] truncate text-sm font-semibold text-slate-900">{name}</span>
        <span className="block text-xs text-slate-500">{onDetails ? 'Your details' : 'Signed in'}</span>
      </span>
    </>
  );

  return (
    <header data-kr-topbar className="sticky top-0 z-30 border-b border-slate-900/5 bg-white/80 shadow-[0_8px_30px_-18px_rgba(15,23,42,0.25)] backdrop-blur-xl">
      <div className="flex h-[72px] items-center gap-2 px-3 sm:gap-3 sm:px-6 xl:px-8">
        <button
          type="button"
          onClick={onMenu}
          aria-haspopup="dialog"
          aria-expanded={menuOpen}
          className={`inline-flex h-12 shrink-0 cursor-pointer items-center gap-2 rounded-xl bg-white/90 px-3 text-base font-semibold text-slate-800 shadow-sm ring-1 ring-slate-900/10 transition hover:bg-white lg:hidden ${ring}`}
        >
          <Menu className="h-5 w-5" aria-hidden />
          Menu
        </button>
        <Link href="/" aria-label="KashRoot home" className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl lg:hidden ${ring}`}>
          <Emblem className="h-10 w-10" />
        </Link>
        {portalName && <span className="hidden min-w-0 max-w-[11rem] truncate text-base font-semibold text-slate-800 sm:block lg:hidden">{portalName}</span>}

        <ShellSearch getItems={searchItems} theme={theme} example={searchExample} />

        <div className="ml-auto flex shrink-0 items-center gap-2">
          {signedIn === false && signInHref && (
            <Link
              href={signInHref}
              className={`inline-flex h-12 items-center gap-2 rounded-xl px-4 text-base font-semibold no-underline shadow-sm transition hover:no-underline lg:h-11 lg:text-sm ${theme.solid} ${ring}`}
            >
              <LogIn className="h-4 w-4" aria-hidden /> Sign in
            </Link>
          )}
          {who &&
            (onDetails ? (
              <button type="button" onClick={onDetails} aria-label={`${name}: your details`} className={`flex cursor-pointer items-center gap-3 rounded-full p-0.5 transition hover:bg-white lg:pr-3 ${ring}`}>
                {who}
              </button>
            ) : (
              <span className="flex items-center gap-3 p-0.5 lg:pr-3">{who}</span>
            ))}
          {signedIn && onSignOut && (
            <button
              type="button"
              onClick={onSignOut}
              aria-label="Sign out"
              className={`inline-flex h-12 cursor-pointer items-center gap-2 rounded-xl bg-white/90 px-3 text-base font-semibold text-slate-800 shadow-sm ring-1 ring-slate-900/10 transition hover:bg-white lg:hidden ${ring}`}
            >
              <LogOut className="h-5 w-5" aria-hidden />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
