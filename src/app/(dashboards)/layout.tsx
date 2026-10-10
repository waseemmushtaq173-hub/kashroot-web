'use client';
export const dynamic = 'force-dynamic';

import { useSelectedLayoutSegment, useRouter } from 'next/navigation';
import { SiteHeader, SiteFooter } from '@/components/layout/SiteHeader';
import { ReactNode, useEffect, useState } from 'react';

import { ShieldCheck } from 'lucide-react';

import { KYCPanel, type KycRole } from '@/components/auth/KYCPanel';
import { PortalGuide } from '@/components/voice/PortalGuide';
import { supabase } from '@/lib/supabase';
import { authApi, SELF_JOIN_ROLES, storedRoles, tokenStore } from '@/lib/api/auth';
import { loginHref, PORTALS, portalForSegment } from '@/lib/auth/roles';

/**
 * Each dashboard segment belongs to one portal (see lib/auth/roles). Signed-out
 * visitors go to that portal's own sign-in; role portals (farmer, buyer,
 * seller, logistics, admin) need an account of that role, shared portals
 * (kissan tools, rental, tracking, dealer, expert) accept any account.
 */
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
  const [userRoles, setUserRoles] = useState<string[]>([]);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [showKyc, setShowKyc] = useState(false);
  // KYC is one check per person: asked once, then a reminder banner until done.
  const [kycDone, setKycDone] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('auth_token');
      if (!token) {
        // Replace, not push: the portal page must not stay in history, or
        // Back would land on it and bounce straight back to sign-in.
        const portal = portalForSegment(segment);
        router.replace(portal ? loginHref(portal, window.location.pathname) : '/login');
      } else {
        setUserRole(localStorage.getItem('user_role'));
        setUserRoles(storedRoles());

        const kyc = localStorage.getItem('kyc_status');
        setKycDone(kyc === 'submitted');
        // Open the KYC panel by itself only the first time after signing up,
        // and only in portals where money changes hands.
        const moneyPortal = ['farmer', 'buyer', 'seller', 'logistics'].includes(portalForSegment(segment) ?? '');
        if (kyc === 'pending' && moneyPortal) {
          setShowKyc(true);
          localStorage.setItem('kyc_status', 'later');
        }

        setIsAuthenticated(true);
      }
      setIsMounted(true);
    }
  }, [router, segment]);

  if (!isMounted || !isAuthenticated) {
    // Prevent flicker and layout shift while checking credentials
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-amber-50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-600 border-t-transparent" />
      </div>
    );
  }

  const portal = portalForSegment(segment);
  const required = portal ? PORTALS[portal].requiredRole : null;
  // One account can hold several portals (see RoleLoginForm).
  const authorized = !userRole || !required || userRole === required || userRoles.includes(required);
  const canJoin = (SELF_JOIN_ROLES as readonly string[]).includes(required ?? '');
  const joinPortal = async () => {
    if (!required || !canJoin) return;
    setJoining(true);
    setJoinError(null);
    try {
      const roles = await authApi.addPortalRole(required as (typeof SELF_JOIN_ROLES)[number]);
      localStorage.setItem('user_roles', JSON.stringify(roles));
      localStorage.setItem('user_role', required);
      setUserRoles(roles);
      setUserRole(required);
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : 'Could not add this portal.');
    } finally {
      setJoining(false);
    }
  };
  const requiredRoleMsg = portal ? PORTALS[portal].label : '';

  if (!authorized) {
    return (
      <div className="kr-light flex min-h-screen flex-col bg-gradient-to-br from-amber-50 via-white to-emerald-50 text-slate-900">
        <SiteHeader tone="light" />
        <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
          <div className="max-w-lg rounded-3xl bg-white/80 p-8 shadow-[0_20px_60px_rgba(15,23,42,0.12)] ring-1 ring-slate-900/5 backdrop-blur-xl">
            <h2 className="mb-3 font-sans text-2xl font-bold text-slate-900">{canJoin ? `Add the ${requiredRoleMsg} portal?` : 'This portal needs a different account'}</h2>
            <p className="mb-2 text-slate-700">
              You&apos;re signed in with a <strong className="rounded bg-slate-100 px-2 py-0.5">{userRole}</strong> account.
            </p>
            <p className="mb-8 text-slate-600">
              {canJoin ? (
                <>The same account can use the <strong>{requiredRoleMsg}</strong> portal too. Your {requiredRoleMsg} details are kept separately.</>
              ) : (
                <>Sign in with a <strong>{requiredRoleMsg}</strong> account to open this portal.</>
              )}
            </p>
            {joinError && <p role="alert" className="mb-4 text-sm text-rose-700">{joinError}</p>}
            <div className="flex flex-wrap justify-center gap-3">
              {canJoin && (
                <button
                  type="button"
                  onClick={() => void joinPortal()}
                  disabled={joining}
                  className="cursor-pointer rounded-xl bg-emerald-700 px-6 py-3 font-semibold text-white shadow-sm transition hover:bg-emerald-800 disabled:opacity-60"
                >
                  {joining ? 'Adding…' : `Yes, add the ${requiredRoleMsg} portal`}
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  tokenStore.removeToken();
                  const portal = portalForSegment(segment);
                  router.replace(portal ? loginHref(portal, window.location.pathname) : '/login');
                }}
                className={canJoin ? 'cursor-pointer rounded-xl bg-white px-6 py-3 font-semibold text-slate-800 ring-1 ring-slate-200 transition hover:bg-slate-50' : 'cursor-pointer rounded-xl bg-emerald-700 px-6 py-3 font-semibold text-white shadow-sm transition hover:bg-emerald-800'}
              >
                {canJoin ? 'Use a different account' : `Open the ${requiredRoleMsg} sign-in`}
              </button>
              <button
                type="button"
                onClick={() => router.push('/')}
                className="cursor-pointer rounded-xl bg-white px-6 py-3 font-semibold text-slate-800 ring-1 ring-slate-200 transition hover:bg-slate-50"
              >
                Back to home
              </button>
            </div>
          </div>
        </div>
        <SiteFooter tone="light" />
      </div>
    );
  }

  // Every portal renders inside PortalShell (bright, kr-light scoped); the
  // layout only adds the site chrome around it.
  return (
    <div className="kr-light flex min-h-screen flex-col bg-gradient-to-br from-emerald-50 via-white to-amber-50 text-slate-900">
      <SiteHeader tone="light" portal={portal} />
      {!kycDone && portal && ['farmer', 'buyer', 'seller', 'logistics'].includes(portal) && (
        <div className="border-b border-emerald-900/10 bg-emerald-50/90">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-sm sm:px-6 lg:px-8">
            <p className="flex items-center gap-2 text-emerald-950">
              <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-700" aria-hidden />
              Verify your identity once so buyers and sellers can trust you — it covers every KashRoot portal.
            </p>
            <button type="button" onClick={() => setShowKyc(true)} className="cursor-pointer rounded-lg bg-emerald-700 px-3 py-1.5 font-semibold text-white hover:bg-emerald-800">
              Verify now
            </button>
          </div>
        </div>
      )}
      <div className="flex flex-1 flex-col">
        {children}
      </div>
      <SiteFooter tone="light" />
      {portal && <PortalGuide portal={portal} />}
      <KYCPanel
        open={showKyc}
        onClose={() => setShowKyc(false)}
        defaultRole={kycRoleFor(required ?? userRole)}
        // No self-service KYC endpoint exists yet: mark it submitted (under
        // review), never "verified" — nobody has reviewed it.
        onComplete={() => {
          localStorage.setItem('kyc_status', 'submitted');
          setKycDone(true);
          // Remember it on the account, so other devices don't ask again.
          void supabase.auth.updateUser({ data: { kyc_status: 'submitted' } }).catch(() => undefined);
        }}
      />
    </div>
  );
}

/** The KYC role for a portal or account role; logistics providers receive payouts like sellers. */
function kycRoleFor(role: string | null | undefined): KycRole | undefined {
  if (role === 'FARMER' || role === 'BUYER' || role === 'SELLER') return role;
  if (role === 'PROVIDER') return 'SELLER';
  return undefined;
}
