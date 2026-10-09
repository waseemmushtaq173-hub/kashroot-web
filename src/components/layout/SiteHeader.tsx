'use client';

import Link from 'next/link';
import { useState, useRef, useEffect } from 'react';
import { LayoutGrid, ChevronDown } from 'lucide-react';
import { BrandMark } from '@/components/brand/Shikara';

/**
 * Portal menu — every portal on the site is reachable from the top nav.
 * Rendered as a glassmorphic dropdown so the homepage hero never has to
 * carry portal cards.
 */
const PORTALS = [
  { title: 'Farmer Portal', href: '/login/farmer', desc: 'Orchards, listings & advisory' },
  { title: 'Buyer Portal', href: '/login/buyer', desc: 'Source verified produce' },
  { title: 'Seller Portal', href: '/login/seller', desc: 'Products, stock & supplier listings' },
  { title: 'Kissan Tools', href: '/login?role=KISSAN_PARTNER', desc: 'Equipment & horti supplies' },
  { title: 'Rental Marketplace', href: '/login?role=RENTAL', desc: 'Cold storage & machinery' },
  { title: 'Logistics', href: '/login?role=PROVIDER', desc: 'Tracking & providers' },
  { title: 'Expert Desk', href: '/login?role=EXPERT', desc: 'Agronomy & crop advisory' },
  { title: 'Admin Governance', href: '/login?role=ADMIN', desc: 'KYC, audit & escrow' },
  { title: 'Orchard Health', href: '/orchard-health', desc: 'Diagnosis & spray logs' },
  { title: 'Season Planner', href: '/season-planner', desc: 'Calendar & ROI calculator' },
  { title: 'Traceability', href: '/traceability', desc: 'Origin scanner & grade history' },
];

function PortalMenu({ onOpenPortals }: { onOpenPortals?: () => void }) {
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
        className="flex items-center gap-1.5 rounded-lg border border-white/30 bg-white/15 px-3 py-2 text-label font-semibold text-slate-900 backdrop-blur-md transition-all hover:border-[#D4AF37] hover:bg-white/25"
      >
        <LayoutGrid className="w-4 h-4" />
        Portals
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 w-[22rem] max-h-[70vh] overflow-y-auto rounded-2xl border border-white bg-white/95 p-2 shadow-xl backdrop-blur-xl"
        >
          {PORTALS.map((p) => (
            <Link
              key={p.href}
              href={p.href}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="block rounded-xl px-3 py-2.5 transition-colors hover:bg-white/30"
            >
              <span className="block text-sm font-semibold text-slate-900">{p.title}</span>
              <span className="block text-xs text-slate-600">{p.desc}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function SiteHeader({ hideSignIn = false, onOpenPortals }: { hideSignIn?: boolean; onOpenPortals?: () => void }) {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/85 text-slate-800 backdrop-blur-xl shadow-sm">
      <nav
        className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4 py-3"
        aria-label="Primary"
      >
        <Link href="/" className="shrink-0">
          <BrandMark />
        </Link>

        <div className="hidden items-center gap-1 sm:flex">
          <Link
            href="/buyer/discover"
            className="rounded-lg px-3 py-2 text-label text-slate-600 transition-colors hover:bg-white/40 hover:text-slate-900"
          >
            Produce
          </Link>
          <Link
            href="/supplies"
            className="rounded-lg px-3 py-2 text-label text-slate-600 transition-colors hover:bg-white/40 hover:text-slate-900"
          >
            Supplies
          </Link>
          <Link
            href="/compare-prices"
            className="rounded-lg px-3 py-2 text-label text-slate-600 transition-colors hover:bg-white/40 hover:text-slate-900"
          >
            Compare
          </Link>
        </div>

        <div className="flex items-center gap-2">
          <PortalMenu onOpenPortals={onOpenPortals} />
          <Link
            href="/supplies"
            className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-white/40 hover:text-slate-900 sm:hidden"
          >
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
    <footer className="border-t border-slate-200 bg-white/75 text-slate-800 backdrop-blur-xl">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 flex flex-col items-start justify-between gap-4 py-8 sm:flex-row sm:items-center">
        <div>
          <BrandMark size="sm" />
          <p className="mt-2 text-caption text-slate-600">
            &copy; {new Date().getFullYear()} KashRoot Technologies Pvt. Ltd.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-caption">
          <Link
            href="/buyer/discover"
            className="text-slate-600 transition-colors hover:text-emerald-800"
          >
            Produce marketplace
          </Link>
          <Link
            href="/supplies"
            className="text-slate-600 transition-colors hover:text-emerald-800"
          >
            Horticulture supplies
          </Link>
          <Link
            href="/login/farmer"
            className="text-slate-600 transition-colors hover:text-emerald-800"
          >
            For farmers
          </Link>
        </div>
      </div>
    </footer>
  );
}
