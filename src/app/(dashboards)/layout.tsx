'use client';
export const dynamic = 'force-dynamic';

import { useSelectedLayoutSegment, useRouter } from 'next/navigation';
import { SiteHeader, SiteFooter } from '@/components/layout/SiteHeader';
import { ReactNode, useEffect } from 'react';

import { VoiceAssistant } from '@/components/ui/VoiceAssistant';

/**
 * Role-Adaptive Dashboard Layout
 * Injects CSS thematic variables based on the active route segment.
 */
export default function DashboardLayout({ children }: { children: ReactNode }) {
  const segment = useSelectedLayoutSegment();
  const router = useRouter();

  useEffect(() => {
    // Client-side guard: verify auth_token exists
    const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
    if (!token) {
      router.push('/login');
    }
  }, [router]);

  
  // Map segments to theme classes that override CSS variables in globals.css
  let themeClass = 'theme-neutral'; // Default to admin/neutral
  if (segment === 'farmer') themeClass = 'theme-farmer';
  else if (segment === 'buyer') themeClass = 'theme-buyer';
  else if (segment === 'seller') themeClass = 'theme-seller';
  else if (segment === 'dealer') themeClass = 'theme-dealer';
  else if (segment === 'provider') themeClass = 'theme-provider';
  
  return (
    <div className={`flex min-h-screen flex-col bg-kr-bg-page ${themeClass}`}>
      <SiteHeader />
      <div className="flex-1 flex flex-col">
        {children}
      </div>
      <VoiceAssistant />
      <SiteFooter />
    </div>
  );
}
