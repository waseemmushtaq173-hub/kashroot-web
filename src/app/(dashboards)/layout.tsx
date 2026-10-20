'use client';
export const dynamic = 'force-dynamic';

import { useSearchParams, useSelectedLayoutSegment, useRouter } from 'next/navigation';
import { SiteHeader, SiteFooter } from '@/components/layout/SiteHeader';
import { ReactNode, Suspense, useCallback, useEffect, useState } from 'react';

import { ShieldCheck } from 'lucide-react';

import { KYCPanel, type KycRole } from '@/components/auth/KYCPanel';
import { supabase } from '@/lib/supabase';
import { authApi, SELF_JOIN_ROLES, storedRoles } from '@/lib/api/auth';
import { portalAccess, touchPortal } from '@/lib/auth/portalAccess';
import { loginHref, PORTALS, portalForSegment } from '@/lib/auth/roles';
import { restoreSession, signOutCompletely, watchPortalUse } from '@/lib/auth/session';
import { OPEN_KYC } from '@/lib/client/identityCheck';
import { KYC_CHANGED, kycMissing, kycRules, myKyc, type KycRules, type KycStatus } from '@/lib/db/security';

/** Safe payment (pay after delivery) lives in these two portals only; the identity check opens there by itself once. */
const MONEY_PORTALS = ['farmer', 'buyer'];
/** Portals where people book, list or get paid: they show the identity-check reminder when Admin requires it. */
const KYC_PORTALS = [...MONEY_PORTALS, 'rental', 'dealer'];
/** What the identity check is needed for, portal by portal. */
const KYC_FOR: Record<string, string> = {
  rental: 'book cold storage or list your cold store',
  dealer: 'sell or receive payments',
  default: 'sell, buy, book or receive money',
};
/** Portals a signed-out visitor may open: Tracking, to follow a load by its code. */
const GUEST_PORTALS = ['tracking'];

