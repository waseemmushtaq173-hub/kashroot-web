'use client';
import { Button } from "@/components/ui/Button";
export const dynamic = 'force-dynamic';

import { useSelectedLayoutSegment, useRouter } from 'next/navigation';
import { SiteHeader, SiteFooter } from '@/components/layout/SiteHeader';
import { ReactNode, useEffect, useState } from 'react';

import { VoiceAssistant } from '@/components/ui/VoiceAssistant';
import { KYCPanel } from '@/components/auth/KYCPanel';
import { portalBySlug } from '@/lib/auth/portals';
import { isLoginRole, loginHref } from '@/lib/auth/roles';
import { kycNeedsOnboarding, kycRoleFor, markKycSubmitted } from '@/lib/kyc/submission';

/**
 * Role-Adaptive Dashboard Layout
 * Injects CSS thematic variables based on the active route segment.
 */
export default function DashboardLayout({ children }: { children: ReactNode }) {
  const segment = useSelectedLayoutSegment();
  const router = useRouter();

  const [isMounted, setIsMounted] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const [userRole, setUserRole] = useState<string | null>(null);
  const [showKyc, setShowKyc] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('auth_token');
      if (!token) {
        const here = window.location.pathname;
        router.push(
          segment && isLoginRole(segment)
            ? loginHref(segment, here)
            : '/login?returnTo=' + encodeURIComponent(here),
        );
      } else {
        const storedRole = localStorage.getItem('user_role');
        setUserRole(storedRole);

        // Open the KYC panel while this role still owes a submission. The
        // legacy kyc_status flag alone never fired: nothing ever set it to
        // 'pending'. See src/lib/kyc/submission.ts.
        if (kycNeedsOnboarding(kycRoleFor(storedRole))) {
          setShowKyc(true);
        }

        setIsAuthenticated(true);
      }
      setIsMounted(true);
    }
  }, [router, segment]);

  if (!isMounted || !isAuthenticated) {
    // Prevent flicker and layout shift while checking credentials
    return (
      <div className="flex min-h-screen items-center justify-center bg-transparent">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-kr-primary-600 border-t-transparent" />
      </div>
    );
  }

  // Each portal in the registry is scoped to its own role, so the guard reads
  // the requirement from there instead of a hand-maintained chain that a new
  // portal can be left out of. Segments with no registry entry (dealer,
  // tracking) carry no role of their own yet and stay open to any session.
  const guardedPortal = segment ? portalBySlug(segment) : undefined;
  const authorized = !guardedPortal || !userRole || userRole === guardedPortal.role;

  if (!authorized) {
    return (
      <div className="flex min-h-screen flex-col bg-transparent">
        <SiteHeader />
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <div className="kr-glass-strong rounded-2xl p-8 max-w-lg">
            <h2 className="font-heading text-3xl font-bold text-amber-600 mb-4">Unauthorized Access</h2>
            <p className="text-kr-text-primary text-lg mb-2">
              Your current active session is scoped to <strong className="bg-kr-bg-sunken px-2 py-1 rounded">{userRole}</strong>.
            </p>
            <p className="text-kr-text-secondary mb-8">
              Please sign in with a <strong>{guardedPortal?.accountLabel}</strong> account to access this specific portal.
            </p>
            <Button 
              onClick={() => {
                localStorage.removeItem('auth_token');
                localStorage.removeItem('user_role');
                router.push(guardedPortal?.loginHref ?? '/login');
              }}
              className="kr-glass hover:kr-hero-premium kr-pattern-chinar font-bold py-3 px-6 rounded-lg transition-colors w-full"
            >
              Switch Account
            </Button>
          </div>
        </div>
      </div>
    );
  }

  
  // Map segments to vibrant theme classes that override wallpaper hues + glass tints in globals.css
  let themeClass = 'theme-neutral'; // Default to admin/neutral
  if (segment === 'farmer') themeClass = 'theme-farmer';
  else if (segment === 'buyer') themeClass = 'theme-buyer';
  else if (segment === 'seller') themeClass = 'theme-seller';
  else if (segment === 'dealer') themeClass = 'theme-dealer';
  else if (segment === 'provider') themeClass = 'theme-provider';
  else if (segment === 'rental') themeClass = 'theme-rental';
  else if (segment === 'kissan-tools') themeClass = 'theme-kissan';
  else if (segment === 'tracking') themeClass = 'theme-provider';
  else if (segment === 'admin' || segment === 'expert') themeClass = 'theme-neutral';
  
  return (
    <div className={`flex min-h-screen flex-col bg-transparent ${themeClass} kr-app-shell`}>
      <SiteHeader />
      <div className="flex-1 flex flex-col">
        {children}
      </div>
      <VoiceAssistant />
      <SiteFooter />
      {showKyc && (
        <KYCPanel
          open
          defaultRole={kycRoleFor(userRole)}
          onClose={() => setShowKyc(false)}
          onComplete={(submission) => markKycSubmitted(submission.role)}
        />
      )}
    </div>
  );
}
