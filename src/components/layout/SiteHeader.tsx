'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { LogIn, LogOut, User } from 'lucide-react';
import { BrandMark } from '@/components/brand/Shikara';
import { usePathname, useRouter } from 'next/navigation';
import { tokenStore } from '@/lib/api/client';

export function SiteHeader({ hideSignIn = false }: { hideSignIn?: boolean }) {
  const [isAuth, setIsAuth] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [userName, setUserName] = useState<string>('User');
  const [sessionRole, setSessionRole] = useState<string>('USER');
  const pathname = usePathname();
  const router = useRouter();

  // Dynamic Role based on URL
  let dynamicRole = '';
  if (pathname) {
    if (pathname.startsWith('/admin')) dynamicRole = 'ADMIN';
    else if (pathname.startsWith('/expert')) dynamicRole = 'EXPERT';
    else if (pathname.startsWith('/buyer')) dynamicRole = 'BUYER';
    else if (pathname.startsWith('/farmer')) dynamicRole = 'FARMER';
    else if (pathname.startsWith('/seller')) dynamicRole = 'SELLER';
    else if (pathname.startsWith('/dealer')) dynamicRole = 'DEALER';
    else if (pathname.startsWith('/agriculture')) dynamicRole = 'AGRICULTURE';
    else if (pathname.startsWith('/horticulture')) dynamicRole = 'HORTICULTURE';
    else if (pathname.startsWith('/tracking')) dynamicRole = 'LOGISTICS';
    else if (pathname.startsWith('/provider')) dynamicRole = 'PROVIDER';
  }

  const displayRole = dynamicRole || sessionRole;

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('auth_token');
      setIsAuth(!!token);
      setSessionRole(localStorage.getItem('user_role') || 'USER');
      
      const email = localStorage.getItem('auth_email');
      if (email) {
        const prefix = email.split('@')[0];
        let cleanName = prefix.replace(/[0-9]/g, '').replace(/[._]/g, ' ').replace(/\s+/g, ' ').trim();
        
        if (cleanName.toLowerCase() === 'waseemmushtaq') {
          cleanName = 'Waseem Mushtaq';
        } else if (cleanName.length > 0) {
          cleanName = cleanName.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        }
        
        setUserName(cleanName || prefix);
      }
      setIsMounted(true);
    }
  }, []);

  const handleSignOut = () => {
    tokenStore.clear();
    setIsAuth(false);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('auth_email');
    }
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
          <Link href="/supplies" className="kr-btn-ghost kr-btn-sm sm:hidden">
            Supplies
          </Link>
          {!isMounted ? (
            <div className="w-20 h-8"></div>
          ) : isAuth ? (
            <div className="flex items-center gap-2">
              <Link 
                href={`/${displayRole.toLowerCase()}/dashboard`}
                className="kr-badge kr-badge-published flex items-center gap-1.5 hover:bg-emerald-50 transition-colors" 
                title={displayRole || 'User'}
              >
                <User className="w-3.5 h-3.5" />
                <span className="font-semibold">{userName}</span>
                <span className="text-xs opacity-75 hidden sm:inline ml-1">({displayRole})</span>
              </Link>
              <button onClick={handleSignOut} className="kr-btn-ghost kr-btn-sm text-kr-text-danger">
                <LogOut className="h-4 w-4" aria-hidden="true" /> <span className="hidden sm:inline">Sign out</span>
              </button>
            </div>
          ) : !hideSignIn && pathname !== '/' ? (
            <Link href="/login" className="kr-btn-primary kr-btn-sm header-signin-btn">
              <LogIn className="h-4 w-4" aria-hidden="true" /> Sign in
            </Link>
          ) : null}
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
        </div>
      </div>
    </footer>
  );
}