/**
 * Each dashboard segment belongs to one portal (see lib/auth/roles). Signed-out
 * visitors go to that portal's own sign-in (Tracking also opens without an
 * account, to follow a load by its code); role portals (farmer, buyer,
 * admin) need an account of that role, shared portals (kissan tools, cold
 * storage booking, tracking, dealer, expert, mandi helpers) accept any
 * account. A portal sign-in unused for 12 hours is locked (checked before
 * anything of the portal shows, and again while it is open): its sign-in
 * page then offers "Continue as …" (lib/auth/portalAccess).
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
  // Who is signed in to this portal (to keep its sign-in going while used), and whether it just locked.
  const [userId, setUserId] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  // The portal (layout segment) the sign-in was checked for: moving to another portal shows nothing of it until checked.
  const [checkedFor, setCheckedFor] = useState<string | null | undefined>(undefined);

  const [userRole, setUserRole] = useState<string | null>(null);
  const [userRoles, setUserRoles] = useState<string[]>([]);
  const [joining, setJoining] = useState(false);
  // Following a load on Tracking without an account.
  const [guest, setGuest] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [showKyc, setShowKyc] = useState(false);
  // KYC is one check per person: asked once, then a reminder banner until done.
  const [kycDone, setKycDone] = useState(false);
  // The verified record in the database (written only by the KashRoot server).
  const [kyc, setKyc] = useState<{ rules: KycRules | null; status: KycStatus | null } | null>(null);
  const refreshKyc = useCallback(async () => {
    // The person from the session on this device: no extra round trip before the KYC check.
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user.id;
    const [rules, status] = await Promise.all([kycRules(), userId ? myKyc(userId) : Promise.resolve(null)]);
    setKyc({ rules, status });
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let live = true;
    // The real Supabase session decides (refreshed if its token expired), so
    // someone who closed the app and came back is let straight in — to the
    // portals they signed in to here and used in the last 12 hours. Each
    // portal has its own sign-in: a session from another portal does not
    // open this one, and a locked one goes to its sign-in ("Continue as …").
    void restoreSession().then(async (found) => {
      if (!live) return;
      const here = portalForSegment(segment);
      let active = found;
      // Signed in to this portal but unused for hours: its sign-in page offers "Continue as …" (Tracking too, not its guest view).
      let lockedHere = false;
      if (found && here) {
        const access = await portalAccess(found.session.user, found.roles, here);
        if (!live) return;
        if (!access.member || !access.signedIn) {
          active = null;
          lockedHere = access.member && access.locked;
        }
        // Opening the portal is using it.
        else touchPortal(found.session.user.id, here);
      }
      if (!active && !lockedHere && GUEST_PORTALS.includes(portalForSegment(segment) ?? '')) {
        // Following a load needs no account; the page asks to sign in only
        // for creating consignments.
        setUserId(null);
        setUserRole(null);
        setGuest(true);
        setIsAuthenticated(true);
      } else if (!active) {
        // Replace, not push: the portal page must not stay in history, or
        // Back would land on it and bounce straight back to sign-in.
        const portal = portalForSegment(segment);
        setIsAuthenticated(false);
        router.replace(portal ? loginHref(portal, window.location.pathname + window.location.search) : '/login');
      } else {
        setGuest(false);
        setLocked(false);
        setUserId(active.session.user.id);
        setUserRole(localStorage.getItem('user_role'));
        setUserRoles(storedRoles());

        const kyc = localStorage.getItem('kyc_status');
        setKycDone(kyc === 'submitted');
        // Open the KYC panel by itself only the first time after signing up,
        // and only in portals where money changes hands.
        const moneyPortal = MONEY_PORTALS.includes(portalForSegment(segment) ?? '');
        if (kyc === 'pending' && moneyPortal) {
          setShowKyc(true);
          localStorage.setItem('kyc_status', 'later');
        }

        setIsAuthenticated(true);
      }
      setCheckedFor(segment);
      setIsMounted(true);
    });
    return () => {
      live = false;
    };
  }, [router, segment]);

  // While the portal is open: use keeps its sign-in going; unused for 12
  // hours (or signed out in another tab) it locks — hidden at once, then its
  // sign-in page with "Continue as …".
  useEffect(() => {
    const here = portalForSegment(segment);
    if (!isAuthenticated || guest || !userId || !here) return;
    return watchPortalUse(userId, here, () => {
      setLocked(true);
      router.replace(loginHref(here, window.location.pathname + window.location.search));
    });
  }, [guest, isAuthenticated, router, segment, userId]);

  useEffect(() => {
    if (!isAuthenticated) return;
    let live = true;
    const run = async () => {
      if (live) await refreshKyc();
    };
    void run();
    // Verified from a Safe payment tab: the reminder banner goes away too.
    const changed = () => {
      setKycDone(true);
      void run();
    };
    // "Verify now" anywhere in any portal (an error's button, a panel) opens the check here.
    const open = () => setShowKyc(true);
    window.addEventListener(KYC_CHANGED, changed);
    window.addEventListener(OPEN_KYC, open);
    return () => {
      live = false;
      window.removeEventListener(KYC_CHANGED, changed);
      window.removeEventListener(OPEN_KYC, open);
    };
  }, [isAuthenticated, refreshKyc]);

  // A guest who leaves Tracking for another portal waits here for its sign-in.
  if (!isMounted || !isAuthenticated || locked || checkedFor !== segment || (guest && !GUEST_PORTALS.includes(portalForSegment(segment) ?? ''))) {
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
        <SiteHeader tone="light" portal={portal} />
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
                  // Sign out fully, or the sign-in page would open this account again.
                  void signOutCompletely().then(() => {
                    const portal = portalForSegment(segment);
                    router.replace(portal ? loginHref(portal, window.location.pathname) : '/login');
                  });
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
        <SiteFooter tone="light" portal={portal} />
      </div>
    );
  }

  // Every portal renders inside PortalShell (bright, kr-light scoped); the
  // layout only adds the site chrome around it.
  return (
    <div className="kr-light flex min-h-screen flex-col bg-gradient-to-br from-emerald-50 via-white to-amber-50 text-slate-900">
      <SiteHeader tone="light" portal={portal} />
      {portal && KYC_PORTALS.includes(portal) && (kyc?.rules?.kyc_required ? kycMissing(kyc.rules, kyc.status) : MONEY_PORTALS.includes(portal) && !kycDone && !kyc?.status?.aadhaar_verified_at) && (
        <Suspense fallback={null}>
          <NotOnSafePayment>
            <div className={`border-b ${kyc?.rules?.kyc_required ? 'border-amber-900/10 bg-amber-50' : 'border-emerald-900/10 bg-emerald-50/90'}`}>
              <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-sm sm:px-6 lg:px-8">
                <p className={`flex items-center gap-2 ${kyc?.rules?.kyc_required ? 'text-amber-950' : 'text-emerald-950'}`}>
                  <ShieldCheck className={`h-4 w-4 shrink-0 ${kyc?.rules?.kyc_required ? 'text-amber-700' : 'text-emerald-700'}`} aria-hidden />
                  {kyc?.rules?.kyc_required
                    ? kycMissing(kyc.rules, kyc.status) === 'pan'
                      ? `Your Aadhaar is verified. Verify your PAN too before you ${KYC_FOR[portal] ?? KYC_FOR.default} on KashRoot.`
                      : `Verify your Aadhaar${kyc.rules.pan_required ? ' and PAN' : ''} here before you ${KYC_FOR[portal] ?? KYC_FOR.default} — about a minute, once for every portal. It protects you and the people you deal with.`
                    : 'Verify your identity once so buyers and sellers can trust you — it covers every KashRoot portal.'}
                </p>
                <button type="button" onClick={() => setShowKyc(true)} className="cursor-pointer rounded-lg bg-emerald-700 px-3 py-1.5 font-semibold text-white hover:bg-emerald-800">
                  Verify now
                </button>
              </div>
            </div>
          </NotOnSafePayment>
        </Suspense>
      )}
      <div className="flex flex-1 flex-col">
        {children}
      </div>
      <SiteFooter tone="light" portal={portal} />
      <KYCPanel
        open={showKyc}
        onClose={() => setShowKyc(false)}
        defaultRole={kycRoleFor(required ?? userRole)}
        // No self-service KYC endpoint exists yet: mark it submitted (under
        // review), never "verified" — nobody has reviewed it.
        onComplete={async () => {
          localStorage.setItem('kyc_status', 'submitted');
          setKycDone(true);
          await refreshKyc();
          // Panels showing the identity check in the portal refresh too.
          window.dispatchEvent(new Event(KYC_CHANGED));
          // Remember it on the account, so other devices don't ask again.
          void supabase.auth.updateUser({ data: { kyc_status: 'submitted' } }).catch(() => undefined);
        }}
      />
    </div>
  );
}

/** The identity-check reminder, except on the Safe payment tab, which has its own. */
function NotOnSafePayment({ children }: { children: ReactNode }) {
  const tab = useSearchParams().get('tab');
  return tab === 'payouts' || tab === 'payment' ? null : children;
}

/** The KYC role for a portal or account role; old Seller / Logistics accounts receive payouts like sellers. */
function kycRoleFor(role: string | null | undefined): KycRole | undefined {
  if (role === 'FARMER' || role === 'BUYER' || role === 'SELLER') return role;
  if (role === 'PROVIDER') return 'SELLER';
  return undefined;
}
