import Link from 'next/link';
import { LogIn } from 'lucide-react';
import { BrandMark } from '@/components/brand/Shikara';

/**
 * Public site header, shared by the landing page and the supplies catalogue.
 *
 * Extracted so the two verticals cannot drift apart in nav or spacing — the
 * moment Supplies became a first-class section rather than a landing-page
 * subsection, it needed to appear in the same nav on every public page.
 *
 * Deliberately a server component: nothing here is interactive, so there is no
 * reason to ship it to the client. That rules out an active-link highlight
 * (which needs `usePathname`), so the nav stays neutral rather than pulling the
 * whole header across the client boundary for a colour change.
 */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-kr-border-default bg-kr-bg-surface">
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
            className="px-3 py-2 text-label text-kr-text-secondary transition-colors hover:bg-kr-bg-sunken hover:text-kr-text-primary"
          >
            Produce
          </Link>
          <Link
            href="/supplies"
            className="px-3 py-2 text-label text-kr-text-secondary transition-colors hover:bg-kr-bg-sunken hover:text-kr-text-primary"
          >
            Supplies
          </Link>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/supplies" className="kr-btn-ghost kr-btn-sm sm:hidden">
            Supplies
          </Link>
          <Link href="/login" className="kr-btn-primary kr-btn-sm">
            <LogIn className="h-4 w-4" aria-hidden="true" /> Sign in
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
    <footer className="border-t border-kr-border-default bg-kr-bg-surface">
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
          <Link
            href="/login"
            className="text-kr-text-secondary transition-colors hover:text-kr-text-brand"
          >
            Sign in
          </Link>
        </div>
      </div>
    </footer>
  );
}
