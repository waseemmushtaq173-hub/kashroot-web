'use client';
import { Button } from "@/components/ui/Button";
export const dynamic = 'force-dynamic';

import { useSelectedLayoutSegment, useRouter } from 'next/navigation';
import { SiteHeader, SiteFooter } from '@/components/layout/SiteHeader';
import { ReactNode, useEffect, useState } from 'react';

import { VoiceAssistant } from '@/components/ui/VoiceAssistant';
import { KYCPanel } from '@/components/auth/KYCPanel';
import { isPortalRole, loginHref, portalRoleFromValue, ROLE_VALUE } from '@/lib/auth/roles';

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
        // Farmer, buyer and seller routes have their own sign-in pages; every
        // other portal still uses the shared /login.
        const path = window.location.pathname;
        const portal = segment && isPortalRole(segment) ? segment : null;
        router.push(portal ? loginHref(portal, path) : '/login?returnTo=' + encodeURIComponent(path));
      } else {
        setUserRole(localStorage.getItem('user_role'));
        
        // Trigger KYC Panel if status is pending
        if (localStorage.getItem('kyc_status') === 'pending') {
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

  let authorized = true;
  let requiredRoleMsg = '';
  if (userRole) {
    if (segment === 'farmer' && userRole !== 'FARMER') { authorized = false; requiredRoleMsg = 'Farmer'; }
    else if (segment === 'buyer' && userRole !== 'BUYER') { authorized = false; requiredRoleMsg = 'Buyer'; }
    else if (segment === 'seller' && userRole !== 'SELLER') { authorized = false; requiredRoleMsg = 'Seller'; }
    else if (segment === 'expert' && userRole !== 'EXPERT') { authorized = false; requiredRoleMsg = 'Agricultural Expert'; }
    else if (segment === 'admin' && userRole !== 'ADMIN') { authorized = false; requiredRoleMsg = 'Platform Admin'; }
    else if (segment === 'provider' && userRole !== 'PROVIDER') { authorized = false; requiredRoleMsg = 'Logistics & Provider'; }
    else if (segment === 'kissan-tools' && userRole !== 'KISSAN_PARTNER') { authorized = false; requiredRoleMsg = 'Kissan Partner'; }
    else if (segment === 'rental' && userRole !== 'RENTAL') { authorized = false; requiredRoleMsg = 'Equipment / Machinery Rental'; }
  }

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
              Please sign in with a <strong>{requiredRoleMsg}</strong> account to access this specific portal.
            </p>
            <Button 
              onClick={() => {
                localStorage.removeItem('auth_token');
                localStorage.removeItem('user_role');
                const portal = segment && isPortalRole(segment) ? segment : null;
                router.push(portal ? loginHref(portal) : '/login');
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
      <KYCPanel
        open={showKyc}
        onClose={() => setShowKyc(false)}
        defaultRole={(() => {
          const portal = portalRoleFromValue(userRole);
          return portal ? ROLE_VALUE[portal] : undefined;
        })()}
        // No self-service KYC endpoint exists yet: mark it submitted (under
        // review), never "verified" — nobody has reviewed it.
        onComplete={() => localStorage.setItem('kyc_status', 'submitted')}
      />
    </div>
  );
}
