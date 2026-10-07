'use client';

import Link from 'next/link';
import { BrandMark } from '@/components/brand/Shikara';

export function SiteHeader({ hideSignIn = false }: { hideSignIn?: boolean }) {
  return (
    <header className="sticky top-0 z-40 border-b border-white/25 bg-kr-bg-surface/75 backdrop-blur-xl supports-[backdrop-filter]:bg-kr-bg-surface/65 shadow-[0_8px_30px_-12px_rgba(7,11,26,0.35)]">
      <nav
        className="kr-container flex items-center justify-between gap-4 py-3"
        aria-label="Primary"
      >
        <Link href="/" className="shrink-0">
          <BrandMark />
        </Link>

        <div className="hidden items-center gap-1 sm:flex">
          <Link
            href="/buyer/discover"
            className="rounded-lg px-3 py-2 text-label text-kr-text-secondary transition-colors hover:kr-glass/40 hover:text-kr-text-primary"
          >
            Produce
          </Link>
          <Link
            href="/supplies"
            className="rounded-lg px-3 py-2 text-label text-kr-text-secondary transition-colors hover:kr-glass/40 hover:text-kr-text-primary"
          >
            Supplies
          </Link>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/supplies" className="kr-btn-ghost kr-btn-sm sm:hidden">
            Supplies
          </Link>
        </div>
      </nav>
    </header>
  );
}

/**
 * Public site footer. Mirrors the header's information architecture so the two
 * verticals are reachable from the bottom of every public page as well.
 */
export function SiteFooter() {
  return (
    <footer className="border-t border-white/25 bg-kr-bg-surface/70 backdrop-blur-xl supports-[backdrop-filter]:bg-kr-bg-surface/60">
      <div className="kr-container flex flex-col items-start justify-between gap-4 py-8 sm:flex-row sm:items-center">
        <div>
          <BrandMark size="sm" />
          <p className="mt-2 text-caption text-kr-text-secondary">
            &copy; {new Date().getFullYear()} KashRoot Technologies Pvt. Ltd.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-caption">
          <Link
            href="/buyer/discover"
            className="text-kr-text-secondary transition-colors hover:text-kr-text-brand"
          >
            Produce marketplace
          </Link>
          <Link
            href="/supplies"
            className="text-kr-text-secondary transition-colors hover:text-kr-text-brand"
          >
            Horticulture supplies
          </Link>
          <Link
            href="/farmer/dashboard"
            className="text-kr-text-secondary transition-colors hover:text-kr-text-brand"
          >
            For farmers
          </Link>
        </div>
      </div>
    </footer>
  );
}
