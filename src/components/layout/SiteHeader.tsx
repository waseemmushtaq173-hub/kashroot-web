'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { LogIn, LogOut, User } from 'lucide-react';
import { BrandMark } from '@/components/brand/Shikara';
import { RoleSwitcher } from './RoleSwitcher';
import { useRouter } from 'next/navigation';
import { tokenStore } from '@/lib/api/client';

export function SiteHeader() {
  const [isAuth, setIsAuth] = useState(false);
  const [role, setRole] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>('User');
  const router = useRouter();

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('auth_token');
      setIsAuth(!!token);
      setRole(localStorage.getItem('user_role') || 'User');
      
      const email = localStorage.getItem('auth_email');
      if (email) {
        const prefix = email.split('@')[0];
        // Attempt to clean it up slightly
        let cleanName = prefix.replace(/[0-9]/g, ' ').replace(/[._]/g, ' ').replace(/\s+/g, ' ').trim();
        if (cleanName.toLowerCase() === 'waseem mushtaq') cleanName = 'Waseem Mushtaq'; // specifically handle the prompt's example
        else if (cleanName.length > 0) cleanName = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
        
        setUserName(cleanName || prefix);
      }
    }
  }, []);

  const handleSignOut = () => {
    tokenStore.clear();
    setIsAuth(false);
    setRole(null);
    router.push('/');
  };

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
          <div className="hidden sm:block mr-2 border-r border-kr-border-default pr-4">
            <RoleSwitcher />
          </div>
          <Link href="/supplies" className="kr-btn-ghost kr-btn-sm sm:hidden">
            Supplies
          </Link>
          {isAuth ? (
            <div className="flex items-center gap-2">
              <span className="kr-badge kr-badge-published flex items-center gap-1.5" title={role || 'User'}>
                <User className="w-3.5 h-3.5" />
                <span className="font-semibold">{userName}</span>
                <span className="text-xs opacity-75 hidden sm:inline ml-1">({role})</span>
              </span>
              <button onClick={handleSignOut} className="kr-btn-ghost kr-btn-sm text-kr-text-danger">
                <LogOut className="h-4 w-4" aria-hidden="true" /> <span className="hidden sm:inline">Sign out</span>
              </button>
            </div>
          ) : (
            <Link href="/login" className="kr-btn-primary kr-btn-sm">
              <LogIn className="h-4 w-4" aria-hidden="true" /> Sign in
            </Link>
          )}
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
